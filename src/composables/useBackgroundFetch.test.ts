import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useBackgroundFetch } from './useBackgroundFetch'
import { useSettingsStore, useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

const FIVE_MINUTES = 5 * 60 * 1000

describe('useBackgroundFetch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'list_branches') return Promise.resolve({ branches: [] })
      return Promise.resolve(undefined)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restarts periodic fetch after disabling and re-enabling it', async () => {
    const worktrees = useWorktreeStore()
    const settings = useSettingsStore()
    worktrees.setRepositories([{ name: 'grove', worktrees: 1 }])
    let backgroundFetch!: ReturnType<typeof useBackgroundFetch>

    const wrapper = mount(defineComponent({
      setup() {
        backgroundFetch = useBackgroundFetch()
        return () => null
      },
    }))
    backgroundFetch.start()

    await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
    expect(fetchCalls()).toBe(1)

    settings.settings.backgroundFetchInterval = 0
    await nextTick()
    await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
    expect(fetchCalls()).toBe(1)

    settings.settings.backgroundFetchInterval = 5
    await nextTick()
    await vi.advanceTimersByTimeAsync(FIVE_MINUTES)
    expect(fetchCalls()).toBe(2)

    wrapper.unmount()
  })
})

function fetchCalls(): number {
  return mockTauriInvoke.mock.calls.filter(([command]) => command === 'fetch_repo').length
}
