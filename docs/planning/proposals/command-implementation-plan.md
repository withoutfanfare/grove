# wt Command Implementation Plan

This document analyses all `wt` CLI commands and recommends which should be implemented in the Tauri desktop app.

## Implementation Status

### ✅ Phase 1 Complete

| Command | Tauri Command | Notes |
|---------|---------------|-------|
| `wt repos --json` | `list_repositories()` | Lists all repositories |
| `wt ls <repo> --json` | `list_worktrees()` | Lists worktrees for a repo |
| `wt code` | `open_in_editor()` | Opens in VS Code/Cursor |
| `wt open` | `open_in_browser()` | Opens URL in browser |
| N/A | `open_in_terminal()` | Opens terminal at path |
| N/A | `open_in_finder()` | Reveals in file manager |

### ✅ Phase 2 Complete

| Command | Tauri Command | Notes |
|---------|---------------|-------|
| `wt add --json` | `create_worktree()` | Creates worktree with modal UI |
| `wt rm --json` | `remove_worktree()` | Removes worktree with confirmation dialog |
| `wt pull --json` | `pull_worktree()` | Pulls changes with status toast |
| `wt recent --json` | `get_recent_worktrees()` | Lists recently accessed worktrees |
| `wt sync --json` | `sync_worktree()` | Rebases onto base branch |

---

## Phase 2: High Priority Additions

These commands would significantly enhance the app's value proposition.

### 1. `wt add` - Create Worktree

**CLI:** `wt add <repo> <branch> [base]`

**Why:** Core functionality - users should be able to create worktrees without leaving the app.

**UI Concept:**
- "New Worktree" button in header
- Modal dialog with:
  - Repository dropdown (pre-filled if repo selected)
  - Branch name input (with validation)
  - Base branch dropdown (default: origin/staging)
  - Template selection (optional)
- Show preview of what will be created
- Progress indicator during creation

**Tauri Command:**
```rust
#[command]
pub fn create_worktree(
    repo: String,
    branch: String,
    base: Option<String>,
    template: Option<String>,
) -> Result<Worktree, WtError>
```

**JSON Support:** ✅ Yes (`wt add --json`)

---

### 2. `wt rm` - Remove Worktree

**CLI:** `wt rm <repo> [branch]`

**Why:** Essential counterpart to add - cleanup without CLI.

**UI Concept:**
- "Delete" button on each worktree card
- Confirmation dialog with options:
  - [ ] Delete git branch
  - [ ] Drop database
  - [ ] Skip backup
- Show what will be deleted
- Protected branch warning

**Tauri Command:**
```rust
#[command]
pub fn remove_worktree(
    repo: String,
    branch: String,
    delete_branch: bool,
    drop_db: bool,
    skip_backup: bool,
    force: bool,
) -> Result<(), WtError>
```

**JSON Support:** ✅ Yes

---

### 3. `wt pull` - Pull Changes

**CLI:** `wt pull [repo] [branch]`

**Why:** Common operation - keep worktrees updated.

**UI Concept:**
- "Pull" button on each worktree card
- Shows loading spinner during pull
- Success/failure toast notification
- Updates status badges after pull

**Tauri Command:**
```rust
#[command]
pub fn pull_worktree(repo: String, branch: String) -> Result<PullResult, WtError>

struct PullResult {
    success: bool,
    message: String,
    commits_pulled: u32,
}
```

**JSON Support:** ✅ Yes (`wt pull --json`)

---

### 4. `wt recent` - Recent Worktrees

**CLI:** `wt recent [count] --json`

**Why:** Quick access to recently used worktrees across all repos.

**UI Concept:**
- "Recent" tab/view in sidebar
- Shows last 10 worktrees with timestamps
- Click to navigate to that repo/worktree

**Tauri Command:**
```rust
#[command]
pub fn get_recent_worktrees(count: Option<u32>) -> Result<Vec<RecentWorktree>, WtError>

struct RecentWorktree {
    repo: String,
    branch: String,
    path: String,
    url: Option<String>,
    accessed_at: u64,
    accessed_ago: String,
    dirty: bool,
}
```

**JSON Support:** ✅ Yes

---

### 5. `wt info` - Detailed Worktree Info

**CLI:** `wt info <repo> [branch] --json`

**Why:** More detailed view than ls provides.

**UI Concept:**
- Expand worktree card to show details
- Or: Click card to open detail panel
- Shows: full path, URL, database name, last accessed, git status

**Tauri Command:**
```rust
#[command]
pub fn get_worktree_info(repo: String, branch: String) -> Result<WorktreeInfo, WtError>
```

**JSON Support:** ✅ Yes

---

## Phase 3: Medium Priority

### 6. ~~`wt sync` - Rebase onto Base~~ ✅ IMPLEMENTED

**Status:** Moved to Phase 2 and implemented. See `sync_worktree()` command.

---

### 7. `wt branches` - Available Branches

**CLI:** `wt branches <repo>`

**Why:** Useful when creating new worktrees - see what branches exist.

**UI Concept:**
- Dropdown in "New Worktree" modal
- Or: Separate "Branches" panel

**JSON Support:** ✅ Yes (`wt branches --json`)

---

### 8. `wt health` - Repository Health

**CLI:** `wt health <repo>`

**Why:** Diagnostic information about repo state.

**UI Concept:**
- Health icon on repo list
- Click to see detailed health report
- Actionable recommendations

**JSON Support:** ✅ Yes

---

### 9. `wt prune` - Clean Stale Worktrees

**CLI:** `wt prune <repo>`

**Why:** Maintenance - clean up deleted branches.

**UI Concept:**
- "Prune" button in repo header
- Shows what will be removed before confirming

**JSON Support:** ⚠️ Partial

---

### 10. `wt pull-all` - Pull All Worktrees

**CLI:** `wt pull-all <repo>`

**Why:** Batch operation - update everything at once.

**UI Concept:**
- "Pull All" button in header
- Progress indicator showing each worktree
- Summary of results

**JSON Support:** ⚠️ Needs enhancement

---

## Phase 4: Lower Priority

### 11. `wt clean` - Remove Dependencies

**CLI:** `wt clean [repo]`

**Why:** Disk space management.

**UI Concept:**
- Show disk usage per worktree
- "Clean" button to remove node_modules/vendor

---

### 12. `wt diff` / `wt summary` - Show Changes

**CLI:** `wt diff [repo] [branch] [base]`

**Why:** See what's changed vs base branch.

**UI Concept:**
- "Diff" button on card
- Opens diff viewer or modal

---

### 13. `wt log` - Recent Commits

**CLI:** `wt log [repo] [branch]`

**Why:** Quick commit history.

**UI Concept:**
- Expand card to see recent commits
- Or: Tooltip on hover

---

### 14. `wt move` - Rename Worktree

**CLI:** `wt move <repo> <branch> <new-name>`

**Why:** Rename/reorganise worktrees.

**UI Concept:**
- Right-click menu or edit button
- Inline rename

---

## Not Suitable for GUI

These commands are better suited to CLI usage:

| Command | Reason |
|---------|--------|
| `wt clone` | Complex setup, better in terminal |
| `wt setup` | One-time configuration wizard |
| `wt doctor` | Diagnostic tool for CLI |
| `wt upgrade` | Self-update mechanism |
| `wt repair` | Recovery operations |
| `wt tinker` | Interactive PHP REPL |
| `wt exec` | Arbitrary command execution |
| `wt exec-all` | Batch arbitrary commands |
| `wt build-all` | Better suited to CI/terminal |
| `wt alias` | Configuration management |
| `wt group` | Configuration management |
| `wt templates` | Configuration management |
| `wt cd` | Shell navigation (returns path) |
| `wt switch` | Combines cd+code+open |
| `wt migrate` | Laravel-specific, needs terminal |
| `wt fresh` | Laravel-specific, needs terminal |

---

## Implementation Roadmap

### Phase 2 ✅ COMPLETE
1. ✅ `wt add` - Create worktree
2. ✅ `wt rm` - Remove worktree
3. ✅ `wt pull` - Pull changes
4. ✅ `wt recent` - Recent worktrees
5. ✅ `wt sync` - Rebase onto base (moved from Phase 3)

### Phase 3 (Future)
6. `wt branches` - List branches
7. `wt health` - Repository health
8. `wt prune` - Clean stale worktrees
9. `wt pull-all` - Pull all worktrees

### Phase 4 (Nice to Have)
10. `wt clean` - Remove dependencies
11. `wt diff` - Show changes
12. `wt log` - Recent commits
13. `wt move` - Rename worktree

---

## JSON API Requirements

Commands needing JSON output enhancement:

| Command | Current State | Needed |
|---------|---------------|--------|
| `wt pull` | ✅ Has JSON | - |
| `wt sync` | ✅ Has JSON | - |
| `wt prune` | Text output | JSON with removed items |
| `wt branches` | ✅ Has JSON | - |
| `wt pull-all` | Text output | JSON array of results |
| `wt add` | ✅ Has JSON | - |
| `wt rm` | ✅ Has JSON | - |
| `wt recent` | ✅ Has JSON | - |
| `wt info` | ✅ Has JSON | - |
| `wt health` | ✅ Has JSON | - |

---

## UI Mockup: Phase 2 Features

```text
┌─────────────────────────────────────────────────────────────────┐
│  wt Worktree Manager                        [+ New] [↻ Refresh] │
├─────────────────┬───────────────────────────────────────────────┤
│                 │                                               │
│  REPOSITORIES   │   my-project (7 worktrees)      [Pull All]   │
│  ─────────────  │   ─────────────────────────────────────────   │
│                 │                                               │
│  ○ Recent       │   ┌─────────────────┐  ┌─────────────────┐   │
│                 │   │ feature/login   │  │ bugfix/cart     │   │
│  ● my-proj (7)  │   │ ────────────────│  │ ────────────────│   │
│  ○ knotbook (3) │   │ [A] Clean  +0-0 │  │ [B] Dirty  +3-1 │   │
│  ○ myapp (2)    │   │                 │  │                 │   │
│                 │   │ [Code][Term][🌐]│  │ [Pull][Sync]    │   │
│                 │   │ [Delete]        │  │ [Code][Delete]  │   │
│                 │   └─────────────────┘  └─────────────────┘   │
│                 │                                               │
│  ─────────────  │                                               │
│  wt v4.1.0      │                                               │
└─────────────────┴───────────────────────────────────────────────┘
```

---

## Next Steps

1. Review this plan and prioritise features
2. Enhance wt CLI JSON output where needed
3. Implement Phase 2 Rust commands
4. Design and build Vue components
5. Test thoroughly before release
