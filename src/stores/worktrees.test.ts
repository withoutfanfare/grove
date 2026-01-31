import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWorktreeStore } from './worktrees'
import type { Repository, Worktree, RecentWorktree } from '@/types'

describe('useWorktreeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('should have empty repositories', () => {
      const store = useWorktreeStore()
      expect(store.repositories).toEqual([])
    })

    it('should have no selected repository', () => {
      const store = useWorktreeStore()
      expect(store.selectedRepoName).toBeNull()
    })

    it('should not be loading', () => {
      const store = useWorktreeStore()
      expect(store.loading).toBe(false)
      expect(store.loadingWorktrees).toBe(false)
    })

    it('should have no error', () => {
      const store = useWorktreeStore()
      expect(store.error).toBeNull()
    })

    it('should assume wt is available', () => {
      const store = useWorktreeStore()
      expect(store.wtAvailable).toBe(true)
    })
  })

  describe('setRepositories', () => {
    it('should set repositories', () => {
      const store = useWorktreeStore()
      const repos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]

      store.setRepositories(repos)

      expect(store.repositories).toEqual(repos)
    })

    it('should auto-select first repo when none selected', () => {
      const store = useWorktreeStore()
      const repos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]

      store.setRepositories(repos)

      expect(store.selectedRepoName).toBe('repo-a')
    })

    it('should not change selection if already selected', () => {
      const store = useWorktreeStore()
      
      // First set repos and auto-select the first one
      const repos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]
      store.setRepositories(repos)
      expect(store.selectedRepoName).toBe('repo-a')
      
      // Now manually select repo-b
      store.selectRepository('repo-b')
      expect(store.selectedRepoName).toBe('repo-b')
      
      // Setting repos again should not change the selection
      store.setRepositories(repos)

      expect(store.selectedRepoName).toBe('repo-b')
    })
  })

  describe('selectRepository', () => {
    it('should select a repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'test-repo', worktrees: 2 }])

      store.selectRepository('test-repo')

      expect(store.selectedRepoName).toBe('test-repo')
    })

    it('should not select non-existent repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'existing', worktrees: 1 }])

      store.selectRepository('non-existent')

      expect(store.selectedRepoName).toBe('existing')
    })

    it('should clear worktrees when selecting', () => {
      const store = useWorktreeStore()
      store.setRepositories([
        { name: 'repo-a', worktrees: 2 },
        { name: 'repo-b', worktrees: 3 },
      ])
      store.setWorktrees([{ path: '/test', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' }])

      store.selectRepository('repo-b')

      expect(store.worktrees).toEqual([])
    })

    it('should set loadingWorktrees when selecting', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo', worktrees: 2 }])
      store.setLoadingWorktrees(false)

      store.selectRepository('repo')

      expect(store.loadingWorktrees).toBe(true)
    })

    it('should clear focused branch when selecting', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo', worktrees: 2 }])
      store.focusWorktree('feature-branch')

      store.selectRepository('repo')

      expect(store.focusedBranch).toBeNull()
    })
  })

  describe('getters', () => {
    it('selectedRepo should return the selected repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([
        { name: 'repo-a', worktrees: 2 },
        { name: 'repo-b', worktrees: 3 },
      ])
      store.selectRepository('repo-b')

      expect(store.selectedRepo).toEqual({ name: 'repo-b', worktrees: 3 })
    })

    it('selectedRepo should return null when nothing selected', () => {
      const store = useWorktreeStore()
      expect(store.selectedRepo).toBeNull()
    })

    it('hasRepositories should be false when empty', () => {
      const store = useWorktreeStore()
      expect(store.hasRepositories).toBe(false)
    })

    it('hasRepositories should be true when has repos', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo', worktrees: 1 }])
      expect(store.hasRepositories).toBe(true)
    })

    it('totalWorktrees should sum all worktrees', () => {
      const store = useWorktreeStore()
      store.setRepositories([
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ])

      expect(store.totalWorktrees).toBe(8)
    })

    it('dirtyWorktrees should filter dirty worktrees', () => {
      const store = useWorktreeStore()
      store.setWorktrees([
        { path: '/a', branch: 'clean', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
        { path: '/b', branch: 'dirty', dirty: true, ahead: 0, behind: 0, sha: 'def' },
        { path: '/c', branch: 'also-dirty', dirty: true, ahead: 0, behind: 0, sha: 'ghi' },
      ])

      expect(store.dirtyWorktrees).toHaveLength(2)
      expect(store.dirtyWorktrees.map(w => w.branch)).toContain('dirty')
      expect(store.dirtyWorktrees.map(w => w.branch)).toContain('also-dirty')
    })

    it('cleanWorktrees should filter non-dirty worktrees', () => {
      const store = useWorktreeStore()
      store.setWorktrees([
        { path: '/a', branch: 'clean', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
        { path: '/b', branch: 'dirty', dirty: true, ahead: 0, behind: 0, sha: 'def' },
      ])

      expect(store.cleanWorktrees).toHaveLength(1)
      expect(store.cleanWorktrees[0].branch).toBe('clean')
    })
  })

  describe('worktree operations', () => {
    it('setWorktrees should set worktrees', () => {
      const store = useWorktreeStore()
      const worktrees: Worktree[] = [
        { path: '/test/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      ]

      store.setWorktrees(worktrees)

      expect(store.worktrees).toEqual(worktrees)
    })

    it('setWorktrees should replace existing worktrees', () => {
      const store = useWorktreeStore()
      store.setWorktrees([{ path: '/old', branch: 'old', dirty: false, ahead: 0, behind: 0, sha: 'old' }])

      const newWorktrees: Worktree[] = [
        { path: '/new', branch: 'new', dirty: false, ahead: 0, behind: 0, sha: 'new' },
      ]
      store.setWorktrees(newWorktrees)

      expect(store.worktrees).toEqual(newWorktrees)
    })
  })

  describe('recent worktrees', () => {
    it('setRecentWorktrees should set recent worktrees', () => {
      const store = useWorktreeStore()
      const recent: RecentWorktree[] = [
        { repo: 'test', branch: 'feature', path: '/test', accessed_at: 1234567890, accessed_ago: '1 hour ago', dirty: false },
      ]

      store.setRecentWorktrees(recent)

      expect(store.recentWorktrees).toEqual(recent)
    })
  })

  describe('focus worktree', () => {
    it('focusWorktree should set focused branch', () => {
      const store = useWorktreeStore()
      store.focusWorktree('my-feature-branch')

      expect(store.focusedBranch).toBe('my-feature-branch')
    })

    it('focusWorktree with expand should set expandOnFocus', () => {
      const store = useWorktreeStore()
      store.focusWorktree('my-feature-branch', true)

      expect(store.focusedBranch).toBe('my-feature-branch')
      expect(store.expandOnFocus).toBe(true)
    })

    it('clearFocusedWorktree should clear focused branch', () => {
      const store = useWorktreeStore()
      store.focusWorktree('my-feature-branch')
      store.clearFocusedWorktree()

      expect(store.focusedBranch).toBeNull()
    })

    it('clearExpandOnFocus should clear expand flag', () => {
      const store = useWorktreeStore()
      store.focusWorktree('my-feature-branch', true)
      store.clearExpandOnFocus()

      expect(store.expandOnFocus).toBe(false)
    })
  })

  describe('loading state', () => {
    it('setLoading should set loading', () => {
      const store = useWorktreeStore()
      store.setLoading(true)

      expect(store.loading).toBe(true)

      store.setLoading(false)

      expect(store.loading).toBe(false)
    })

    it('setLoadingWorktrees should set loadingWorktrees', () => {
      const store = useWorktreeStore()
      store.setLoadingWorktrees(true)

      expect(store.loadingWorktrees).toBe(true)
    })

    it('setLoadingRecent should set loadingRecent', () => {
      const store = useWorktreeStore()
      store.setLoadingRecent(true)

      expect(store.loadingRecent).toBe(true)
    })
  })

  describe('error handling', () => {
    it('setError should set error', () => {
      const store = useWorktreeStore()
      const error = { code: 'TEST_ERROR', message: 'Test error' }

      store.setError(error)

      expect(store.error).toEqual(error)
    })

    it('clearError should clear error', () => {
      const store = useWorktreeStore()
      store.setError({ code: 'TEST', message: 'Test' })
      store.clearError()

      expect(store.error).toBeNull()
    })

    it('setWtAvailable should set availability', () => {
      const store = useWorktreeStore()
      store.setWtAvailable(false)

      expect(store.wtAvailable).toBe(false)
    })

    it('setWtVersion should set version', () => {
      const store = useWorktreeStore()
      store.setWtVersion('1.0.0')

      expect(store.wtVersion).toBe('1.0.0')
    })
  })

  describe('reset', () => {
    it('reset should clear all state', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo', worktrees: 2 }])
      store.setWorktrees([{ path: '/test', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' }])
      store.setError({ code: 'TEST', message: 'Test' })
      store.setLoading(true)
      store.focusWorktree('feature')

      store.reset()

      expect(store.repositories).toEqual([])
      expect(store.selectedRepoName).toBeNull()
      expect(store.worktrees).toEqual([])
      expect(store.error).toBeNull()
      expect(store.loading).toBe(false)
      expect(store.focusedBranch).toBeNull()
    })
  })
})
