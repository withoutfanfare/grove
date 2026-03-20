// Grove Tauri backend
//
// This library provides the Rust backend for Grove.
// It bridges the Vue frontend to the wt CLI tool via Tauri IPC commands.

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
    delete_hook, derive_repo_name, dismiss_operation, generate_report,
    save_report_to_desktop, get_config,
    get_config_files, get_dirty_details, get_recent_commits, get_recent_worktrees, get_repo_health,
    get_resumable_operations, get_uncommitted_files, get_worktree_status, get_wt_version,
    is_watching, list_branches, list_hooks, list_repositories, list_worktrees,
    mark_interrupted_operations, open_config, open_in_browser, open_in_editor, open_in_finder, open_in_git_client,
    open_in_terminal, prune_repo, pull_all_worktrees, pull_selected_worktrees, pull_worktree,
    read_config_file, read_hook, refresh_tray_menu, remove_worktree, rename_hook,
    repair_repository, resume_operation, set_hook_executable, start_watching, stop_watching,
    sync_worktree, unlock_repository, update_config_keys, write_config_file, write_hook,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Set up system tray with worktree menu
            if let Err(e) = tray::setup_tray(app.handle()) {
                eprintln!("[tray] Failed to set up system tray: {}", e);
            }

            // Handle window close to hide instead of quit (macOS behaviour)
            tray::setup_window_close_handler(app.handle());

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
