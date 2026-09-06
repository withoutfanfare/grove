import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktrees } from './useWorktrees'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

const TRAY_REFRESH_DEBOUNCE_MS = 500

describe('useWorktrees', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
  })

  describe('openInEditor', () => {
    it('returns true on success', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      const { openInEditor } = useWorktrees()

      const result = await openInEditor('/tmp/worktree')

      expect(result).toBe(true)
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: '/tmp/worktree',
        editor: 'vscode',
        customEditorPath: null,
      })
    })

    it('returns false and sets store error on failure', async () => {
      const error = { code: 'OPEN_FAILED', message: 'Editor failed' }
      mockTauriInvoke.mockRejectedValue(error)
      const { openInEditor } = useWorktrees()
      const store = useWorktreeStore()

      const result = await openInEditor('/tmp/worktree')

      expect(result).toBe(false)
      expect(store.error).toEqual(error)
    })
  })

  describe('openAll', () => {
    it('reports full success when all open operations succeed', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      const { openAll } = useWorktrees()

      const result = await openAll('/tmp/worktree', 'https://feature.test')

      expect(result).toEqual({
        terminal: true,
        editor: true,
        browser: true,
        browserSkipped: false,
      })
    })

    it('reports partial success when browser open fails', async () => {
      mockTauriInvoke.mockImplementation((command: string) => {
        if (command === 'open_in_browser') {
          return Promise.reject({ code: 'OPEN_FAILED', message: 'Browser failed' })
        }
        return Promise.resolve(undefined)
      })

      const { openAll } = useWorktrees()
      const store = useWorktreeStore()

      const result = await openAll('/tmp/worktree', 'https://feature.test')

      expect(result).toEqual({
        terminal: true,
        editor: true,
        browser: false,
        browserSkipped: false,
      })
      expect(store.error?.code).toBe('OPEN_FAILED')
    })

    it('skips browser open when URL is not provided', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      const { openAll } = useWorktrees()

      const result = await openAll('/tmp/worktree')

      expect(result).toEqual({
        terminal: true,
        editor: true,
        browser: false,
        browserSkipped: true,
      })
      expect(
        mockTauriInvoke.mock.calls.some(([command]) => command === 'open_in_browser')
      ).toBe(false)
    })
  })

  describe('silent revalidation', () => {
    it('never toggles loadingWorktrees but still reconciles via setWorktrees', async () => {
      const resolved = [
        { path: '/repo/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      ]
      mockTauriInvoke.mockImplementation((command: string) => {
        if (command === 'get_worktree_status') {
          return Promise.resolve(resolved)
        }
        return Promise.resolve(undefined)
      })

      const store = useWorktreeStore()
      store.setRepositories([{ name: 'my-repo', worktrees: 1 }])
      store.selectRepository('my-repo')

      // Spy after selection so we only observe the fetch path's loading toggles.
      const setLoadingSpy = vi.spyOn(store, 'setLoadingWorktrees')
      const setWorktreesSpy = vi.spyOn(store, 'setWorktrees')

      const { fetchWorktrees } = useWorktrees()
      await fetchWorktrees({ silent: true })

      expect(setLoadingSpy).not.toHaveBeenCalledWith(true)
      expect(setLoadingSpy).not.toHaveBeenCalledWith(false)
      expect(setWorktreesSpy).toHaveBeenCalledWith(resolved)
      expect(store.worktrees).toEqual(resolved)
    })

    it('toggles loadingWorktrees when not silent', async () => {
      const resolved = [
        { path: '/repo/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      ]
      mockTauriInvoke.mockImplementation((command: string) => {
        if (command === 'get_worktree_status') {
          return Promise.resolve(resolved)
        }
        return Promise.resolve(undefined)
      })

      const store = useWorktreeStore()
      store.setRepositories([{ name: 'my-repo', worktrees: 1 }])
      store.selectRepository('my-repo')

      const setLoadingSpy = vi.spyOn(store, 'setLoadingWorktrees')

      const { fetchWorktrees } = useWorktrees()
      await fetchWorktrees()

      expect(setLoadingSpy).toHaveBeenCalledWith(true)
      expect(setLoadingSpy).toHaveBeenCalledWith(false)
    })

    it('does not surface an error banner when a silent fetch fails', async () => {
      // Both the primary status fetch and the listWorktrees fallback fail.
      mockTauriInvoke.mockRejectedValue({ code: 'WT_ERROR', message: 'transient hiccup' })

      const store = useWorktreeStore()
      store.setRepositories([{ name: 'my-repo', worktrees: 1 }])
      store.selectRepository('my-repo')

      const setErrorSpy = vi.spyOn(store, 'setError')

      const { fetchWorktrees } = useWorktrees()
      await fetchWorktrees({ silent: true })

      expect(setErrorSpy).not.toHaveBeenCalled()
      expect(store.error).toBeNull()
    })

    it('surfaces an error banner when a non-silent fetch fails', async () => {
      // Both the primary status fetch and the listWorktrees fallback fail.
      mockTauriInvoke.mockRejectedValue({ code: 'WT_ERROR', message: 'transient hiccup' })

      const store = useWorktreeStore()
      store.setRepositories([{ name: 'my-repo', worktrees: 1 }])
      store.selectRepository('my-repo')

      const setErrorSpy = vi.spyOn(store, 'setError')

      const { fetchWorktrees } = useWorktrees()
      await fetchWorktrees()

      expect(setErrorSpy).toHaveBeenCalled()
      expect(store.error?.code).toBe('FETCH_FAILED')
    })
  })

  describe('tray refresh after mutations', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    const trayInvoked = () =>
      mockTauriInvoke.mock.calls.some(([command]) => command === 'refresh_tray_menu')

    it('schedules a debounced tray refresh after a successful createWorktree', async () => {
      mockTauriInvoke.mockResolvedValue({})
      const { createWorktree } = useWorktrees()

      await createWorktree({ repo: 'my-repo', branch: 'feature/new' })

      // Not yet fired before the debounce window elapses
      expect(trayInvoked()).toBe(false)

      vi.advanceTimersByTime(TRAY_REFRESH_DEBOUNCE_MS)

      expect(mockTauriInvoke).toHaveBeenCalledWith('refresh_tray_menu')
    })

    it('schedules a debounced tray refresh after a successful removeWorktree', async () => {
      mockTauriInvoke.mockResolvedValue({})
      const { removeWorktree } = useWorktrees()

      await removeWorktree({ repo: 'my-repo', branch: 'feature/old' })

      vi.advanceTimersByTime(TRAY_REFRESH_DEBOUNCE_MS)

      expect(mockTauriInvoke).toHaveBeenCalledWith('refresh_tray_menu')
    })

    it('does not schedule a tray refresh when the mutation fails', async () => {
      mockTauriInvoke.mockRejectedValue({ code: 'CREATE_FAILED', message: 'nope' })
      const { createWorktree } = useWorktrees()

      await createWorktree({ repo: 'my-repo', branch: 'feature/new' })

      vi.advanceTimersByTime(TRAY_REFRESH_DEBOUNCE_MS)

      expect(trayInvoked()).toBe(false)
    })

    it('coalesces two rapid successful mutations into a single tray refresh', async () => {
      mockTauriInvoke.mockResolvedValue({})
      const { createWorktree } = useWorktrees()

      await createWorktree({ repo: 'my-repo', branch: 'feature/one' })
      await createWorktree({ repo: 'my-repo', branch: 'feature/two' })

      vi.advanceTimersByTime(TRAY_REFRESH_DEBOUNCE_MS)

      const trayCalls = mockTauriInvoke.mock.calls.filter(
        ([command]) => command === 'refresh_tray_menu'
      )
      expect(trayCalls).toHaveLength(1)
    })
  })
})
