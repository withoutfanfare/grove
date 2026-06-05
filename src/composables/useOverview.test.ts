import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOverview } from './useOverview'
import { useWorktreeStore, useOverviewStore } from '../stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Worktree, HealthResult, RepoDiskUsage } from '../types'

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

const healthFixture: HealthResult = {
  repo: 'demo',
  overall_grade: 'B',
  overall_score: 82,
  worktree_count: 1,
  summary: { healthy: 0, warning: 1, critical: 0 },
  issues: [{ severity: 'warning', worktree: 'main', message: 'Behind by 12 commits' }],
  worktrees: [],
}

const diskFixture: RepoDiskUsage = {
  repo: 'demo',
  total_bytes: 2048,
  total_display: '2 KB',
  worktrees: [],
}

/** Mock all overview-related commands; per-repo worktree lists or errors */
function mockCommands(worktreesByRepo: Record<string, Worktree[] | { error: string }>) {
  mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    const repoName = (args?.repoName as string) ?? ''
    if (command === 'list_worktrees') {
      const entry = worktreesByRepo[repoName]
      if (entry && 'error' in entry && !Array.isArray(entry)) {
        return Promise.reject({ code: 'GIT_ERROR', message: entry.error })
      }
      return Promise.resolve(entry ?? [])
    }
    if (command === 'get_repo_health') return Promise.resolve({ ...healthFixture, repo: repoName })
    if (command === 'get_repo_disk_usage') return Promise.resolve({ ...diskFixture, repo: repoName })
    return Promise.resolve(undefined)
  })
}

function healthCallCount(): number {
  return mockTauriInvoke.mock.calls.filter((call) => call[0] === 'get_repo_health').length
}

describe('useOverview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
  })

  it('populates a snapshot per repo from list_worktrees', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'api', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])
    mockCommands({
      api: [makeWorktree({ path: '/repos/api/main', branch: 'main', dirty: true })],
      demo: [makeWorktree()],
    })

    const { refreshAll } = useOverview()
    await refreshAll()

    const overviewStore = useOverviewStore()
    expect(Object.keys(overviewStore.snapshots).sort()).toEqual(['api', 'demo'])
    expect(overviewStore.snapshots['api'].worktrees[0].dirty).toBe(true)
    expect(overviewStore.refreshing).toBe(false)
  })

  it('isolates per-repo failures and retains stale data', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'broken', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])

    const overviewStore = useOverviewStore()
    // Stale data from a previous session
    overviewStore.setWorktreeSnapshot('broken', [makeWorktree({ branch: 'stale-branch' })], 1)

    mockCommands({
      broken: { error: 'cannot read repository' },
      demo: [makeWorktree()],
    })

    const { refreshAll } = useOverview()
    await refreshAll()

    expect(overviewStore.snapshots['broken'].error).toBe('cannot read repository')
    expect(overviewStore.snapshots['broken'].worktrees[0].branch).toBe('stale-branch')
    expect(overviewStore.snapshots['demo'].error).toBeUndefined()
  })

  it('runs the expensive tier after the cheap tier and stores health + disk usage', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockCommands({ demo: [makeWorktree()] })

    const { refreshAll } = useOverview()
    await refreshAll()

    const overviewStore = useOverviewStore()
    expect(overviewStore.snapshots['demo'].health?.issues).toHaveLength(1)
    expect(overviewStore.snapshots['demo'].diskUsage?.total_bytes).toBe(2048)
  })

  it('skips the expensive tier inside the throttle window unless forced', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockCommands({ demo: [makeWorktree()] })

    const { refreshAll } = useOverview()
    await refreshAll()
    expect(healthCallCount()).toBe(1)

    // Within the 5-minute window: expensive tier throttled
    await refreshAll()
    expect(healthCallCount()).toBe(1)

    // Forced (manual refresh): throttle bypassed
    await refreshAll({ force: true })
    expect(healthCallCount()).toBe(2)
  })

  it('refreshRepos only re-fetches the given repos', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'api', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])
    mockCommands({ api: [makeWorktree()], demo: [makeWorktree()] })

    const { refreshRepos } = useOverview()
    await refreshRepos(['api'])

    const listCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'list_worktrees')
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0][1]).toEqual({ repoName: 'api' })
  })

  it('does nothing when no repositories are registered (cache retained)', async () => {
    const overviewStore = useOverviewStore()
    overviewStore.setWorktreeSnapshot('cached', [makeWorktree()], 1)
    mockCommands({})

    const { refreshAll } = useOverview()
    await refreshAll()

    expect(Object.keys(overviewStore.snapshots)).toEqual(['cached'])
    expect(mockTauriInvoke).not.toHaveBeenCalled()
  })
})
