import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktrees } from './useWorktrees'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import { useOverviewStore } from '@/stores/overview'
import { flushPromises } from '@vue/test-utils'

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

    it('a fetch for a repo the user left does not clear the next repo\'s loading state', async () => {
      const release: Record<string, () => void> = {}
      mockTauriInvoke.mockImplementation((command: string, args?: { repoName?: string }) => {
        if (command === 'get_worktree_status') {
          return new Promise((resolve) => { release[args!.repoName!] = () => resolve([]) })
        }
        return Promise.resolve(undefined)
      })
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo-a', worktrees: 1 }, { name: 'repo-b', worktrees: 1 }])
      const { fetchWorktrees } = useWorktrees()

      store.selectRepository('repo-a')
      const a = fetchWorktrees()
      store.selectRepository('repo-b')
      const b = fetchWorktrees()

      release['repo-a']()
      await a
      expect(store.loadingWorktrees).toBe(true)

      release['repo-b']()
      await b
      expect(store.loadingWorktrees).toBe(false)
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
      expect(store.refreshErrors?.['my-repo']).toContain('transient hiccup')
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

  describe('removal reconciliation', () => {
    const rows = [
      { path: '/repo/envguard', branch: 'fix/deploy-env-guard', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      { path: '/repo/retained', branch: 'feature/retained', dirty: false, ahead: 0, behind: 0, sha: 'def' },
    ]

    function seedRows() {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'my-repo', worktrees: 2 }])
      store.selectRepository('my-repo')
      store.setWorktrees(rows)
      store.setSelection(rows.map(row => row.path))
      useOverviewStore().setWorktreeSnapshot('my-repo', rows, 123)
      return store
    }

    afterEach(() => useWorktrees().cleanup())

    it('retires an absent single target from visible and persisted caches without reporting success', async () => {
      const store = seedRows()
      const error = { code: 'WORKTREE_NOT_FOUND', message: 'No matching worktree registered' }
      mockTauriInvoke.mockRejectedValue(error)

      const result = await useWorktrees().removeWorktree({ repo: 'my-repo', branch: rows[0].branch })

      expect(result).toBeNull()
      expect(store.error).toEqual(error)
      expect(store.worktrees).toEqual([rows[1]])
      expect(store.getCachedWorktrees('my-repo')).toEqual([rows[1]])
      expect([...store.selectedPaths]).toEqual([rows[1].path])
      expect(useOverviewStore().snapshots['my-repo'].worktrees).toEqual([rows[1]])
    })

    it('keeps blocked targets while retiring confirmed absent batch rows even if refresh fails', async () => {
      const store = seedRows()
      mockTauriInvoke.mockResolvedValue({ repo: 'my-repo', worktrees: [
        { branch: rows[0].branch, success: false, branch_deleted: false, error_code: 'WORKTREE_NOT_FOUND', message: 'No matching worktree registered' },
        { branch: rows[1].branch, success: false, branch_deleted: false, error_code: 'REMOVAL_BLOCKED', message: 'Live agent session' },
      ], summary: { total: 2, succeeded: 0, failed: 2, cancelled: 0 } })

      await useWorktrees().removeSelectedWorktrees('my-repo', rows.map(row => row.branch), { deleteBranch: false, dropDb: false, skipBackup: false })

      expect(store.worktrees).toEqual([rows[1]])
      expect([...store.selectedPaths]).toEqual([rows[1].path])
    })

    it('waits for a post-removal listing and discards an older in-flight capture', async () => {
      const store = seedRows()
      const reads: Array<(rows: typeof store.worktrees) => void> = []
      mockTauriInvoke.mockImplementation((command: string) => command === 'get_worktree_status'
        ? new Promise(resolve => reads.push(resolve))
        : Promise.resolve({ result: { success: true, path: rows[0].path }, hooks: [] }))
      const api = useWorktrees()
      const oldRead = api.fetchWorktrees()
      let settled = false
      const removal = api.removeWorktree({ repo: 'my-repo', branch: rows[0].branch }).then(() => { settled = true })
      await flushPromises()
      reads[0](rows)
      await flushPromises()
      expect(store.worktrees).toEqual([rows[1]])
      expect(settled).toBe(false)
      reads[1]([rows[1]])
      await Promise.all([oldRead, removal])
      expect(settled).toBe(true)
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
