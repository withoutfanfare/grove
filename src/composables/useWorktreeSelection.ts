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
