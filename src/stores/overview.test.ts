import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  useOverviewStore,
  formatBytes,
  EXPENSIVE_REFRESH_INTERVAL_MS,
} from './overview'
import type { Worktree, HealthResult, RepoDiskUsage } from '@/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/demo/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

function makeHealth(overrides: Partial<HealthResult> = {}): HealthResult {
  return {
    repo: 'demo',
    overall_grade: 'B',
    overall_score: 82,
    worktree_count: 2,
    summary: { healthy: 1, warning: 1, critical: 0 },
    issues: [],
    worktrees: [],
    ...overrides,
  }
}

function makeDiskUsage(overrides: Partial<RepoDiskUsage> = {}): RepoDiskUsage {
  return {
    repo: 'demo',
    total_bytes: 1024,
    total_display: '1 KB',
    worktrees: [],
    ...overrides,
  }
}

describe('useOverviewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('attention derivation', () => {
    it('groups dirty worktrees across repos', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [
        makeWorktree({ path: '/repos/api/a', branch: 'a', dirty: true }),
        makeWorktree({ path: '/repos/api/b', branch: 'b', dirty: false }),
      ], 1000)
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.dirtyAttention).toHaveLength(2)
      expect(store.dirtyAttention.map((i) => `${i.repo}/${i.worktree.branch}`))
        .toEqual(['api/a', 'demo/c'])
    })

    it('groups worktrees behind their remote', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/a', branch: 'a', behind: 3 }),
        makeWorktree({ path: '/repos/demo/b', branch: 'b', behind: 0 }),
      ], 1000)

      expect(store.behindAttention).toHaveLength(1)
      expect(store.behindAttention[0].worktree.branch).toBe('a')
    })

    it('classifies merged or stale worktrees as cleanup candidates', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/a', branch: 'a', merged: true }),
        makeWorktree({ path: '/repos/demo/b', branch: 'b', stale: true }),
        makeWorktree({ path: '/repos/demo/c', branch: 'c' }),
      ], 1000)

      expect(store.cleanupAttention.map((i) => i.worktree.branch)).toEqual(['a', 'b'])
    })

    it('orders health issues critical first', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)
      store.setHealth('demo', makeHealth({
        issues: [
          { severity: 'warning', worktree: 'a', message: 'warn issue' },
          { severity: 'critical', worktree: 'b', message: 'critical issue' },
        ],
      }))

      expect(store.healthAttention[0].issue.severity).toBe('critical')
      expect(store.healthAttention[1].issue.severity).toBe('warning')
    })

    it('combines multiple health issues for the same worktree into one attention item', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree({ branch: 'feature' })], 1000)
      store.setHealth('demo', makeHealth({
        issues: [
          { severity: 'warning', worktree: 'feature', message: 'behind:22' },
          { severity: 'critical', worktree: 'feature', message: 'changes:1' },
          { severity: 'warning', worktree: 'feature', message: 'unmerged,behind:22' },
        ],
      }))

      expect(store.healthAttention).toHaveLength(1)
      expect(store.healthAttention[0]).toEqual({
        repo: 'demo',
        issue: {
          severity: 'critical',
          worktree: 'feature',
          message: 'behind:22,changes:1,unmerged',
        },
      })
    })

    it('sorts worktree attention items by repo then branch', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('zeta', [
        makeWorktree({ path: '/z/b', branch: 'b', dirty: true }),
      ], 1000)
      store.setWorktreeSnapshot('alpha', [
        makeWorktree({ path: '/a/d', branch: 'd', dirty: true }),
        makeWorktree({ path: '/a/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.dirtyAttention.map((i) => `${i.repo}/${i.worktree.branch}`))
        .toEqual(['alpha/c', 'alpha/d', 'zeta/b'])
    })

    it('reports hasAttentionItems false when everything is clean', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)

      expect(store.hasAttentionItems).toBe(false)
    })
  })

  describe('stats', () => {
    it('totals worktrees, dirty and behind counts across snapshots', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [
        makeWorktree({ path: '/a/a', branch: 'a', dirty: true, behind: 2 }),
        makeWorktree({ path: '/a/b', branch: 'b' }),
      ], 1000)
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/d/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.stats.worktreeCount).toBe(3)
      expect(store.stats.dirtyCount).toBe(2)
      expect(store.stats.behindCount).toBe(1)
    })

    it('sums disk usage and formats the total', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [makeWorktree()], 1000)
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)
      store.setDiskUsage('api', makeDiskUsage({ repo: 'api', total_bytes: 1024 * 1024 }))
      store.setDiskUsage('demo', makeDiskUsage({ repo: 'demo', total_bytes: 1024 * 1024 }))

      expect(store.stats.totalDiskBytes).toBe(2 * 1024 * 1024)
      expect(store.stats.diskDisplay).toBe('2 MB')
    })

    it('reports null diskDisplay before any disk usage has loaded', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)

      expect(store.stats.diskDisplay).toBeNull()
    })
  })

  describe('per-repo error isolation', () => {
    it('records an error while retaining stale worktree data', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree({ dirty: true })], 1000)

      store.setSnapshotError('demo', 'cannot read repository', 2000)

      expect(store.snapshots['demo'].error).toBe('cannot read repository')
      expect(store.snapshots['demo'].worktrees).toHaveLength(1)
      // Stale data still feeds attention derivation
      expect(store.dirtyAttention).toHaveLength(1)
    })

    it('clears the error on the next successful snapshot', () => {
      const store = useOverviewStore()
      store.setSnapshotError('demo', 'boom', 1000)
      store.setWorktreeSnapshot('demo', [makeWorktree()], 2000)

      expect(store.snapshots['demo'].error).toBeUndefined()
      expect(store.repoErrors).toHaveLength(0)
    })

    it('lists repo errors as attention items', () => {
      const store = useOverviewStore()
      store.setSnapshotError('broken', 'cannot read repository', 1000)

      expect(store.repoErrors).toEqual([{ repo: 'broken', error: 'cannot read repository' }])
      expect(store.hasAttentionItems).toBe(true)
    })
  })

  describe('localStorage persistence', () => {
    it('round-trips snapshots through localStorage', async () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree({ dirty: true })], 1234)
      await nextTick()

      // A fresh pinia simulates an app relaunch
      setActivePinia(createPinia())
      const fresh = useOverviewStore()

      expect(fresh.snapshots['demo'].refreshedAt).toBe(1234)
      expect(fresh.snapshots['demo'].worktrees[0].dirty).toBe(true)
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('grove-overview-snapshots', 'invalid json{')

      const store = useOverviewStore()

      expect(store.snapshots).toEqual({})
    })
  })

  describe('expensive-tier throttling', () => {
    it('allows refresh when the repo has never been refreshed', () => {
      const store = useOverviewStore()
      expect(store.shouldRefreshExpensive('demo', 1_000_000)).toBe(true)
    })

    it('blocks refresh within the 5-minute window', () => {
      const store = useOverviewStore()
      store.markExpensiveRefreshed('demo', 1_000_000)

      expect(store.shouldRefreshExpensive('demo', 1_000_000 + EXPENSIVE_REFRESH_INTERVAL_MS - 1)).toBe(false)
    })

    it('allows refresh after the window elapses', () => {
      const store = useOverviewStore()
      store.markExpensiveRefreshed('demo', 1_000_000)

      expect(store.shouldRefreshExpensive('demo', 1_000_000 + EXPENSIVE_REFRESH_INTERVAL_MS)).toBe(true)
    })
  })

  describe('pruneSnapshots', () => {
    it('drops snapshots for repos that are no longer registered', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('keep', [makeWorktree()], 1000)
      store.setWorktreeSnapshot('drop', [makeWorktree()], 1000)

      store.pruneSnapshots(['keep'])

      expect(Object.keys(store.snapshots)).toEqual(['keep'])
    })
  })

  describe('formatBytes', () => {
    it('formats byte counts at sensible precision', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(512)).toBe('512 B')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
      expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB')
    })
  })
})
