import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Repository, Worktree } from '../types'

/**
 * Structured highlight match result for safe template rendering.
 * Use this with template syntax to avoid XSS vulnerabilities:
 * `<span>{{ result.before }}<mark>{{ result.match }}</mark>{{ result.after }}</span>`
 */
export interface HighlightMatchResult {
  /** Text before the match */
  before: string
  /** The matched text */
  match: string
  /** Text after the match */
  after: string
  /** Whether there was a match found */
  hasMatch: boolean
}

/**
 * useSearch Composable
 *
 * Provides reactive search state and filtering functions for worktrees and repositories.
 * Uses case-insensitive substring matching for fuzzy filtering.
 */
export interface UseSearchReturn {
  /** Current search query */
  query: Ref<string>
  /** Clear the search query */
  clearQuery: () => void
  /** Filter worktrees by branch name */
  filterWorktrees: (worktrees: Worktree[]) => Worktree[]
  /** Filter repositories by name */
  filterRepositories: (repositories: Repository[]) => Repository[]
  /** Check if a string matches the current query */
  matches: (text: string) => boolean
  /** Highlight matching text in a string (returns structured data for safe rendering) */
  highlightMatch: (text: string) => HighlightMatchResult
}

/**
 * Create a search composable instance
 * @returns Search state and filter functions
 */
export function useSearch(): UseSearchReturn {
  const query = ref('')

  function clearQuery() {
    query.value = ''
  }

  /**
   * Case-insensitive substring match
   */
  function matches(text: string): boolean {
    if (!query.value.trim()) return true
    return text.toLowerCase().includes(query.value.toLowerCase().trim())
  }

  /**
   * Filter worktrees by branch name
   * Preserves original order
   */
  function filterWorktrees(worktrees: Worktree[]): Worktree[] {
    if (!query.value.trim()) return worktrees
    return worktrees.filter((wt) => matches(wt.branch))
  }

  /**
   * Filter repositories by name
   * Preserves original order
   */
  function filterRepositories(repositories: Repository[]): Repository[] {
    if (!query.value.trim()) return repositories
    return repositories.filter((repo) => matches(repo.name))
  }

  /**
   * Highlight matching text by returning structured segments.
   * Returns an object with before, match, and after segments for safe template rendering.
   * This approach prevents XSS vulnerabilities by avoiding v-html.
   *
   * Usage in template:
   * ```vue
   * <span>
   *   {{ result.before }}
   *   <mark v-if="result.hasMatch" class="bg-accent/30 text-text-primary rounded px-0.5">
   *     {{ result.match }}
   *   </mark>
   *   {{ result.after }}
   * </span>
   * ```
   */
  function highlightMatch(text: string): HighlightMatchResult {
    if (!query.value.trim()) {
      return { before: text, match: '', after: '', hasMatch: false }
    }

    const searchTerm = query.value.trim()
    const lowerText = text.toLowerCase()
    const lowerSearch = searchTerm.toLowerCase()
    const index = lowerText.indexOf(lowerSearch)

    if (index === -1) {
      return { before: text, match: '', after: '', hasMatch: false }
    }

    // Use Array.from to get Unicode-safe character boundaries
    const chars = Array.from(text)
    const lowerChars = Array.from(lowerText)
    
    // Convert char index from toLowerCase'd string to original char array index
    let charIndex = 0
    let byteIndex = 0
    for (let i = 0; i < lowerChars.length && byteIndex < index; i++) {
      byteIndex += lowerChars[i].length
      charIndex++
    }
    
    const searchChars = Array.from(lowerSearch)
    const matchLength = searchChars.length

    return {
      before: chars.slice(0, charIndex).join(''),
      match: chars.slice(charIndex, charIndex + matchLength).join(''),
      after: chars.slice(charIndex + matchLength).join(''),
      hasMatch: true,
    }
  }

  return {
    query,
    clearQuery,
    filterWorktrees,
    filterRepositories,
    matches,
    highlightMatch,
  }
}

/**
 * Create a computed filtered list based on search query
 * Useful when you need a reactive filtered list
 */
export function useFilteredList<T>(
  items: Ref<T[]> | ComputedRef<T[]>,
  query: Ref<string>,
  filterFn: (item: T, query: string) => boolean
): ComputedRef<T[]> {
  return computed(() => {
    const searchQuery = query.value.trim().toLowerCase()
    if (!searchQuery) return items.value
    return items.value.filter((item) => filterFn(item, searchQuery))
  })
}

