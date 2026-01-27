/**
 * Toast Notification Composable
 *
 * Global toast state management for non-intrusive notifications.
 * Supports success, error, warning, and info variants with auto-dismiss.
 *
 * M14: Implements a queue system for toasts exceeding MAX_VISIBLE.
 * Queued toasts are shown as older visible toasts are dismissed.
 */
import { ref, readonly } from 'vue'
import { getErrorTitle, getErrorAction } from '../utils/errorHandling'
import { isWtError } from '../types/wt'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration: number
  dismissible: boolean
  action?: {
    label: string
    onClick: () => void
  }
}

export interface ToastOptions {
  duration?: number
  dismissible?: boolean
  action?: {
    label: string
    onClick: () => void
  }
}

const MAX_VISIBLE_TOASTS = 3
const DEFAULT_DURATION = 4000

// Global toast state - visible toasts
const toasts = ref<Toast[]>([])
// M14: Queue for toasts waiting to be shown
const toastQueue = ref<Toast[]>([])
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * M14: Process the queue - show next queued toast if space available
 */
function processQueue(): void {
  while (toasts.value.length < MAX_VISIBLE_TOASTS && toastQueue.value.length > 0) {
    const nextToast = toastQueue.value.shift()
    if (nextToast) {
      showToast(nextToast)
    }
  }
}

/**
 * Actually display a toast (internal function)
 */
function showToast(toast: Toast): void {
  toasts.value = [...toasts.value, toast]

  // Set auto-dismiss timer if duration > 0
  if (toast.duration > 0) {
    const timer = setTimeout(() => {
      removeToast(toast.id)
    }, toast.duration)
    timers.set(toast.id, timer)
  }
}

function addToast(message: string, variant: ToastVariant, options: ToastOptions = {}): string {
  const id = generateId()
  const duration = options.duration ?? DEFAULT_DURATION
  const dismissible = options.dismissible ?? true

  const toast: Toast = {
    id,
    message,
    variant,
    duration,
    dismissible,
    action: options.action,
  }

  // M14: If at max visible, add to queue instead of removing oldest
  if (toasts.value.length >= MAX_VISIBLE_TOASTS) {
    toastQueue.value = [...toastQueue.value, toast]
  } else {
    showToast(toast)
  }

  return id
}

function removeToast(id: string): void {
  // Clear timer if exists
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }

  // Remove from toasts array
  toasts.value = toasts.value.filter(t => t.id !== id)

  // M14: Process queue to show next waiting toast
  processQueue()
}

function clearAll(): void {
  // Clear all timers
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()

  // Clear all toasts and queue
  toasts.value = []
  toastQueue.value = []  // M14: Also clear the queue
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
function showWtError(error: unknown, fallbackMessage = 'An error occurred'): string {
  if (isWtError(error)) {
    const title = getErrorTitle(error.code)
    const action = getErrorAction(error.code)

    // Build message: title + error message + optional action hint
    let message = `${title}: ${error.message}`
    if (action) {
      message += `\n${action}`
    }

    return addToast(message, 'error', {
      duration: action ? 8000 : 5000, // Longer duration if there's an action hint
    })
  } else {
    return addToast(fallbackMessage, 'error')
  }
}

/**
 * Toast notification composable
 *
 * Usage:
 * ```ts
 * const { toast, toasts, showWtError } = useToast()
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
  return {
    toasts: readonly(toasts),
    removeToast,
    clearAll,
    showWtError,
    toast: {
      success: (message: string, options?: ToastOptions) =>
        addToast(message, 'success', options),
      error: (message: string, options?: ToastOptions) =>
        addToast(message, 'error', options),
      warning: (message: string, options?: ToastOptions) =>
        addToast(message, 'warning', options),
      info: (message: string, options?: ToastOptions) =>
        addToast(message, 'info', options),
    },
  }
}
