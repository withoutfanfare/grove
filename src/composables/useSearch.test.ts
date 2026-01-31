import { describe, it, expect, beforeEach } from 'vitest'
import { useSearch, useFilteredList } from './useSearch'
import type { Repository, Worktree } from '@/types'
import { ref } from 'vue'

describe('useSearch', () => {
  let search: ReturnType<typeof useSearch>

  beforeEach(() => {
    search = useSearch()
  })

  describe('query', () => {
    it('should have empty query by default', () => {
      expect(search.query.value).toBe('')
    })

    it('should set query value', () => {
      search.query.value = 'test'
      expect(search.query.value).toBe('test')
    })
  })

  describe('clearQuery', () => {
    it('should clear the query', () => {
      search.query.value = 'something'
      search.clearQuery()
      expect(search.query.value).toBe('')
    })
  })

  describe('matches', () => {
    it('should return true when query is empty', () => {
      expect(search.matches('anything')).toBe(true)
    })

    it('should match substring case-insensitively', () => {
      search.query.value = 'Feature'
      expect(search.matches('feature/login')).toBe(true)
      expect(search.matches('my-feature-branch')).toBe(true)
      expect(search.matches('other')).toBe(false)
    })

    it('should trim whitespace from query', () => {
      search.query.value = '  test  '
      expect(search.matches('testing')).toBe(true)
    })

    it('should handle special characters in query', () => {
      search.query.value = 'feature/test-123'
      expect(search.matches('feature/test-123-branch')).toBe(true)
    })
  })

  describe('filterWorktrees', () => {
    const worktrees: Worktree[] = [
      { path: '/a', branch: 'main', dirty: false, ahead: 0, behind: 0, sha: 'abc' },
      { path: '/b', branch: 'feature/login', dirty: false, ahead: 0, behind: 0, sha: 'def' },
      { path: '/c', branch: 'feature/checkout', dirty: false, ahead: 0, behind: 0, sha: 'ghi' },
      { path: '/d', branch: 'bugfix/auth', dirty: false, ahead: 0, behind: 0, sha: 'jkl' },
    ]

    it('should return all worktrees when query is empty', () => {
      expect(search.filterWorktrees(worktrees)).toEqual(worktrees)
    })

    it('should filter worktrees by branch name', () => {
      search.query.value = 'feature'
      const filtered = search.filterWorktrees(worktrees)
      expect(filtered).toHaveLength(2)
      expect(filtered.map(w => w.branch)).toContain('feature/login')
      expect(filtered.map(w => w.branch)).toContain('feature/checkout')
    })

    it('should return empty array when no matches', () => {
      search.query.value = 'nonexistent'
      expect(search.filterWorktrees(worktrees)).toEqual([])
    })

    it('should preserve original order', () => {
      search.query.value = 'feature'
      const filtered = search.filterWorktrees(worktrees)
      expect(filtered[0].branch).toBe('feature/login')
      expect(filtered[1].branch).toBe('feature/checkout')
    })
  })

  describe('filterRepositories', () => {
    const repos: Repository[] = [
      { name: 'frontend-app', worktrees: 3 },
      { name: 'backend-api', worktrees: 5 },
      { name: 'frontend-components', worktrees: 2 },
    ]

    it('should return all repos when query is empty', () => {
      expect(search.filterRepositories(repos)).toEqual(repos)
    })

    it('should filter repos by name', () => {
      search.query.value = 'frontend'
      const filtered = search.filterRepositories(repos)
      expect(filtered).toHaveLength(2)
      expect(filtered.map(r => r.name)).toContain('frontend-app')
      expect(filtered.map(r => r.name)).toContain('frontend-components')
    })

    it('should be case-insensitive', () => {
      search.query.value = 'FRONTEND'
      const filtered = search.filterRepositories(repos)
      expect(filtered).toHaveLength(2)
    })
  })

  describe('highlightMatch', () => {
    it('should return full text as before when no query', () => {
      const result = search.highlightMatch('feature/login')
      expect(result.before).toBe('feature/login')
      expect(result.match).toBe('')
      expect(result.after).toBe('')
      expect(result.hasMatch).toBe(false)
    })

    it('should highlight matching substring', () => {
      search.query.value = 'feat'
      const result = search.highlightMatch('feature/login')
      expect(result.before).toBe('')
      expect(result.match).toBe('feat')
      expect(result.after).toBe('ure/login')
      expect(result.hasMatch).toBe(true)
    })

    it('should highlight middle match', () => {
      search.query.value = 'ure'
      const result = search.highlightMatch('feature/login')
      expect(result.before).toBe('feat')
      expect(result.match).toBe('ure')
      expect(result.after).toBe('/login')
    })

    it('should handle no match', () => {
      search.query.value = 'xyz'
      const result = search.highlightMatch('feature/login')
      expect(result.before).toBe('feature/login')
      expect(result.match).toBe('')
      expect(result.after).toBe('')
      expect(result.hasMatch).toBe(false)
    })

    it('should handle Unicode characters', () => {
      search.query.value = '🚀'
      const result = search.highlightMatch('feature🚀branch')
      expect(result.hasMatch).toBe(true)
      expect(result.match).toBe('🚀')
    })

    it('should be case-insensitive for highlighting', () => {
      search.query.value = 'FEATURE'
      const result = search.highlightMatch('Feature/Login')
      expect(result.hasMatch).toBe(true)
      // Should preserve original case in match
      expect(result.match).toBe('Feature')
    })
  })
})

describe('useFilteredList', () => {
  it('should return all items when query is empty', () => {
    const items = ref([1, 2, 3, 4, 5])
    const query = ref('')
    const filtered = useFilteredList(items, query, (item, q) => item > parseInt(q))
    
    expect(filtered.value).toEqual([1, 2, 3, 4, 5])
  })

  it('should filter items based on query', () => {
    const items = ref([1, 2, 3, 4, 5])
    const query = ref('3')
    const filtered = useFilteredList(items, query, (item, q) => item > parseInt(q))
    
    expect(filtered.value).toEqual([4, 5])
  })

  it('should react to query changes', () => {
    const items = ref([1, 2, 3, 4, 5])
    const query = ref('')
    const filtered = useFilteredList(items, query, (item, q) => item.toString().includes(q))
    
    expect(filtered.value).toEqual([1, 2, 3, 4, 5])
    
    query.value = '2'
    expect(filtered.value).toEqual([2])
  })

  it('should react to items changes', () => {
    const items = ref([1, 2, 3])
    const query = ref('')
    const filtered = useFilteredList(items, query, (item, q) => item > parseInt(q))
    
    items.value = [4, 5, 6]
    query.value = '4'
    expect(filtered.value).toEqual([5, 6])
  })

  it('should trim and lowercase query', () => {
    const items = ref(['Apple', 'Banana', 'apricot'])
    const query = ref('  AP  ')
    const filtered = useFilteredList(items, query, (item, q) => item.toLowerCase().includes(q))
    
    expect(filtered.value).toEqual(['Apple', 'apricot'])
  })
})
