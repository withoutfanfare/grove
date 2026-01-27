// System tray (menu bar) functionality
//
// Provides macOS menu bar integration with:
// - Dynamic worktree list grouped by repository
// - Quick access to show/hide window and quit
// - Click on worktree to open it in the app

use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Wry,
};

use crate::types::{Repository, Worktree};
use crate::wt;

// ============================================================================
// Constants
// ============================================================================

/// Tray icon embedded at compile time (22x22 monochromatic PNG for macOS template)
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray-icon.png");

// ============================================================================
// Types
// ============================================================================

/// Event emitted when a worktree is selected from the tray menu
#[derive(Clone, serde::Serialize)]
pub struct TrayWorktreeSelectedEvent {
    pub repo: String,
    pub branch: String,
}

// ============================================================================
// Global State
// ============================================================================

lazy_static::lazy_static! {
    /// Stores the tray icon ID for menu updates
    static ref TRAY_ID: Mutex<Option<String>> = Mutex::new(None);
}

// ============================================================================
// Tray Setup
// ============================================================================

/// Set up the system tray icon and menu.
///
/// Creates a tray icon with:
/// - Dynamic worktree list grouped by repository
/// - Separator
/// - Show Window option
/// - Quit option
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_tray_menu(app)?;

    // Load dedicated tray icon (monochromatic for template mode)
    let icon = Image::from_bytes(TRAY_ICON_BYTES)?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true) // Adapts to macOS light/dark mode
        .tooltip("Grove")
        .menu(&menu)
        .show_menu_on_left_click(false) // Left-click toggles window, right-click shows menu
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event)
        .build(app)?;

    // Store tray ID for later menu updates
    if let Ok(mut id) = TRAY_ID.lock() {
        *id = Some(tray.id().0.clone());
    }

    Ok(())
}

/// Build the tray menu with worktrees grouped by repository.
fn build_tray_menu(app: &AppHandle) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let mut menu_builder = MenuBuilder::new(app);

    // Try to fetch repositories and their worktrees
    if let Ok(repos) = wt::get_repositories(app) {
        if repos.is_empty() {
            // No repositories - show a placeholder
            let no_repos = MenuItemBuilder::with_id("no_repos", "No repositories")
                .enabled(false)
                .build(app)?;
            menu_builder = menu_builder.item(&no_repos);
        } else {
            // Build submenu for each repository
            for repo in repos {
                let submenu = build_repo_submenu(app, &repo)?;
                menu_builder = menu_builder.item(&submenu);
            }
        }
    } else {
        // Failed to fetch repos - show error state
        let error_item = MenuItemBuilder::with_id("error", "Unable to load repositories")
            .enabled(false)
            .build(app)?;
        menu_builder = menu_builder.item(&error_item);
    }

    // Add separator and standard items
    let separator = PredefinedMenuItem::separator(app)?;
    let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let show_item = MenuItemBuilder::with_id("show", "Show Window")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    menu_builder = menu_builder
        .item(&separator)
        .item(&refresh_item)
        .item(&show_item)
        .item(&quit_item);

    Ok(menu_builder.build()?)
}

/// Build a submenu for a single repository containing its worktrees.
fn build_repo_submenu(
    app: &AppHandle,
    repo: &Repository,
) -> Result<tauri::menu::Submenu<Wry>, Box<dyn std::error::Error>> {
    let mut submenu_builder = SubmenuBuilder::new(app, &repo.name);

    // Fetch worktrees for this repo
    if let Ok(worktrees) = wt::get_worktrees(app, &repo.name) {
        if worktrees.is_empty() {
            let no_worktrees =
                MenuItemBuilder::with_id(format!("{}:empty", repo.name), "No worktrees")
                    .enabled(false)
                    .build(app)?;
            submenu_builder = submenu_builder.item(&no_worktrees);
        } else {
            for wt in worktrees {
                let item = build_worktree_item(app, &repo.name, &wt)?;
                submenu_builder = submenu_builder.item(&item);
            }
        }
    } else {
        let error_item = MenuItemBuilder::with_id(
            format!("{}:error", repo.name),
            "Unable to load worktrees",
        )
        .enabled(false)
        .build(app)?;
        submenu_builder = submenu_builder.item(&error_item);
    }

    Ok(submenu_builder.build()?)
}

/// Build a menu item for a single worktree.
fn build_worktree_item(
    app: &AppHandle,
    repo_name: &str,
    worktree: &Worktree,
) -> Result<tauri::menu::MenuItem<Wry>, Box<dyn std::error::Error>> {
    // Build display name with status indicators
    let mut display_name = worktree.branch.clone();

    // Add dirty indicator if worktree has uncommitted changes
    if worktree.dirty {
        display_name = format!("● {}", display_name);
    }

    // Add sync status if behind
    if worktree.behind > 0 {
        display_name = format!("{} ↓{}", display_name, worktree.behind);
    }

    // Menu item ID encodes repo:branch for the event handler
    let item_id = format!("wt:{}:{}", repo_name, worktree.branch);

    Ok(MenuItemBuilder::with_id(item_id, display_name).build(app)?)
}

// ============================================================================
// Event Handlers
// ============================================================================

/// Handle menu item clicks.
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id.0.as_str();

    match id {
        "show" => {
            show_and_focus_window(app);
        }
        "quit" => {
            app.exit(0);
        }
        "refresh" => {
            refresh_tray_menu(app);
        }
        _ if id.starts_with("wt:") => {
            // Worktree selection: "wt:repo_name:branch_name"
            let parts: Vec<&str> = id.splitn(3, ':').collect();
            if parts.len() == 3 {
                let repo = parts[1].to_string();
                let branch = parts[2].to_string();

                // Emit event to frontend
                let _ = app.emit(
                    "tray_worktree_selected",
                    TrayWorktreeSelectedEvent {
                        repo: repo.clone(),
                        branch: branch.clone(),
                    },
                );

                // Show and focus the window
                show_and_focus_window(app);
            }
        }
        _ => {
            // Ignore other IDs (disabled items, separators, etc.)
        }
    }
}

/// Handle tray icon events (clicks on the icon itself).
fn handle_tray_icon_event(tray: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        let app = tray.app_handle();
        toggle_window_visibility(app);
    }
}

// ============================================================================
// Window Helpers
// ============================================================================

/// Show and focus the main window.
fn show_and_focus_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Toggle main window visibility.
fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Set up window close handler to hide instead of quit.
pub fn setup_window_close_handler(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window_clone.hide();
            }
        });
    }
}

// ============================================================================
// Menu Refresh
// ============================================================================

/// Refresh the tray menu with current worktree data.
pub fn refresh_tray_menu(app: &AppHandle) {
    let tray_id = {
        TRAY_ID
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    };

    if let Some(id) = tray_id {
        if let Some(tray) = app.tray_by_id(&tauri::tray::TrayIconId(id)) {
            if let Ok(menu) = build_tray_menu(app) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}
