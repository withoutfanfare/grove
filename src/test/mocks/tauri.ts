import { vi } from 'vitest'
import type { Repository, Worktree, WtError } from '@/types'

// ============================================================================
// Mock Data Factories
// ============================================================================

export function createMockRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    name: 'test-repo',
    worktrees: 3,
    ...overrides,
  }
}

export function createMockWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/home/user/repos/test-repo-worktrees/feature-branch',
    branch: 'feature/test',
    sha: 'abc1234',
    url: 'https://feature.test.local',
    dirty: false,
    ahead: 0,
    behind: 0,
    mismatch: false,
    health_grade: 'A',
    health_score: 95,
    last_accessed: '2026-01-30T10:00:00Z',
    merged: false,
    stale: false,
    ...overrides,
  }
}

export function createMockWtError(overrides: Partial<WtError> = {}): WtError {
  return {
    code: 'COMMAND_FAILED',
    message: 'Something went wrong',
    ...overrides,
  }
}

// ============================================================================
// Tauri Invoke Mock Builder
// ============================================================================

export type MockResponse<T = any> = { data: T } | { error: WtError }

export class TauriInvokeMock {
  private responses = new Map<string, MockResponse>()

  /**
   * Set a successful response for a command
   */
  given<T>(command: string, data: T): this {
    this.responses.set(command, { data })
    return this
  }

  /**
   * Set an error response for a command
   */
  givenError(command: string, error: WtError): this {
    this.responses.set(command, { error })
    return this
  }

  /**
   * Create repositories list response
   */
  givenRepositories(repos: Repository[] = []): this {
    return this.given('list_repositories', repos)
  }

  /**
   * Create worktrees list response
   */
  givenWorktrees(worktrees: Worktree[] = []): this {
    return this.given('list_worktrees', worktrees)
  }

  /**
   * Setup the mock on the provided vi.fn()
   */
  setup(mockFn: ReturnType<typeof vi.fn>): void {
    mockFn.mockImplementation(async (command: string, args?: any) => {
      const response = this.responses.get(command)
      
      if (!response) {
        throw new Error(`No mock response configured for command: ${command}`)
      }

      if ('error' in response) {
        throw response.error
      }

      return response.data
    })
  }

  /**
   * Create the mock and auto-setup
   */
  static create(mockFn: ReturnType<typeof vi.fn>): TauriInvokeMock {
    const mock = new TauriInvokeMock()
    mock.setup(mockFn)
    return mock
  }
}

// ============================================================================
// Event Listener Mock Builder
// ============================================================================

export type EventCallback<T = any> = (event: { payload: T }) => void

export class TauriListenMock {
  private listeners = new Map<string, EventCallback[]>()
  private unlistenFns: (() => void)[] = []

  setup(mockFn: ReturnType<typeof vi.fn>): void {
    mockFn.mockImplementation(async (event: string, callback: EventCallback) => {
      const existing = this.listeners.get(event) || []
      existing.push(callback)
      this.listeners.set(event, existing)

      // Return unlisten function
      const unlisten = () => {
        const list = this.listeners.get(event) || []
        const idx = list.indexOf(callback)
        if (idx > -1) list.splice(idx, 1)
      }
      this.unlistenFns.push(unlisten)
      return unlisten
    })
  }

  /**
   * Emit an event to all registered listeners
   */
  emit<T>(event: string, payload: T): void {
    const callbacks = this.listeners.get(event) || []
    callbacks.forEach(cb => cb({ payload }))
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear()
    this.unlistenFns.forEach(fn => fn())
    this.unlistenFns = []
  }

  static create(mockFn: ReturnType<typeof vi.fn>): TauriListenMock {
    const mock = new TauriListenMock()
    mock.setup(mockFn)
    return mock
  }
}

// ============================================================================
// Common Mock Scenarios
// ============================================================================

export const mockScenarios = {
  /**
   * Standard setup with single repository
   */
  singleRepo: () => {
    const repo = createMockRepository()
    const worktrees = [
      createMockWorktree({ branch: 'main', path: '/repos/test-repo-worktrees/main' }),
      createMockWorktree({ branch: 'feature/test', ahead: 2, behind: 1 }),
    ]
    
    return new TauriInvokeMock()
      .givenRepositories([repo])
      .givenWorktrees(worktrees)
  },

  /**
   * Empty state - no repositories
   */
  emptyState: () => {
    return new TauriInvokeMock()
      .givenRepositories([])
  },

  /**
   * Error state - grove CLI not available
   */
  wtNotAvailable: () => {
    return new TauriInvokeMock()
      .givenError('list_repositories', createMockWtError({
        code: 'CLI_NOT_FOUND',
        message: 'grove CLI not found'
      }))
  },

  /**
   * Operation in progress scenario
   */
  operationInProgress: () => {
    return {
      invoke: new TauriInvokeMock()
        .givenRepositories([createMockRepository()]),
      events: new TauriListenMock(),
    }
  },
}

// ============================================================================
// Pinia Store Helpers
// ============================================================================

import { createPinia, setActivePinia } from 'pinia'

export function createTestingPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
