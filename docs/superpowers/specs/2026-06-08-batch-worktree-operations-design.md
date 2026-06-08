# Batch Worktree Operations — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorm complete, pending implementation plan)

## Summary

Add multi-select to the worktree list so users can pick several worktrees and
run a single batch operation across all of them. The first version supports
batch **Delete** and batch **Pull**. Selection is driven by a hover-revealed,
then-persistent checkbox on each `WorktreeCard` (with shift-click range
select), a tristate "select all" in the filter/sort toolbar, and a floating
action bar that appears once anything is selected. Batch operations reuse the
existing per-item progress infrastructure (`OperationProgressPanel` +
`operation_progress` Tauri events), so they get progress, cancellation, and
retry-failed essentially for free.

This directly solves the stated pain: clearing out many unneeded worktrees at
once instead of deleting them one by one.

## Decisions Made During Brainstorm

| Question | Decision |
|---|---|
| Scope of batch operations | **Delete + Pull** (sync, open-all deferred) |
| Selection UX | **Hover checkbox + persistent** — fades in on hover, stays visible on all cards once a selection exists; shift-click range, click toggles |
| Risky-item handling | **Exclude protected, warn on dirty** — protected branches are not selectable (delete individually); dirty worktrees are selectable but called out by name in the confirm dialog |

## Selectable Rule

A worktree is **selectable** only when both hold:

1. It has a non-empty `branch` (detached-HEAD worktrees are excluded — all batch
   operations are branch-based).
2. Its branch is **not** protected per the repo's effective config
   `protected_branches` (same matching logic already used in
   `DeleteWorktreeDialog.vue`: exact match or `*` glob → regex).

Non-selectable cards render a **disabled** checkbox with a tooltip
(`Protected — delete individually` or `Detached HEAD — not selectable`). This is
what keeps the primary / default-base checkout safe from a careless
"select all → delete": the default base branch is conventionally in
`protected_branches`, and `grove rm` itself guards the main worktree.

## Selection State (`stores/worktrees.ts`)

New state:

- `selectedPaths: Ref<Set<string>>` — keyed by worktree `path` (the existing
  card `:key`; stable and unique within a repo).
- `lastSelectedPath: Ref<string | null>` — anchor for shift-click range select.

New actions / getters:

- `toggleSelection(path)`, `setSelection(paths: string[])`, `clearSelection()`
- `selectRange(toPath, orderedPaths: string[])` — selects the inclusive range
  between `lastSelectedPath` and `toPath` within the supplied ordered list
  (the current filtered/sorted list passed from the component).
- getter `selectedWorktrees` (resolves paths → `Worktree[]` from current list),
  getter `selectionCount`.

Lifecycle:

- Cleared inside `selectRepository` and `deselectRepository` (alongside the
  existing `focusedBranch` reset).
- After every worktree refresh (`setWorktrees`), prune any `selectedPaths` no
  longer present so a deleted/pruned worktree drops out of the selection
  cleanly.

## Frontend Composable (`composables/useWorktreeSelection.ts`)

Encapsulates selection behaviour so components stay thin:

- Reads the worktree store + `repoConfig` effective config to compute
  `isSelectable(worktree)` (the rule above) and `protectedReason(worktree)`.
- `toggle(worktree, { shift })` — plain click toggles; shift-click calls
  `store.selectRange` against the component-supplied filtered list.
- `selectAllFiltered(filtered: Worktree[])` / `deselectAllFiltered(...)` and a
  `selectAllState: 'none' | 'some' | 'all'` for the tristate toolbar checkbox
  (computed over the *selectable* members of the current filtered list).
- Ensures shift-range and select-all only ever act on selectable worktrees.

## UI Components

**WorktreeCard.vue** — add a leading-edge checkbox:

- Hidden by default; fades in on hover; visible on all cards once
  `selectionCount > 0`.
- Click toggles selection and **stops propagation** so the card's existing
  click-to-focus still works for the rest of the card.
- Shift-click performs a range select.
- Protected / detached → disabled checkbox with tooltip; not toggleable.
- New props: `selected: boolean`, `selectable: boolean`,
  `selectionActive: boolean` (whether any selection exists, controls
  persistent visibility), `protectedReason?: string`.
- New emit: `toggle-select` with `{ path, shift }`.

**VirtualWorktreeList.vue** — same checkbox affordance and event passthrough.
Selection must work here because the 50+ list is exactly the bulk-cleanup case.
Pass the selection props/handlers straight through to the virtualised
`WorktreeCard`s.

**Toolbar select-all** — a tristate checkbox added to the existing
filter/sort toolbar row in `Dashboard.vue` (only shown when
`selectedRepo && worktrees.length > 0`). Selects/deselects all currently
**filtered, selectable** worktrees, so a user can filter to Clean/Merged then
select-all then delete. Renders indeterminate when the filtered selectable set
is partially selected.

**SelectionActionBar.vue** (new) — a floating bar pinned to the bottom of the
content area, shown only when `selectionCount > 0`:

- Left: `{n} selected`.
- Actions: **Pull**, **Delete** (danger), **Clear**.
- Styled with existing design tokens to match the topbar action buttons.
- Slides in/out using the existing animation tokens (`var(--duration-*)`).

## Batch Delete Flow

1. **Confirm** — new lightweight `BatchDeleteDialog.vue` (confirm-only, no
   3-phase lifecycle):
   - Header: `Delete {n} worktrees`.
   - If any selected worktrees are dirty, list them by name under an
     "uncommitted changes" warning (matches the single dialog's warning tone).
   - Options applied **uniformly** to all selected:
     - ☑ Delete branches (default **on**, matches `DeleteWorktreeDialog`)
     - ☐ Drop databases (default off)
     - ☐ Skip database backup — revealed only when Drop databases is on
       (mirrors the single dialog), flagged dangerous.
   - Buttons: Cancel / `Delete {n}` (danger).
2. **Execute** — on confirm, close the dialog and hand off to the existing
   `OperationProgressPanel`:
   - `startListening('remove_all', branches, worktreePathMap)` then invoke the
     new backend command.
   - Pause auto-refresh during the operation (as pull-all does), resume after.
3. **Backend** — `wt.rs::remove_selected_with_progress(app, repo, branches,
   { delete_branch, drop_db, skip_backup })`:
   - Mirrors `pull_selected_with_progress`: loops over branches, emits
     `operation_progress` (operation `"remove_all"`) with
     `in_progress` → `success` / `failed` per item.
   - Reuses the existing single-remove arg construction (`force: true` as the
     GUI single-delete already does).
   - Per-item failure is recorded and the loop continues (one bad delete does
     not abort the batch).
   - Honours the existing cancellation signal so the action bar / panel can
     cancel mid-run.
   - Returns a summary (succeeded / failed counts).
4. **After completion** — debounced worktree refresh, `clearSelection()`,
   schedule tray refresh. Stale-path pruning in `setWorktrees` removes the
   deleted worktrees from the selection automatically.

## Batch Pull Flow

Non-destructive, so **no confirmation**. The action bar's Pull button hands
directly to `OperationProgressPanel` and reuses the **existing**
`pullSelectedWorktrees(repo, branches)` / `pull_selected_with_progress` — no new
backend. The panel's existing retry-failed path continues to work unchanged.

## Backend (Rust)

New, mirroring the pull-selected pattern:

- `wt.rs::remove_selected_with_progress(...)` — loop + per-item progress +
  cancellation + summary.
- `commands.rs::remove_selected_worktrees(app, repo, branches, options)` —
  `spawn_blocking` wrapper.
- Register in `lib.rs` `invoke_handler`.
- `useWt.ts::removeSelectedWorktrees(...)` and a `useWorktrees.ts`
  `removeSelectedWorktrees(...)` wrapper (refresh + tray, like the others).

Branch names are validated per item (existing `validate_branch_name`). Protected
exclusion is enforced in the UI; the backend still validates input defensively.

## Keyboard / Esc

`Escape` clears the selection — but only as the **lowest priority** in the
existing `closeAllModals` Esc chain in `Dashboard.vue`. Modals, panels, and the
command palette continue to take precedence, so Esc only clears selection when
nothing else is open. No new global shortcut to enter "select mode" in v1
(selection is always available via hover/click).

## Out of Scope

- Batch **Sync** and batch **Open all** (deferred; the chosen scope is
  Delete + Pull).
- Cross-repository batch selection (selection is per-repo, as today's list is).
- A dedicated "select mode" toggle or a keyboard shortcut to enter it.
- Per-worktree differing delete options (options apply uniformly to the batch).
- Native multi-remove in the `grove` CLI (we loop in Rust; the CLI's `rm` is
  single-worktree).

## Testing

**Store (`worktrees.test.ts`):** toggle add/remove, `setSelection`,
`clearSelection`, `selectRange` against an ordered list, clear-on-repo-switch,
and stale-path pruning after `setWorktrees`.

**Composable (`useWorktreeSelection.test.ts`):** `isSelectable` excludes
protected and detached worktrees; shift-range and select-all only touch
selectable members; `selectAllState` tristate transitions.

**Components:**
- `WorktreeCard.test.ts` — checkbox hidden/hover/persistent states, click
  toggles + stops propagation (focus still works), disabled for
  protected/detached, shift-click emits `{ shift: true }`.
- New `SelectionActionBar.test.ts` — visibility tied to `selectionCount`,
  count text, button wiring.
- New `BatchDeleteDialog.test.ts` — dirty callout lists dirty worktrees,
  Skip-backup only visible when Drop-databases is on, primary button label
  reflects count.
- `Dashboard.test.ts` — select-all tristate selects filtered set; action bar
  Pull/Delete route to the progress panel / dialog.

**Rust (`cargo test`):** `remove_selected_with_progress` — all-success,
partial-failure (loop continues, summary correct), and cancellation
(remaining items skipped).

**Gates:** `npx vitest run`, `npm run build` (vue-tsc), and
`cd src-tauri && cargo test` all clean.
