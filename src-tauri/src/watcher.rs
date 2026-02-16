// Real-time file system watcher for git worktrees
//
// Uses the `notify` crate to monitor git directories for changes and emit
// events to the frontend for real-time UI updates.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, DebouncedEventKind, Debouncer};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::types::WtError;

// ============================================================================
// Types
// ============================================================================

/// Event emitted when a watched worktree changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeChangedEvent {
    /// Repository name
    pub repo: String,
    /// Type of change detected
    pub change_type: String,
    /// Affected paths (relative to worktree)
    pub paths: Vec<String>,
}

/// Handle to a running watcher, allowing it to be stopped
struct WatcherHandle {
    _debouncer: Debouncer<RecommendedWatcher>,
    #[allow(dead_code)]
    repo_name: String,
}

// ============================================================================
// Global State
// ============================================================================

lazy_static::lazy_static! {
    /// Active watchers keyed by repository name
    static ref WATCHERS: Mutex<HashMap<String, WatcherHandle>> = Mutex::new(HashMap::new());
}

// ============================================================================
// Watch Functions
// ============================================================================

/// Start watching a repository's worktrees for changes.
///
/// Watches the following paths in each worktree's `.git` directory:
/// - `HEAD` - Branch changes (checkout)
/// - `index` - Staging area changes
/// - `refs/heads/` - Local branch updates
/// - `FETCH_HEAD` - Remote fetch updates
///
/// Emits `worktree_changed` events when changes are detected.
pub fn start_watching(
    repo_name: &str,
    worktree_paths: Vec<String>,
    app: AppHandle,
) -> Result<(), WtError> {
    log::info!("Starting file watcher for '{}' ({} worktrees)", repo_name, worktree_paths.len());

    // Stop any existing watcher for this repo
    stop_watching(repo_name)?;

    if worktree_paths.is_empty() {
        return Ok(());
    }

    let repo_name_clone = repo_name.to_string();
    let app_clone = app.clone();

    // Create a debounced watcher with 500ms delay to batch rapid changes
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            match res {
                Ok(events) => {
                    // H9: Cap event paths to prevent unbounded memory use on rapid changes
                    const MAX_EVENT_PATHS: usize = 500;
                    let paths: Vec<String> = events
                        .iter()
                        .filter(|e| e.kind == DebouncedEventKind::Any)
                        .filter_map(|e| e.path.to_str().map(String::from))
                        .take(MAX_EVENT_PATHS)
                        .collect();

                    if !paths.is_empty() {
                        // Determine change type from paths
                        let change_type = determine_change_type(&paths);

                        let event = WorktreeChangedEvent {
                            repo: repo_name_clone.clone(),
                            change_type,
                            paths,
                        };

                        if let Err(e) = app_clone.emit("worktree_changed", &event) {
                            log::error!("Failed to emit worktree_changed event: {}", e);
                        }
                    }
                }
                Err(e) => {
                    log::error!("File watcher error: {}", e);
                }
            }
        },
    )
    .map_err(|e| WtError::new("WATCHER_ERROR", format!("Failed to create watcher: {}", e)))?;

    // Watch each worktree's .git directory
    for path_str in &worktree_paths {
        let git_dir = PathBuf::from(path_str).join(".git");

        // Watch key files in .git
        let watch_targets = [
            git_dir.join("HEAD"),
            git_dir.join("index"),
            git_dir.join("FETCH_HEAD"),
            git_dir.join("refs").join("heads"),
        ];

        for target in watch_targets {
            if target.exists() {
                let mode = if target.is_dir() {
                    RecursiveMode::Recursive
                } else {
                    RecursiveMode::NonRecursive
                };

                if let Err(e) = debouncer.watcher().watch(&target, mode) {
                    // Log but continue - some targets may not exist
                    log::debug!("Could not watch {}: {}", target.display(), e);
                }
            }
        }
    }

    // Store the watcher handle
    let handle = WatcherHandle {
        _debouncer: debouncer,
        repo_name: repo_name.to_string(),
    };

    match WATCHERS.lock() {
        Ok(mut watchers) => { watchers.insert(repo_name.to_string(), handle); }
        Err(e) => { e.into_inner().insert(repo_name.to_string(), handle); }
    }

    Ok(())
}

/// Stop watching a repository.
pub fn stop_watching(repo_name: &str) -> Result<(), WtError> {
    match WATCHERS.lock() {
        Ok(mut watchers) => {
            if watchers.remove(repo_name).is_some() {
                log::info!("Stopped file watcher for '{}'", repo_name);
            }
        }
        Err(e) => { e.into_inner().remove(repo_name); }
    }
    Ok(())
}

/// Check if a repository is currently being watched.
pub fn is_watching(repo_name: &str) -> bool {
    match WATCHERS.lock() {
        Ok(watchers) => watchers.contains_key(repo_name),
        Err(e) => e.into_inner().contains_key(repo_name),
    }
}

/// Get the list of currently watched repositories.
#[allow(dead_code)]
pub fn get_watched_repos() -> Vec<String> {
    match WATCHERS.lock() {
        Ok(watchers) => watchers.keys().cloned().collect(),
        Err(e) => e.into_inner().keys().cloned().collect(),
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Determine the type of change from the affected paths.
fn determine_change_type(paths: &[String]) -> String {
    for path in paths {
        // Check for FETCH_HEAD before HEAD since FETCH_HEAD contains "HEAD"
        if path.contains("FETCH_HEAD") {
            return "fetch".to_string();
        }
        if path.contains("HEAD") {
            return "head".to_string();
        }
        if path.contains("index") {
            return "index".to_string();
        }
        if path.contains("refs/heads") {
            return "refs".to_string();
        }
    }
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_change_type_head() {
        let paths = vec!["/path/to/.git/HEAD".to_string()];
        assert_eq!(determine_change_type(&paths), "head");
    }

    #[test]
    fn test_determine_change_type_index() {
        let paths = vec!["/path/to/.git/index".to_string()];
        assert_eq!(determine_change_type(&paths), "index");
    }

    #[test]
    fn test_determine_change_type_fetch() {
        let paths = vec!["/path/to/.git/FETCH_HEAD".to_string()];
        assert_eq!(determine_change_type(&paths), "fetch");
    }

    #[test]
    fn test_determine_change_type_refs() {
        let paths = vec!["/path/to/.git/refs/heads/main".to_string()];
        assert_eq!(determine_change_type(&paths), "refs");
    }

    #[test]
    fn test_determine_change_type_unknown() {
        let paths = vec!["/path/to/something".to_string()];
        assert_eq!(determine_change_type(&paths), "unknown");
    }
}
