// Lifecycle hook file operations for wt hook management
//
// This module handles reading, writing, and managing wt lifecycle hooks.
// Hooks are shell scripts that run at various points in the worktree lifecycle:
// pre-add, post-add, post-pull, post-switch, post-sync, pre-rm, post-rm.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::fs_safety::{
    canonicalise_existing, delete_file, ensure_within_any_root, get_allowed_roots, get_file_meta,
    get_wt_config_dir, read_text_file, validate_hook_filename, write_text_file_atomic,
};
use crate::types::WtError;

// ============================================================================
// Types
// ============================================================================

/// Lifecycle hook event types.
///
/// These correspond to the different phases of worktree operations
/// where hooks can be executed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookEvent {
    /// Runs before creating a worktree
    PreAdd,
    /// Runs after creating a worktree
    PostAdd,
    /// Runs after pulling changes
    PostPull,
    /// Runs after switching worktrees
    PostSwitch,
    /// Runs after syncing (rebasing) a worktree
    PostSync,
    /// Runs before removing a worktree
    PreRm,
    /// Runs after removing a worktree
    PostRm,
}

impl HookEvent {
    /// Get the directory/file name for this hook event.
    pub fn as_str(&self) -> &'static str {
        match self {
            HookEvent::PreAdd => "pre-add",
            HookEvent::PostAdd => "post-add",
            HookEvent::PostPull => "post-pull",
            HookEvent::PostSwitch => "post-switch",
            HookEvent::PostSync => "post-sync",
            HookEvent::PreRm => "pre-rm",
            HookEvent::PostRm => "post-rm",
        }
    }

    /// Get all hook events in execution order.
    pub fn all() -> &'static [HookEvent] {
        &[
            HookEvent::PreAdd,
            HookEvent::PostAdd,
            HookEvent::PostPull,
            HookEvent::PostSwitch,
            HookEvent::PostSync,
            HookEvent::PreRm,
            HookEvent::PostRm,
        ]
    }
}

impl std::fmt::Display for HookEvent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Scope of a hook script.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookScope {
    /// Single hook file (e.g., post-add)
    Single,
    /// Global .d directory script (e.g., post-add.d/01-setup.sh)
    GlobalD,
    /// Repo-specific .d directory script (e.g., post-add.d/myrepo/01-setup.sh)
    RepoD,
}

impl std::fmt::Display for HookScope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HookScope::Single => write!(f, "single"),
            HookScope::GlobalD => write!(f, "global.d"),
            HookScope::RepoD => write!(f, "repo.d"),
        }
    }
}

/// Security status of a hook script.
///
/// Mirrors the security checks performed by wt's `verify_hook_security` function.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookSecurity {
    /// Whether the hook is owned by the current user (Unix only)
    pub owned_by_current_user: Option<bool>,
    /// Whether the hook is world-writable (security risk)
    pub world_writable: Option<bool>,
    /// Whether the hook has the executable bit set
    pub executable: bool,
    /// Whether wt would allow this hook to run
    pub allowed_to_run: bool,
    /// Reason if the hook is blocked from running
    pub blocked_reason: Option<String>,
}

/// Metadata about a hook script.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookScriptMeta {
    /// Which event this hook runs on
    pub event: HookEvent,
    /// Scope of the hook (single, global.d, repo.d)
    pub scope: HookScope,
    /// Repository name (only for RepoD scope)
    pub repo: Option<String>,
    /// Filename of the hook script
    pub name: String,
    /// Full path to the hook script
    pub path: String,
    /// Whether the hook is a symlink
    pub is_symlink: bool,
    /// Target path if the hook is a symlink
    pub symlink_target: Option<String>,
    /// Key for stable sorting (filename-based)
    pub order_key: String,
    /// Security status
    pub security: HookSecurity,
}

/// Full contents of a hook script.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookScriptContents {
    /// Hook metadata
    pub meta: HookScriptMeta,
    /// Script contents
    pub content: String,
}

// ============================================================================
// Hooks Directory Resolution
// ============================================================================

/// Get the hooks directory path.
///
/// Checks in order:
/// 1. GROVE_HOOKS_DIR environment variable
/// 2. ~/.grove/hooks (default)
pub fn get_hooks_dir(config_hooks_dir: Option<&str>) -> Result<PathBuf, WtError> {
    // First check config-provided hooks dir
    if let Some(dir) = config_hooks_dir {
        let path = PathBuf::from(dir);
        if path.exists() {
            return path.canonicalize().map_err(|e| {
                WtError::new("IO_ERROR", format!("Failed to resolve hooks directory: {}", e))
            });
        }
    }

    // Check environment variable
    if let Ok(dir) = std::env::var("GROVE_HOOKS_DIR") {
        let path = PathBuf::from(dir);
        if path.exists() {
            return path.canonicalize().map_err(|e| {
                WtError::new("IO_ERROR", format!("Failed to resolve hooks directory: {}", e))
            });
        }
    }

    // Default to ~/.grove/hooks
    let default = get_wt_config_dir()?.join("hooks");
    Ok(default)
}

// ============================================================================
// Security Checks
// ============================================================================

/// Check the security status of a hook script.
///
/// This mirrors the security checks in wt's `verify_hook_security` function.
#[cfg(unix)]
fn check_hook_security(path: &Path) -> HookSecurity {
    use std::os::unix::fs::MetadataExt;

    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => {
            return HookSecurity {
                owned_by_current_user: None,
                world_writable: None,
                executable: false,
                allowed_to_run: false,
                blocked_reason: Some("Cannot read file metadata".to_string()),
            };
        }
    };

    let mode = metadata.permissions().mode();
    let executable = mode & 0o111 != 0;
    let world_writable = mode & 0o002 != 0;

    // Check ownership
    // SAFETY: getuid() is always safe to call
    let current_uid = unsafe { libc::getuid() };
    let file_uid = metadata.uid();
    let owned_by_current_user = current_uid == file_uid;

    // Determine if allowed to run
    let (allowed_to_run, blocked_reason) = if !executable {
        (false, Some("Hook is not executable".to_string()))
    } else if world_writable {
        (false, Some("Hook is world-writable (security risk)".to_string()))
    } else if !owned_by_current_user && file_uid != 0 {
        (false, Some("Hook is not owned by current user or root".to_string()))
    } else {
        (true, None)
    };

    HookSecurity {
        owned_by_current_user: Some(owned_by_current_user),
        world_writable: Some(world_writable),
        executable,
        allowed_to_run,
        blocked_reason,
    }
}

#[cfg(not(unix))]
fn check_hook_security(path: &Path) -> HookSecurity {
    // On non-Unix, we can only check if the file exists
    let executable = path.exists();
    
    HookSecurity {
        owned_by_current_user: None,
        world_writable: None,
        executable,
        allowed_to_run: executable,
        blocked_reason: if executable { None } else { Some("File does not exist".to_string()) },
    }
}

// ============================================================================
// Hook Listing
// ============================================================================

/// List all hooks for a given event.
fn list_hooks_for_event(
    hooks_dir: &Path,
    event: HookEvent,
    repo_name: Option<&str>,
) -> Vec<HookScriptMeta> {
    let mut hooks = Vec::new();
    let event_name = event.as_str();

    // 1. Single hook (e.g., post-add)
    let single_path = hooks_dir.join(event_name);
    if single_path.exists() && single_path.is_file() {
        if let Some(meta) = create_hook_meta(&single_path, event, HookScope::Single, None) {
            hooks.push(meta);
        }
    }

    // 2. Global .d scripts (e.g., post-add.d/*)
    let global_d_path = hooks_dir.join(format!("{}.d", event_name));
    if global_d_path.exists() && global_d_path.is_dir() {
        if let Ok(entries) = fs::read_dir(&global_d_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                // Skip directories (they might be repo-specific subdirs)
                if path.is_file() && !should_exclude_hook_file(&path) {
                    if let Some(meta) = create_hook_meta(&path, event, HookScope::GlobalD, None) {
                        hooks.push(meta);
                    }
                }
            }
        }
    }

    // 3. Repo-specific .d scripts (e.g., post-add.d/myrepo/*)
    if let Some(repo) = repo_name {
        let repo_d_path = global_d_path.join(repo);
        if repo_d_path.exists() && repo_d_path.is_dir() {
            if let Ok(entries) = fs::read_dir(&repo_d_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() && !should_exclude_hook_file(&path) {
                        if let Some(meta) = create_hook_meta(&path, event, HookScope::RepoD, Some(repo.to_string())) {
                            hooks.push(meta);
                        }
                    }
                }
            }
        }
    }

    // Sort by order_key (filename) for consistent ordering
    hooks.sort_by(|a, b| a.order_key.cmp(&b.order_key));

    hooks
}

/// Create hook metadata from a file path.
/// Check if a filename should be excluded from hook listings.
/// Excludes hidden files (starting with .), backup files, and system files.
fn should_exclude_hook_file(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
        return true;
    };
    
    // Exclude hidden files (starting with .)
    if file_name.starts_with('.') {
        return true;
    }
    
    // Exclude backup files
    if file_name.ends_with('~') || file_name.ends_with(".bak") || file_name.ends_with(".swp") {
        return true;
    }
    
    // Exclude common editor temp files
    if file_name.starts_with('#') && file_name.ends_with('#') {
        return true;
    }
    
    false
}

fn create_hook_meta(
    path: &Path,
    event: HookEvent,
    scope: HookScope,
    repo: Option<String>,
) -> Option<HookScriptMeta> {
    let name = path.file_name()?.to_string_lossy().to_string();
    let file_meta = get_file_meta(path);
    let security = check_hook_security(path);

    Some(HookScriptMeta {
        event,
        scope,
        repo,
        name: name.clone(),
        path: path.to_string_lossy().to_string(),
        is_symlink: file_meta.is_symlink,
        symlink_target: file_meta.symlink_target,
        order_key: name,
        security,
    })
}

/// List all hooks, optionally filtered by repository.
pub fn list_hooks(
    hooks_dir: Option<&str>,
    repo_name: Option<&str>,
) -> Result<Vec<HookScriptMeta>, WtError> {
    let dir = get_hooks_dir(hooks_dir)?;
    
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut all_hooks = Vec::new();

    for event in HookEvent::all() {
        let event_hooks = list_hooks_for_event(&dir, *event, repo_name);
        all_hooks.extend(event_hooks);
    }

    Ok(all_hooks)
}

// ============================================================================
// Hook CRUD Operations
// ============================================================================

/// Read a hook script's contents.
pub fn read_hook(path: &str, herd_root: Option<&str>) -> Result<HookScriptContents, WtError> {
    let canonical = canonicalise_existing(path)?;
    
    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    // Determine event and scope from path
    let (event, scope, repo) = parse_hook_path(&canonical)?;
    
    let name = canonical
        .file_name()
        .ok_or_else(|| WtError::new("INVALID_PATH", "Path has no filename"))?
        .to_string_lossy()
        .to_string();

    let file_meta = get_file_meta(&canonical);
    let security = check_hook_security(&canonical);
    let content = read_text_file(&canonical)?;

    Ok(HookScriptContents {
        meta: HookScriptMeta {
            event,
            scope,
            repo,
            name: name.clone(),
            path: canonical.to_string_lossy().to_string(),
            is_symlink: file_meta.is_symlink,
            symlink_target: file_meta.symlink_target,
            order_key: name,
            security,
        },
        content,
    })
}

/// Parse a hook path to determine its event, scope, and repo.
fn parse_hook_path(path: &Path) -> Result<(HookEvent, HookScope, Option<String>), WtError> {
    let path_str = path.to_string_lossy();
    
    for event in HookEvent::all() {
        let event_name = event.as_str();
        let d_dir = format!("{}.d", event_name);

        if path_str.contains(&d_dir) {
            // It's a .d script
            // Check if it's repo-specific by looking at the parent directory
            if let Some(parent) = path.parent() {
                let parent_name = parent.file_name()
                    .map(|n| n.to_string_lossy().to_string());
                
                if let Some(ref pname) = parent_name {
                    if pname == &d_dir {
                        // Global .d script
                        return Ok((*event, HookScope::GlobalD, None));
                    } else if parent.parent()
                        .and_then(|gp| gp.file_name())
                        .map(|n| n.to_string_lossy().to_string())
                        .as_ref() == Some(&d_dir)
                    {
                        // Repo-specific .d script
                        return Ok((*event, HookScope::RepoD, parent_name));
                    }
                }
            }
        } else if path_str.ends_with(event_name) || path_str.contains(&format!("/{}", event_name)) {
            // Single hook
            return Ok((*event, HookScope::Single, None));
        }
    }

    Err(WtError::new(
        "INVALID_PATH",
        "Could not determine hook event from path",
    ))
}

/// Write a hook script.
pub fn write_hook(
    path: &str,
    content: &str,
    herd_root: Option<&str>,
) -> Result<(), WtError> {
    let canonical = canonicalise_existing(path)?;
    
    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    // Write with executable permissions (0755) and backup
    write_text_file_atomic(&canonical, content, 0o755, true)?;

    Ok(())
}

/// Create a new hook script.
pub fn create_hook(
    hooks_dir: Option<&str>,
    event: HookEvent,
    scope: HookScope,
    repo_name: Option<&str>,
    file_name: &str,
    content: &str,
    herd_root: Option<&str>,
) -> Result<HookScriptMeta, WtError> {
    let dir = get_hooks_dir(hooks_dir)?;
    
    // Validate filename
    let is_d_script = matches!(scope, HookScope::GlobalD | HookScope::RepoD);
    validate_hook_filename(file_name, is_d_script)?;

    // Build the path
    let path = match scope {
        HookScope::Single => dir.join(event.as_str()),
        HookScope::GlobalD => dir.join(format!("{}.d", event.as_str())).join(file_name),
        HookScope::RepoD => {
            let repo = repo_name.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "Repository name required for repo-specific hooks")
            })?;
            dir.join(format!("{}.d", event.as_str())).join(repo).join(file_name)
        }
    };

    // Check if file already exists
    if path.exists() {
        return Err(WtError::new(
            "ALREADY_EXISTS",
            format!("Hook already exists: {}", path.display()),
        ));
    }

    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    if let Some(parent) = path.parent() {
        // Create parent directories if needed
        fs::create_dir_all(parent).map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to create hook directory: {}", e))
        })?;
        
        let canonical_parent = parent.canonicalize().map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to canonicalize parent: {}", e))
        })?;
        ensure_within_any_root(&canonical_parent, &roots)?;
    }

    // Write the hook with executable permissions
    write_text_file_atomic(&path, content, 0o755, false)?;

    log::info!("Created hook: {} (scope: {}, event: {})", path.display(), scope, event);

    // Return the new hook's metadata
    create_hook_meta(&path, event, scope, repo_name.map(|s| s.to_string()))
        .ok_or_else(|| WtError::new("IO_ERROR", "Failed to read created hook"))
}

/// Delete a hook script.
pub fn delete_hook(path: &str, herd_root: Option<&str>) -> Result<(), WtError> {
    let canonical = canonicalise_existing(path)?;
    
    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    delete_file(&canonical)
}

/// Rename a hook script (used for reordering .d scripts).
pub fn rename_hook(
    path: &str,
    new_file_name: &str,
    herd_root: Option<&str>,
) -> Result<HookScriptMeta, WtError> {
    let canonical = canonicalise_existing(path)?;
    
    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    // Determine if this is a .d script for validation
    let (event, scope, repo) = parse_hook_path(&canonical)?;
    let is_d_script = matches!(scope, HookScope::GlobalD | HookScope::RepoD);
    validate_hook_filename(new_file_name, is_d_script)?;

    // Build new path
    let new_path = canonical
        .parent()
        .ok_or_else(|| WtError::new("INVALID_PATH", "Path has no parent"))?
        .join(new_file_name);

    // Check if new path already exists
    if new_path.exists() {
        return Err(WtError::new(
            "ALREADY_EXISTS",
            format!("A hook with that name already exists: {}", new_path.display()),
        ));
    }

    // Rename the file
    fs::rename(&canonical, &new_path).map_err(|e| {
        WtError::new("IO_ERROR", format!("Failed to rename hook: {}", e))
    })?;

    // Return updated metadata
    create_hook_meta(&new_path, event, scope, repo)
        .ok_or_else(|| WtError::new("IO_ERROR", "Failed to read renamed hook"))
}

/// Set or clear the executable bit on a hook.
#[cfg(unix)]
pub fn set_hook_executable(
    path: &str,
    executable: bool,
    herd_root: Option<&str>,
) -> Result<HookScriptMeta, WtError> {
    let canonical = canonicalise_existing(path)?;
    
    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    let metadata = fs::metadata(&canonical).map_err(|e| {
        WtError::new("IO_ERROR", format!("Failed to read file metadata: {}", e))
    })?;

    let mut perms = metadata.permissions();
    let current_mode = perms.mode();

    let new_mode = if executable {
        // Add execute bits where there are read bits
        current_mode | ((current_mode & 0o444) >> 2)
    } else {
        // Remove all execute bits
        current_mode & !0o111
    };

    perms.set_mode(new_mode);
    fs::set_permissions(&canonical, perms).map_err(|e| {
        WtError::new("IO_ERROR", format!("Failed to set permissions: {}", e))
    })?;

    // Return updated metadata
    let (event, scope, repo) = parse_hook_path(&canonical)?;
    create_hook_meta(&canonical, event, scope, repo)
        .ok_or_else(|| WtError::new("IO_ERROR", "Failed to read hook after permission change"))
}

#[cfg(not(unix))]
pub fn set_hook_executable(
    path: &str,
    _executable: bool,
    herd_root: Option<&str>,
) -> Result<HookScriptMeta, WtError> {
    // On non-Unix, we can't change executable bit, just return current state
    let canonical = canonicalise_existing(path)?;
    let roots = get_allowed_roots(herd_root)?;
    ensure_within_any_root(&canonical, &roots)?;

    let (event, scope, repo) = parse_hook_path(&canonical)?;
    create_hook_meta(&canonical, event, scope, repo)
        .ok_or_else(|| WtError::new("IO_ERROR", "Failed to read hook"))
}

// ============================================================================
// Default Hook Templates
// ============================================================================

/// Get a default shebang and header for new hook scripts.
#[allow(dead_code)]
pub fn get_default_hook_template(event: HookEvent) -> String {
    format!(
        r#"#!/bin/bash
# {} hook
# This script runs {} a worktree is {}
#
# Available environment variables:
# - WT_REPO: Repository name
# - WT_BRANCH: Branch name
# - WT_PATH: Worktree path
# - WT_URL: Development URL (if configured)
# - WT_DB: Database name (if configured)

set -e

# Your hook code here
"#,
        event.as_str(),
        match event {
            HookEvent::PreAdd | HookEvent::PreRm => "before",
            _ => "after",
        },
        match event {
            HookEvent::PreAdd | HookEvent::PostAdd => "created",
            HookEvent::PreRm | HookEvent::PostRm => "removed",
            HookEvent::PostPull => "pulled",
            HookEvent::PostSwitch => "switched to",
            HookEvent::PostSync => "synced",
        }
    )
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hook_event_as_str() {
        assert_eq!(HookEvent::PreAdd.as_str(), "pre-add");
        assert_eq!(HookEvent::PostAdd.as_str(), "post-add");
        assert_eq!(HookEvent::PostPull.as_str(), "post-pull");
        assert_eq!(HookEvent::PostSwitch.as_str(), "post-switch");
        assert_eq!(HookEvent::PostSync.as_str(), "post-sync");
        assert_eq!(HookEvent::PreRm.as_str(), "pre-rm");
        assert_eq!(HookEvent::PostRm.as_str(), "post-rm");
    }

    #[test]
    fn test_hook_scope_display() {
        assert_eq!(HookScope::Single.to_string(), "single");
        assert_eq!(HookScope::GlobalD.to_string(), "global.d");
        assert_eq!(HookScope::RepoD.to_string(), "repo.d");
    }

    #[test]
    fn test_default_hook_template() {
        let template = get_default_hook_template(HookEvent::PostAdd);
        assert!(template.starts_with("#!/bin/bash"));
        assert!(template.contains("post-add"));
        assert!(template.contains("WT_REPO"));
    }
}
