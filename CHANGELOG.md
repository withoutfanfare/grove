# Changelog

All notable changes to Grove will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026.06] - June 2026

### Added

- **Services Panel** - A new topbar panel showing app service status from `grove services status --json`: Supervisor and Redis daemon health, then each registered app with its Supervisor worker state, scheduler LaunchAgent state, active worktree, and Start/Stop/Restart actions, plus a one-click Horizon dashboard link for Horizon apps. Includes a worktree switcher per app (points the `-current` symlink at a chosen worktree via `grove services switch`, cycling services around the change) and silent auto-refresh every 15 seconds while the panel is open. Replaces the need for the retired `devctl status` and `devctl switch` workflows

- **Batch worktree operations** — select multiple worktrees with hover checkboxes (shift-click for ranges, select-all in the toolbar) and delete or pull them in one action, with live progress and cancellation. Protected branches are excluded from multi-select; dirty worktrees are flagged before a batch delete
- **Overview Dashboard** - A cross-repository home screen shown whenever no repository is selected: portfolio stat strip (repos, worktrees, dirty, behind, disk usage), a grouped "Needs Attention" panel (repository errors with Repair, health issues, dirty, behind remote, cleanup candidates) and a Recent worktrees panel. Includes bulk **Pull all** (sequential, with live progress, cancel and retry) and bulk **Prune all** behind a mandatory confirmation listing exactly what will be deleted. Snapshots cache to localStorage for instant paint, with a tiered background refresh (worktree lists ×3 concurrent; health and disk usage throttled to once per five minutes per repository). Reachable via the sidebar Overview button, Cmd+0, or the command palette
- **Worktree Focus Persistence** - Selecting a worktree (click, Enter, or J/K navigation) keeps it focused so keyboard shortcuts and palette actions always have a target; tray and recents navigation use transient focus that auto-clears
- **Filter Count Chips** - Live per-filter match counts on the worktree filter segmented control
- **Broader Worktree Search** - Search now matches worktree path and purpose note as well as branch name
- **Auto-Focus on Creation** - Newly created worktrees are focused and scrolled into view when the create modal closes
- **Tray Menu Auto-Refresh** - The system tray menu rebuilds (debounced) after create, delete, pull, sync, and prune operations so its quick-switch list always reflects current state
- **Coloured Diff Stats** - Worktree card diff badge now shows insertions in green and deletions in red instead of a single neutral figure
- **Plain-English Health Findings** - The health report now groups findings by worktree and explains each in plain English (e.g. "37 uncommitted changes") with why it matters, the exact points deducted, and inline fix actions (Pull, Sync, Open in Editor, Go to Worktree, and Remove… via the usual delete confirmation). Severity chips and summary tiles explain themselves on hover, and an expandable "How scoring works" section shows the full deduction table, grade bands, and severity brackets. The Overview's health attention items show the same translated findings

### Changed

- **Tidier Sidebar Header** - The sidebar's top section is now three rows instead of four: clone and global-config buttons sit beside the Overview button as a header toolbar, both tabs show live count chips (repositories and recent), and the floating "n repos · n worktrees" line is gone (portfolio totals live on the Overview page)
- **Launch Lands on the Overview** - The app no longer auto-selects (or restores) a repository at launch; it opens onto the new Overview home screen instead
- **Global Shortcuts Wired Up** - Cmd+T/Cmd+B/copy/Cmd+Enter shortcuts now act on the focused worktree, gated so they no longer swallow native keystrokes (notably Cmd+C) when no worktree is focused
- **Cmd+Shift+W Quick Switch** - The global quick-switch shortcut now opens the command palette instead of doing nothing
- **Instant Repo Switching** - Previously loaded repositories render their cached worktrees immediately on switch with a silent background revalidation, instead of a blank loading state
- **Persistent Filter and Sort** - Worktree filter and sort selections survive repo switches and app restarts
- **Compact UI Density** - Tighter badges, keyboard hints, and spacing with softer card shadows across the dashboard for a denser, more scannable layout

### Fixed

- **Worktree Deletion Reported False Failures** - Deleting a worktree showed "Failed to delete worktree" (and the row lingered until a manual refresh) even though the worktree had already been removed. The bundled `grove` CLI renamed its `rm --json` field `db_dropped` to `db_drop_requested` (the database drop is hook-delegated, so the CLI reports the request rather than a confirmed outcome) and Grove's mirrored types had drifted, so strict JSON parsing failed with `missing field 'db_dropped'`. The types now match the CLI, the response parses cleanly, and the list refreshes immediately; a Rust contract test pins the CLI's JSON shape to catch future drift
- **Nullable Sync Counts** - Worktree ahead/behind counts may legitimately arrive as null from the CLI when the base ref cannot be resolved (e.g. a detached-HEAD worktree before a fetch); Grove now accepts this instead of failing the whole repository snapshot with "invalid type: null, expected u32"
- **Silent Revalidation Errors** - Background refresh failures on cached repositories no longer raise the error banner over a perfectly usable cached list
- **Accurate Health Issue Counts** - Health findings are counted individually (one per finding) even with older `grove` CLI builds that joined a worktree's findings into a single comma-separated message, and summary tiles now reflect worktree score brackets rather than issue rows
- **Stale Toast Tests** - Rewrote useToast tests against the current @stuntrocket/ui wrapper API, eliminating 24 pre-existing failures left over from the component library migration

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
