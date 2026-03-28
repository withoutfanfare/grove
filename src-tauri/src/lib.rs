// Grove Tauri backend
//
// This library provides the Rust backend for Grove.
// It bridges the Vue frontend to the grove CLI tool via Tauri IPC commands.

mod commands;
mod config_files;
mod fs_safety;
mod hooks_fs;
mod operation_state;
mod tray;
mod types;
mod watcher;
mod wt;

// Re-export types for external use
pub use types::{Repository, Worktree, WtError, WtResult};

use commands::{
    cancel_operation, check_wt_available, clone_repository, create_hook, create_worktree,
    delete_hook, derive_repo_name, dismiss_operation, fetch_pr_branch, generate_report,
    save_report_to_desktop, get_config,
    get_config_files, get_diff_stats, get_dirty_details, get_recent_commits, get_recent_worktrees,
    get_remote_branches, get_repo_disk_usage, get_repo_health,
    get_resumable_operations, get_uncommitted_files, get_worktree_status, get_wt_version,
    fetch_repo, is_watching, list_branches, list_hooks, list_repositories, list_worktrees,
    mark_interrupted_operations, open_config, open_in_browser, open_in_editor, open_in_finder, open_in_git_client,
    open_in_terminal, prune_repo, pull_all_worktrees, pull_selected_worktrees, pull_worktree,
    read_config_file, read_hook, refresh_tray_menu, register_repository, remove_worktree, rename_hook,
    repair_repository, resume_operation, set_hook_executable,
    show_worktree_context_menu,
    start_watching, stop_watching,
    sync_worktree, unlock_repository, update_config_keys, write_config_file, write_hook,
};

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Single instance must be registered first
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        // Focus existing window when a duplicate launch is attempted
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));

    builder
        // Phase 1: Foundation plugins
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        // Phase 2: Desktop integration plugins
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        // Existing plugins
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        // Phase 4: Visual polish
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            // Set up system tray with worktree menu
            if let Err(e) = tray::setup_tray(app.handle()) {
                log::error!("[tray] Failed to set up system tray: {}", e);
            }

            // Handle window close to hide instead of quit (macOS behaviour)
            tray::setup_window_close_handler(app.handle());

            // Register global shortcuts
            setup_global_shortcuts(app.handle());

            // Show main window (window-state plugin handles position restoration)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            log::info!("Grove started successfully");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Repository and worktree commands
            list_repositories,
            list_worktrees,
            get_worktree_status,
            check_wt_available,
            get_wt_version,
            get_recent_worktrees,
            // Worktree management commands
            create_worktree,
            remove_worktree,
            pull_worktree,
            sync_worktree,
            // Phase 3: Branches, health, prune, pull-all
            list_branches,
            get_repo_health,
            get_recent_commits,
            get_uncommitted_files,
            prune_repo,
            pull_all_worktrees,
            pull_selected_worktrees,
            // Operation control
            cancel_operation,
            // Operation state persistence
            get_resumable_operations,
            resume_operation,
            dismiss_operation,
            mark_interrupted_operations,
            // Phase 4: Repository management
            clone_repository,
            repair_repository,
            unlock_repository,
            generate_report,
            save_report_to_desktop,
            derive_repo_name,
            // File system watching
            start_watching,
            stop_watching,
            is_watching,
            // Dirty state details
            get_dirty_details,
            // Disk usage
            get_repo_disk_usage,
            // Diff stats
            get_diff_stats,
            // Background fetch
            fetch_repo,
            // Remote branches
            get_remote_branches,
            // Repository registration (drag-and-drop)
            register_repository,
            // GitHub PR integration
            fetch_pr_branch,
            // System integration commands
            open_in_editor,
            open_in_git_client,
            open_in_terminal,
            open_in_browser,
            open_in_finder,
            open_config,
            // Configuration commands
            get_config,
            get_config_files,
            read_config_file,
            write_config_file,
            update_config_keys,
            // Hook management commands
            list_hooks,
            read_hook,
            write_hook,
            create_hook,
            delete_hook,
            rename_hook,
            set_hook_executable,
            // System tray
            refresh_tray_menu,
            // Context menus
            show_worktree_context_menu,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Register global keyboard shortcuts for toggling the Grove window.
fn setup_global_shortcuts(app: &tauri::AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let app_handle = app.clone();

    // Ctrl+Shift+G: Toggle Grove window visibility
    if let Err(e) = app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+G", move |_app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            if let Some(window) = app_handle.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }
    }) {
        log::warn!("Failed to register Ctrl+Shift+G shortcut: {}", e);
    }

    let app_handle = app.clone();

    // Ctrl+Shift+W: Quick worktree switcher (show window and emit event)
    if let Err(e) = app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+W", move |_app, _shortcut, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                // Emit event to focus the search/command palette
                let _ = app_handle.emit("global_shortcut_quick_switch", ());
            }
        }
    }) {
        log::warn!("Failed to register Ctrl+Shift+W shortcut: {}", e);
    }

    log::info!("Global shortcuts registered");
}
