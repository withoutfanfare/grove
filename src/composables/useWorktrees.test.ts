import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktrees } from './useWorktrees'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

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
})
