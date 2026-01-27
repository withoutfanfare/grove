/**
 * Error Handling Utilities
 *
 * Provides user-friendly error messages, titles, and suggested actions
 * based on WtErrorCode values from the CLI.
 */
import type { WtErrorCode } from '../types/wt'

/**
 * Get a user-friendly title for an error code.
 *
 * These titles are shown in toast notifications and error dialogs.
 */
export function getErrorTitle(code: WtErrorCode | string): string {
  const titles: Record<string, string> = {
    // Input validation
    INVALID_INPUT: 'Invalid Input',
    INVALID_BRANCH: 'Invalid Branch Name',
    INVALID_REPO: 'Invalid Repository',
    INVALID_PATH: 'Invalid Path',
    // Not found
    REPO_NOT_FOUND: 'Repository Not Found',
    BRANCH_NOT_FOUND: 'Branch Not Found',
    WORKTREE_NOT_FOUND: 'Worktree Not Found',
    CONFIG_NOT_FOUND: 'Configuration Not Found',
    // Git operations
    GIT_ERROR: 'Git Error',
    WORKTREE_EXISTS: 'Worktree Already Exists',
    PROTECTED_BRANCH: 'Protected Branch',
    // System
    CLI_NOT_FOUND: 'CLI Not Installed',
    COMMAND_FAILED: 'Command Failed',
    PARSE_ERROR: 'Parse Error',
    IO_ERROR: 'File System Error',
    DB_ERROR: 'Database Error',
    HOOK_FAILED: 'Hook Failed',
    // Internal
    OUTPUT_TOO_LARGE: 'Output Too Large',
    SPAWN_ERROR: 'Task Error',
    THREAD_POOL_ERROR: 'System Error',
  }
  return titles[code] || 'Error'
}

/**
 * Check if an error is retryable.
 *
 * Retryable errors are transient failures that may succeed on retry.
 */
export function isRetryableError(code: WtErrorCode | string): boolean {
  const retryable = ['COMMAND_FAILED', 'IO_ERROR', 'GIT_ERROR', 'HOOK_FAILED']
  return retryable.includes(code)
}

/**
 * Get a suggested action for an error.
 *
 * Returns a helpful hint for the user, or null if no specific action is suggested.
 */
export function getErrorAction(code: WtErrorCode | string): string | null {
  const actions: Record<string, string> = {
    CLI_NOT_FOUND: "Install the wt CLI tool and ensure it's in your PATH",
    REPO_NOT_FOUND: 'Check the repository name and try again',
    BRANCH_NOT_FOUND: 'Fetch the latest branches and try again',
    WORKTREE_NOT_FOUND: 'The worktree may have been removed. Refresh the list.',
    PROTECTED_BRANCH: 'Use the force option to operate on this branch',
    WORKTREE_EXISTS: 'A worktree already exists for this branch',
    CONFIG_NOT_FOUND: 'Run wt setup to configure the tool',
    INVALID_BRANCH: 'Branch names must not start with - or contain special characters',
    INVALID_REPO: 'Repository names must be alphanumeric with hyphens, underscores, or dots',
    OUTPUT_TOO_LARGE: 'The operation produced too much output. Try a more specific command.',
  }
  return actions[code] || null
}

/**
 * Check if an error indicates a missing CLI installation.
 */
export function isCliMissingError(code: WtErrorCode | string): boolean {
  return code === 'CLI_NOT_FOUND'
}

/**
 * Check if an error is related to input validation.
 */
export function isValidationError(code: WtErrorCode | string): boolean {
  return (
    code === 'INVALID_INPUT' ||
    code === 'INVALID_BRANCH' ||
    code === 'INVALID_REPO' ||
    code === 'INVALID_PATH'
  )
}

/**
 * Check if an error is related to something not being found.
 */
export function isNotFoundError(code: WtErrorCode | string): boolean {
  return (
    code === 'REPO_NOT_FOUND' ||
    code === 'BRANCH_NOT_FOUND' ||
    code === 'WORKTREE_NOT_FOUND' ||
    code === 'CONFIG_NOT_FOUND'
  )
}
