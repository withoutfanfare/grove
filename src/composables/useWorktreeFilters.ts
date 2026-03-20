import { ref, computed } from 'vue'
import type { Worktree } from '../types'

/**
 * Filter preset for worktree lists
 */
export type WorktreeFilter = 'all' | 'dirty' | 'stale' | 'unmerged'

/**
 * Sort option for worktree lists
 */
export type WorktreeSort = 'name' | 'last-accessed' | 'branch-age'

/**
 * useWorktreeFilters Composable
 *
 * Provides structured filtering (by state) and sorting for worktree lists.
 * Works alongside the existing text search in useSearch.
 */
export function useWorktreeFilters() {
  const activeFilter = ref<WorktreeFilter>('all')
  const activeSort = ref<WorktreeSort>('name')

  /**
   * Available filter options with labels
   */
  const filterOptions: { value: WorktreeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'dirty', label: 'Dirty' },
    { value: 'stale', label: 'Stale' },
    { value: 'unmerged', label: 'Unmerged' },
  ]

  /**
   * Available sort options with labels
   */
  const sortOptions: { value: WorktreeSort; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'last-accessed', label: 'Last accessed' },
    { value: 'branch-age', label: 'Branch age' },
  ]

  const hasActiveFilter = computed(() => activeFilter.value !== 'all')

  function setFilter(filter: WorktreeFilter) {
    activeFilter.value = filter
  }

  function setSort(sort: WorktreeSort) {
    activeSort.value = sort
  }

  function resetFilter() {
    activeFilter.value = 'all'
  }

  /**
   * Apply the active filter to a worktree list
   */
  function filterWorktrees(worktrees: Worktree[]): Worktree[] {
    switch (activeFilter.value) {
      case 'dirty':
        return worktrees.filter(wt => wt.dirty)
      case 'stale':
        return worktrees.filter(wt => wt.stale === true)
      case 'unmerged':
        return worktrees.filter(wt => wt.merged === false)
      default:
        return worktrees
    }
  }

  /**
   * Apply the active sort to a worktree list
   */
  function sortWorktrees(worktrees: Worktree[]): Worktree[] {
    const sorted = [...worktrees]

    switch (activeSort.value) {
      case 'name':
        sorted.sort((a, b) => a.branch.localeCompare(b.branch))
        break
      case 'last-accessed':
        sorted.sort((a, b) => {
          const aTime = a.lastAccessed ? new Date(a.lastAccessed).getTime() : 0
          const bTime = b.lastAccessed ? new Date(b.lastAccessed).getTime() : 0
          return bTime - aTime // Most recent first
        })
        break
      case 'branch-age':
        // Use lastAccessed as a proxy for branch age (oldest first)
        sorted.sort((a, b) => {
          const aTime = a.lastAccessed ? new Date(a.lastAccessed).getTime() : 0
          const bTime = b.lastAccessed ? new Date(b.lastAccessed).getTime() : 0
          return aTime - bTime // Oldest first
        })
        break
    }

    return sorted
  }

  /**
   * Apply both filter and sort to a worktree list
   */
  function applyFiltersAndSort(worktrees: Worktree[]): Worktree[] {
    return sortWorktrees(filterWorktrees(worktrees))
  }

  return {
    activeFilter,
    activeSort,
    filterOptions,
    sortOptions,
    hasActiveFilter,
    setFilter,
    setSort,
    resetFilter,
    filterWorktrees,
    sortWorktrees,
    applyFiltersAndSort,
  }
}
