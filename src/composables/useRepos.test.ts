import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRepos } from './useRepos'
import { useWorktreeStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Repository } from '@/types'

describe('useRepos', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
  })

  describe('fetchRepositories', () => {
    it('should fetch and store repositories', async () => {
      const mockRepos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]
      mockTauriInvoke.mockResolvedValue(mockRepos)

      const { fetchRepositories } = useRepos()
      const store = useWorktreeStore()

      await fetchRepositories()

      expect(store.repositories).toEqual(mockRepos)
      expect(store.loading).toBe(false)
    })

    it('should handle errors', async () => {
      const error = { code: 'CLI_NOT_FOUND', message: 'grove CLI not found' }
      mockTauriInvoke.mockRejectedValue(error)

      const { fetchRepositories } = useRepos()
      const store = useWorktreeStore()

      await fetchRepositories()

      expect(store.error).toEqual(error)
      expect(store.loading).toBe(false)
    })

    it('should set loading state while fetching', async () => {
      mockTauriInvoke.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 100))
      )

      const { fetchRepositories } = useRepos()
      const store = useWorktreeStore()

      const fetchPromise = fetchRepositories()
      expect(store.loading).toBe(true)

      await fetchPromise
      expect(store.loading).toBe(false)
    })
  })

  describe('selectRepository', () => {
    it('should select a repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo-a', worktrees: 2 }])

      const { selectRepository } = useRepos()
      selectRepository('repo-a')

      expect(store.selectedRepoName).toBe('repo-a')
    })
  })

  describe('refreshRepositories', () => {
    it('should be an alias for fetchRepositories', async () => {
      const mockRepos: Repository[] = [{ name: 'repo-a', worktrees: 2 }]
      mockTauriInvoke.mockResolvedValue(mockRepos)

      const { refreshRepositories } = useRepos()
      const store = useWorktreeStore()

      await refreshRepositories()

      expect(store.repositories).toEqual(mockRepos)
    })
  })

  describe('checkAvailability', () => {
    it('should check wt availability and store result', async () => {
      mockTauriInvoke.mockImplementation((command: string) => {
        if (command === 'check_wt_available') return Promise.resolve(true)
        if (command === 'get_wt_version') return Promise.resolve('wt 1.2.3')
        return Promise.resolve(null)
      })

      const { checkAvailability } = useRepos()
      const store = useWorktreeStore()

      const result = await checkAvailability()

      expect(result).toBe(true)
      expect(store.wtAvailable).toBe(true)
      expect(store.wtVersion).toBe('wt 1.2.3')
    })

    it('should handle unavailable wt', async () => {
      mockTauriInvoke.mockResolvedValue(false)

      const { checkAvailability, startupError } = useRepos()
      const store = useWorktreeStore()

      const result = await checkAvailability()

      expect(result).toBe(false)
      expect(store.wtAvailable).toBe(false)
      expect(startupError.value?.code).toBe('COMMAND_FAILED')
    })

    it('keeps the real WtError reason, with the home folder redacted', async () => {
      mockTauriInvoke.mockRejectedValue({
        code: 'IO_ERROR',
        message: 'Failed to spawn /Users/alice/Applications/Grove.app/Contents/MacOS/grove: Permission denied (os error 13)',
      })

      const { checkAvailability, startupError } = useRepos()
      await checkAvailability()

      expect(startupError.value).toEqual({
        code: 'IO_ERROR',
        message: 'Failed to spawn ~/Applications/Grove.app/Contents/MacOS/grove: Permission denied (os error 13)',
      })
    })

    it('clears the startup error once a retry succeeds', async () => {
      mockTauriInvoke.mockRejectedValueOnce({ code: 'TIMEOUT', message: 'Command timed out' })
      const { checkAvailability, startupError } = useRepos()
      const store = useWorktreeStore()

      expect(await checkAvailability()).toBe(false)
      expect(startupError.value?.code).toBe('TIMEOUT')

      mockTauriInvoke.mockImplementation((command: string) =>
        Promise.resolve(command === 'check_wt_available' ? true : 'grove 3.0.0'))
      expect(await checkAvailability()).toBe(true)
      expect(startupError.value).toBeNull()
      expect(store.wtAvailable).toBe(true)
    })

    it('keeps a failed version query visible instead of marking startup successful', async () => {
      mockTauriInvoke.mockImplementation((command: string) => command === 'check_wt_available'
        ? Promise.resolve(true)
        : Promise.reject({ code: 'TIMEOUT', message: 'Version query timed out' }))
      const { checkAvailability, startupError } = useRepos()
      const store = useWorktreeStore()

      expect(await checkAvailability()).toBe(false)
      expect(store.wtAvailable).toBe(false)
      expect(startupError.value).toEqual({ code: 'TIMEOUT', message: 'Version query timed out' })
    })
  })
})
