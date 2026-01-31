import { describe, it, expect } from 'vitest'
import {
  isWtError,
  isOperationResumable,
  getOperationTypeLabel,
  getOperationStatusLabel,
  getHookEventLabel,
  getHookScopeLabel,
  getConfigLayerLabel,
} from './wt'
import type { ResumableOperationSummary, WtError } from './wt'

describe('isWtError', () => {
  it('should return true for valid WtError objects', () => {
    const error: WtError = { code: 'CLI_NOT_FOUND', message: 'Not found' }
    expect(isWtError(error)).toBe(true)
  })

  it('should return true for WtError with object code', () => {
    const error = { code: 'TEST', message: 'Test' }
    expect(isWtError(error)).toBe(true)
  })

  it('should return false for null', () => {
    expect(isWtError(null)).toBe(false)
  })

  it('should return false for undefined', () => {
    expect(isWtError(undefined)).toBe(false)
  })

  it('should return false for strings', () => {
    expect(isWtError('error')).toBe(false)
  })

  it('should return false for numbers', () => {
    expect(isWtError(123)).toBe(false)
  })

  it('should return false for objects without code', () => {
    expect(isWtError({ message: 'No code' })).toBe(false)
  })

  it('should return false for objects without message', () => {
    expect(isWtError({ code: 'TEST' })).toBe(false)
  })

  it('should return false for empty objects', () => {
    expect(isWtError({})).toBe(false)
  })
})

describe('isOperationResumable', () => {
  const createSummary = (status: ResumableOperationSummary['status'], pending: number): ResumableOperationSummary => ({
    id: 'test-id',
    operation_type: 'pull_all',
    repo_name: 'test-repo',
    started_at: '2026-01-31T14:00:00Z',
    updated_at: '2026-01-31T14:00:00Z',
    status,
    total_items: 10,
    completed_items: 10 - pending,
    successful_items: 5,
    failed_items: 10 - pending - 5,
    pending_items: pending,
  })

  it('should return true for interrupted operations with pending items', () => {
    const summary = createSummary('interrupted', 5)
    expect(isOperationResumable(summary)).toBe(true)
  })

  it('should return true for paused operations with pending items', () => {
    const summary = createSummary('paused', 3)
    expect(isOperationResumable(summary)).toBe(true)
  })

  it('should return false for interrupted operations with no pending items', () => {
    const summary = createSummary('interrupted', 0)
    expect(isOperationResumable(summary)).toBe(false)
  })

  it('should return false for running operations', () => {
    const summary = createSummary('running', 5)
    expect(isOperationResumable(summary)).toBe(false)
  })

  it('should return false for completed operations', () => {
    const summary = createSummary('completed', 0)
    expect(isOperationResumable(summary)).toBe(false)
  })

  it('should return false for failed operations', () => {
    const summary = createSummary('failed', 5)
    expect(isOperationResumable(summary)).toBe(false)
  })
})

describe('getOperationTypeLabel', () => {
  it('should return correct labels for operation types', () => {
    expect(getOperationTypeLabel('pull_all')).toBe('Pull All')
    expect(getOperationTypeLabel('prune')).toBe('Prune')
    expect(getOperationTypeLabel('sync')).toBe('Sync')
  })

  it('should return the type itself for unknown types', () => {
    expect(getOperationTypeLabel('unknown' as any)).toBe('unknown')
  })
})

describe('getOperationStatusLabel', () => {
  it('should return correct labels for status types', () => {
    expect(getOperationStatusLabel('running')).toBe('Running')
    expect(getOperationStatusLabel('paused')).toBe('Paused')
    expect(getOperationStatusLabel('interrupted')).toBe('Interrupted')
    expect(getOperationStatusLabel('completed')).toBe('Completed')
    expect(getOperationStatusLabel('failed')).toBe('Failed')
  })

  it('should return the status itself for unknown status', () => {
    expect(getOperationStatusLabel('unknown' as any)).toBe('unknown')
  })
})

describe('getHookEventLabel', () => {
  it('should return correct labels for hook events', () => {
    expect(getHookEventLabel('pre_add')).toBe('Pre-Add')
    expect(getHookEventLabel('post_add')).toBe('Post-Add')
    expect(getHookEventLabel('post_pull')).toBe('Post-Pull')
    expect(getHookEventLabel('post_switch')).toBe('Post-Switch')
    expect(getHookEventLabel('post_sync')).toBe('Post-Sync')
    expect(getHookEventLabel('pre_rm')).toBe('Pre-Remove')
    expect(getHookEventLabel('post_rm')).toBe('Post-Remove')
  })

  it('should return the event itself for unknown events', () => {
    expect(getHookEventLabel('unknown' as any)).toBe('unknown')
  })
})

describe('getHookScopeLabel', () => {
  it('should return correct labels for hook scopes', () => {
    expect(getHookScopeLabel('single')).toBe('Single Hook')
    expect(getHookScopeLabel('global_d')).toBe('Global Scripts')
    expect(getHookScopeLabel('repo_d')).toBe('Repository Scripts')
  })

  it('should return the scope itself for unknown scopes', () => {
    expect(getHookScopeLabel('unknown' as any)).toBe('unknown')
  })
})

describe('getConfigLayerLabel', () => {
  it('should return correct labels for config layers', () => {
    expect(getConfigLayerLabel('global')).toBe('Global (~/.wtrc)')
    expect(getConfigLayerLabel('project')).toBe('Project (.wtconfig)')
    expect(getConfigLayerLabel('repo')).toBe('Repository')
  })

  it('should return the layer itself for unknown layers', () => {
    expect(getConfigLayerLabel('unknown' as any)).toBe('unknown')
  })
})
