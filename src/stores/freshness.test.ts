import { it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorktreeStore, useOverviewStore } from '@/stores'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useWorktrees } from '@/composables/useWorktrees'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  resetTauriMocks()
})
afterEach(() => vi.useRealTimers())

it("shows a cached repository's real age, not \"just now\", until it revalidates", () => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
  useOverviewStore().setWorktreeSnapshot('old', [], twoHoursAgo)
  const store = useWorktreeStore()
  store.setRepositories([{ name: 'old', worktrees: 0 }])
  store.selectRepository('old')

  const { lastUpdatedText } = useAutoRefresh()
  expect(lastUpdatedText.value).toBe('Updated 2h ago')
})

it('records a successful load and a later failure per repository, keeping the success time', async () => {
  const store = useWorktreeStore()
  store.setRepositories([{ name: 'demo', worktrees: 0 }])
  store.selectRepository('demo')
  mockTauriInvoke.mockResolvedValueOnce([])
  const { fetchWorktrees } = useWorktrees()
  await fetchWorktrees({ silent: true })
  const loadedAt = store.observedAt['demo']
  expect(loadedAt).toBeGreaterThan(0)

  mockTauriInvoke.mockRejectedValueOnce({ code: 'GIT_ERROR', message: 'index.lock exists' })
  await fetchWorktrees({ silent: true })
  expect(store.observedAt['demo']).toBe(loadedAt)
  expect(store.refreshFailedAt['demo']).toBeGreaterThanOrEqual(loadedAt)
  expect(store.refreshErrors['demo']).toContain('index.lock exists')
})


it('keeps local status time separate from a successful and then failed remote fetch', async () => {
  const { useWt } = await import('@/composables/useWt')
  const store = useWorktreeStore()
  store.observedAt.demo = 123
  mockTauriInvoke.mockResolvedValueOnce(undefined)
  await useWt().fetchRepo('demo')
  const fetched = store.remoteFetchedAt.demo
  expect(fetched).toBeGreaterThan(123)
  mockTauriInvoke.mockRejectedValueOnce({ code: 'NETWORK', message: 'Remote is unavailable' })
  await expect(useWt().fetchRepo('demo')).rejects.toMatchObject({ code: 'NETWORK' })
  expect(store.observedAt.demo).toBe(123)
  expect(store.remoteFetchedAt.demo).toBe(fetched)
  expect(store.remoteFetchErrors.demo).toBe('Remote is unavailable')
})
