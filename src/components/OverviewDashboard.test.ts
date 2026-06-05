import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import OverviewDashboard from './OverviewDashboard.vue'
import { useWorktreeStore, useOverviewStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Worktree, RecentWorktree } from '@/types'

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

const recentFixture: RecentWorktree = {
  repo: 'api',
  branch: 'feature/recent-work',
  path: '/repos/api/feature-recent-work',
  accessed_at: 1717500000,
  accessed_ago: '2 hours ago',
  dirty: false,
}

/** Mock the Tauri commands the overview triggers on mount */
function mockWtCommands(
  worktreesByRepo: Record<string, Worktree[] | { error: string }>,
  recent: RecentWorktree[] = []
) {
  mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === 'list_worktrees') {
      const entry = worktreesByRepo[(args?.repoName as string) ?? '']
      if (entry && 'error' in entry && !Array.isArray(entry)) {
        return Promise.reject({ code: 'GIT_ERROR', message: entry.error })
      }
      return Promise.resolve(entry ?? [])
    }
    if (command === 'get_recent_worktrees') return Promise.resolve(recent)
    if (command === 'get_repo_health') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
    if (command === 'get_repo_disk_usage') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
    return Promise.resolve(undefined)
  })
}

function mountOverview() {
  return mount(OverviewDashboard, {
    global: {
      stubs: {
        HealthPanel: true,
        DeleteWorktreeDialog: true,
        OperationProgressPanel: true,
        PruneConfirmDialog: true,
        SIconButton: true,
        SSkeleton: true,
      },
    },
  })
}

/** Mount variant that renders OperationProgressPanel for real (not stubbed). */
function mountOverviewWithProgress() {
  return mount(OverviewDashboard, {
    global: {
      stubs: {
        HealthPanel: true,
        DeleteWorktreeDialog: true,
        PruneConfirmDialog: true,
        SIconButton: true,
        SSkeleton: true,
      },
    },
  })
}

describe('OverviewDashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
  })

  it('shows the onboarding state when no repositories are registered', async () => {
    mockWtCommands({})

    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain('No repositories yet')
    wrapper.unmount()
  })

  it('renders grouped attention items and stats from refreshed snapshots', async () => {
    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'api', worktrees: 2 },
      { name: 'demo', worktrees: 1 },
    ])
    mockWtCommands(
      {
        api: [
          makeWorktree({ path: '/repos/api/main', branch: 'main', dirty: true }),
          makeWorktree({ path: '/repos/api/old', branch: 'old', merged: true }),
        ],
        demo: [makeWorktree({ path: '/repos/demo/main', branch: 'main', behind: 3 })],
      },
      [recentFixture]
    )

    const wrapper = mountOverview()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Needs Attention')
    expect(text).toContain('Dirty')
    expect(text).toContain('Behind remote')
    expect(text).toContain('Cleanup candidates')
    expect(text).toContain('2 repos')
    expect(text).toContain('3 worktrees')
    // Recent panel shows the recent worktree
    expect(text).toContain('feature/recent-work')
    wrapper.unmount()
  })

  it('shows the all-clear state when nothing needs attention', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockWtCommands({ demo: [makeWorktree()] })

    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Everything's tidy")
    wrapper.unmount()
  })

  it('shows a repo error attention item with a repair action', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'broken', worktrees: 0 }])
    mockWtCommands({ broken: { error: 'cannot read repository' } })

    const wrapper = mountOverview()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain("Couldn't read")
    expect(text).toContain('broken')
    expect(text).toContain('cannot read repository')
    expect(text).toContain('Repair')
    wrapper.unmount()
  })

  it('shows the refreshing indicator while the cheap tier is in flight', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockWtCommands({ demo: [makeWorktree()] })

    const wrapper = mountOverview()
    await flushPromises()

    const overviewStore = useOverviewStore()
    overviewStore.setRefreshing(true)
    await nextTick()

    expect(wrapper.text()).toContain('Refreshing')
    wrapper.unmount()
  })

  it('bulk pull progress panel updates reactively and shows completion', async () => {
    // Arrange: one repo with one worktree that is 2 commits behind
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'api', worktrees: 1 }])
    mockWtCommands(
      {
        api: [makeWorktree({ path: '/repos/api/main', branch: 'main', behind: 2 })],
      },
      []
    )

    // Extend the invoke mock to handle pull_worktree
    mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_worktrees') {
        const repo = (args?.repoName as string) ?? ''
        if (repo === 'api') {
          return Promise.resolve([
            makeWorktree({ path: '/repos/api/main', branch: 'main', behind: 2 }),
          ])
        }
        return Promise.resolve([])
      }
      if (command === 'get_recent_worktrees') return Promise.resolve([])
      if (command === 'get_repo_health') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
      if (command === 'get_repo_disk_usage') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
      if (command === 'pull_worktree') {
        return Promise.resolve({
          success: true,
          already_up_to_date: false,
          conflicts: false,
          commits_pulled: 2,
          message: 'Updated 2 commits',
        })
      }
      return Promise.resolve(undefined)
    })

    const wrapper = mountOverviewWithProgress()
    await flushPromises()

    // The Behind group should be present with its Pull all button
    const bulkBtn = wrapper.find('.attention-bulk-action')
    expect(bulkBtn.exists()).toBe(true)

    // Act: click Pull all and wait for all async work (pull + refreshRepos) to settle
    await bulkBtn.trigger('click')
    await flushPromises()

    // Assert: the progress panel completed — "1 succeeded" appears in the summary
    // This assertion FAILS against the buggy code (which freezes at 0% / pending)
    // and PASSES after the reactive-ref fix.
    const text = wrapper.text()
    expect(text).toContain('1 succeeded')

    wrapper.unmount()
  })
})
