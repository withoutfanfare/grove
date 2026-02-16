# Features Guide

## Dashboard Overview

The dashboard is divided into two main areas:

```text
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │              │  │                                 │  │
│  │   Sidebar    │  │        Main Content             │  │
│  │              │  │                                 │  │
│  │  Repository  │  │     Worktree Cards Grid        │  │
│  │    List      │  │                                 │  │
│  │              │  │                                 │  │
│  └──────────────┘  └─────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Sidebar

### Repository List

- Shows all repositories registered with `grove`
- Displays worktree count for each repository
- Click to select and view worktrees
- Selected repository is highlighted in blue

### Footer

- Shows `grove` CLI version
- Confirms CLI connectivity

## Worktree Cards

Each worktree is displayed as a card with:

### Branch Information
- **Branch name** - The git branch for this worktree
- **Short SHA** - First 7 characters of the current commit

### Health Grade

Letter grades indicate worktree health:

| Grade | Colour | Meaning |
|-------|--------|---------|
| A | Green | Excellent - clean, up to date |
| B | Blue | Good - minor issues |
| C | Yellow | Fair - needs attention |
| D | Orange | Poor - significant issues |
| F | Red | Critical - requires action |

### Status Badges

- **Clean** (green) - No uncommitted changes
- **Dirty** (yellow) - Has uncommitted changes
- **+N ahead** - Commits ahead of remote
- **-N behind** - Commits behind remote

### Path

Shows the filesystem path to the worktree directory.

## Actions

Each worktree card has action buttons:

### Open in Code

Opens the worktree in your code editor.

**Editor detection order:**
1. Visual Studio Code
2. Cursor
3. System default

### Open in Terminal

Opens a new terminal window at the worktree path.

**Terminal apps:**
- macOS: Terminal.app
- Windows: Command Prompt
- Linux: gnome-terminal, konsole, xfce4-terminal, or xterm

### Open in Browser

Opens the worktree's URL in your default browser.

> Only shown if the worktree has a URL configured (e.g., Laravel Herd sites)

### Open in Finder/Explorer

Reveals the worktree folder in your file manager.

### Context Menu

**Right-click** on any worktree card to access a native context menu with quick actions:

- **Open in Editor** - Launch your configured editor
- **Open in Terminal** - Open a terminal at the worktree path
- **Open in Browser** - Open the development URL
- **Copy Path** - Copy the filesystem path to clipboard
- **Copy Branch Name** - Copy the branch name to clipboard
- **Copy URL** - Copy the development URL to clipboard
- **Pull** - Pull latest changes from remote
- **Delete...** - Delete the worktree (with confirmation)

## Header Actions

### Refresh Button

Click to reload:
- Repository list
- Worktree data for selected repository

Grove automatically watches for filesystem changes and refreshes when worktrees are added or removed, but you can manually refresh to ensure the latest data.

## Error Handling

### Error Banner

Red banner at the top shows errors:
- CLI command failures
- Path access issues
- Network problems

Click **Dismiss** to close the banner.

### Loading States

- **Sidebar spinner** - Loading repositories
- **Content spinner** - Loading worktrees
- **Skeleton cards** - Data is being fetched

## Global Keyboard Shortcuts

Grove supports global keyboard shortcuts that work from any application:

| Shortcut | Action |
|----------|--------|
| **Cmd+Shift+G** (macOS) | Toggle Grove window (show/hide) |
| **Cmd+Shift+W** (macOS) | Show Grove and open quick worktree switcher |

> Global shortcuts work even when Grove is hidden to the system tray, making it easy to quickly access your worktrees.

## Native Notifications

When the Grove window is minimised or unfocused, you'll receive native macOS notifications for long-running operations:

- **Pull All Complete** - Shows summary: "Pull All: 5 updated, 1 failed"
- **Prune Complete** - Confirms: "Pruned 3 worktrees from my-repo"

### Disable Notifications

1. Open **Settings** (gear icon in sidebar)
2. Toggle **"Enable Notifications"** off

Notifications only appear when Grove is not the focused window, avoiding duplication with in-app toasts.

## Window Behaviour

### Single Instance

Grove prevents multiple instances from running simultaneously. If you attempt to launch a second instance, the existing window will be focused instead.

### Position Memory

Grove remembers your window position, size, and maximised state across restarts. This is particularly useful for multi-monitor setups.

### Visual Effects

On macOS, Grove uses native window vibrancy for a frosted-glass appearance that adapts to your desktop wallpaper and system light/dark mode.

## Tips

1. **Quick navigation** - Click repositories to quickly switch context, or use **Cmd+Shift+W** from any app

2. **Auto-refresh** - Grove watches for filesystem changes and automatically refreshes when worktrees are added or removed

3. **Right-click for actions** - Context menus provide quick access to common operations without clicking individual buttons

4. **Check grades** - Health grades help identify worktrees needing attention

5. **Use browser action** - Great for Laravel Herd sites with automatic `.test` domains

6. **Global shortcuts** - Press **Cmd+Shift+G** from any application to quickly toggle the Grove window
