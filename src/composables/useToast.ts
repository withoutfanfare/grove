/**
 * Toast Notification Composable
 *
 * Wraps the @stuntrocket/ui useToastStack composable to provide
 * a domain-specific API with WtError-aware formatting.
 *
 * All toast state is delegated to the library's module-level singleton,
 * ensuring SToastContainer renders toasts from this composable.
 */
import { useToastStack } from '@stuntrocket/ui'
import { getErrorTitle, getErrorAction } from '../utils/errorHandling'
import { isWtError } from '../types/wt'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  duration?: number
}

/**
 * Show an error toast with WtError-aware formatting.
 *
 * If the error is a WtError, uses the error code to provide a user-friendly
 * title and longer duration if there's a suggested action.
 *
 * @param error - The error to display (WtError or unknown)
 * @param fallbackMessage - Message to show if error is not a WtError
 */
function showWtError(
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void,
  error: unknown,
  fallbackMessage = 'An error occurred',
): void {
  if (isWtError(error)) {
    const title = getErrorTitle(error.code)
    const action = getErrorAction(error.code)

    // Build message: title + error message + optional action hint
    let message = `${title}: ${error.message}`
    if (action) {
      message += ` — ${action}`
    }

    addToast(message, 'error', action ? 8000 : 5000)
  } else {
    addToast(fallbackMessage, 'error')
  }
}

/**
 * Toast notification composable
 *
 * Delegates to @stuntrocket/ui useToastStack for shared state with SToastContainer.
 *
 * Usage:
 * ```ts
 * const { toast, showWtError } = useToast()
 *
 * toast.success('Worktree created successfully')
 * toast.error('Failed to delete worktree')
 * toast.warning('Uncommitted changes detected')
 * toast.info('Syncing with remote...')
 *
 * // Error-aware toast for WtError responses
 * try {
 *   await someOperation()
 * } catch (error) {
 *   showWtError(error, 'Operation failed')
 * }
 * ```
 */
export function useToast() {
  const stack = useToastStack()

  return {
    toasts: stack.toasts,
    removeToast: stack.removeToast,
    showWtError: (error: unknown, fallbackMessage?: string) =>
      showWtError(stack.addToast, error, fallbackMessage),
    toast: {
      success: (message: string, options?: ToastOptions) =>
        stack.success(message, options?.duration),
      error: (message: string, options?: ToastOptions) =>
        stack.error(message, options?.duration),
      warning: (message: string, options?: ToastOptions) =>
        stack.warning(message, options?.duration),
      info: (message: string, options?: ToastOptions) =>
        stack.info(message, options?.duration),
    },
  }
}
