// Operation State Persistence Module
//
// This module handles saving and loading operation state to enable
// resumption of interrupted batch operations.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::types::{
    OperationState, OperationStatus, ResumableOperationSummary, WtError, WtResult,
};

/// H11: Maximum number of cached operation states before eviction.
const MAX_CACHE_ENTRIES: usize = 50;

lazy_static::lazy_static! {
    /// Cache of operation states currently being tracked.
    /// Key is the operation ID, value is the state.
    static ref STATE_CACHE: Mutex<std::collections::HashMap<String, OperationState>> =
        Mutex::new(std::collections::HashMap::new());
}

/// H11: Evict oldest completed entries if cache exceeds MAX_CACHE_ENTRIES.
fn evict_cache_if_needed(cache: &mut std::collections::HashMap<String, OperationState>) {
    if cache.len() <= MAX_CACHE_ENTRIES {
        return;
    }
    // Remove completed/failed operations first (keep in-progress ones)
    let removable: Vec<String> = cache
        .iter()
        .filter(|(_, s)| matches!(s.status, OperationStatus::Completed | OperationStatus::Failed))
        .map(|(k, _)| k.clone())
        .collect();
    for key in removable {
        cache.remove(&key);
        if cache.len() <= MAX_CACHE_ENTRIES {
            break;
        }
    }
}

// ============================================================================
// Directory Management
// ============================================================================

/// Get the operations directory path (~/.wt/operations/).
///
/// Creates the directory if it doesn't exist.
pub fn get_operations_dir() -> WtResult<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| {
        WtError::new(
            "IO_ERROR",
            "Could not determine home directory",
        )
    })?;

    let ops_dir = home.join(".wt").join("operations");

    if !ops_dir.exists() {
        fs::create_dir_all(&ops_dir).map_err(|e| {
            WtError::new(
                "IO_ERROR",
                format!("Failed to create operations directory: {}", e),
            )
        })?;
    }

    Ok(ops_dir)
}

/// Get the file path for a specific operation's state file.
fn get_state_file_path(operation_id: &str) -> WtResult<PathBuf> {
    let ops_dir = get_operations_dir()?;
    Ok(ops_dir.join(format!("{}.json", operation_id)))
}

// ============================================================================
// State Persistence
// ============================================================================

/// Save an operation state to disk.
///
/// This is called after each item completes to checkpoint progress.
/// The state is saved as JSON to `~/.wt/operations/<operation_id>.json`.
pub fn save_state(state: &OperationState) -> WtResult<()> {
    let file_path = get_state_file_path(&state.id)?;

    let json = serde_json::to_string_pretty(state).map_err(|e| {
        WtError::new(
            "IO_ERROR",
            format!("Failed to serialise operation state: {}", e),
        )
    })?;

    fs::write(&file_path, json).map_err(|e| {
        WtError::new(
            "IO_ERROR",
            format!("Failed to write operation state file: {}", e),
        )
    })?;

    // Update cache (recover from poisoned mutex)
    match STATE_CACHE.lock() {
        Ok(mut cache) => {
            cache.insert(state.id.clone(), state.clone());
            evict_cache_if_needed(&mut cache);
        }
        Err(e) => {
            let mut cache = e.into_inner();
            cache.insert(state.id.clone(), state.clone());
            evict_cache_if_needed(&mut cache);
        }
    }

    Ok(())
}

/// Load an operation state from disk by ID.
pub fn load_state(operation_id: &str) -> WtResult<OperationState> {
    // Check cache first
    let cached = match STATE_CACHE.lock() {
        Ok(cache) => cache.get(operation_id).cloned(),
        Err(e) => e.into_inner().get(operation_id).cloned(),
    };
    if let Some(state) = cached {
        return Ok(state);
    }

    let file_path = get_state_file_path(operation_id)?;

    if !file_path.exists() {
        return Err(WtError::new(
            "NOT_FOUND",
            format!("Operation state not found: {}", operation_id),
        ));
    }

    let json = fs::read_to_string(&file_path).map_err(|e| {
        WtError::new(
            "IO_ERROR",
            format!("Failed to read operation state file: {}", e),
        )
    })?;

    let state: OperationState = serde_json::from_str(&json).map_err(|e| {
        WtError::new(
            "PARSE_ERROR",
            format!("Failed to parse operation state: {}", e),
        )
    })?;

    // Update cache
    match STATE_CACHE.lock() {
        Ok(mut cache) => { cache.insert(state.id.clone(), state.clone()); }
        Err(e) => { e.into_inner().insert(state.id.clone(), state.clone()); }
    }

    Ok(state)
}

/// Delete an operation state file.
///
/// Called when an operation completes successfully or is dismissed by the user.
pub fn delete_state(operation_id: &str) -> WtResult<()> {
    let file_path = get_state_file_path(operation_id)?;

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| {
            WtError::new(
                "IO_ERROR",
                format!("Failed to delete operation state file: {}", e),
            )
        })?;
    }

    // Remove from cache
    match STATE_CACHE.lock() {
        Ok(mut cache) => { cache.remove(operation_id); }
        Err(e) => { e.into_inner().remove(operation_id); }
    }

    Ok(())
}

// ============================================================================
// Operation Lifecycle
// ============================================================================

/// Get all resumable operations (interrupted or paused).
///
/// Scans the operations directory for state files and returns summaries
/// of operations that can be resumed.
pub fn get_resumable_operations() -> WtResult<Vec<ResumableOperationSummary>> {
    let ops_dir = get_operations_dir()?;

    let mut operations = Vec::new();

    let entries = fs::read_dir(&ops_dir).map_err(|e| {
        WtError::new(
            "IO_ERROR",
            format!("Failed to read operations directory: {}", e),
        )
    })?;

    for entry in entries.flatten() {
        let path = entry.path();

        // Skip non-JSON files
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }

        // Try to load the state
        if let Ok(json) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str::<OperationState>(&json) {
                // Only include resumable operations
                if state.is_resumable() {
                    operations.push(ResumableOperationSummary::from(&state));
                }
            }
        }
    }

    // Sort by updated_at descending (most recent first)
    operations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(operations)
}

/// Mark all running operations as interrupted.
///
/// This should be called on app startup to handle operations that were
/// running when the app crashed or was force-quit.
pub fn mark_running_as_interrupted() -> WtResult<u32> {
    let ops_dir = get_operations_dir()?;
    let mut count = 0;

    let entries = fs::read_dir(&ops_dir).map_err(|e| {
        WtError::new(
            "IO_ERROR",
            format!("Failed to read operations directory: {}", e),
        )
    })?;

    for entry in entries.flatten() {
        let path = entry.path();

        // Skip non-JSON files
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }

        // Try to load and update the state
        if let Ok(json) = fs::read_to_string(&path) {
            if let Ok(mut state) = serde_json::from_str::<OperationState>(&json) {
                if state.status == OperationStatus::Running {
                    state.mark_interrupted();

                    // Save the updated state
                    if let Ok(updated_json) = serde_json::to_string_pretty(&state) {
                        if fs::write(&path, updated_json).is_ok() {
                            count += 1;
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}

/// Complete an operation, optionally deleting its state file.
///
/// If `delete_on_success` is true and the operation completed successfully,
/// the state file will be deleted. Failed operations are kept for review.
#[allow(dead_code)]
pub fn complete_operation(operation_id: &str, delete_on_success: bool) -> WtResult<()> {
    let mut state = load_state(operation_id)?;

    // Check if all items are processed
    let has_pending = state.pending_items().iter().any(|_| true);

    if has_pending {
        // Operation was cancelled - mark remaining as skipped
        state.skip_remaining(Some("Operation cancelled".to_string()));
    }

    // Determine final status based on results
    let has_failures = !state.failed_items().is_empty();

    if has_failures {
        state.mark_failed();
    } else {
        state.mark_completed();
    }

    save_state(&state)?;

    // Delete state file if successful and requested
    if delete_on_success && state.status == OperationStatus::Completed {
        delete_state(operation_id)?;
    }

    Ok(())
}

// ============================================================================
// Cache Management
// ============================================================================

/// Register an operation state in the cache.
///
/// Called when starting a new operation to track it in memory.
#[allow(dead_code)]
pub fn register_state(state: &OperationState) {
    match STATE_CACHE.lock() {
        Ok(mut cache) => { cache.insert(state.id.clone(), state.clone()); }
        Err(e) => { e.into_inner().insert(state.id.clone(), state.clone()); }
    }
}

/// Get a cached state by ID (returns None if not cached).
#[allow(dead_code)]
pub fn get_cached_state(operation_id: &str) -> Option<OperationState> {
    match STATE_CACHE.lock() {
        Ok(cache) => cache.get(operation_id).cloned(),
        Err(e) => e.into_inner().get(operation_id).cloned(),
    }
}

/// Update a cached state.
#[allow(dead_code)]
pub fn update_cached_state(state: &OperationState) {
    match STATE_CACHE.lock() {
        Ok(mut cache) => { cache.insert(state.id.clone(), state.clone()); }
        Err(e) => { e.into_inner().insert(state.id.clone(), state.clone()); }
    }
}

/// Remove an operation from the cache.
#[allow(dead_code)]
pub fn remove_from_cache(operation_id: &str) {
    match STATE_CACHE.lock() {
        Ok(mut cache) => { cache.remove(operation_id); }
        Err(e) => { e.into_inner().remove(operation_id); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ItemStatus, PersistentOperationType};

    #[test]
    fn test_operation_state_creation() {
        let items = vec![
            "main".to_string(),
            "feature/test".to_string(),
            "develop".to_string(),
        ];
        let state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        assert_eq!(state.repo_name, "test-repo");
        assert_eq!(state.operation_type, PersistentOperationType::PullAll);
        assert_eq!(state.total_items, 3);
        assert_eq!(state.completed_items, 0);
        assert_eq!(state.status, OperationStatus::Running);
        assert_eq!(state.items.len(), 3);

        for item in &state.items {
            assert_eq!(item.status, ItemStatus::Pending);
        }
    }

    #[test]
    fn test_mark_item_success() {
        let items = vec!["main".to_string(), "develop".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        state.mark_item_success("main", Some("+5 commits".to_string()));

        assert_eq!(state.completed_items, 1);
        assert_eq!(state.items[0].status, ItemStatus::Success);
        assert_eq!(state.items[0].message, Some("+5 commits".to_string()));
        assert!(state.items[0].completed_at.is_some());
        assert_eq!(state.items[1].status, ItemStatus::Pending);
    }

    #[test]
    fn test_mark_item_failed() {
        let items = vec!["main".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        state.mark_item_failed("main", "Merge conflict".to_string());

        assert_eq!(state.completed_items, 1);
        assert_eq!(state.items[0].status, ItemStatus::Failed);
        assert_eq!(state.items[0].message, Some("Merge conflict".to_string()));
    }

    #[test]
    fn test_pending_items() {
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        state.mark_item_success("a", None);
        state.mark_item_failed("b", "error".to_string());

        let pending = state.pending_items();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].name, "c");

        let pending_names = state.pending_item_names();
        assert_eq!(pending_names, vec!["c"]);
    }

    #[test]
    fn test_skip_remaining() {
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        state.mark_item_success("a", None);
        state.skip_remaining(Some("cancelled".to_string()));

        assert_eq!(state.completed_items, 3);
        assert_eq!(state.items[0].status, ItemStatus::Success);
        assert_eq!(state.items[1].status, ItemStatus::Skipped);
        assert_eq!(state.items[2].status, ItemStatus::Skipped);
    }

    #[test]
    fn test_is_resumable() {
        let items = vec!["a".to_string(), "b".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        // Running operations are not resumable (they're in progress)
        assert!(!state.is_resumable());

        // Mark as interrupted with pending items - should be resumable
        state.mark_item_success("a", None);
        state.mark_interrupted();
        assert!(state.is_resumable());

        // Complete all items - should not be resumable
        state.mark_item_success("b", None);
        assert!(!state.is_resumable());
    }

    #[test]
    fn test_resumable_operation_summary() {
        let items = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let mut state = OperationState::new(
            PersistentOperationType::PullAll,
            "test-repo",
            items,
        );

        state.mark_item_success("a", None);
        state.mark_item_failed("b", "error".to_string());
        state.mark_interrupted();

        let summary = ResumableOperationSummary::from(&state);

        assert_eq!(summary.total_items, 3);
        assert_eq!(summary.completed_items, 2);
        assert_eq!(summary.successful_items, 1);
        assert_eq!(summary.failed_items, 1);
        assert_eq!(summary.pending_items, 1);
        assert_eq!(summary.status, OperationStatus::Interrupted);
    }
}
