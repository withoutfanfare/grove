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

## Overview Home Screen

When no repository is selected — including every launch — Grove shows the
cross-repository Overview. It answers two questions at a glance: **what needs
my attention?** and **where was I?**

### Stat Strip

A row of chips across the top totals your portfolio: repositories, worktrees,
dirty count, behind count, and total disk usage (disk appears once the
background scan completes).

### Needs Attention Panel

Grouped sections, each with a count badge:

- **Repository errors** — repositories Grove couldn't read, with a **Repair**
  action; last-known data is still shown
- **Health issues** — critical issues first, described in plain English
  (e.g. "37 uncommitted changes · No commits for 105 days"); hover the
  severity dot for what the severity means, and **View** opens the full
  health report for that repository
- **Dirty** — worktrees with uncommitted changes; open them straight in your
  editor
- **Behind remote** — worktrees with commits to pull; pull individually or use
  **Pull all** to pull every behind worktree across all repositories (one at a
  time, with live progress)
- **Cleanup candidates** — merged or stale worktrees; **Remove** uses the
  normal delete flow, or **Prune all** removes merged branches across
  repositories after a confirmation listing exactly what will be pruned

Clicking an item's body jumps to that repository with the worktree focused.
When nothing needs attention, the panel shows a calm all-clear state.

### Recent Panel

Your recently accessed worktrees with relative timestamps and quick-open
editor/terminal buttons. Click one to jump straight back to it.

### Getting to the Overview

- Click the **Overview** button at the top of the sidebar
- Press **Cmd+0**
- Run **"Go to Overview"** from the command palette (Cmd+K)

The Overview paints instantly from its cached snapshot, then refreshes in the
background (on launch, on window focus, and with **Cmd+R**).

## Sidebar

### Overview Button

- Sits above the Repositories/Recent tabs
- Returns to the cross-repository Overview
- Highlighted when the Overview is showing

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

### Worktree Ledger Badges

These appear only if you have Waypoint's `way` command installed. They report what the ledger says about a worktree — Grove never works any of it out for itself.

- **At risk** - The most serious verdict. Removing this worktree would destroy work nobody has a copy of, and `grove rm` will refuse until you deal with it.
- **Needs a look** - Something is wrong but no work is about to be lost. Open the details panel for the remedy.
- **Worth knowing** - The ledger has a note about this worktree. Nothing is at stake.
- **Clear** - The ledger checked this worktree and found nothing. Said out loud rather than left blank, so you can tell it apart from a check that never ran.
- **Risk unknown** - The ledger answered for this worktree but could not work out its risk. This is *not* the same as "Clear", and Grove will never quietly show it as safe. Hover the badge for the reason.
- **Ledger unknown** - The ledger could not answer about this worktree at all. Same rule: unknown, never safe.
- **`<tool>` working here** - An agent session (Claude, Codex) is working in this worktree right now. Hover to see which session, on which machine, and until when.
- **Drifted** - The worktree has changed since its last recorded checkpoint.
- **No checkpoint** - Nothing has ever been recorded about this worktree.

Expand a worktree's details for the full picture, including an expired agent claim and who last held it. Nothing in Grove can override the ledger — that stays a deliberate command-line step, so it is always recorded.

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

### Actions Menu

Click the **⋯** button on any worktree card for the full set of actions. (Right-click does nothing — Grove uses this menu instead of a native context menu.)

- **Details** - Expand the worktree's detail panel
- **Edit / Delete note** - Manage the worktree's purpose note
- **Open All** - Terminal, editor and browser together
- **Pull** / **Sync** - Update from remote (Sync is disabled while the worktree is dirty)
- **Open in** - Editor, Terminal, Git Client, Browser, Finder, and **Waypoint**
- **Copy** - Path, branch name, URL, or a ready-made `cd` command
- **Delete Worktree** - Remove it, with confirmation

#### Open in Waypoint

Shown only when the worktree has a record in the Worktree Ledger. It opens Waypoint on that record, where you can see the full risk detail and the remedy for each one.

This is a one-way, read-only handover: Waypoint shows you what it knows, and cannot remove, acknowledge or override anything on your behalf.

## Header Actions

### Refresh Button

Click to reload:
- Repository list
- Worktree data for selected repository

Grove automatically watches for filesystem changes and refreshes when worktrees are added or removed, but you can manually refresh to ensure the latest data.

## Health Report

Open the health report for the selected repository from the **Repository
health** button in the top bar, via **Health Report** in the command palette
(Cmd+K), or with **View** on a health item in the Overview's Needs Attention
panel.

### What It Shows

- **Overall grade and score** - The repository's letter grade (A-F) and its
  score out of 100
- **Summary tiles** - How many worktrees are Healthy (score 80 or above),
  Warning (60-79), or Critical (below 60); hover a tile for its score range
- **Findings grouped by worktree** - Each issue is described in plain English
  with a one-line explanation of why it matters and a chip showing exactly how
  many points it deducted (e.g. "-10 pts")
- **Severity chips** - Each worktree group is labelled Warning or Critical;
  hover the chip for what that means
- **How scoring works** - An expandable explainer with the full deduction
  table, grade bands, and severity brackets

### Fixing Issues Inline

Each finding offers the actions that resolve it:

- **Pull** / **Sync** - Catch a worktree up with its base branch
- **Open in Editor** - Jump straight to uncommitted work
- **Go to Worktree** - Close the report and focus that worktree in the list
- **Remove…** - For dormant worktrees; always opens the normal delete
  confirmation first, so nothing is deleted in one click

The report refreshes automatically after an action completes.

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
