import { describe, it, expect } from 'vitest'
import {
  getErrorTitle,
  isRetryableError,
  getErrorAction,
  isCliMissingError,
  isValidationError,
  isNotFoundError,
} from './errorHandling'

describe('getErrorTitle', () => {
  it('should return title for known error codes', () => {
    expect(getErrorTitle('CLI_NOT_FOUND')).toBe('CLI Not Installed')
    expect(getErrorTitle('REPO_NOT_FOUND')).toBe('Repository Not Found')
    expect(getErrorTitle('GIT_ERROR')).toBe('Git Error')
    expect(getErrorTitle('INVALID_INPUT')).toBe('Invalid Input')
  })

  it('should return "Error" for unknown codes', () => {
    expect(getErrorTitle('UNKNOWN_CODE')).toBe('Error')
    expect(getErrorTitle('SOMETHING_RANDOM')).toBe('Error')
  })

  it('should handle all documented error codes', () => {
    const codes = [
      'INVALID_INPUT',
      'INVALID_BRANCH',
      'INVALID_REPO',
      'INVALID_PATH',
      'REPO_NOT_FOUND',
      'BRANCH_NOT_FOUND',
      'WORKTREE_NOT_FOUND',
      'CONFIG_NOT_FOUND',
      'GIT_ERROR',
      'WORKTREE_EXISTS',
      'PROTECTED_BRANCH',
      'CLI_NOT_FOUND',
      'COMMAND_FAILED',
      'PARSE_ERROR',
      'IO_ERROR',
      'DB_ERROR',
      'HOOK_FAILED',
      'OUTPUT_TOO_LARGE',
      'SPAWN_ERROR',
      'THREAD_POOL_ERROR',
    ]

    codes.forEach(code => {
      const title = getErrorTitle(code)
      expect(title).not.toBe('Error')
      expect(typeof title).toBe('string')
      expect(title.length).toBeGreaterThan(0)
    })
  })
})

describe('isRetryableError', () => {
  it('should return true for retryable errors', () => {
    expect(isRetryableError('COMMAND_FAILED')).toBe(true)
    expect(isRetryableError('IO_ERROR')).toBe(true)
    expect(isRetryableError('GIT_ERROR')).toBe(true)
    expect(isRetryableError('HOOK_FAILED')).toBe(true)
  })

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError('CLI_NOT_FOUND')).toBe(false)
    expect(isRetryableError('INVALID_INPUT')).toBe(false)
    expect(isRetryableError('REPO_NOT_FOUND')).toBe(false)
    expect(isRetryableError('PARSE_ERROR')).toBe(false)
  })

  it('should return false for unknown error codes', () => {
    expect(isRetryableError('UNKNOWN')).toBe(false)
  })
})

describe('getErrorAction', () => {
  it('should return action for known error codes', () => {
    expect(getErrorAction('CLI_NOT_FOUND')).toContain('wt CLI')
    expect(getErrorAction('REPO_NOT_FOUND')).toContain('repository name')
    expect(getErrorAction('WORKTREE_EXISTS')).toContain('already exists')
  })

  it('should return null for codes without specific actions', () => {
    expect(getErrorAction('COMMAND_FAILED')).toBeNull()
    expect(getErrorAction('PARSE_ERROR')).toBeNull()
    expect(getErrorAction('GIT_ERROR')).toBeNull()
  })

  it('should return null for unknown error codes', () => {
    expect(getErrorAction('UNKNOWN_CODE')).toBeNull()
  })

  it('should provide helpful actions for all actionable errors', () => {
    const actionableCodes = [
      'CLI_NOT_FOUND',
      'REPO_NOT_FOUND',
      'BRANCH_NOT_FOUND',
      'WORKTREE_NOT_FOUND',
      'PROTECTED_BRANCH',
      'WORKTREE_EXISTS',
      'CONFIG_NOT_FOUND',
      'INVALID_BRANCH',
      'INVALID_REPO',
      'OUTPUT_TOO_LARGE',
    ]

    actionableCodes.forEach(code => {
      const action = getErrorAction(code)
      expect(action).not.toBeNull()
      expect(typeof action).toBe('string')
      expect(action!.length).toBeGreaterThan(10)
    })
  })
})

describe('isCliMissingError', () => {
  it('should return true for CLI_NOT_FOUND', () => {
    expect(isCliMissingError('CLI_NOT_FOUND')).toBe(true)
  })

  it('should return false for other errors', () => {
    expect(isCliMissingError('COMMAND_FAILED')).toBe(false)
    expect(isCliMissingError('REPO_NOT_FOUND')).toBe(false)
    expect(isCliMissingError('INVALID_INPUT')).toBe(false)
  })
})

describe('isValidationError', () => {
  it('should return true for validation errors', () => {
    expect(isValidationError('INVALID_INPUT')).toBe(true)
    expect(isValidationError('INVALID_BRANCH')).toBe(true)
    expect(isValidationError('INVALID_REPO')).toBe(true)
    expect(isValidationError('INVALID_PATH')).toBe(true)
  })

  it('should return false for non-validation errors', () => {
    expect(isValidationError('CLI_NOT_FOUND')).toBe(false)
    expect(isValidationError('COMMAND_FAILED')).toBe(false)
    expect(isValidationError('GIT_ERROR')).toBe(false)
    expect(isValidationError('REPO_NOT_FOUND')).toBe(false)
  })
})

describe('isNotFoundError', () => {
  it('should return true for not found errors', () => {
    expect(isNotFoundError('REPO_NOT_FOUND')).toBe(true)
    expect(isNotFoundError('BRANCH_NOT_FOUND')).toBe(true)
    expect(isNotFoundError('WORKTREE_NOT_FOUND')).toBe(true)
    expect(isNotFoundError('CONFIG_NOT_FOUND')).toBe(true)
  })

  it('should return false for other errors', () => {
    expect(isNotFoundError('CLI_NOT_FOUND')).toBe(false)
    expect(isNotFoundError('INVALID_INPUT')).toBe(false)
    expect(isNotFoundError('COMMAND_FAILED')).toBe(false)
    expect(isNotFoundError('GIT_ERROR')).toBe(false)
  })
})
