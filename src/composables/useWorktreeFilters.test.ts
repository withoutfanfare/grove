import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useWorktreeFilters } from './useWorktreeFilters'
import type { Worktree } from '../types'

describe('useWorktreeFilters', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('persistence', () => {
    it('returns default filter and sort on a fresh composable', () => {
      const { activeFilter, activeSort } = useWorktreeFilters()
      expect(activeFilter.value).toBe('all')
      expect(activeSort.value).toBe('last-accessed')
    })

    it('persists filter and sort changes to localStorage', async () => {
      const { setFilter, setSort } = useWorktreeFilters()

      setFilter('dirty')
      setSort('branch-age')
      // usePersistedRef writes with flush:'post', so wait for the watcher to flush
      await nextTick()

      expect(JSON.parse(localStorage.getItem('wt-worktree-filter')!)).toBe('dirty')
      expect(JSON.parse(localStorage.getItem('wt-worktree-sort')!)).toBe('branch-age')
    })

    it('rehydrates filter and sort from localStorage', () => {
      localStorage.setItem('wt-worktree-filter', JSON.stringify('dirty'))
      localStorage.setItem('wt-worktree-sort', JSON.stringify('last-accessed'))

      const { activeFilter, activeSort } = useWorktreeFilters()
      expect(activeFilter.value).toBe('dirty')
      expect(activeSort.value).toBe('last-accessed')
    })
  })

  describe('countWorktrees', () => {
    const worktrees: Worktree[] = [
      // clean, merged, not stale
      { path: '/wt/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'a', merged: true, stale: false },
      // dirty, unmerged
      { path: '/wt/feature-a', branch: 'feature/a', dirty: true, ahead: 0, behind: 0, sha: 'b', merged: false },
      // dirty, stale, unmerged
      { path: '/wt/feature-b', branch: 'feature/b', dirty: true, ahead: 0, behind: 0, sha: 'c', merged: false, stale: true },
      // clean, optional fields undefined (must not count as stale/unmerged)
      { path: '/wt/feature-c', branch: 'feature/c', dirty: false, ahead: 0, behind: 0, sha: 'd' },
    ]

    it('counts all/dirty/stale/unmerged over the full list', () => {
      const { countWorktrees } = useWorktreeFilters()
      expect(countWorktrees(worktrees)).toEqual({
        all: 4,
        dirty: 2,
        stale: 1,
        unmerged: 2,
      })
    })

    it('returns zero for states with no matches', () => {
      const { countWorktrees } = useWorktreeFilters()
      const noStale: Worktree[] = [
        { path: '/wt/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'a', merged: true },
        { path: '/wt/feature-a', branch: 'feature/a', dirty: true, ahead: 0, behind: 0, sha: 'b', merged: false },
      ]
      expect(countWorktrees(noStale).stale).toBe(0)
    })

    it('does not miscount undefined stale/merged fields', () => {
      const { countWorktrees } = useWorktreeFilters()
      const allUndefined: Worktree[] = [
        { path: '/wt/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'a' },
      ]
      const counts = countWorktrees(allUndefined)
      expect(counts.stale).toBe(0)
      expect(counts.unmerged).toBe(0)
    })

    it('is independent of the active filter', () => {
      const { countWorktrees, setFilter } = useWorktreeFilters()
      setFilter('dirty')
      expect(countWorktrees(worktrees)).toEqual({
        all: 4,
        dirty: 2,
        stale: 1,
        unmerged: 2,
      })
    })

    it('returns all zeros for an empty list', () => {
      const { countWorktrees } = useWorktreeFilters()
      expect(countWorktrees([])).toEqual({ all: 0, dirty: 0, stale: 0, unmerged: 0 })
    })
  })

  describe('sortWorktrees', () => {
    it('orders by last accessed by default with most recent first', () => {
      const { sortWorktrees } = useWorktreeFilters()
      const worktrees: Worktree[] = [
        { path: '/wt/older', branch: 'older', dirty: false, ahead: 0, behind: 0, sha: 'a', lastAccessed: '2026-01-02T10:00:00Z' },
        { path: '/wt/newer', branch: 'newer', dirty: false, ahead: 0, behind: 0, sha: 'b', lastAccessed: '2026-01-03T10:00:00Z' },
        { path: '/wt/missing', branch: 'missing', dirty: false, ahead: 0, behind: 0, sha: 'c' },
      ]

      expect(sortWorktrees(worktrees).map(wt => wt.branch)).toEqual(['newer', 'older', 'missing'])
    })
  })
})
