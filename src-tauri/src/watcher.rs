// Real-time file system watcher for git worktrees
//
// Uses the `notify` crate to monitor git directories for changes and emit
// events to the frontend for real-time UI updates.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
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
    log::info!(
        "Starting file watcher for '{}' ({} worktrees)",
        repo_name,
        worktree_paths.len()
    );

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

    let mut registered_targets = 0;
    let mut seen_targets = HashSet::new();

    // Watch each worktree's resolved git directory
    for path_str in &worktree_paths {
        let Some(targets) = collect_watch_targets(Path::new(path_str)) else {
            log::debug!("Could not resolve git directory for {}", path_str);
            continue;
        };

        for target in targets {
            if !seen_targets.insert(target.clone()) {
                continue;
            }

            let mode = if target.is_dir() {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };

            if let Err(e) = debouncer.watcher().watch(&target, mode) {
                log::debug!("Could not watch {}: {}", target.display(), e);
            } else {
                registered_targets += 1;
            }
        }
    }

    if registered_targets == 0 {
        return Err(WtError::new(
            "WATCHER_ERROR",
            format!("No watch targets registered for '{}'", repo_name),
        ));
    }

    // Store the watcher handle
    let handle = WatcherHandle {
        _debouncer: debouncer,
        repo_name: repo_name.to_string(),
    };

    match WATCHERS.lock() {
        Ok(mut watchers) => {
            watchers.insert(repo_name.to_string(), handle);
        }
        Err(e) => {
            e.into_inner().insert(repo_name.to_string(), handle);
        }
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
        Err(e) => {
            e.into_inner().remove(repo_name);
        }
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

fn resolve_git_dir(worktree_path: &Path) -> Option<PathBuf> {
    let dot_git = worktree_path.join(".git");

    if dot_git.is_dir() {
        return dot_git.canonicalize().ok();
    }

    if !dot_git.is_file() {
        return None;
    }

    let content = fs::read_to_string(&dot_git).ok()?;
    let gitdir = content.trim().strip_prefix("gitdir:")?.trim();
    if gitdir.is_empty() {
        return None;
    }

    let path = PathBuf::from(gitdir);
    let path = if path.is_absolute() {
        path
    } else {
        worktree_path.join(path)
    };

    path.canonicalize().ok()
}

fn resolve_common_dir(git_dir: &Path) -> PathBuf {
    let Ok(content) = fs::read_to_string(git_dir.join("commondir")) else {
        return git_dir.to_path_buf();
    };

    let commondir = content.trim();
    if commondir.is_empty() {
        return git_dir.to_path_buf();
    }

    let path = PathBuf::from(commondir);
    let path = if path.is_absolute() {
        path
    } else {
        git_dir.join(path)
    };

    path.canonicalize().unwrap_or(path)
}

fn collect_watch_targets(worktree_path: &Path) -> Option<Vec<PathBuf>> {
    let git_dir = resolve_git_dir(worktree_path)?;
    let common_dir = resolve_common_dir(&git_dir);

    Some(
        [
            git_dir.join("HEAD"),
            git_dir.join("index"),
            common_dir.join("FETCH_HEAD"),
            common_dir.join("refs").join("heads"),
        ]
        .into_iter()
        .filter(|target| target.exists())
        .collect(),
    )
}

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
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "grove-watcher-test-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

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

    #[test]
    fn test_resolve_git_dir_directory() {
        let worktree = temp_dir("git-dir");
        let git_dir = worktree.join(".git");
        fs::create_dir(&git_dir).unwrap();

        assert_eq!(
            resolve_git_dir(&worktree).unwrap(),
            git_dir.canonicalize().unwrap()
        );

        fs::remove_dir_all(worktree).unwrap();
    }

    #[test]
    fn test_resolve_git_dir_pointer_file_absolute() {
        let root = temp_dir("gitdir-absolute");
        let worktree = root.join("worktree");
        let git_dir = root.join("repo.git").join("worktrees").join("wt1");
        fs::create_dir_all(&worktree).unwrap();
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();

        assert_eq!(
            resolve_git_dir(&worktree).unwrap(),
            git_dir.canonicalize().unwrap()
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_resolve_git_dir_pointer_file_relative() {
        let root = temp_dir("gitdir-relative");
        let worktree = root.join("worktree");
        let git_dir = root.join("repo.git").join("worktrees").join("wt1");
        fs::create_dir_all(&worktree).unwrap();
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(worktree.join(".git"), "gitdir: ../repo.git/worktrees/wt1\n").unwrap();

        assert_eq!(
            resolve_git_dir(&worktree).unwrap(),
            git_dir.canonicalize().unwrap()
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn test_resolve_git_dir_missing() {
        let worktree = temp_dir("missing");

        assert!(resolve_git_dir(&worktree).is_none());

        fs::remove_dir_all(worktree).unwrap();
    }

    #[test]
    fn test_watch_targets_for_linked_worktree() {
        let root = temp_dir("targets");
        let worktree = root.join("worktree");
        let common_dir = root.join("repo.git");
        let git_dir = common_dir.join("worktrees").join("wt1");
        let refs_heads = common_dir.join("refs").join("heads");
        fs::create_dir_all(&worktree).unwrap();
        fs::create_dir_all(&git_dir).unwrap();
        fs::create_dir_all(&refs_heads).unwrap();
        fs::write(
            worktree.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();
        fs::write(git_dir.join("commondir"), "../..").unwrap();
        fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::write(git_dir.join("index"), "").unwrap();
        fs::write(common_dir.join("FETCH_HEAD"), "").unwrap();

        let common_dir = common_dir.canonicalize().unwrap();
        let git_dir = git_dir.canonicalize().unwrap();
        let refs_heads = refs_heads.canonicalize().unwrap();
        let targets = collect_watch_targets(&worktree).unwrap();
        assert!(targets.contains(&git_dir.join("HEAD")));
        assert!(targets.contains(&git_dir.join("index")));
        assert!(targets.contains(&common_dir.join("FETCH_HEAD")));
        assert!(targets.contains(&refs_heads));

        fs::remove_dir_all(root).unwrap();
    }
}
