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

- Shows all repositories registered with `wt`
- Displays worktree count for each repository
- Click to select and view worktrees
- Selected repository is highlighted in blue

### Footer

- Shows `wt` CLI version
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

## Header Actions

### Refresh Button

Click to reload:
- Repository list
- Worktree data for selected repository

Use after:
- Creating new worktrees via CLI
- Pulling changes
- Any external modifications

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

## Tips

1. **Quick navigation** - Click repositories to quickly switch context

2. **Keep CLI handy** - For operations like creating worktrees, use the CLI:
   ```bash
   wt add feature/new-feature
   ```

3. **Refresh after changes** - The app doesn't auto-refresh; click refresh after CLI operations

4. **Check grades** - Health grades help identify worktrees needing attention

5. **Use browser action** - Great for Laravel Herd sites with automatic `.test` domains
