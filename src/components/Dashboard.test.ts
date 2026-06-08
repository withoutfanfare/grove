import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import Dashboard from './Dashboard.vue'
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
          ErrorBoundary: true,
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
})
