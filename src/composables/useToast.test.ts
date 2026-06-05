import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from './useToast'

/**
 * useToast wraps @stuntrocket/ui's useToastStack, which holds its toast
 * array and timer map in module-level singletons. That state is shared
 * across every useToast() call and persists between tests, so each test
 * must drain the stack first to stay isolated.
 */
function resetToasts() {
  const { toasts, removeToast } = useToast()
  // Copy ids before mutating, since removeToast splices the shared array.
  for (const id of toasts.value.map((t) => t.id)) {
    removeToast(id)
  }
}

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetToasts()
  })

  afterEach(() => {
    resetToasts()
    vi.useRealTimers()
  })

  describe('basic toast operations', () => {
    it('should add a success toast', () => {
      const { toast, toasts } = useToast()

      toast.success('Operation successful')

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].message).toBe('Operation successful')
      expect(toasts.value[0].variant).toBe('success')
    })

    it('should add an error toast', () => {
      const { toast, toasts } = useToast()

      toast.error('Something went wrong')

      expect(toasts.value[0].variant).toBe('error')
    })

    it('should add a warning toast', () => {
      const { toast, toasts } = useToast()

      toast.warning('Please check your input')

      expect(toasts.value[0].variant).toBe('warning')
    })

    it('should add an info toast', () => {
      const { toast, toasts } = useToast()

      toast.info('New update available')

      expect(toasts.value[0].variant).toBe('info')
    })

    it('should generate unique IDs for each toast', () => {
      const { toast, toasts } = useToast()

      toast.success('First')
      toast.success('Second')

      expect(toasts.value[0].id).not.toBe(toasts.value[1].id)
    })
  })

  describe('toast options', () => {
    it('should respect custom duration', () => {
      const { toast, toasts } = useToast()

      toast.success('Quick toast', { duration: 1000 })

      expect(toasts.value[0].duration).toBe(1000)
    })

    it('should default to the stack duration when none is given', () => {
      const { toast, toasts } = useToast()

      toast.success('Default toast')

      // @stuntrocket/ui useToastStack defaults to 4000ms.
      expect(toasts.value[0].duration).toBe(4000)
    })
  })

  describe('auto-dismiss', () => {
    it('should auto-dismiss after default duration', () => {
      const { toast, toasts } = useToast()

      toast.success('Auto dismiss')
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(4000) // default stack duration

      expect(toasts.value).toHaveLength(0)
    })

    it('should auto-dismiss after custom duration', () => {
      const { toast, toasts } = useToast()

      toast.success('Custom duration', { duration: 2000 })

      vi.advanceTimersByTime(1999)
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(1)
      expect(toasts.value).toHaveLength(0)
    })
  })

  describe('manual removal', () => {
    it('should remove a toast by ID', () => {
      const { toast, toasts, removeToast } = useToast()

      toast.success('Removable')
      expect(toasts.value).toHaveLength(1)

      removeToast(toasts.value[0].id)
      expect(toasts.value).toHaveLength(0)
    })

    it('should clear the pending timer when manually removing', () => {
      const { toast, toasts, removeToast } = useToast()
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      toast.success('With timer')
      removeToast(toasts.value[0].id)

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('should handle removing a non-existent toast gracefully', () => {
      const { removeToast, toasts } = useToast()

      expect(() => removeToast('non-existent-id')).not.toThrow()
      expect(toasts.value).toHaveLength(0)
    })

    it('should only remove the targeted toast', () => {
      const { toast, toasts, removeToast } = useToast()

      toast.success('Keep me')
      toast.error('Remove me')
      const removeId = toasts.value[1].id

      removeToast(removeId)

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].message).toBe('Keep me')
    })
  })

  describe('showWtError', () => {
    it('should show an error toast for a WtError', () => {
      const { toasts, showWtError } = useToast()

      const wtError = {
        code: 'CLI_NOT_FOUND',
        message: 'grove CLI not found in PATH',
      }

      showWtError(wtError)

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].variant).toBe('error')
      expect(toasts.value[0].message).toContain('CLI Not Installed')
      expect(toasts.value[0].message).toContain('grove CLI not found in PATH')
    })

    it('should append the suggested action to the message', () => {
      const { toasts, showWtError } = useToast()

      showWtError({ code: 'CLI_NOT_FOUND', message: 'Not found' })

      expect(toasts.value[0].message).toContain(
        "Install the grove CLI tool and ensure it's in your PATH",
      )
    })

    it('should show the fallback message for a non-WtError', () => {
      const { toasts, showWtError } = useToast()

      showWtError(new Error('Regular error'), 'Custom fallback')

      expect(toasts.value[0].message).toBe('Custom fallback')
      expect(toasts.value[0].variant).toBe('error')
    })

    it('should use a longer duration for errors with actions', () => {
      const { toasts, showWtError } = useToast()

      // CLI_NOT_FOUND has an associated action.
      showWtError({ code: 'CLI_NOT_FOUND', message: 'Not found' })

      expect(toasts.value[0].duration).toBe(8000)
    })

    it('should use the standard duration for errors without actions', () => {
      const { toasts, showWtError } = useToast()

      // GENERIC_ERROR has no associated action.
      showWtError({ code: 'GENERIC_ERROR', message: 'Something failed' })

      expect(toasts.value[0].duration).toBe(5000)
    })
  })
})
