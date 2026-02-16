// Tauri IPC command handlers
//
// These commands are callable from the Vue frontend via Tauri's invoke API.
// Each command wraps the grove CLI executor and returns typed results.

use std::path::PathBuf;
use std::process::Command;

use tauri::{command, Emitter, Manager};
use tokio::task::spawn_blocking;

use crate::operation_state;
use crate::types::{
    BranchesResult, ChangesResult, CloneResult, Config, CreateWorktreeResponse, HealthResult,
    LogResult, PruneResult, PullAllResult, PullResult, RecentWorktree, RemoveWorktreeResponse,
    RepairResult, Repository, ResumableOperationSummary, SyncResult, UnlockResult, Worktree,
    WtError,
};
use crate::wt;

// ============================================================================
// Input Validation
// ============================================================================

/// Validate and canonicalise a filesystem path.
///
/// Returns the canonical path if valid, or an error if:
/// - The path doesn't exist
/// - The path contains null bytes or shell metacharacters
/// - The path fails to canonicalise
fn validate_path(path: &str) -> Result<PathBuf, WtError> {
    // Check for null bytes and dangerous shell characters
    if path.contains('\0') {
        return Err(WtError::new("INVALID_PATH", "Path contains null bytes"));
    }

    // Check for shell metacharacters that could be used for injection
    let dangerous_chars = [
        ';', '&', '|', '$', '`', '(', ')', '{', '}', '<', '>', '\n', '\r',
    ];
    if path.chars().any(|c| dangerous_chars.contains(&c)) {
        return Err(WtError::new(
            "INVALID_PATH",
            "Path contains invalid characters",
        ));
    }

    let path_buf = PathBuf::from(path);

    // Canonicalise to resolve symlinks and .. components
    let canonical = path_buf.canonicalize().map_err(|e| {
        WtError::new(
            "INVALID_PATH",
            format!("Path does not exist or is not accessible: {}", e),
        )
    })?;

    Ok(canonical)
}

/// Validate a URL for opening in browser.
///
/// Only allows http:// and https:// URLs to prevent file:// or javascript: attacks.
fn validate_url(url: &str) -> Result<(), WtError> {
    let url_lower = url.to_lowercase();

    // Only allow HTTP and HTTPS protocols
    if !url_lower.starts_with("http://") && !url_lower.starts_with("https://") {
        return Err(WtError::new(
            "INVALID_URL",
            "Only HTTP and HTTPS URLs are allowed",
        ));
    }

    // Check for dangerous characters
    if url.contains('\0') || url.contains('\n') || url.contains('\r') {
        return Err(WtError::new(
            "INVALID_URL",
            "URL contains invalid characters",
        ));
    }

    Ok(())
}

/// Validate a template name to prevent path traversal attacks (H4).
///
/// Template names must:
/// - Not be empty
/// - Only contain alphanumeric characters, hyphens, and underscores
/// - Not start with a hyphen (flag injection)
/// - Not contain dots (path traversal prevention)
///
/// The restriction on dots is critical because template names might be used
/// to construct file paths. Allowing dots could enable attacks like:
/// - `../../../etc/passwd` - directory traversal
/// - `.hidden` - hidden file access
fn validate_template_name(name: &str) -> Result<(), WtError> {
    if name.is_empty() {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Template name cannot be empty",
        ));
    }

    // Only allow alphanumeric, hyphens, and underscores - NO DOTS
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Template name contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed. Dots are not permitted to prevent path traversal.",
        ));
    }

    // Prevent flag injection
    if name.starts_with('-') {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Template name cannot start with a hyphen",
        ));
    }

    Ok(())
}

// ============================================================================
// Repository and Worktree Commands
// ============================================================================

/// List all repositories managed by grove
///
/// Returns a list of repositories with their worktree counts.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('list_repositories')
#[command]
pub async fn list_repositories(app: tauri::AppHandle) -> Result<Vec<Repository>, WtError> {
    spawn_blocking(move || wt::get_repositories(&app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// List worktrees for a given repository
///
/// Returns detailed information about each worktree including branch, status, and health.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('list_worktrees', { repoName: 'scooda' })
#[command(rename_all = "camelCase")]
pub async fn list_worktrees(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<Vec<Worktree>, WtError> {
    spawn_blocking(move || wt::get_worktrees(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Get status of worktrees in a repository
///
/// Returns the same information as list_worktrees (status is included in ls output).
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_worktree_status', { repoName: 'scooda' })
#[command(rename_all = "camelCase")]
pub async fn get_worktree_status(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<Vec<Worktree>, WtError> {
    spawn_blocking(move || wt::get_worktree_status(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Check if grove CLI is available
///
/// Callable from frontend as: invoke('check_wt_available')
#[command]
pub async fn check_wt_available(app: tauri::AppHandle) -> bool {
    let handle = app.clone();
    spawn_blocking(move || wt::is_wt_available(&handle))
        .await
        .unwrap_or(false)
}

/// Get grove CLI version
///
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_wt_version')
#[command]
pub async fn get_wt_version(app: tauri::AppHandle) -> Result<String, WtError> {
    spawn_blocking(move || wt::get_version(&app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

// ============================================================================
// System Integration Commands (Open in Editor/Terminal/Browser)
// ============================================================================

/// Get the application name for a given editor choice
fn get_editor_app(editor: &str) -> &'static str {
    match editor {
        "vscode" => "Visual Studio Code",
        "cursor" => "Cursor",
        "phpstorm" => "PhpStorm",
        "zed" => "Zed",
        "sublime" => "Sublime Text",
        "custom" => {
            // Custom path handling is done separately
            ""
        }
        // CLI editors are handled differently
        _ => "Visual Studio Code",
    }
}

/// Check if an editor is a CLI editor (runs in terminal)
fn is_cli_editor(editor: &str) -> bool {
    matches!(editor, "vim" | "nvim")
}

/// Open a path in the configured code editor
///
/// Validates the path before opening to prevent path traversal attacks.
/// Callable from frontend as: invoke('open_in_editor', { path, editor, customEditorPath })
#[command]
pub fn open_in_editor(
    path: String,
    editor: Option<String>,
    custom_editor_path: Option<String>,
) -> Result<(), WtError> {
    let validated_path = validate_path(&path)?;
    let editor_choice = editor.unwrap_or_else(|| "vscode".to_string());

    #[cfg(target_os = "macos")]
    {
        // Handle CLI editors (vim, nvim) - open in terminal
        if is_cli_editor(&editor_choice) {
            let editor_cmd = if editor_choice == "nvim" {
                "nvim"
            } else {
                "vim"
            };
            let script = format!(
                r#"tell application "Terminal"
                    activate
                    do script "{} \"{}\""
                end tell"#,
                editor_cmd,
                validated_path.display()
            );
            Command::new("osascript")
                .args(["-e", &script])
                .status()
                .map_err(|e| {
                    WtError::new(
                        "OPEN_FAILED",
                        format!("Failed to open in {}: {}", editor_cmd, e),
                    )
                })?;
            return Ok(());
        }

        // Handle custom editor path
        if editor_choice == "custom" {
            if let Some(custom_path) = custom_editor_path {
                Command::new("open")
                    .args(["-a", &custom_path])
                    .arg(&validated_path)
                    .status()
                    .map_err(|e| {
                        WtError::new(
                            "OPEN_FAILED",
                            format!("Failed to open custom editor: {}", e),
                        )
                    })?;
                return Ok(());
            }
        }

        // Handle GUI editors
        let app_name = get_editor_app(&editor_choice);
        let result = Command::new("open")
            .args(["-a", app_name])
            .arg(&validated_path)
            .status();

        if let Ok(status) = result {
            if status.success() {
                return Ok(());
            }
        }

        // Fall back to system default
        Command::new("open")
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open in editor: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        let result = Command::new("cmd")
            .args(["/C", "code"])
            .arg(&validated_path)
            .status();

        if let Ok(status) = result {
            if status.success() {
                return Ok(());
            }
        }

        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open in editor: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let result = Command::new("code").arg(&validated_path).status();

        if let Ok(status) = result {
            if status.success() {
                return Ok(());
            }
        }

        Command::new("xdg-open")
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open in editor: {}", e)))?;

        Ok(())
    }
}

/// Generate AppleScript for opening a terminal at a path
fn get_terminal_applescript(terminal: &str, path: &std::path::Path) -> String {
    let path_str = path.display();
    match terminal {
        "iterm2" => format!(
            r#"tell application "iTerm"
                activate
                create window with default profile
                tell current session of current window
                    write text "cd \"{}\" && clear"
                end tell
            end tell"#,
            path_str
        ),
        "warp" => format!(
            r#"tell application "Warp"
                activate
            end tell
            delay 0.5
            tell application "System Events"
                keystroke "t" using command down
                delay 0.2
                keystroke "cd \"{}\" && clear"
                keystroke return
            end tell"#,
            path_str
        ),
        "alacritty" => format!(
            r#"do shell script "open -a Alacritty --args --working-directory \"{}\""#,
            path_str
        ),
        "wezterm" => format!(
            r#"do shell script "open -a WezTerm --args start --cwd \"{}\""#,
            path_str
        ),
        _ => format!(
            r#"tell application "Terminal"
                activate
                do script "cd \"{}\" && clear"
            end tell"#,
            path_str
        ),
    }
}

/// Open a path in the configured terminal application
///
/// Uses platform-specific terminal application.
/// Validates the path before opening to prevent path traversal attacks.
/// Callable from frontend as: invoke('open_in_terminal', { path, terminal })
#[command]
pub fn open_in_terminal(path: String, terminal: Option<String>) -> Result<(), WtError> {
    let validated_path = validate_path(&path)?;
    let terminal_choice = terminal.unwrap_or_else(|| "terminal".to_string());

    #[cfg(target_os = "macos")]
    {
        let script = get_terminal_applescript(&terminal_choice, &validated_path);
        Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open terminal: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "cmd", "/K", "cd", "/D"])
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open terminal: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // M17: Try common terminal emulators and return error if none found
        // This provides clear feedback instead of silent failure
        let terminals = [
            ("gnome-terminal", vec!["--working-directory"]),
            ("konsole", vec!["--workdir"]),
            ("xfce4-terminal", vec!["--working-directory"]),
            ("xterm", vec!["-e", "cd"]),
        ];

        let mut last_error: Option<String> = None;

        for (term, args) in &terminals {
            let mut cmd = Command::new(term);
            for arg in args {
                cmd.arg(arg);
            }
            cmd.arg(&validated_path);

            match cmd.status() {
                Ok(status) if status.success() => return Ok(()),
                Ok(status) => {
                    last_error = Some(format!("{} exited with status: {}", term, status));
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // Terminal not installed, try next
                    continue;
                }
                Err(e) => {
                    last_error = Some(format!("{} failed: {}", term, e));
                }
            }
        }

        Err(WtError::new(
            "TERMINAL_NOT_FOUND",
            format!(
                "No supported terminal emulator found. Please install one of: gnome-terminal, konsole, xfce4-terminal, or xterm. {}",
                last_error.map(|e| format!("Last error: {}", e)).unwrap_or_default()
            ),
        ))
    }
}


/// Get the application name for a Git client
fn get_git_client_app(client: &str) -> &'static str {
    match client {
        "gitkraken" => "GitKraken",
        "tower" => "Tower",
        "github-desktop" => "GitHub Desktop",
        "sourcetree" => "Sourcetree",
        "fork" => "Fork",
        "sublime-merge" => "Sublime Merge",
        _ => "",
    }
}

/// Open a path in the configured Git client application
///
/// Validates the path before opening to prevent path traversal attacks.
/// Callable from frontend as: invoke('open_in_git_client', { path, gitClient, customGitClientPath })
#[command]
pub fn open_in_git_client(
    path: String,
    git_client: Option<String>,
    custom_git_client_path: Option<String>,
) -> Result<(), WtError> {
    let validated_path = validate_path(&path)?;
    let client_choice = git_client.unwrap_or_else(|| "none".to_string());

    if client_choice == "none" {
        return Err(WtError::new(
            "NO_GIT_CLIENT",
            "No Git client configured. Please set a Git client in Settings.".to_string(),
        ));
    }

    #[cfg(target_os = "macos")]
    {
        // Handle custom Git client path
        if client_choice == "custom" {
            if let Some(custom_path) = custom_git_client_path {
                Command::new("open")
                    .args(["-a", &custom_path])
                    .arg(&validated_path)
                    .status()
                    .map_err(|e| {
                        WtError::new(
                            "OPEN_FAILED",
                            format!("Failed to open custom Git client: {}", e),
                        )
                    })?;
                return Ok(());
            } else {
                return Err(WtError::new(
                    "NO_CUSTOM_PATH",
                    "Custom Git client selected but no path configured.".to_string(),
                ));
            }
        }

        // Handle known Git clients
        let app_name = get_git_client_app(&client_choice);
        if app_name.is_empty() {
            return Err(WtError::new(
                "UNKNOWN_GIT_CLIENT",
                format!("Unknown Git client: {}", client_choice),
            ));
        }

        let result = Command::new("open")
            .args(["-a", app_name])
            .arg(&validated_path)
            .status();

        if let Ok(status) = result {
            if status.success() {
                return Ok(());
            }
        }

        Err(WtError::new(
            "OPEN_FAILED",
            format!("Failed to open {} - is it installed?", app_name),
        ))
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, try to open with the application
        let app_name = get_git_client_app(&client_choice);
        Command::new("cmd")
            .args(["/C", "start", "", app_name])
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open Git client: {}", e)))?;
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, try common command names
        let cmd = match client_choice.as_str() {
            "gitkraken" => "gitkraken",
            "sublime-merge" => "smerge",
            _ => return Err(WtError::new("UNSUPPORTED", "Git client not supported on Linux".to_string())),
        };
        Command::new(cmd)
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open Git client: {}", e)))?;
        Ok(())
    }
}

/// Open a URL in the default browser
///
/// Validates the URL to only allow HTTP/HTTPS protocols.
/// Callable from frontend as: invoke('open_in_browser', { url: 'https://example.test' })
#[command]
pub fn open_in_browser(url: String) -> Result<(), WtError> {
    validate_url(&url)?;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open browser: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&url)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open browser: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open browser: {}", e)))?;

        Ok(())
    }
}

/// Open a path in the file manager
///
/// Uses Finder on macOS, Explorer on Windows, or xdg-open on Linux.
/// Validates the path before opening to prevent path traversal attacks.
/// Callable from frontend as: invoke('open_in_finder', { path: '/path/to/worktree' })
#[command]
pub fn open_in_finder(path: String) -> Result<(), WtError> {
    let validated_path = validate_path(&path)?;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R"])
            .arg(&validated_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open in Finder: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg("/select,")
            .arg(&validated_path)
            .status()
            .map_err(|e| {
                WtError::new("OPEN_FAILED", format!("Failed to open in Explorer: {}", e))
            })?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        // L13: Explicitly handle None case for path parent
        // If the path has no parent (e.g., root path), open the path itself
        let path_to_open = match validated_path.parent() {
            Some(parent) if parent.as_os_str().is_empty() => &validated_path,
            Some(parent) => parent,
            None => &validated_path,
        };

        Command::new("xdg-open")
            .arg(path_to_open)
            .status()
            .map_err(|e| {
                WtError::new("OPEN_FAILED", format!("Failed to open file manager: {}", e))
            })?;

        Ok(())
    }
}

// ============================================================================
// Configuration Commands
// ============================================================================

/// Get the grove configuration with layered overrides.
///
/// Returns a structured Config object with grove configuration values.
/// When `repo_name` is provided, overlays project and repo config layers
/// on top of the CLI's global config, so "Resolved Values" reflects the
/// effective configuration for that repository.
///
/// Callable from frontend as: invoke('get_config', { repoName })
#[command(rename_all = "camelCase")]
pub async fn get_config(
    repo_name: Option<String>,
    app: tauri::AppHandle,
) -> Result<Config, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let mut config = wt::get_config(&handle)?;
        config_files::apply_all_config_layers(&mut config, repo_name.as_deref())?;
        Ok(config)
    })
    .await
    .map_err(|e| WtError {
        code: "SPAWN_ERROR".to_string(),
        message: format!("Failed to spawn blocking task: {}", e),
    })?
}

// ============================================================================
// Worktree Management Commands
// ============================================================================

/// Create a new worktree
///
/// Creates a new worktree with the given branch name, optionally based on a specific branch.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('create_worktree', { repo, branch, base, template, force })
#[command]
pub async fn create_worktree(
    repo: String,
    branch: String,
    base: Option<String>,
    template: Option<String>,
    force: bool,
    app: tauri::AppHandle,
) -> Result<CreateWorktreeResponse, WtError> {
    // H4: Validate template name if provided (stricter than repo name validation)
    if let Some(ref t) = template {
        validate_template_name(t)?;
    }

    spawn_blocking(move || {
        wt::create_worktree(
            &app,
            &repo,
            &branch,
            base.as_deref(),
            template.as_deref(),
            force,
        )
    })
    .await
    .map_err(|e| WtError {
        code: "SPAWN_ERROR".to_string(),
        message: format!("Failed to spawn background task: {}", e),
    })?
}

/// Remove a worktree
///
/// Removes a worktree with options to delete the branch and drop the database.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('remove_worktree', { repo, branch, deleteBranch, dropDb, skipBackup, force })
#[command(rename_all = "camelCase")]
pub async fn remove_worktree(
    repo: String,
    branch: String,
    delete_branch: bool,
    drop_db: bool,
    skip_backup: bool,
    force: bool,
    app: tauri::AppHandle,
) -> Result<RemoveWorktreeResponse, WtError> {
    spawn_blocking(move || {
        wt::remove_worktree(
            &app,
            &repo,
            &branch,
            delete_branch,
            drop_db,
            skip_backup,
            force,
        )
    })
    .await
    .map_err(|e| WtError {
        code: "SPAWN_ERROR".to_string(),
        message: format!("Failed to spawn background task: {}", e),
    })?
}

/// Pull changes for a worktree
///
/// Pulls the latest changes and rebases the worktree.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('pull_worktree', { repo, branch })
#[command]
pub async fn pull_worktree(
    repo: String,
    branch: String,
    app: tauri::AppHandle,
) -> Result<PullResult, WtError> {
    spawn_blocking(move || wt::pull_worktree(&app, &repo, &branch))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Sync (rebase) a worktree onto its base branch
///
/// Rebases the worktree onto origin/staging (or configured base).
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('sync_worktree', { repo, branch })
#[command]
pub async fn sync_worktree(
    repo: String,
    branch: String,
    app: tauri::AppHandle,
) -> Result<SyncResult, WtError> {
    spawn_blocking(move || wt::sync_worktree(&app, &repo, &branch))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Get recently accessed worktrees
///
/// Returns the most recently accessed worktrees across all repositories.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_recent_worktrees', { count })
#[command]
pub async fn get_recent_worktrees(
    count: Option<u32>,
    app: tauri::AppHandle,
) -> Result<Vec<RecentWorktree>, WtError> {
    spawn_blocking(move || wt::get_recent_worktrees(&app, count))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

// ============================================================================
// Phase 3: Branches, Health, Prune, Pull-All
// ============================================================================

/// List branches in a repository
///
/// Returns all local and remote branches with their worktree status.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('list_branches', { repoName })
#[command]
pub async fn list_branches(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<BranchesResult, WtError> {
    spawn_blocking(move || wt::get_branches(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Get repository health report
///
/// Returns health grades, scores, and issues for all worktrees.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_repo_health', { repoName })
#[command]
pub async fn get_repo_health(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<HealthResult, WtError> {
    spawn_blocking(move || wt::get_health(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Get recent commits for a worktree
///
/// Returns the most recent commits for the specified worktree.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_recent_commits', { repoName, branch, count })
#[command(rename_all = "camelCase")]
pub async fn get_recent_commits(
    repo_name: String,
    branch: String,
    count: Option<u32>,
    app: tauri::AppHandle,
) -> Result<LogResult, WtError> {
    spawn_blocking(move || wt::get_recent_commits(&app, &repo_name, &branch, count))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Get uncommitted file changes for a worktree
///
/// Returns a list of files with their change status (M, A, D, ?, etc.).
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('get_uncommitted_files', { repoName, branch })
#[command(rename_all = "camelCase")]
pub async fn get_uncommitted_files(
    repo_name: String,
    branch: String,
    app: tauri::AppHandle,
) -> Result<ChangesResult, WtError> {
    spawn_blocking(move || wt::get_uncommitted_files(&app, &repo_name, &branch))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Prune stale worktrees and merged branches
///
/// Removes stale worktree references and optionally deletes merged branches.
/// Emits `operation_progress` events for real-time feedback.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('prune_repo', { repoName, force })
#[command]
pub async fn prune_repo(
    repo_name: String,
    force: bool,
    app: tauri::AppHandle,
) -> Result<PruneResult, WtError> {
    spawn_blocking(move || wt::prune_with_progress(&repo_name, force, &app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Pull all worktrees in a repository
///
/// Pulls the latest changes for all worktrees sequentially, emitting
/// `operation_progress` events for each worktree for real-time feedback.
/// Runs on a background thread to keep the UI responsive.
/// Callable from frontend as: invoke('pull_all_worktrees', { repoName })
#[command]
pub async fn pull_all_worktrees(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<PullAllResult, WtError> {
    spawn_blocking(move || wt::pull_all_with_progress(&repo_name, &app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Pull selected worktrees in a repository (for retry functionality)
///
/// Pulls the latest changes for specified worktrees only, emitting
/// `operation_progress` events for each worktree for real-time feedback.
/// Used to retry failed items from a previous pull-all operation.
/// Callable from frontend as: invoke('pull_selected_worktrees', { repoName, branches })
#[command]
pub async fn pull_selected_worktrees(
    repo_name: String,
    branches: Vec<String>,
    app: tauri::AppHandle,
) -> Result<PullAllResult, WtError> {
    spawn_blocking(move || wt::pull_selected_with_progress(&repo_name, branches, &app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Cancel the current long-running operation
///
/// Sets the global cancellation flag, which will be checked by operations
/// like pull-all and prune between individual items.
/// Callable from frontend as: invoke('cancel_operation')
#[command]
pub fn cancel_operation() {
    wt::request_cancel();
}

// ============================================================================
// Operation State Persistence
// ============================================================================

/// Get all resumable operations (interrupted or paused).
///
/// Returns a list of operations that can be resumed, sorted by most
/// recently updated first.
/// Callable from frontend as: invoke('get_resumable_operations')
#[command]
pub async fn get_resumable_operations() -> Result<Vec<ResumableOperationSummary>, WtError> {
    spawn_blocking(operation_state::get_resumable_operations)
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Resume an interrupted operation.
///
/// Continues processing a previously interrupted batch operation from
/// where it left off.
/// Callable from frontend as: invoke('resume_operation', { operationId })
#[command]
pub async fn resume_operation(
    operation_id: String,
    app: tauri::AppHandle,
) -> Result<PullAllResult, WtError> {
    spawn_blocking(move || wt::resume_pull_all_operation(&operation_id, &app))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Dismiss (delete) an operation state without resuming.
///
/// Removes the state file for an interrupted operation that the user
/// does not want to resume.
/// Callable from frontend as: invoke('dismiss_operation', { operationId })
#[command]
pub async fn dismiss_operation(operation_id: String) -> Result<(), WtError> {
    spawn_blocking(move || operation_state::delete_state(&operation_id))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Mark any running operations as interrupted (called on app startup).
///
/// This handles the case where the app was closed while an operation
/// was in progress.
/// Callable from frontend as: invoke('mark_interrupted_operations')
#[command]
pub async fn mark_interrupted_operations() -> Result<u32, WtError> {
    spawn_blocking(operation_state::mark_running_as_interrupted)
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

// ============================================================================
// Phase 4: Repository Management Commands
// ============================================================================

/// Clone a git repository
///
/// Clones a git repository using the grove CLI.
/// Supports HTTPS and SSH URLs.
/// Callable from frontend as: invoke('clone_repository', { url, name, defaultBranch })
#[command(rename_all = "camelCase")]
pub async fn clone_repository(
    url: String,
    name: Option<String>,
    default_branch: Option<String>,
    app: tauri::AppHandle,
) -> Result<CloneResult, WtError> {
    spawn_blocking(move || {
        wt::clone_repository(
            &app,
            &url,
            name.as_deref(),
            default_branch.as_deref(),
        )
    })
    .await
    .map_err(|e| WtError {
        code: "SPAWN_ERROR".to_string(),
        message: format!("Failed to spawn background task: {}", e),
    })?
}

/// Repair a repository
///
/// Fixes common repository issues like stale worktree references.
/// Callable from frontend as: invoke('repair_repository', { repoName })
#[command(rename_all = "camelCase")]
pub async fn repair_repository(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<RepairResult, WtError> {
    spawn_blocking(move || wt::repair_repository(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Unlock a repository (remove stale lock files)
///
/// Removes git lock files that may have been left behind after crashes.
/// Callable from frontend as: invoke('unlock_repository', { repoName })
#[command(rename_all = "camelCase")]
pub async fn unlock_repository(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<UnlockResult, WtError> {
    spawn_blocking(move || wt::unlock_repository(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}

/// Open the grove config file in the default editor
///
/// Opens the grove config in the system default text editor.
/// Callable from frontend as: invoke('open_config')
#[command]
pub fn open_config() -> Result<(), WtError> {
    let config_path = wt::get_config_path()?;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-t") // Open in default text editor
            .arg(&config_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open config: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "notepad"])
            .arg(&config_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open config: {}", e)))?;

        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&config_path)
            .status()
            .map_err(|e| WtError::new("OPEN_FAILED", format!("Failed to open config: {}", e)))?;

        Ok(())
    }
}

/// Generate a markdown health report for a repository
///
/// Returns a formatted markdown report of the repository health.
/// Callable from frontend as: invoke('generate_report', { repoName })
#[command(rename_all = "camelCase")]
pub async fn generate_report(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<String, WtError> {
    spawn_blocking(move || wt::generate_health_report(&app, &repo_name))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })?
}


/// Save a health report to the user's Desktop
///
/// Generates a health report and saves it to ~/Desktop/grove-report-{repoName}-{timestamp}.md
/// Returns the path to the saved file.
/// Callable from frontend as: invoke('save_report_to_desktop', { repoName })
#[command(rename_all = "camelCase")]
pub async fn save_report_to_desktop(
    repo_name: String,
    app: tauri::AppHandle,
) -> Result<String, WtError> {
    let repo_for_report = repo_name.clone();

    // Generate the report
    let report = spawn_blocking(move || wt::generate_health_report(&app, &repo_for_report))
        .await
        .map_err(|e| WtError {
            code: "SPAWN_ERROR".to_string(),
            message: format!("Failed to spawn background task: {}", e),
        })??;

    // Get Desktop path
    let desktop_path = dirs::desktop_dir().ok_or_else(|| WtError {
        code: "PATH_ERROR".to_string(),
        message: "Could not find Desktop directory".to_string(),
    })?;

    // Create filename with timestamp
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let filename = format!("grove-report-{}-{}.md", repo_name, timestamp);
    let file_path = desktop_path.join(&filename);

    // Write the report
    std::fs::write(&file_path, &report).map_err(|e| WtError {
        code: "IO_ERROR".to_string(),
        message: format!("Failed to write report: {}", e),
    })?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Derive a repository name from a Git URL
///
/// Extracts the repository name from a Git URL.
/// Useful for auto-filling the name field in the clone form.
/// Callable from frontend as: invoke('derive_repo_name', { url })
#[command]
pub fn derive_repo_name(url: String) -> Option<String> {
    wt::derive_repo_name_from_url(&url)
}

// ============================================================================
// File System Watching
// ============================================================================

/// Start watching a repository's worktrees for changes.
///
/// Watches git directories for changes and emits `worktree_changed` events.
/// Callable from frontend as: invoke('start_watching', { repoName })
#[command]
pub async fn start_watching(repo_name: String, app: tauri::AppHandle) -> Result<(), WtError> {
    // Get worktree paths for this repo
    let worktrees = wt::get_worktrees(&app, &repo_name)?;
    let paths: Vec<String> = worktrees.iter().map(|w| w.path.clone()).collect();

    crate::watcher::start_watching(&repo_name, paths, app)
}

/// Stop watching a repository.
///
/// Callable from frontend as: invoke('stop_watching', { repoName })
#[command]
pub fn stop_watching(repo_name: String) -> Result<(), WtError> {
    crate::watcher::stop_watching(&repo_name)
}

/// Check if a repository is being watched.
///
/// Callable from frontend as: invoke('is_watching', { repoName })
#[command]
pub fn is_watching(repo_name: String) -> bool {
    crate::watcher::is_watching(&repo_name)
}

// ============================================================================
// Configuration File Management Commands
// ============================================================================

use crate::config_files::{
    self, ConfigFileContents, ConfigFileMeta, ConfigKeyUpdate, ConfigLayer,
};

/// Get metadata for all configuration files.
///
/// Returns information about the global, project, and repo config files.
/// Callable from frontend as: invoke('get_config_files', { repoName })
#[command(rename_all = "camelCase")]
pub async fn get_config_files(
    repo_name: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<ConfigFileMeta>, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        config_files::get_config_files(herd_root.as_deref(), repo_name.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Read a configuration file with parsed entries.
///
/// Callable from frontend as: invoke('read_config_file', { layer, repoName })
#[command(rename_all = "camelCase")]
pub async fn read_config_file(
    layer: ConfigLayer,
    repo_name: Option<String>,
    app: tauri::AppHandle,
) -> Result<ConfigFileContents, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        config_files::read_config_file(layer, herd_root.as_deref(), repo_name.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Write a configuration file.
///
/// Callable from frontend as: invoke('write_config_file', { layer, repoName, content })
#[command(rename_all = "camelCase")]
pub async fn write_config_file(
    layer: ConfigLayer,
    repo_name: Option<String>,
    content: String,
    app: tauri::AppHandle,
) -> Result<(), WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        config_files::write_config_file(layer, herd_root.as_deref(), repo_name.as_deref(), &content)
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Update specific keys in a configuration file.
///
/// Callable from frontend as: invoke('update_config_keys', { layer, repoName, updates })
#[command(rename_all = "camelCase")]
pub async fn update_config_keys(
    layer: ConfigLayer,
    repo_name: Option<String>,
    updates: Vec<ConfigKeyUpdate>,
    app: tauri::AppHandle,
) -> Result<ConfigFileContents, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        config_files::update_config_keys(layer, herd_root.as_deref(), repo_name.as_deref(), &updates)
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

// ============================================================================
// Hook Management Commands
// ============================================================================

use crate::hooks_fs::{self, HookEvent, HookScope, HookScriptContents, HookScriptMeta};

/// List all hooks, optionally filtered by repository.
///
/// Callable from frontend as: invoke('list_hooks', { repoName })
#[command(rename_all = "camelCase")]
pub async fn list_hooks(
    repo_name: Option<String>,
    app: tauri::AppHandle,
) -> Result<Vec<HookScriptMeta>, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let hooks_dir = config.hooks_dir;
        hooks_fs::list_hooks(hooks_dir.as_deref(), repo_name.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Read a hook script's contents.
///
/// Callable from frontend as: invoke('read_hook', { path })
#[command]
pub async fn read_hook(
    path: String,
    app: tauri::AppHandle,
) -> Result<HookScriptContents, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        hooks_fs::read_hook(&path, herd_root.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Write a hook script.
///
/// Callable from frontend as: invoke('write_hook', { path, content })
#[command]
pub async fn write_hook(
    path: String,
    content: String,
    app: tauri::AppHandle,
) -> Result<(), WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        hooks_fs::write_hook(&path, &content, herd_root.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Create a new hook script.
///
/// Callable from frontend as: invoke('create_hook', { event, scope, repoName, fileName, content })
#[command(rename_all = "camelCase")]
pub async fn create_hook(
    event: HookEvent,
    scope: HookScope,
    repo_name: Option<String>,
    file_name: String,
    content: String,
    app: tauri::AppHandle,
) -> Result<HookScriptMeta, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let hooks_dir = config.hooks_dir;
        let herd_root = config.herd_root;
        hooks_fs::create_hook(
            hooks_dir.as_deref(),
            event,
            scope,
            repo_name.as_deref(),
            &file_name,
            &content,
            herd_root.as_deref(),
        )
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Delete a hook script.
///
/// Callable from frontend as: invoke('delete_hook', { path })
#[command]
pub async fn delete_hook(path: String, app: tauri::AppHandle) -> Result<(), WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        hooks_fs::delete_hook(&path, herd_root.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Rename a hook script (used for reordering .d scripts).
///
/// Callable from frontend as: invoke('rename_hook', { path, newFileName })
#[command(rename_all = "camelCase")]
pub async fn rename_hook(
    path: String,
    new_file_name: String,
    app: tauri::AppHandle,
) -> Result<HookScriptMeta, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        hooks_fs::rename_hook(&path, &new_file_name, herd_root.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

/// Set or clear the executable bit on a hook.
///
/// Callable from frontend as: invoke('set_hook_executable', { path, executable })
#[command]
pub async fn set_hook_executable(
    path: String,
    executable: bool,
    app: tauri::AppHandle,
) -> Result<HookScriptMeta, WtError> {
    let handle = app.clone();
    spawn_blocking(move || {
        let config = wt::get_config(&handle)?;
        let herd_root = config.herd_root;
        hooks_fs::set_hook_executable(&path, executable, herd_root.as_deref())
    })
    .await
    .map_err(|e| WtError::spawn_error(e.to_string()))?
}

// ============================================================================
// System Tray
// ============================================================================
///
/// Call this after worktree changes (add/remove/pull) to update the menu.
/// Callable from frontend as: invoke('refresh_tray_menu')
#[command]
pub fn refresh_tray_menu(app: tauri::AppHandle) {
    crate::tray::refresh_tray_menu(&app);
}

// ============================================================================
// Context Menus (Phase 4.2)
// ============================================================================

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

/// Show a native context menu for a worktree card.
///
/// Creates a native right-click context menu with actions for the specified worktree.
/// Callable from frontend as: invoke('show_worktree_context_menu', { repoName, branch, path, url })
#[command(rename_all = "camelCase")]
pub async fn show_worktree_context_menu(
    app: tauri::AppHandle,
    repo_name: String,
    branch: String,
    path: String,
    url: Option<String>,
) -> Result<(), WtError> {
    let webview_window = app.get_webview_window("main").ok_or_else(|| WtError {
        code: "WINDOW_ERROR".to_string(),
        message: "Main window not found".to_string(),
    })?;

    let menu = build_worktree_context_menu(&app, &repo_name, &branch, &path, url.as_deref())
        .map_err(|e| WtError {
            code: "MENU_ERROR".to_string(),
            message: format!("Failed to build context menu: {}", e),
        })?;

    let app_handle = app.clone();
    let repo = repo_name.clone();
    let br = branch.clone();
    let p = path.clone();
    let u = url.clone();

    webview_window.popup_menu(&menu).map_err(|e| WtError {
        code: "MENU_ERROR".to_string(),
        message: format!("Failed to show context menu: {}", e),
    })?;

    // Handle menu events via the app-level menu event handler
    app_handle.on_menu_event(move |app, event| {
        let id = event.id.0.as_str();
        match id {
            "ctx_open_editor" => {
                let _ = std::process::Command::new("open")
                    .args(["-a", "Visual Studio Code", &p])
                    .spawn();
            }
            "ctx_open_terminal" => {
                let _ = std::process::Command::new("open")
                    .args(["-a", "Terminal", &p])
                    .spawn();
            }
            "ctx_open_browser" => {
                if let Some(ref url) = u {
                    let _ = std::process::Command::new("open").arg(url).spawn();
                }
            }
            "ctx_copy_path" => {
                let _ = app.emit("context_menu_action", serde_json::json!({
                    "action": "copy_path",
                    "value": &p,
                }));
            }
            "ctx_copy_branch" => {
                let _ = app.emit("context_menu_action", serde_json::json!({
                    "action": "copy_branch",
                    "value": &br,
                }));
            }
            "ctx_copy_url" => {
                if let Some(ref url) = u {
                    let _ = app.emit("context_menu_action", serde_json::json!({
                        "action": "copy_url",
                        "value": url,
                    }));
                }
            }
            "ctx_pull" => {
                let _ = app.emit("context_menu_action", serde_json::json!({
                    "action": "pull",
                    "repo": &repo,
                    "branch": &br,
                }));
            }
            "ctx_delete" => {
                let _ = app.emit("context_menu_action", serde_json::json!({
                    "action": "delete",
                    "repo": &repo,
                    "branch": &br,
                }));
            }
            _ => {}
        }
    });

    Ok(())
}

/// Build a native context menu for a worktree card.
fn build_worktree_context_menu(
    app: &tauri::AppHandle,
    _repo_name: &str,
    _branch: &str,
    _path: &str,
    url: Option<&str>,
) -> Result<Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let mut builder = MenuBuilder::new(app);

    // Open actions
    let open_editor = MenuItemBuilder::with_id("ctx_open_editor", "Open in Editor").build(app)?;
    let open_terminal = MenuItemBuilder::with_id("ctx_open_terminal", "Open in Terminal").build(app)?;
    builder = builder.item(&open_editor).item(&open_terminal);

    if url.is_some() {
        let open_browser = MenuItemBuilder::with_id("ctx_open_browser", "Open in Browser").build(app)?;
        builder = builder.item(&open_browser);
    }

    // Separator
    let sep1 = PredefinedMenuItem::separator(app)?;
    builder = builder.item(&sep1);

    // Copy actions
    let copy_path = MenuItemBuilder::with_id("ctx_copy_path", "Copy Path").build(app)?;
    let copy_branch = MenuItemBuilder::with_id("ctx_copy_branch", "Copy Branch Name").build(app)?;
    builder = builder.item(&copy_path).item(&copy_branch);

    if url.is_some() {
        let copy_url = MenuItemBuilder::with_id("ctx_copy_url", "Copy URL").build(app)?;
        builder = builder.item(&copy_url);
    }

    // Separator
    let sep2 = PredefinedMenuItem::separator(app)?;
    builder = builder.item(&sep2);

    // Worktree actions
    let pull = MenuItemBuilder::with_id("ctx_pull", "Pull").build(app)?;
    let delete = MenuItemBuilder::with_id("ctx_delete", "Delete\u{2026}").build(app)?;
    builder = builder.item(&pull).item(&delete);

    Ok(builder.build()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_wt_available_does_not_panic() {
        // Just ensure the function doesn't panic
        // Requires AppHandle - tested via integration tests
    }

    #[test]
    fn test_validate_url_valid() {
        assert!(validate_url("https://example.com").is_ok());
        assert!(validate_url("http://localhost:8080").is_ok());
        assert!(validate_url("https://sub.domain.com/path?query=1").is_ok());
    }

    #[test]
    fn test_validate_url_invalid_protocol() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("javascript:alert(1)").is_err());
        assert!(validate_url("ftp://example.com").is_err());
        assert!(validate_url("/local/path").is_err());
    }

    #[test]
    fn test_validate_url_injection_attempts() {
        assert!(validate_url("https://example.com\nX-Injected: header").is_err());
        assert!(validate_url("https://example.com\0").is_err());
    }

    #[test]
    fn test_validate_path_injection_attempts() {
        // Shell metacharacter injection
        assert!(validate_path("; rm -rf /").is_err());
        assert!(validate_path("path; echo pwned").is_err());
        assert!(validate_path("path && cat /etc/passwd").is_err());
        assert!(validate_path("$(whoami)").is_err());
        assert!(validate_path("`id`").is_err());
        assert!(validate_path("path | cat /etc/passwd").is_err());
    }

    #[test]
    fn test_validate_path_null_byte() {
        assert!(validate_path("/valid/path\0/more").is_err());
    }

    // H4: Template name validation tests
    #[test]
    fn test_validate_template_name_valid() {
        assert!(validate_template_name("my-template").is_ok());
        assert!(validate_template_name("my_template").is_ok());
        assert!(validate_template_name("MyTemplate123").is_ok());
        assert!(validate_template_name("template").is_ok());
    }

    #[test]
    fn test_validate_template_name_empty() {
        assert!(validate_template_name("").is_err());
    }

    #[test]
    fn test_validate_template_name_with_dots() {
        // Dots are NOT allowed to prevent path traversal
        assert!(validate_template_name("my.template").is_err());
        assert!(validate_template_name("..").is_err());
        assert!(validate_template_name("../etc").is_err());
        assert!(validate_template_name(".hidden").is_err());
    }

    #[test]
    fn test_validate_template_name_flag_injection() {
        assert!(validate_template_name("-rf").is_err());
        assert!(validate_template_name("--help").is_err());
        assert!(validate_template_name("-").is_err());
    }

    #[test]
    fn test_validate_template_name_invalid_chars() {
        assert!(validate_template_name("template/path").is_err());
        assert!(validate_template_name("template;cmd").is_err());
        assert!(validate_template_name("template name").is_err());
    }
}
