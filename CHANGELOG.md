# Changelog

All notable changes to Grove will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026.02] - February 2026

### Added

- **Tauri 2 Platform Plugins** - Integrated 10 new Tauri 2 plugins: single-instance, window-state, log, store, notification, global-shortcut, process, dialog, positioner, and vibrancy for a fully native desktop experience
- **Single Instance Enforcement** - Prevents multiple app windows from opening simultaneously; re-focuses the existing window when a second launch is attempted
- **Window State Persistence** - Remembers window position, size, and maximised state across app restarts using `tauri-plugin-window-state`
- **Structured Logging** - Replaced all `eprintln!` calls with structured `log::info!`, `log::warn!`, `log::debug!`, and `log::error!` calls via `tauri-plugin-log` for better diagnostics
- **Persistent Preferences Store** - New `useAppStore` composable backed by `tauri-plugin-store` to persist user preferences (last selected repo, sidebar width, sort order, expanded sections, notification preference) across restarts
- **Native OS Notifications** - Desktop notifications for long-running operations (pull-all completion, prune completion) via `tauri-plugin-notification`, only shown when the app window is unfocused
- **Global Keyboard Shortcuts** - System-wide shortcuts: Cmd+Shift+G to toggle app visibility, Cmd+Shift+W to quickly switch worktrees via `tauri-plugin-global-shortcut`
- **Native Context Menus** - Right-click context menu on worktree cards using native OS menus built with Tauri's `MenuBuilder`, with actions for open in editor/terminal/browser, copy path/branch/URL, pull, and delete
- **Window Vibrancy** - macOS translucent window effect using private API for a premium native appearance
- **Window Positioner** - Tray-icon-aware window positioning via `tauri-plugin-positioner`
- **Native Dialogs** - OS-native confirmation dialogs for destructive operations (delete worktree) via `tauri-plugin-dialog`
- **Process Control** - App quit and relaunch support via `tauri-plugin-process`
- **Last Selected Repo Persistence** - The previously selected repository is remembered and restored on app restart
- **Global Shortcuts in Help Modal** - New "Global Shortcuts" section in the keyboard shortcuts help tab documenting Cmd+Shift+G and Cmd+Shift+W

### Changed

- **Plugin Housekeeping** - Removed unused `tauri-plugin-opener` dependency from both Rust and npm packages
- **Tauri Configuration** - Enabled `macOSPrivateApi` for vibrancy support, set window to start hidden (restored by window-state plugin), enabled transparency
- **Capabilities** - Updated `capabilities/default.json` with permissions for all new plugins, removed opener permission
- **Sidecar Execution Logging** - CLI command execution and failures now logged via structured logging instead of stderr prints
- **File Watcher Logging** - File system watcher events use structured logging for better debugging
- **Config Resolution Logging** - Config layer resolution steps logged at debug level for troubleshooting

### Fixed

- **Repository Selection Race Condition** - `setRepositories` now sets the first repo synchronously before async-restoring the persisted preference, preventing test failures and potential UI flash

## [2026.02] - Early February 2026

### Added

- **Comprehensive Testing Infrastructure** - 87+ Rust backend tests and 245+ frontend Vitest tests covering stores, composables, types, and utilities
- **Command Palette** - Quick-access command palette for power users
- **Global Config UI** - Enhanced global configuration panel with full settings management

### Changed

- **Premium Dark Theme Redesign** - Complete UI overhaul with premium dark theme, improved visual hierarchy, and polished component styling
- **Help Modal** - Comprehensive help modal with keyboard shortcuts reference, feature documentation, and getting started guide

## [2026.01] - January 2026

### Added

- **Git Client Integration** - Open worktrees directly in configured Git clients (Fork, Tower, GitKraken, SourceTree, or custom)
- **Report Export** - Export repository health reports to desktop
- **Initial Release** - Grove desktop application with worktree management, repository health monitoring, system tray integration, hook management, and configuration editing
