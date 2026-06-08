# Batch Worktree Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users select multiple worktrees in a repo and run a single batch Delete or batch Pull across all of them.

**Architecture:** Selection state lives in the `worktrees` Pinia store (a `Set` of worktree paths). A hover-revealed, then-persistent checkbox on each `WorktreeCard` toggles selection (shift-click ranges); a tristate select-all sits in the filter toolbar; a floating `SelectionActionBar` exposes Pull/Delete/Clear. Batch Pull reuses the existing `pull_selected_with_progress` backend; batch Delete adds a new `remove_selected_with_progress` that loops the existing single-remove, emitting the same `operation_progress` events so the shared `OperationProgressPanel` handles progress/cancel/retry.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Pinia + Tailwind (frontend); Rust + Tauri 2 commands + `tauri_plugin_shell` sidecar (backend); Vitest + `@vue/test-utils` and `cargo test` (tests).

**Spec:** `docs/superpowers/specs/2026-06-08-batch-worktree-operations-design.md`

---

## File Structure

**Backend (Rust):**
- `src-tauri/src/types.rs` — add `RemoveSelectedItem`, `RemoveSelectedSummary`, `RemoveSelectedResult` (mirror the `PullAll*` family).
- `src-tauri/src/wt.rs` — add pure helper `summarise_removals()` and `remove_selected_with_progress()` (mirrors `pull_selected_with_progress` at line 1188, but sequential).
- `src-tauri/src/commands.rs` — add `remove_selected_worktrees` command.
- `src-tauri/src/lib.rs` — register the command in the `use` list and `invoke_handler`.

**Frontend types & data layer:**
- `src/types/wt.ts` — mirror the three new Rust types.
- `src/composables/useWt.ts` — add `removeSelectedWorktrees()` invoke wrapper.
- `src/composables/useWorktrees.ts` — add `removeSelectedWorktrees()` (refresh + tray, returns null on error).

**Selection state & logic:**
- `src/stores/worktrees.ts` — add `selectedPaths`, `lastSelectedPath`, selection actions/getters, clear-on-switch, prune-on-`setWorktrees`.
- `src/composables/useWorktreeSelection.ts` (new) — selectability rule + toggle/range/select-all/derived selectors over the store.
- `src/composables/index.ts` — export the new composable.

**UI components:**
- `src/components/WorktreeCard.vue` — leading checkbox, emits `toggle-select`.
- `src/components/VirtualWorktreeList.vue` — forward `toggle-select`.
- `src/components/SelectionActionBar.vue` (new) — floating Pull/Delete/Clear bar.
- `src/components/BatchDeleteDialog.vue` (new) — confirm-only delete dialog.
- `src/components/Dashboard.vue` — select-all in toolbar, wire action bar + dialogs, batch handlers, retry routing, Esc-to-clear.

**Docs:**
- `CHANGELOG.md` — feature entry.

---

## Task 1: Selection state in the worktrees store

**Files:**
- Modify: `src/stores/worktrees.ts`
- Test: `src/stores/worktrees.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `src/stores/worktrees.test.ts` (after the existing blocks, before the final closing `})`):

```ts
  describe('multi-selection', () => {
    const wts: Worktree[] = [
      { path: '/r/a', branch: 'a', sha: 's', dirty: false, ahead: 0, behind: 0 },
      { path: '/r/b', branch: 'b', sha: 's', dirty: false, ahead: 0, behind: 0 },
      { path: '/r/c', branch: 'c', sha: 's', dirty: false, ahead: 0, behind: 0 },
    ]

    it('starts with an empty selection', () => {
      const store = useWorktreeStore()
      expect(store.selectedPaths.size).toBe(0)
      expect(store.selectionCount).toBe(0)
    })

    it('toggles a path on and off and tracks the anchor', () => {
      const store = useWorktreeStore()
      store.toggleSelection('/r/a')
      expect(store.selectedPaths.has('/r/a')).toBe(true)
      expect(store.lastSelectedPath).toBe('/r/a')
      store.toggleSelection('/r/a')
      expect(store.selectedPaths.has('/r/a')).toBe(false)
    })

    it('selects an inclusive range between the anchor and target', () => {
      const store = useWorktreeStore()
      store.toggleSelection('/r/a')
      store.selectRange('/r/c', ['/r/a', '/r/b', '/r/c'])
      expect([...store.selectedPaths].sort()).toEqual(['/r/a', '/r/b', '/r/c'])
    })

    it('replaces the selection with setSelection', () => {
      const store = useWorktreeStore()
      store.toggleSelection('/r/a')
      store.setSelection(['/r/b', '/r/c'])
      expect([...store.selectedPaths].sort()).toEqual(['/r/b', '/r/c'])
    })

    it('clears selection when switching repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'r1', worktrees: 1 }, { name: 'r2', worktrees: 1 }])
      store.selectRepository('r1')
      store.toggleSelection('/r/a')
      store.selectRepository('r2')
      expect(store.selectedPaths.size).toBe(0)
      expect(store.lastSelectedPath).toBeNull()
    })

    it('prunes selected paths that disappear after a refresh', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'r1', worktrees: 3 }])
      store.selectRepository('r1')
      store.setWorktrees(wts)
      store.setSelection(['/r/a', '/r/b'])
      store.setWorktrees([wts[0]]) // /r/b removed
      expect([...store.selectedPaths]).toEqual(['/r/a'])
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stores/worktrees.test.ts`
Expected: FAIL — `store.selectedPaths`, `toggleSelection`, etc. are undefined.

- [ ] **Step 3: Add selection state to the store**

In `src/stores/worktrees.ts`, add state after the `worktreeCache` ref (line 27):

```ts
  // Multi-selection: set of selected worktree paths (per-repo, cleared on switch)
  const selectedPaths = ref<Set<string>>(new Set());
  // Anchor for shift-click range selection
  const lastSelectedPath = ref<string | null>(null);
```

Add this getter alongside the other getters (after `cleanWorktrees`, line 46):

```ts
  const selectionCount = computed(() => selectedPaths.value.size);
```

Add these actions after `getCachedWorktrees` (line 77):

```ts
  function toggleSelection(path: string) {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedPaths.value = next;
    lastSelectedPath.value = path;
  }

  function setSelection(paths: string[]) {
    selectedPaths.value = new Set(paths);
  }

  function clearSelection() {
    selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }

  function selectRange(toPath: string, orderedPaths: string[]) {
    const anchor = lastSelectedPath.value;
    const next = new Set(selectedPaths.value);
    if (anchor && orderedPaths.includes(anchor) && orderedPaths.includes(toPath)) {
      const a = orderedPaths.indexOf(anchor);
      const b = orderedPaths.indexOf(toPath);
      const [start, end] = a < b ? [a, b] : [b, a];
      for (let i = start; i <= end; i++) {
        next.add(orderedPaths[i]);
      }
    } else {
      next.add(toPath);
    }
    selectedPaths.value = next;
    lastSelectedPath.value = toPath;
  }
```

- [ ] **Step 4: Prune stale selections and clear on repo switch**

In `setWorktrees` (currently lines 56-63), insert the prune block before the cache logic so the function reads:

```ts
  function setWorktrees(wts: Worktree[]) {
    worktrees.value = wts;
    // Drop any selected paths that no longer exist (e.g. after a batch delete)
    if (selectedPaths.value.size > 0) {
      const valid = new Set(wts.map((w) => w.path));
      const pruned = new Set([...selectedPaths.value].filter((p) => valid.has(p)));
      if (pruned.size !== selectedPaths.value.size) {
        selectedPaths.value = pruned;
      }
    }
    // Cache for lazy loading
    if (selectedRepoName.value) {
      loadedRepos.value.add(selectedRepoName.value);
      worktreeCache.value[selectedRepoName.value] = wts;
    }
  }
```

In `selectRepository`, add `clearSelection();` immediately after the `focusedBranch.value = null;` line (line 83). In `deselectRepository`, add `clearSelection();` after `focusTransient.value = false;` (line 104). In `reset()`, add `clearSelection();` before the closing brace (after line 167).

- [ ] **Step 5: Export the new members**

In the store's `return { ... }` object, add to the State group: `selectedPaths,`, `lastSelectedPath,`; to the Getters group: `selectionCount,`; to the Actions group: `toggleSelection,`, `setSelection,`, `clearSelection,`, `selectRange,`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/stores/worktrees.test.ts`
Expected: PASS (all selection tests green, existing tests still green).

- [ ] **Step 7: Commit**

Stage with `gitaddall` (it prints an "ignored by .gitignore" notice and exits 1 — that is expected here; the tracked files are still staged), then commit:

```bash
gitaddall
git commit -m "feat: add multi-selection state to worktree store"
```

---

## Task 2: Backend types + batch-remove function

**Files:**
- Modify: `src-tauri/src/types.rs`
- Modify: `src-tauri/src/wt.rs`
- Test: inline `#[cfg(test)]` module in `src-tauri/src/wt.rs`

- [ ] **Step 1: Add the result types**

In `src-tauri/src/types.rs`, after `RemoveWorktreeResponse` (line 192), add:

```rust
/// One worktree's outcome within a batch remove operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveSelectedItem {
    /// Branch name
    pub branch: String,
    /// Whether the removal succeeded
    pub success: bool,
    /// Whether the git branch was deleted
    pub branch_deleted: bool,
    /// Outcome message (or error/cancellation reason)
    pub message: String,
}

/// Summary of a batch remove operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveSelectedSummary {
    /// Total worktrees attempted
    pub total: u32,
    /// Number removed successfully
    pub succeeded: u32,
    /// Number that failed (excludes cancelled)
    pub failed: u32,
    /// Number cancelled by the user
    #[serde(default)]
    pub cancelled: u32,
}

/// Aggregated result of removing several worktrees
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveSelectedResult {
    /// Repository name
    pub repo: String,
    /// Per-worktree outcomes
    pub worktrees: Vec<RemoveSelectedItem>,
    /// Summary of the operation
    pub summary: RemoveSelectedSummary,
}
```

- [ ] **Step 2: Write the failing Rust tests**

In `src-tauri/src/wt.rs`, inside the existing `#[cfg(test)] mod tests { ... }` block (find `mod tests` near the bottom), add:

```rust
    #[test]
    fn test_summarise_removals_counts() {
        let items = vec![
            RemoveSelectedItem { branch: "a".into(), success: true, branch_deleted: true, message: "removed".into() },
            RemoveSelectedItem { branch: "b".into(), success: false, branch_deleted: false, message: "boom".into() },
            RemoveSelectedItem { branch: "c".into(), success: false, branch_deleted: false, message: "Operation cancelled".into() },
        ];
        let result = summarise_removals("myrepo", items);
        assert_eq!(result.repo, "myrepo");
        assert_eq!(result.summary.total, 3);
        assert_eq!(result.summary.succeeded, 1);
        assert_eq!(result.summary.failed, 1);
        assert_eq!(result.summary.cancelled, 1);
    }

    #[test]
    fn test_remove_selected_result_serde_roundtrip() {
        let result = summarise_removals(
            "r",
            vec![RemoveSelectedItem { branch: "x".into(), success: true, branch_deleted: false, message: "removed".into() }],
        );
        let json = serde_json::to_string(&result).unwrap();
        let parsed: RemoveSelectedResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.worktrees.len(), 1);
        assert_eq!(parsed.worktrees[0].branch, "x");
        assert_eq!(parsed.summary.succeeded, 1);
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd src-tauri && cargo test summarise_removals remove_selected_result_serde 2>&1 | tail -20`
Expected: compile error — `summarise_removals`, `RemoveSelectedItem`, `RemoveSelectedResult` not found in `wt.rs` scope.

- [ ] **Step 4: Implement the helper and batch function**

In `src-tauri/src/wt.rs`, ensure the types are imported. Find the existing `use crate::types::{...}` block near the top and add `RemoveSelectedItem`, `RemoveSelectedResult`, `RemoveSelectedSummary` to it (keep alphabetical-ish to match the file's style; if `RemoveWorktreeResult` is already imported, add these next to it).

Then add, immediately after `pull_selected_with_progress` (after line 1346):

```rust
/// Build a `RemoveSelectedResult` from per-item outcomes.
///
/// Pure (no I/O) so it can be unit-tested without an `AppHandle`.
fn summarise_removals(repo_name: &str, items: Vec<RemoveSelectedItem>) -> RemoveSelectedResult {
    let total = items.len() as u32;
    let succeeded = items.iter().filter(|i| i.success).count() as u32;
    let cancelled = items
        .iter()
        .filter(|i| i.message == "Operation cancelled")
        .count() as u32;
    let failed = items
        .iter()
        .filter(|i| !i.success && i.message != "Operation cancelled")
        .count() as u32;

    RemoveSelectedResult {
        repo: repo_name.to_string(),
        worktrees: items,
        summary: RemoveSelectedSummary { total, succeeded, failed, cancelled },
    }
}

/// Remove several worktrees sequentially, emitting progress events.
///
/// Mirrors `pull_selected_with_progress` but runs sequentially (worktree
/// removal mutates the repo's worktree list and runs hooks, so parallelism is
/// unsafe). Per-item failures are recorded and do not abort the batch.
/// Cancellation is honoured between items via the global cancellation token.
/// `force` is always true, matching the single-delete GUI behaviour.
pub fn remove_selected_with_progress(
    app: &tauri::AppHandle,
    repo_name: &str,
    branches: Vec<String>,
    delete_branch: bool,
    drop_db: bool,
    skip_backup: bool,
) -> WtResult<RemoveSelectedResult> {
    validate_repo_name(repo_name)?;
    for branch in &branches {
        validate_branch_name(branch)?;
    }

    let total = branches.len() as u32;
    if total == 0 {
        return Ok(summarise_removals(repo_name, vec![]));
    }

    // Registers globally and becomes the active operation; request_cancel() flips it.
    let cancel_token = CancellationToken::new();

    // Emit initial "pending" for all items so the panel shows the full list.
    for (i, branch) in branches.iter().enumerate() {
        emit_progress(app, "remove_all", (i + 1) as u32, total, branch, "pending", None);
    }

    let mut items: Vec<RemoveSelectedItem> = Vec::with_capacity(branches.len());
    for (i, branch) in branches.iter().enumerate() {
        let current = (i + 1) as u32;

        if cancel_token.is_cancelled() {
            emit_progress(app, "remove_all", current, total, branch, "skipped", Some("cancelled".to_string()));
            items.push(RemoveSelectedItem {
                branch: branch.clone(),
                success: false,
                branch_deleted: false,
                message: "Operation cancelled".to_string(),
            });
            continue;
        }

        emit_progress(app, "remove_all", current, total, branch, "in_progress", None);

        match remove_worktree(app, repo_name, branch, delete_branch, drop_db, skip_backup, true) {
            Ok(resp) if resp.result.success => {
                let deleted = resp.result.branch_deleted;
                let details = if deleted { "branch deleted" } else { "worktree removed" };
                emit_progress(app, "remove_all", current, total, branch, "success", Some(details.to_string()));
                items.push(RemoveSelectedItem {
                    branch: branch.clone(),
                    success: true,
                    branch_deleted: deleted,
                    message: "removed".to_string(),
                });
            }
            Ok(_) => {
                emit_progress(app, "remove_all", current, total, branch, "failed", Some("removal reported failure".to_string()));
                items.push(RemoveSelectedItem {
                    branch: branch.clone(),
                    success: false,
                    branch_deleted: false,
                    message: "removal reported failure".to_string(),
                });
            }
            Err(e) => {
                emit_progress(app, "remove_all", current, total, branch, "failed", Some(e.message.clone()));
                items.push(RemoveSelectedItem {
                    branch: branch.clone(),
                    success: false,
                    branch_deleted: false,
                    message: e.message,
                });
            }
        }
    }

    Ok(summarise_removals(repo_name, items))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd src-tauri && cargo test summarise_removals remove_selected_result_serde 2>&1 | tail -20`
Expected: PASS (2 tests). Then `cd src-tauri && cargo build 2>&1 | tail -5` — Expected: clean build.

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add remove_selected_with_progress batch backend"
```

---

## Task 3: Batch-remove Tauri command + registration

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the command**

In `src-tauri/src/commands.rs`, add `RemoveSelectedResult` to the `use crate::types::{...}` import block (next to `RemoveWorktreeResponse`). Then add, immediately after `pull_selected_worktrees` (after line 979):

```rust
/// Remove several worktrees in one batch operation.
///
/// Emits `operation_progress` events (operation `"remove_all"`) per worktree.
/// Options apply uniformly to every selected worktree; force is always on.
/// Callable from frontend as: invoke('remove_selected_worktrees', { repoName, branches, deleteBranch, dropDb, skipBackup })
#[command(rename_all = "camelCase")]
pub async fn remove_selected_worktrees(
    repo_name: String,
    branches: Vec<String>,
    delete_branch: bool,
    drop_db: bool,
    skip_backup: bool,
    app: tauri::AppHandle,
) -> Result<RemoveSelectedResult, WtError> {
    spawn_blocking(move || {
        wt::remove_selected_with_progress(&app, &repo_name, branches, delete_branch, drop_db, skip_backup)
    })
    .await
    .map_err(|e| WtError {
        code: "SPAWN_ERROR".to_string(),
        message: format!("Failed to spawn background task: {}", e),
    })?
}
```

- [ ] **Step 2: Register the command**

In `src-tauri/src/lib.rs`: add `remove_selected_worktrees` to the `commands::{...}` `use` list (next to `remove_worktree` on line 31), and add `remove_selected_worktrees,` to the `invoke_handler` list (immediately after `pull_selected_worktrees,` on line 116).

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo build 2>&1 | tail -5`
Expected: clean build (no "unused" or "not found" errors for the new command).

- [ ] **Step 4: Run the full Rust suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -15`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
gitaddall
git commit -m "feat: register remove_selected_worktrees command"
```

---

## Task 4: Frontend types + data-layer wrappers

**Files:**
- Modify: `src/types/wt.ts`
- Modify: `src/composables/useWt.ts`
- Modify: `src/composables/useWorktrees.ts`

- [ ] **Step 1: Mirror the Rust types**

In `src/types/wt.ts`, after `RemoveWorktreeResponse` (line 215-ish), add:

```ts
/** One worktree's outcome within a batch remove (mirrors Rust RemoveSelectedItem) */
export interface RemoveSelectedItem {
  branch: string;
  success: boolean;
  branch_deleted: boolean;
  message: string;
}

/** Summary of a batch remove (mirrors Rust RemoveSelectedSummary) */
export interface RemoveSelectedSummary {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}

/** Aggregated result of removing several worktrees (mirrors Rust RemoveSelectedResult) */
export interface RemoveSelectedResult {
  repo: string;
  worktrees: RemoveSelectedItem[];
  summary: RemoveSelectedSummary;
}
```

- [ ] **Step 2: Add the invoke wrapper**

In `src/composables/useWt.ts`: add `RemoveSelectedResult` to the type import block at the top (next to the other type imports). Then add, immediately after `pullSelectedWorktrees` (after line 265):

```ts
  /**
   * Remove several worktrees in one batch (emits operation_progress events).
   */
  async function removeSelectedWorktrees(
    repoName: string,
    branches: string[],
    options: { deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }
  ): Promise<RemoveSelectedResult> {
    return await invoke<RemoveSelectedResult>('remove_selected_worktrees', {
      repoName,
      branches,
      deleteBranch: options.deleteBranch,
      dropDb: options.dropDb,
      skipBackup: options.skipBackup,
    });
  }
```

Add `removeSelectedWorktrees,` to the `return { ... }` object of `useWt`.

- [ ] **Step 3: Add the store-integrated wrapper**

In `src/composables/useWorktrees.ts`: add `RemoveSelectedResult` to the type import block (lines 5-16). Then add, immediately after `pullSelectedWorktrees` (after line 535):

```ts
  /**
   * Remove selected worktrees in a batch. Refreshes the list and tray on
   * completion. Returns the aggregated result, or null on a hard failure.
   */
  async function removeSelectedWorktrees(
    repoName: string,
    branches: string[],
    options: { deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }
  ): Promise<RemoveSelectedResult | null> {
    try {
      const result = await wt.removeSelectedWorktrees(repoName, branches, options);
      // Refresh after batch removal (debounced to prevent flicker)
      fetchWorktreesDebounced();
      scheduleTrayRefresh();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }
```

Add `removeSelectedWorktrees,` to the `return { ... }` object of `useWorktrees` (near `pullSelectedWorktrees`).

- [ ] **Step 4: Verify types**

Run: `npm run build`
Expected: vue-tsc completes with no type errors.

- [ ] **Step 5: Commit**

```bash
gitaddall
git commit -m "feat: add batch-remove types and data-layer wrappers"
```

---

## Task 5: Selection composable

**Files:**
- Create: `src/composables/useWorktreeSelection.ts`
- Modify: `src/composables/index.ts`
- Test: `src/composables/useWorktreeSelection.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/composables/useWorktreeSelection.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktreeSelection } from './useWorktreeSelection'
import { useWorktreeStore } from '../stores'
import { useRepoConfigStore } from '../stores/repoConfig'
import type { Worktree } from '../types'

const mk = (path: string, branch: string, dirty = false): Worktree => ({
  path, branch, sha: 's', dirty, ahead: 0, behind: 0,
})

const list: Worktree[] = [
  mk('/r/a', 'feature/a'),
  mk('/r/b', 'main'),          // protected
  mk('/r/c', 'feature/c', true),
  mk('/r/d', ''),              // detached
]

describe('useWorktreeSelection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const repoConfig = useRepoConfigStore()
    repoConfig.effectiveConfig = {
      protected_branches: ['main', 'release/*'],
    } as any
  })

  it('marks protected and detached worktrees unselectable', () => {
    const sel = useWorktreeSelection()
    expect(sel.isSelectable(list[0])).toBe(true)
    expect(sel.isSelectable(list[1])).toBe(false)
    expect(sel.unselectableReason(list[1])).toMatch(/Protected/)
    expect(sel.isSelectable(list[3])).toBe(false)
    expect(sel.unselectableReason(list[3])).toMatch(/Detached/)
  })

  it('ignores toggle on unselectable worktrees', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[1], {}, list)
    expect(sel.selectionCount.value).toBe(0)
  })

  it('range select only includes selectable items', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[0], {}, list)            // anchor on /r/a
    sel.toggle(list[2], { shift: true }, list) // range a..c, skipping protected main
    expect([...useWorktreeStore().selectedPaths].sort()).toEqual(['/r/a', '/r/c'])
  })

  it('select-all toggles the selectable members of the filtered list', () => {
    const sel = useWorktreeSelection()
    expect(sel.selectAllState(list)).toBe('none')
    sel.toggleSelectAll(list)
    expect([...useWorktreeStore().selectedPaths].sort()).toEqual(['/r/a', '/r/c'])
    expect(sel.selectAllState(list)).toBe('all')
    sel.toggleSelectAll(list)
    expect(sel.selectAllState(list)).toBe('none')
  })

  it('reports partial select-all as "some"', () => {
    const sel = useWorktreeSelection()
    sel.toggle(list[0], {}, list)
    expect(sel.selectAllState(list)).toBe('some')
  })

  it('derives selected branches and dirty selections', () => {
    const sel = useWorktreeSelection()
    sel.toggleSelectAll(list)
    expect(sel.selectedBranches(list).sort()).toEqual(['feature/a', 'feature/c'])
    expect(sel.selectedDirty(list).map((w) => w.path)).toEqual(['/r/c'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/composables/useWorktreeSelection.test.ts`
Expected: FAIL — module `./useWorktreeSelection` does not exist.

- [ ] **Step 3: Implement the composable**

Create `src/composables/useWorktreeSelection.ts`:

```ts
import { computed } from 'vue'
import { useWorktreeStore } from '../stores'
import { useRepoConfigStore } from '../stores/repoConfig'
import type { Worktree } from '../types'

/** True if `branch` matches any protected pattern (exact or `*` glob). */
function matchesProtected(branch: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === branch) return true
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escaped}$`).test(branch)
  })
}

/**
 * Multi-selection logic over the worktree store: selectability rules,
 * click/shift-click toggling, select-all, and derived selectors.
 */
export function useWorktreeSelection() {
  const store = useWorktreeStore()
  const repoConfig = useRepoConfigStore()

  const selectionCount = computed(() => store.selectedPaths.size)
  const hasSelection = computed(() => store.selectedPaths.size > 0)

  function isSelected(path: string): boolean {
    return store.selectedPaths.has(path)
  }

  /** Reason a worktree cannot be batch-selected, or null if it can. */
  function unselectableReason(wt: Worktree): string | null {
    if (!wt.branch) return 'Detached HEAD — not selectable'
    const patterns = repoConfig.effectiveConfig?.protected_branches ?? []
    if (matchesProtected(wt.branch, patterns)) return 'Protected — delete individually'
    return null
  }

  function isSelectable(wt: Worktree): boolean {
    return unselectableReason(wt) === null
  }

  /** Toggle a worktree; shift extends a range against the ordered (filtered) list. */
  function toggle(wt: Worktree, opts: { shift?: boolean }, ordered: Worktree[]): void {
    if (!isSelectable(wt)) return
    if (opts.shift && store.lastSelectedPath) {
      const selectablePaths = ordered.filter(isSelectable).map((w) => w.path)
      store.selectRange(wt.path, selectablePaths)
    } else {
      store.toggleSelection(wt.path)
    }
  }

  function selectableFiltered(filtered: Worktree[]): Worktree[] {
    return filtered.filter(isSelectable)
  }

  function selectAllState(filtered: Worktree[]): 'none' | 'some' | 'all' {
    const selectable = selectableFiltered(filtered)
    if (selectable.length === 0) return 'none'
    const selectedCount = selectable.filter((w) => store.selectedPaths.has(w.path)).length
    if (selectedCount === 0) return 'none'
    if (selectedCount === selectable.length) return 'all'
    return 'some'
  }

  /** Select all selectable filtered worktrees, or deselect them if already all selected. */
  function toggleSelectAll(filtered: Worktree[]): void {
    const selectable = selectableFiltered(filtered)
    const allSelected =
      selectable.length > 0 && selectable.every((w) => store.selectedPaths.has(w.path))
    const next = new Set(store.selectedPaths)
    for (const w of selectable) {
      if (allSelected) {
        next.delete(w.path)
      } else {
        next.add(w.path)
      }
    }
    store.setSelection([...next])
  }

  function selectedWorktrees(all: Worktree[]): Worktree[] {
    return all.filter((w) => store.selectedPaths.has(w.path))
  }

  function selectedBranches(all: Worktree[]): string[] {
    return selectedWorktrees(all)
      .map((w) => w.branch)
      .filter((b): b is string => Boolean(b))
  }

  function selectedDirty(all: Worktree[]): Worktree[] {
    return selectedWorktrees(all).filter((w) => w.dirty)
  }

  function clear(): void {
    store.clearSelection()
  }

  return {
    selectionCount,
    hasSelection,
    isSelected,
    isSelectable,
    unselectableReason,
    toggle,
    selectAllState,
    toggleSelectAll,
    selectedWorktrees,
    selectedBranches,
    selectedDirty,
    clear,
  }
}
```

- [ ] **Step 4: Export it**

In `src/composables/index.ts`, add: `export { useWorktreeSelection } from './useWorktreeSelection'` (match the existing export style in that file).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/composables/useWorktreeSelection.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add useWorktreeSelection composable"
```

---

## Task 6: WorktreeCard selection checkbox

**Files:**
- Modify: `src/components/WorktreeCard.vue`
- Test: `src/components/WorktreeCard.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/components/WorktreeCard.test.ts`, add a new `describe` block at the end (before the final `})` of the file). It needs the repoConfig + worktree stores, so import them at the top of the file (add after the existing imports):

```ts
import { useRepoConfigStore } from '@/stores/repoConfig'
import { useWorktreeStore } from '@/stores'
```

Then add:

```ts
describe('WorktreeCard selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockResolvedValue(undefined)
  })

  const selectableWt: Worktree = {
    path: '/repos/grove/feature-x', branch: 'feature/x', sha: 'abc', dirty: false, ahead: 0, behind: 0,
  }

  function mountSelectable(wt: Worktree = selectableWt) {
    return mount(WorktreeCard, {
      props: { worktree: wt, repoName: 'grove' },
      global: { stubs: { Dropdown: true, DropdownItem: true, WorktreeDetailsPanel: true } },
    })
  }

  it('renders a selection checkbox', () => {
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').exists()).toBe(true)
  })

  it('emits toggle-select with the path and shift flag on click', async () => {
    const wrapper = mountSelectable()
    await wrapper.find('[data-testid="wt-select"]').trigger('click', { shiftKey: true })
    const events = wrapper.emitted('toggle-select')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ path: '/repos/grove/feature-x', shift: true })
  })

  it('disables the checkbox for protected branches and does not emit', async () => {
    const repoConfig = useRepoConfigStore()
    repoConfig.effectiveConfig = { protected_branches: ['main'] } as any
    const wrapper = mountSelectable({ ...selectableWt, branch: 'main' })
    const box = wrapper.find('[data-testid="wt-select"]')
    expect(box.attributes('disabled')).toBeDefined()
    await box.trigger('click')
    expect(wrapper.emitted('toggle-select')).toBeFalsy()
  })

  it('shows the checked state when the path is selected', () => {
    const store = useWorktreeStore()
    store.setSelection(['/repos/grove/feature-x'])
    const wrapper = mountSelectable()
    expect(wrapper.find('[data-testid="wt-select"]').classes()).toContain('wt-select-checkbox--checked')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/WorktreeCard.test.ts`
Expected: FAIL — no `[data-testid="wt-select"]` element.

- [ ] **Step 3: Add selection logic to the script**

In `src/components/WorktreeCard.vue`, add to the composables import (line 16) by appending `useWorktreeSelection` to the destructured import from `'../composables'`. Then after the existing `emit` definition (line 34), extend the emits to include the new event — replace the `defineEmits` block (lines 31-34) with:

```ts
const emit = defineEmits<{
  delete: [worktree: Worktree]
  select: [branch: string]
  'toggle-select': [payload: { path: string; shift: boolean }]
}>()
```

After the `repoConfigStore` line (line 40), add:

```ts
const selection = useWorktreeSelection()
const isSelected = computed(() => selection.isSelected(props.worktree.path))
const selectionActive = computed(() => selection.hasSelection)
const isSelectable = computed(() => selection.isSelectable(props.worktree))
const unselectableReason = computed(() => selection.unselectableReason(props.worktree))

function handleCheckboxClick(e: MouseEvent) {
  e.stopPropagation()
  if (!isSelectable.value) return
  emit('toggle-select', { path: props.worktree.path, shift: e.shiftKey })
}
```

- [ ] **Step 4: Add the checkbox to the template**

In `src/components/WorktreeCard.vue`, the main content row starts at line 370 (`<div class="px-3.5 py-3 flex items-center gap-3 cursor-pointer" ...>`). Insert the checkbox as the **first child** of that row, immediately before `<!-- Left: Branch info -->` (line 372):

```html
      <!-- Selection checkbox (hover-revealed, persistent once selecting) -->
      <button
        type="button"
        role="checkbox"
        data-testid="wt-select"
        :aria-checked="isSelected"
        :disabled="!isSelectable"
        :title="unselectableReason || (isSelected ? 'Deselect' : 'Select')"
        class="wt-select-checkbox flex-shrink-0"
        :class="{
          'wt-select-checkbox--visible': selectionActive,
          'wt-select-checkbox--checked': isSelected,
          'wt-select-checkbox--disabled': !isSelectable,
        }"
        @click="handleCheckboxClick"
      >
        <svg v-if="isSelected" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </button>
```

Add a `<style scoped>` block at the end of the file (the component currently has no `<style>` block — add one after the closing `</template>`):

```html
<style scoped>
.wt-select-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  opacity: 0;
  transition: opacity var(--duration-fast, 120ms) ease, background-color 120ms ease, border-color 120ms ease;
}

/* `.card` is this component's root; reveal on hover */
.card:hover .wt-select-checkbox {
  opacity: 1;
}

.wt-select-checkbox--visible {
  opacity: 1;
}

.wt-select-checkbox--checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.wt-select-checkbox--disabled,
.card:hover .wt-select-checkbox--disabled {
  opacity: 0;
  cursor: not-allowed;
}

.card:hover .wt-select-checkbox--disabled {
  opacity: 0.3;
}
</style>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/WorktreeCard.test.ts`
Expected: PASS (existing diff-stats tests + new selection tests).

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add selection checkbox to WorktreeCard"
```

---

## Task 7: Forward selection through VirtualWorktreeList

**Files:**
- Modify: `src/components/VirtualWorktreeList.vue`

- [ ] **Step 1: Forward the new event**

In `src/components/VirtualWorktreeList.vue`, extend the `defineEmits` block (lines 23-26) to:

```ts
const emit = defineEmits<{
  delete: [worktree: Worktree]
  select: [branch: string]
  'toggle-select': [payload: { path: string; shift: boolean }]
}>()
```

In the template, on the `<WorktreeCard>` (lines 112-119), add the forwarding handler after `@select`:

```html
          @toggle-select="(payload) => emit('toggle-select', payload)"
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: vue-tsc clean (the card reads selected/selectionActive from the store directly, so no extra props are needed here).

- [ ] **Step 3: Commit**

```bash
gitaddall
git commit -m "feat: forward toggle-select through VirtualWorktreeList"
```

---

## Task 8: SelectionActionBar component

**Files:**
- Create: `src/components/SelectionActionBar.vue`
- Test: `src/components/SelectionActionBar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SelectionActionBar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SelectionActionBar from './SelectionActionBar.vue'

function mountBar(count: number) {
  return mount(SelectionActionBar, { props: { count } })
}

describe('SelectionActionBar', () => {
  it('renders nothing when count is 0', () => {
    const wrapper = mountBar(0)
    expect(wrapper.find('[data-testid="selection-action-bar"]').exists()).toBe(false)
  })

  it('shows the selected count', () => {
    const wrapper = mountBar(3)
    expect(wrapper.text()).toContain('3 selected')
  })

  it('emits pull, delete, and clear', async () => {
    const wrapper = mountBar(2)
    await wrapper.find('[data-testid="bar-pull"]').trigger('click')
    await wrapper.find('[data-testid="bar-delete"]').trigger('click')
    await wrapper.find('[data-testid="bar-clear"]').trigger('click')
    expect(wrapper.emitted('pull')).toBeTruthy()
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('clear')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/SelectionActionBar.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/SelectionActionBar.vue`:

```html
<script setup lang="ts">
/**
 * SelectionActionBar
 *
 * Floating bar shown at the bottom of the worktree list when one or more
 * worktrees are selected. Exposes batch Pull, Delete, and Clear actions.
 */
const props = defineProps<{
  count: number
}>()

const emit = defineEmits<{
  pull: []
  delete: []
  clear: []
}>()

void props
</script>

<template>
  <Transition name="action-bar">
    <div
      v-if="count > 0"
      data-testid="selection-action-bar"
      class="selection-action-bar"
    >
      <span class="selection-count">{{ count }} selected</span>

      <div class="flex-1" />

      <button class="bar-action" data-testid="bar-pull" title="Pull selected worktrees" @click="emit('pull')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Pull
      </button>

      <button class="bar-action bar-action-danger" data-testid="bar-delete" title="Delete selected worktrees" @click="emit('delete')">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete
      </button>

      <span class="bar-divider" />

      <button class="bar-action" data-testid="bar-clear" title="Clear selection (Esc)" @click="emit('clear')">
        Clear
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.selection-action-bar {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 360px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.selection-count {
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.bar-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  transition: background-color 120ms ease, color 120ms ease;
}

.bar-action:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.bar-action-danger {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
}

.bar-action-danger:hover {
  background: color-mix(in srgb, var(--color-danger) 22%, transparent);
}

.bar-divider {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.08);
}

.action-bar-enter-active,
.action-bar-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out), transform var(--duration-modal) var(--ease-out);
}

.action-bar-enter-from,
.action-bar-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/SelectionActionBar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
gitaddall
git commit -m "feat: add SelectionActionBar component"
```

---

## Task 9: BatchDeleteDialog component

**Files:**
- Create: `src/components/BatchDeleteDialog.vue`
- Test: `src/components/BatchDeleteDialog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/BatchDeleteDialog.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BatchDeleteDialog from './BatchDeleteDialog.vue'
import type { Worktree } from '../types'

const mk = (branch: string, dirty = false): Worktree => ({
  path: `/r/${branch}`, branch, sha: 's', dirty, ahead: 0, behind: 0,
})

function mountDialog(worktrees: Worktree[]) {
  return mount(BatchDeleteDialog, {
    props: { isOpen: true, worktrees },
    global: {
      stubs: {
        // Render slot content for SModal so we can query the body
        SModal: { template: '<div><slot /><slot name="footer" /></div>' },
        SButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        SCheckbox: {
          props: ['modelValue'],
          template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
        },
      },
    },
  })
}

describe('BatchDeleteDialog', () => {
  it('shows the worktree count in the primary button', () => {
    const wrapper = mountDialog([mk('a'), mk('b'), mk('c')])
    expect(wrapper.text()).toContain('Delete 3')
  })

  it('lists dirty worktrees by name', () => {
    const wrapper = mountDialog([mk('clean'), mk('messy', true)])
    expect(wrapper.text()).toContain('messy')
    expect(wrapper.text()).toMatch(/uncommitted changes/i)
  })

  it('does not warn when nothing is dirty', () => {
    const wrapper = mountDialog([mk('a'), mk('b')])
    expect(wrapper.text()).not.toMatch(/uncommitted changes/i)
  })

  it('emits confirm with the chosen options', async () => {
    const wrapper = mountDialog([mk('a')])
    // First checkbox is "Delete branches" (default on); toggle "Drop databases" (second)
    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[1].setValue(true) // drop databases
    await wrapper.find('[data-testid="batch-delete-confirm"]').trigger('click')
    const events = wrapper.emitted('confirm')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ deleteBranch: true, dropDb: true, skipBackup: false })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/BatchDeleteDialog.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/BatchDeleteDialog.vue`:

```html
<script setup lang="ts">
/**
 * BatchDeleteDialog
 *
 * Confirm-only dialog for deleting several worktrees at once. Lists any dirty
 * worktrees by name, exposes uniform delete options, and emits `confirm` with
 * the chosen options. The actual deletion + progress is handled by the parent
 * via the shared OperationProgressPanel.
 */
import { ref, computed, watch } from 'vue'
import type { Worktree } from '../types'
import { SButton, SModal, SCheckbox } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
  worktrees: Worktree[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [options: { deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }]
}>()

const deleteBranch = ref(true)
const dropDatabase = ref(false)
const skipBackup = ref(false)

const count = computed(() => props.worktrees.length)
const dirtyWorktrees = computed(() => props.worktrees.filter((w) => w.dirty))

// Reset options each time the dialog opens
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      deleteBranch.value = true
      dropDatabase.value = false
      skipBackup.value = false
    }
  }
)

function handleConfirm() {
  emit('confirm', {
    deleteBranch: deleteBranch.value,
    dropDb: dropDatabase.value,
    skipBackup: skipBackup.value,
  })
}
</script>

<template>
  <SModal :open="isOpen" max-width="max-w-md" @close="emit('close')">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="text-danger">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 class="text-[14px] font-semibold tracking-tight text-text-primary">
          Delete {{ count }} worktree{{ count === 1 ? '' : 's' }}
        </h3>
      </div>
    </template>

    <div class="space-y-5">
      <p class="text-text-secondary text-sm leading-relaxed">
        Are you sure you want to delete {{ count }} worktree{{ count === 1 ? '' : 's' }}?
        This action cannot be undone.
      </p>

      <!-- Dirty warning -->
      <div v-if="dirtyWorktrees.length > 0" class="p-3 bg-warning-muted rounded-lg border border-warning/20">
        <div class="flex items-start gap-2">
          <svg class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="text-warning text-sm font-medium">
              {{ dirtyWorktrees.length }} with uncommitted changes
            </p>
            <ul class="text-warning/80 text-xs mt-1 space-y-0.5">
              <li v-for="wt in dirtyWorktrees" :key="wt.path" class="font-mono truncate">{{ wt.branch }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Options (applied to every selected worktree) -->
      <div class="space-y-3 pt-1">
        <SCheckbox
          v-model="deleteBranch"
          label="Delete branches"
          description="Removes each branch from the git repository"
        />
        <SCheckbox
          v-model="dropDatabase"
          label="Drop associated databases"
          description="Deletes the database for each worktree"
        />
        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div v-if="dropDatabase" class="ml-7">
            <SCheckbox
              v-model="skipBackup"
              label="Skip database backup"
              description="Delete without creating a backup (dangerous)"
              danger
            />
          </div>
        </Transition>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <SButton variant="ghost" @click="emit('close')">Cancel</SButton>
        <SButton variant="danger" data-testid="batch-delete-confirm" @click="handleConfirm">
          Delete {{ count }}
        </SButton>
      </div>
    </template>
  </SModal>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/BatchDeleteDialog.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
gitaddall
git commit -m "feat: add BatchDeleteDialog component"
```

---

## Task 10: Wire selection into Dashboard

**Files:**
- Modify: `src/components/Dashboard.vue`
- Test: `src/components/Dashboard.test.ts`

This task connects everything: the select-all toolbar control, the action bar, the batch dialogs, the batch handlers, retry routing, and Esc-to-clear.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block to `src/components/Dashboard.test.ts` (after the existing block, before the file's end). It uses its own mount helper because the existing `mountDashboard()` auto-stubs `SResizableSplit` with `true`, which swallows the `#second` slot where `<main>` (and the action bar) lives — so we override that one stub to render its slots. `BatchDeleteDialog` is stubbed with a prop-preserving stub so we can assert `isOpen` without depending on `@stuntrocket/ui` internals; `SelectionActionBar` is left real so its buttons are clickable. The store state is set **after** `flushPromises()` so the `onMounted` worktree fetch (mocked to return `[]`) doesn't overwrite it.

First, add this import at the top of the file (after line 7):

```ts
import { flushPromises } from '@vue/test-utils'
```

Then append:

```ts
describe('Dashboard batch selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    // get_worktree_status / list_worktrees → empty list so the onMounted fetch
    // completes cleanly; everything else resolves undefined.
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_worktree_status' || command === 'list_worktrees') {
        return Promise.resolve([])
      }
      return Promise.resolve(undefined)
    })
    mockTauriListen.mockResolvedValue(() => {})
  })

  function mountWithList() {
    return mount(Dashboard, {
      global: {
        stubs: {
          RepoList: true,
          OverviewDashboard: true,
          WorktreeCard: true,
          VirtualWorktreeList: true,
          CreateWorktreeModal: true,
          DeleteWorktreeDialog: true,
          SettingsPanel: true,
          HelpModal: true,
          RepoManagementPanel: true,
          HealthPanel: true,
          OperationProgressPanel: true,
          ErrorBoundary: true,
          SearchInput: true,
          CommandPalette: true,
          UpdateBanner: true,
          SButton: true,
          SIconButton: true,
          // Render slots so <main> (and the action bar inside it) mounts
          SResizableSplit: { template: '<div><slot name="first" /><slot name="second" /></div>' },
          SkeletonCard: true,
          // Prop-preserving stub so we can read isOpen without @stuntrocket/ui
          BatchDeleteDialog: {
            props: ['isOpen', 'worktrees'],
            template: '<div data-testid="batch-delete-dialog" :data-open="String(isOpen)" />',
          },
        },
      },
    })
  }

  it('shows the action bar when worktrees are selected and opens the delete dialog', async () => {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'grove', worktrees: 2 }])
    store.selectRepository('grove')

    const wrapper = mountWithList()
    await flushPromises()

    // No selection yet → no action bar
    expect(wrapper.find('[data-testid="selection-action-bar"]').exists()).toBe(false)

    // Populate worktrees and select one (after the onMounted fetch settles)
    store.setWorktrees([
      { path: '/r/a', branch: 'feature/a', sha: 's', dirty: false, ahead: 0, behind: 0 },
      { path: '/r/b', branch: 'feature/b', sha: 's', dirty: false, ahead: 0, behind: 0 },
    ])
    store.setSelection(['/r/a'])
    await nextTick()

    expect(wrapper.find('[data-testid="selection-action-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="batch-delete-dialog"]').attributes('data-open')).toBe('false')

    await wrapper.find('[data-testid="bar-delete"]').trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="batch-delete-dialog"]').attributes('data-open')).toBe('true')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/Dashboard.test.ts`
Expected: FAIL — `selection-action-bar` never appears (and `batch-delete-dialog` stub absent) because the wiring doesn't exist yet.

- [ ] **Step 3: Add imports and selection wiring to the script**

In `src/components/Dashboard.vue`:

Add to the component imports (after line 33, near the other component imports):

```ts
import SelectionActionBar from './SelectionActionBar.vue'
import BatchDeleteDialog from './BatchDeleteDialog.vue'
```

Add `useWorktreeSelection` to the destructured import from `'../composables'` (line 14).

Add `removeSelectedWorktrees` to the destructured `useWorktrees()` result (lines 60-73).

After the `useWorktreeFilters()` block (line 100), add the selection composable and derived state:

```ts
// Multi-selection
const selection = useWorktreeSelection()
const selectionCount = selection.selectionCount
const selectAllState = computed(() => selection.selectAllState(filteredWorktrees.value))

function handleToggleSelect(payload: { path: string; shift: boolean }) {
  const wt = filteredWorktrees.value.find((w) => w.path === payload.path)
  if (wt) selection.toggle(wt, { shift: payload.shift }, filteredWorktrees.value)
}

function handleSelectAll() {
  selection.toggleSelectAll(filteredWorktrees.value)
}
```

- [ ] **Step 4: Add the batch dialog/operation state and handlers**

After the existing modal-state refs (around line 385, near `worktreeToDelete`), add:

```ts
// Batch operations
const showBatchDeleteDialog = ref(false)
const activeBatchOp = ref<'pull_all' | 'remove_all' | null>(null)
const lastBatchDeleteOptions = ref<{ deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }>({
  deleteBranch: true,
  dropDb: false,
  skipBackup: false,
})

// Worktrees backing the open batch-delete dialog (snapshot of the selection)
const batchDeleteWorktrees = computed(() => selection.selectedWorktrees(worktrees.value))
```

Add the batch Pull handler (place near `handlePullAll`, after line 529):

```ts
async function handleBatchPull() {
  if (!selectedRepoName.value) return
  const branches = selection.selectedBranches(worktrees.value)
  if (branches.length === 0) return

  const worktreePathMap = new Map<string, string>()
  for (const wt of worktrees.value) {
    if (wt.branch) worktreePathMap.set(wt.branch, wt.path)
  }

  closeAllPanels()
  activeBatchOp.value = 'pull_all'
  progressTitle.value = `Pulling ${branches.length} Worktree${branches.length === 1 ? '' : 's'}`
  await startListening('pull_all', branches, worktreePathMap)
  showProgressPanel.value = true

  pauseAutoRefresh()
  try {
    await pullSelectedWorktrees(selectedRepoName.value, branches)
    selection.clear()
  } catch {
    toast.error('Failed to pull selected worktrees')
  } finally {
    resumeAutoRefresh()
  }
}
```

Add the batch Delete handlers (place after `handleBatchPull`):

```ts
function openBatchDeleteDialog() {
  if (selectionCount.value === 0) return
  showBatchDeleteDialog.value = true
}

async function handleBatchDeleteConfirm(options: { deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }) {
  showBatchDeleteDialog.value = false
  if (!selectedRepoName.value) return
  const branches = selection.selectedBranches(worktrees.value)
  if (branches.length === 0) return

  lastBatchDeleteOptions.value = options

  const worktreePathMap = new Map<string, string>()
  for (const wt of worktrees.value) {
    if (wt.branch) worktreePathMap.set(wt.branch, wt.path)
  }

  closeAllPanels()
  activeBatchOp.value = 'remove_all'
  progressTitle.value = `Deleting ${branches.length} Worktree${branches.length === 1 ? '' : 's'}`
  await startListening('remove_all', branches, worktreePathMap)
  showProgressPanel.value = true

  pauseAutoRefresh()
  try {
    const result = await removeSelectedWorktrees(selectedRepoName.value, branches, options)
    if (result) {
      const { succeeded, failed } = result.summary
      if (failed > 0) {
        toast.warning(`Deleted ${succeeded}, ${failed} failed`)
      } else {
        toast.success(`Deleted ${succeeded} worktree${succeeded === 1 ? '' : 's'}`)
      }
    }
    selection.clear()
  } catch {
    toast.error('Failed to delete selected worktrees')
  } finally {
    resumeAutoRefresh()
  }
}
```

- [ ] **Step 5: Route retry-failed by operation type**

Replace the body of `handleRetryFailed` (lines 558-583) so it dispatches based on `activeBatchOp`:

```ts
async function handleRetryFailed() {
  const failedBranches = getFailedItems()
  if (failedBranches.length === 0 || !selectedRepoName.value) return

  const worktreePathMap = new Map<string, string>()
  for (const wt of worktrees.value) {
    if (wt.branch && failedBranches.includes(wt.branch)) {
      worktreePathMap.set(wt.branch, wt.path)
    }
  }

  await resetProgress()

  if (activeBatchOp.value === 'remove_all') {
    progressTitle.value = `Retrying ${failedBranches.length} Failed`
    await startListening('remove_all', failedBranches, worktreePathMap)
    pauseAutoRefresh()
    try {
      await removeSelectedWorktrees(selectedRepoName.value, failedBranches, lastBatchDeleteOptions.value)
    } finally {
      resumeAutoRefresh()
    }
    return
  }

  // Default: pull retry
  progressTitle.value = `Retrying ${failedBranches.length} Failed`
  await startListening('pull_all', failedBranches, worktreePathMap)
  pauseAutoRefresh()
  try {
    await pullSelectedWorktrees(selectedRepoName.value, failedBranches)
  } finally {
    resumeAutoRefresh()
  }
}
```

Also set `activeBatchOp.value = 'pull_all'` at the start of the existing `handlePullAll` (just after the guard on line 500) so retry routes correctly after a pull-all.

- [ ] **Step 6: Esc clears the selection (lowest priority)**

In `closeAllModals` (lines 602-620), add a final `else if` branch at the end of the chain, before the closing brace:

```ts
  } else if (selectionCount.value > 0) {
    selection.clear()
  }
```

- [ ] **Step 7: Add the select-all control, action bar, and dialog to the template**

In the filter/sort toolbar (the `worktree-toolbar` div, line 1048), add the select-all control as the first child, before the `worktree-filter-group` div (line 1052):

```html
            <!-- Select all (filtered, selectable) -->
            <button
              type="button"
              role="checkbox"
              data-testid="select-all"
              :aria-checked="selectAllState === 'all'"
              :title="selectAllState === 'all' ? 'Deselect all' : 'Select all'"
              class="wt-select-all"
              :class="{
                'wt-select-all--checked': selectAllState === 'all',
                'wt-select-all--indeterminate': selectAllState === 'some',
              }"
              @click="handleSelectAll"
            >
              <svg v-if="selectAllState === 'all'" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
              <span v-else-if="selectAllState === 'some'" class="wt-select-all-dash" />
            </button>
```

Add `@toggle-select` handlers to BOTH worktree-card renderers. On `VirtualWorktreeList` (line 1152-1154):

```html
                  <VirtualWorktreeList v-if="useVirtualScroll" :worktrees="filteredWorktrees"
                    :repo-name="selectedRepoName!" :focused-branch="focusedBranch" :expand-on-focus="expandOnFocus"
                    @delete="handleDeleteWorktree" @select="handleSelectWorktree" @toggle-select="handleToggleSelect" />
```

On the `WorktreeCard` inside the TransitionGroup (lines 1159-1163), add `@toggle-select="handleToggleSelect"` alongside the existing `@delete`/`@select`.

Add the action bar inside `<main>` so it floats over the list — place it just before the closing `</main>` (line 1171):

```html
          <SelectionActionBar
            :count="selectionCount"
            @pull="handleBatchPull"
            @delete="openBatchDeleteDialog"
            @clear="selection.clear()"
          />
```

Add the dialog alongside the other modals, after `DeleteWorktreeDialog` (line 1180):

```html
    <BatchDeleteDialog
      :is-open="showBatchDeleteDialog"
      :worktrees="batchDeleteWorktrees"
      @close="showBatchDeleteDialog = false"
      @confirm="handleBatchDeleteConfirm"
    />
```

Add styles for the select-all control to the Dashboard `<style scoped>` block (after the `.worktree-filter-group` rules, around line 1347):

```css
.wt-select-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 5px;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.wt-select-all:hover {
  border-color: rgba(255, 255, 255, 0.45);
}

.wt-select-all--checked {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.wt-select-all--indeterminate {
  border-color: var(--color-accent);
}

.wt-select-all-dash {
  width: 9px;
  height: 2px;
  border-radius: 1px;
  background: var(--color-accent);
}
```

- [ ] **Step 8: Run the Dashboard test to verify it passes**

Run: `npx vitest run src/components/Dashboard.test.ts`
Expected: PASS (new batch test + existing tests green).

- [ ] **Step 9: Full frontend gate**

Run: `npx vitest run && npm run build`
Expected: all Vitest suites pass; vue-tsc clean.

- [ ] **Step 10: Commit**

```bash
gitaddall
git commit -m "feat: wire batch selection, action bar, and dialogs into Dashboard"
```

---

## Task 11: Changelog + final verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a changelog entry**

Open `CHANGELOG.md`, find the current "Unreleased" / top section (match the existing heading style), and add under an `### Added` subsection:

```markdown
- **Batch worktree operations** — select multiple worktrees with hover checkboxes
  (shift-click for ranges, select-all in the toolbar) and delete or pull them in
  one action, with live progress and cancellation. Protected branches are excluded
  from multi-select; dirty worktrees are flagged before a batch delete.
```

- [ ] **Step 2: Run every gate**

Run each and confirm clean:

```bash
npx vitest run
npm run build
cd src-tauri && cargo test && cargo clippy 2>&1 | tail -20 && cargo fmt --check
```

Expected: Vitest all pass; vue-tsc clean; cargo test pass; clippy no new warnings; fmt clean. If `cargo fmt --check` reports diffs in the new code, run `cargo fmt` and re-stage.

- [ ] **Step 3: Commit**

`gitaddall` stages tracked files but the changelog is sometimes missed by the alias — stage it explicitly, then commit:

```bash
gitaddall
git add CHANGELOG.md
git commit -m "docs: changelog entry for batch worktree operations"
```

---

## Self-Review Notes (for the implementer)

- **Selection identity is `path`, operations need `branch`.** The store keys on `path`; `selectedBranches()` resolves to branch names (dropping any empty/detached) before any backend call. Never pass paths to the Rust commands.
- **Reactivity:** store selection actions always assign a fresh `Set` so computed getters re-run. Don't switch to in-place `Set.add/delete` on `selectedPaths.value`.
- **Protected exclusion is UI-only.** The backend still validates branch names; the UI prevents protected/detached worktrees from ever entering the selection.
- **Progress operation strings:** batch pull uses `"pull_all"` (so it shares retry/known UI); batch delete uses `"remove_all"`. `activeBatchOp` routes retry correctly.
- **`SModal`/`SCheckbox`/`SButton` come from `@stuntrocket/ui`** — match the props used in `DeleteWorktreeDialog.vue` (`:open`, `max-width`, `v-model`, `variant`). If a prop name differs in your installed version, mirror `DeleteWorktreeDialog.vue` exactly.
