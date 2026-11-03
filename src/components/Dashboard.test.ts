import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import Dashboard from './Dashboard.vue'
import BatchDeleteDialog from './BatchDeleteDialog.vue'
import OperationProgressPanel from './OperationProgressPanel.vue'
import PruneConfirmDialog from './overview/PruneConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import pr5 from '../../src-tauri/tests/fixtures/cli-pr5.json'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, mockTauriListen, resetTauriMocks } from '@/test/setup'

type ListenCallback = (event: { payload: unknown }) => void

function mountDashboard() {
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
        SResizableSplit: true,
        SkeletonCard: true,
      },
    },
  })
}

describe('Dashboard global quick-switch listener', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockResolvedValue(undefined)
    // listen() returns an unlisten function; default to a no-op so cleanup is safe
    mockTauriListen.mockResolvedValue(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers a global_shortcut_quick_switch listener on mount', async () => {
    const wrapper = mountDashboard()
    await nextTick()
    await nextTick()

    const registered = mockTauriListen.mock.calls.some(
      (call) => call[0] === 'global_shortcut_quick_switch'
    )
    expect(registered).toBe(true)
    wrapper.unmount()
  })

  it('opens the command palette when the quick-switch event fires', async () => {
    // Mark grove as available so the main layout (with CommandPalette) renders
    const store = useWorktreeStore()
    store.wtAvailable = true

    let quickSwitchCallback: ListenCallback | undefined
    mockTauriListen.mockImplementation((event: string, cb: ListenCallback) => {
      if (event === 'global_shortcut_quick_switch') {
        quickSwitchCallback = cb
      }
      return Promise.resolve(() => {})
    })

    const wrapper = mountDashboard()
    await nextTick()
    await nextTick()

    const palette = wrapper.findComponent({ name: 'CommandPalette' })
    expect(palette.exists()).toBe(true)
    expect(palette.props('isOpen')).toBe(false)

    expect(quickSwitchCallback).toBeDefined()
    quickSwitchCallback!({ payload: undefined })
    await nextTick()

    expect(palette.props('isOpen')).toBe(true)
    wrapper.unmount()
  })
})

describe('Dashboard batch selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
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
          ErrorBoundary: { template: '<div><slot /></div>' },
          SearchInput: true,
          CommandPalette: true,
          UpdateBanner: true,
          SButton: true,
          SIconButton: true,
          SResizableSplit: { template: '<div><slot name="first" /><slot name="second" /></div>' },
          SkeletonCard: true,
          BatchDeleteDialog: {
            props: ['isOpen', 'worktrees'],
            template: '<div data-testid="batch-delete-dialog" :data-open="String(isOpen)" />',
          },
        },
      },
    })
  }

  it('shows failed pull-all JSON as an error with the remote failure reason', async () => {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'demo', worktrees: 1 }])
    store.selectRepository('demo')
    const { toasts } = useToast()
    toasts.value = []
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'pull_all_worktrees') return Promise.resolve(pr5['pull-all'].stdout)
      if (command === 'list_worktrees' || command === 'get_worktree_status') return Promise.resolve(pr5.ls.stdout)
      return Promise.resolve(undefined)
    })
    const wrapper = mountWithList()
    await flushPromises()
    await wrapper.find('[title="Pull all worktrees"]').trigger('click')
    await flushPromises()
    expect(toasts.value.some(t => t.variant === 'success' && t.message.includes('Pull all'))).toBe(false)
    expect(toasts.value.some(t => t.variant === 'error' && t.message.includes('Fetch failed, nothing was pulled:'))).toBe(true)
    wrapper.unmount()
  })

  function setUpBatchDelete(removeSelected: () => Promise<unknown>) {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'grove', worktrees: 2 }])
    store.selectRepository('grove')
    const { toasts } = useToast()
    toasts.value = []
    let progressListener: ListenCallback | undefined
    mockTauriListen.mockImplementation((event: string, cb: ListenCallback) => {
      if (event === 'operation_progress') progressListener = cb
      return Promise.resolve(() => {})
    })
    const worktrees = [
      { path: '/r/a', branch: 'feature/a', sha: 's', dirty: false, ahead: 0, behind: 0 },
      { path: '/r/b', branch: 'feature/b', sha: 's', dirty: false, ahead: 0, behind: 0 },
    ]
    let operationId: unknown
    mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'remove_selected_worktrees') {
        operationId = args?.operationId
        return removeSelected()
      }
      if (command === 'get_worktree_status' || command === 'list_worktrees') return Promise.resolve(worktrees)
      return Promise.resolve(undefined)
    })
    // Progress events carry the run's own ID, as the backend's do
    return { store, toasts, worktrees, emitProgress: (payload: object) => progressListener!({ payload: { ...payload, operation_id: operationId } }) }
  }

  it('reports a batch delete that fails outright instead of leaving the panel pending', async () => {
    const failure = { code: 'INVALID_INPUT', message: 'invalid removal target\nnothing was removed' }
    const { store, toasts, worktrees } = setUpBatchDelete(() => Promise.reject(failure))
    const wrapper = mountWithList()
    await flushPromises()
    store.setWorktrees(worktrees)
    store.setSelection(['/r/a', '/r/b'])
    await nextTick()

    wrapper.findComponent(BatchDeleteDialog).vm.$emit('confirm', { deleteBranch: true, dropDb: false, skipBackup: false })
    await flushPromises()

    expect(toasts.value.some(t => t.variant === 'error' && t.message.includes('invalid removal target'))).toBe(true)
    expect(toasts.value.some(t => t.variant === 'success')).toBe(false)
    expect(wrapper.findComponent(OperationProgressPanel).props('isOpen')).toBe(false)
    expect(store.selectedPaths.size).toBe(2)
    wrapper.unmount()
  })

  it('reports the outcome of retrying failed deletions, never forcing them', async () => {
    let call = 0
    const { store, toasts, worktrees, emitProgress } = setUpBatchDelete(() => {
      call++
      if (call === 1) {
        emitProgress({ operation: 'remove_all', current: 1, total: 1, item: 'feature/a', status: 'failed', details: 'Removing would lose:\n  - 1 uncommitted change(s)' })
        return Promise.resolve({ repo: 'grove', worktrees: [], summary: { total: 1, succeeded: 0, failed: 1, cancelled: 0 } })
      }
      return Promise.reject({ code: 'COMMAND_FAILED', message: 'sidecar exited' })
    })
    const wrapper = mountWithList()
    await flushPromises()
    store.setWorktrees(worktrees)
    store.setSelection(['/r/a'])
    await nextTick()

    wrapper.findComponent(BatchDeleteDialog).vm.$emit('confirm', { deleteBranch: true, dropDb: false, skipBackup: false })
    await flushPromises()
    toasts.value = []
    wrapper.findComponent(OperationProgressPanel).vm.$emit('retry')
    await flushPromises()

    const [firstCall, retryCall] = mockTauriInvoke.mock.calls.filter(c => c[0] === 'remove_selected_worktrees')
    expect(retryCall[1]).toEqual({ repoName: 'grove', branches: ['feature/a'], deleteBranch: true, dropDb: false, skipBackup: false, operationId: expect.any(String) })
    // A retry is a new run with its own ID, so stray events from the first run cannot touch it
    expect(retryCall[1].operationId).not.toBe(firstCall[1].operationId)
    expect(toasts.value.some(t => t.variant === 'error' && t.message.includes('sidecar exited'))).toBe(true)
    wrapper.unmount()
  })

  it('sends Clean through the exact-plan dialogue, never the broad prune command', async () => {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'grove', worktrees: 1 }])
    store.selectRepository('grove')
    mockTauriInvoke.mockImplementation((command: string) =>
      command === 'get_prune_plan'
        ? Promise.resolve({ plan_id: 'p1', repo: 'grove', base: 'origin/main', branches: [], stale_registrations: [] })
        : Promise.resolve([])
    )
    const wrapper = mountWithList()
    await flushPromises()

    const clean = wrapper.findAll('button.topbar-action').find((b) => b.text().includes('Clean'))!
    await clean.trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent(PruneConfirmDialog)
    expect(dialog.props('isOpen')).toBe(true)
    expect(dialog.props('repos')).toEqual(['grove'])
    expect(mockTauriInvoke).toHaveBeenCalledWith('get_prune_plan', { repoName: 'grove' })
    expect(mockTauriInvoke.mock.calls.some((c) => c[0] === 'prune_repo')).toBe(false)
    wrapper.unmount()
  })

  it('shows the action bar when worktrees are selected and opens the delete dialog', async () => {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'grove', worktrees: 2 }])
    store.selectRepository('grove')

    const wrapper = mountWithList()
    await flushPromises()

    expect(wrapper.find('[data-testid="selection-action-bar"]').exists()).toBe(false)

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

  it('keeps the running batch progress visible and blocks a second batch', async () => {
    const store = useWorktreeStore()
    store.wtAvailable = true
    store.setRepositories([{ name: 'grove', worktrees: 1 }])
    store.selectRepository('grove')
    let finish!: (value: unknown) => void
    const pending = new Promise(resolve => { finish = resolve })
    mockTauriInvoke.mockImplementation((command: string) => command === 'pull_selected_worktrees'
      ? pending : Promise.resolve(command === 'list_worktrees' || command === 'get_worktree_status' ? [] : undefined))
    const wrapper = mountWithList()
    await flushPromises()
    store.setWorktrees([{ path: '/r/a', branch: 'feature/a', sha: 's', dirty: false, ahead: 0, behind: 0 }])
    store.setSelection(['/r/a'])
    await nextTick()
    await wrapper.get('[data-testid="bar-pull"]').trigger('click')
    await flushPromises()
    const panel = wrapper.findComponent(OperationProgressPanel)
    expect(panel.props('isOpen')).toBe(true)
    expect(wrapper.get('[data-testid="bar-pull"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="bar-pull"]').trigger('click')
    await wrapper.get('[title="Pull all worktrees"]').trigger('click')
    await flushPromises()
    expect(panel.props('isOpen')).toBe(true)
    expect(mockTauriInvoke.mock.calls.filter(call => call[0] === 'pull_selected_worktrees')).toHaveLength(1)
    expect(mockTauriInvoke.mock.calls.some(call => call[0] === 'pull_all_worktrees')).toBe(false)
    finish({ repo: 'grove', worktrees: [], summary: { total: 0, succeeded: 0, failed: 0, cancelled: 0, up_to_date: 0 } })
    await flushPromises()
    wrapper.unmount()
  })

})
