import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useWt } from './useWt'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'

describe('useWt', () => {
  beforeEach(() => {
    resetTauriMocks()
  })

  describe('checkWtAvailable', () => {
    it('should return true when wt is available', async () => {
      mockTauriInvoke.mockResolvedValue(true)
      
      const wt = useWt()
      const result = await wt.checkWtAvailable()
      
      expect(result).toBe(true)
      expect(mockTauriInvoke).toHaveBeenCalledWith('check_wt_available')
    })

    it('should return false when invoke throws', async () => {
      mockTauriInvoke.mockRejectedValue(new Error('Not found'))
      
      const wt = useWt()
      const result = await wt.checkWtAvailable()
      
      expect(result).toBe(false)
    })
  })

  describe('getWtVersion', () => {
    it('should return version string on success', async () => {
      mockTauriInvoke.mockResolvedValue('wt 1.2.3')
      
      const wt = useWt()
      const result = await wt.getWtVersion()
      
      expect(result).toBe('wt 1.2.3')
      expect(mockTauriInvoke).toHaveBeenCalledWith('get_wt_version')
    })

    it('should return null on error', async () => {
      mockTauriInvoke.mockRejectedValue(new Error('Failed'))
      
      const wt = useWt()
      const result = await wt.getWtVersion()
      
      expect(result).toBeNull()
    })
  })

  describe('listRepositories', () => {
    it('should return repositories list', async () => {
      const mockRepos = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]
      mockTauriInvoke.mockResolvedValue(mockRepos)
      
      const wt = useWt()
      const result = await wt.listRepositories()
      
      expect(result).toEqual(mockRepos)
      expect(mockTauriInvoke).toHaveBeenCalledWith('list_repositories')
    })
  })

  describe('listWorktrees', () => {
    it('should call list_worktrees with repo name', async () => {
      const mockWorktrees = [
        { path: '/test/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      ]
      mockTauriInvoke.mockResolvedValue(mockWorktrees)
      
      const wt = useWt()
      const result = await wt.listWorktrees('my-repo')
      
      expect(result).toEqual(mockWorktrees)
      expect(mockTauriInvoke).toHaveBeenCalledWith('list_worktrees', { repoName: 'my-repo' })
    })
  })

  describe('getWorktreeStatus', () => {
    it('should call get_worktree_status with repo name', async () => {
      const mockWorktrees = [
        { path: '/test/main', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      ]
      mockTauriInvoke.mockResolvedValue(mockWorktrees)
      
      const wt = useWt()
      const result = await wt.getWorktreeStatus('my-repo')
      
      expect(result).toEqual(mockWorktrees)
      expect(mockTauriInvoke).toHaveBeenCalledWith('get_worktree_status', { repoName: 'my-repo' })
    })
  })

  describe('openInEditor', () => {
    it('should call open_in_editor with path only', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.openInEditor('/path/to/worktree')
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: '/path/to/worktree',
        editor: null,
        customEditorPath: null,
      })
    })

    it('should call open_in_editor with editor preference', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.openInEditor('/path/to/worktree', 'vscode')
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: '/path/to/worktree',
        editor: 'vscode',
        customEditorPath: null,
      })
    })

    it('should call open_in_editor with custom editor path', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.openInEditor('/path/to/worktree', 'custom', '/Applications/MyEditor.app')
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: '/path/to/worktree',
        editor: 'custom',
        customEditorPath: '/Applications/MyEditor.app',
      })
    })
  })

  describe('openInTerminal', () => {
    it('should call open_in_terminal with path', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.openInTerminal('/path/to/worktree', 'iterm2')
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_terminal', {
        path: '/path/to/worktree',
        terminal: 'iterm2',
      })
    })
  })

  describe('openInGitClient', () => {
    it('should call open_in_git_client with parameters', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.openInGitClient('/path/to/worktree', 'fork', '/Applications/Fork.app')
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('open_in_git_client', {
        path: '/path/to/worktree',
        gitClient: 'fork',
        customGitClientPath: '/Applications/Fork.app',
      })
    })
  })

  describe('createWorktree', () => {
    it('should call create_worktree with options', async () => {
      const mockResult = {
        path: '/new/worktree',
        url: 'https://new.test',
        branch: 'feature/new',
        database: 'new_db',
      }
      mockTauriInvoke.mockResolvedValue(mockResult)
      
      const wt = useWt()
      const result = await wt.createWorktree({
        repo: 'my-repo',
        branch: 'feature/new',
        base: 'main',
        template: 'laravel',
        force: true,
      })
      
      expect(result).toEqual(mockResult)
      expect(mockTauriInvoke).toHaveBeenCalledWith('create_worktree', {
        repo: 'my-repo',
        branch: 'feature/new',
        base: 'main',
        template: 'laravel',
        force: true,
      })
    })

    it('should default force to true', async () => {
      mockTauriInvoke.mockResolvedValue({})
      
      const wt = useWt()
      await wt.createWorktree({
        repo: 'my-repo',
        branch: 'feature/new',
      })
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('create_worktree', expect.objectContaining({
        force: true,
      }))
    })
  })

  describe('removeWorktree', () => {
    it('should call remove_worktree with options', async () => {
      const mockResult = {
        success: true,
        repo: 'my-repo',
        branch: 'feature/old',
        path: '/old/worktree',
        branch_deleted: true,
        db_dropped: false,
      }
      mockTauriInvoke.mockResolvedValue(mockResult)
      
      const wt = useWt()
      const result = await wt.removeWorktree({
        repo: 'my-repo',
        branch: 'feature/old',
        deleteBranch: true,
        dropDb: false,
        skipBackup: false,
        force: false,
      })
      
      expect(result).toEqual(mockResult)
      expect(mockTauriInvoke).toHaveBeenCalledWith('remove_worktree', {
        repo: 'my-repo',
        branch: 'feature/old',
        deleteBranch: true,
        dropDb: false,
        skipBackup: false,
        force: false,
      })
    })
  })

  describe('pullWorktree', () => {
    it('should call pull_worktree with repo and branch', async () => {
      const mockResult = {
        success: true,
        already_up_to_date: false,
        conflicts: false,
        commits_pulled: 3,
        message: 'Updated 3 commits',
      }
      mockTauriInvoke.mockResolvedValue(mockResult)
      
      const wt = useWt()
      const result = await wt.pullWorktree('my-repo', 'feature/test')
      
      expect(result).toEqual(mockResult)
      expect(mockTauriInvoke).toHaveBeenCalledWith('pull_worktree', {
        repo: 'my-repo',
        branch: 'feature/test',
      })
    })
  })

  describe('syncWorktree', () => {
    it('should call sync_worktree with repo and branch', async () => {
      const mockResult = {
        success: true,
        base: 'origin/staging',
        conflicts: false,
        dirty: false,
        commits_rebased: 2,
        message: 'Rebased 2 commits',
      }
      mockTauriInvoke.mockResolvedValue(mockResult)
      
      const wt = useWt()
      const result = await wt.syncWorktree('my-repo', 'feature/test')
      
      expect(result).toEqual(mockResult)
      expect(mockTauriInvoke).toHaveBeenCalledWith('sync_worktree', {
        repo: 'my-repo',
        branch: 'feature/test',
      })
    })
  })

  describe('cancelOperation', () => {
    it('should call cancel_operation', async () => {
      mockTauriInvoke.mockResolvedValue(undefined)
      
      const wt = useWt()
      await wt.cancelOperation()
      
      expect(mockTauriInvoke).toHaveBeenCalledWith('cancel_operation')
    })
  })

  describe('toWtError', () => {
    it('should return WtError as-is', () => {
      const wt = useWt()
      const error = { code: 'TEST_ERROR', message: 'Test error' }
      
      const result = wt.toWtError(error)
      
      expect(result).toEqual(error)
    })

    it('should convert Error to WtError', () => {
      const wt = useWt()
      const error = new Error('Something went wrong')
      
      const result = wt.toWtError(error)
      
      expect(result.code).toBe('UNKNOWN_ERROR')
      expect(result.message).toBe('Something went wrong')
    })

    it('should convert string to WtError', () => {
      const wt = useWt()
      
      const result = wt.toWtError('Error message')
      
      expect(result.code).toBe('UNKNOWN_ERROR')
      expect(result.message).toBe('Error message')
    })

    it('should handle unknown error types', () => {
      const wt = useWt()
      
      const result = wt.toWtError(null)
      
      expect(result.code).toBe('UNKNOWN_ERROR')
      expect(result.message).toBe('An unexpected error occurred')
    })

    it('should handle objects without code/message', () => {
      const wt = useWt()
      
      const result = wt.toWtError({ foo: 'bar' })
      
      expect(result.code).toBe('UNKNOWN_ERROR')
      expect(result.message).toBe('An unexpected error occurred')
    })
  })
})
