import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
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
