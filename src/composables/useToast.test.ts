import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast } from './useToast'
import { nextTick } from 'vue'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    const { clearAll } = useToast()
    clearAll()
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

    it('should be dismissible by default', () => {
      const { toast, toasts } = useToast()
      
      toast.success('Dismissible toast')
      
      expect(toasts.value[0].dismissible).toBe(true)
    })

    it('should allow non-dismissible toasts', () => {
      const { toast, toasts } = useToast()
      
      toast.success('Locked toast', { dismissible: false })
      
      expect(toasts.value[0].dismissible).toBe(false)
    })

    it('should include action when provided', () => {
      const { toast, toasts } = useToast()
      const actionFn = vi.fn()
      
      toast.success('Action toast', {
        action: {
          label: 'Undo',
          onClick: actionFn,
        },
      })
      
      expect(toasts.value[0].action).toBeDefined()
      expect(toasts.value[0].action?.label).toBe('Undo')
      
      // Verify the action works
      toasts.value[0].action?.onClick()
      expect(actionFn).toHaveBeenCalled()
    })
  })

  describe('auto-dismiss', () => {
    it('should auto-dismiss after default duration', () => {
      const { toast, toasts } = useToast()
      
      toast.success('Auto dismiss')
      expect(toasts.value).toHaveLength(1)
      
      vi.advanceTimersByTime(4000) // DEFAULT_DURATION
      
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

    it('should not auto-dismiss when duration is 0', () => {
      const { toast, toasts } = useToast()
      
      toast.success('Persistent', { duration: 0 })
      
      vi.advanceTimersByTime(100000)
      expect(toasts.value).toHaveLength(1)
    })
  })

  describe('manual removal', () => {
    it('should remove toast by ID', () => {
      const { toast, toasts, removeToast } = useToast()
      
      const id = toast.success('Removable')
      expect(toasts.value).toHaveLength(1)
      
      removeToast(id)
      expect(toasts.value).toHaveLength(0)
    })

    it('should clear timer when manually removing', () => {
      const { toast, toasts, removeToast } = useToast()
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      
      const id = toast.success('With timer')
      removeToast(id)
      
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('should handle removing non-existent toast gracefully', () => {
      const { removeToast, toasts } = useToast()
      
      expect(() => removeToast('non-existent-id')).not.toThrow()
      expect(toasts.value).toHaveLength(0)
    })
  })

  describe('queue management (M14)', () => {
    it('should queue toasts when max visible reached', () => {
      const { toast, toasts } = useToast()
      
      // Add 5 toasts (max visible is 3)
      for (let i = 0; i < 5; i++) {
        toast.success(`Toast ${i + 1}`)
      }
      
      expect(toasts.value).toHaveLength(3)
      expect(toasts.value[0].message).toBe('Toast 1')
    })

    it('should show queued toast when visible one is dismissed', () => {
      const { toast, toasts, removeToast } = useToast()
      
      // Add 4 toasts
      const id1 = toast.success('Toast 1')
      toast.success('Toast 2')
      toast.success('Toast 3')
      toast.success('Toast 4')
      
      expect(toasts.value).toHaveLength(3)
      
      // Remove first toast
      removeToast(id1)
      
      expect(toasts.value).toHaveLength(3)
      expect(toasts.value[2].message).toBe('Toast 4')
    })

    it('should process multiple queued toasts when multiple are dismissed', () => {
      const { toast, toasts, removeToast } = useToast()
      
      // Add 5 toasts
      const id1 = toast.success('Toast 1')
      const id2 = toast.success('Toast 2')
      toast.success('Toast 3')
      toast.success('Toast 4')
      toast.success('Toast 5')
      
      // Remove 2 toasts
      removeToast(id1)
      removeToast(id2)
      
      expect(toasts.value).toHaveLength(3)
      // Toast 4 and 5 should now be visible
      const messages = toasts.value.map(t => t.message)
      expect(messages).toContain('Toast 4')
      expect(messages).toContain('Toast 5')
    })
  })

  describe('clearAll', () => {
    it('should remove all toasts and clear queue', () => {
      const { toast, toasts, clearAll } = useToast()
      
      // Add many toasts
      for (let i = 0; i < 10; i++) {
        toast.success(`Toast ${i + 1}`)
      }
      
      clearAll()
      
      expect(toasts.value).toHaveLength(0)
    })

    it('should clear all timers', () => {
      const { toast, clearAll } = useToast()
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
      
      toast.success('Toast 1')
      toast.success('Toast 2')
      clearAll()
      
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('showWtError', () => {
    it('should show error toast for WtError', () => {
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

    it('should show fallback message for non-WtError', () => {
      const { toasts, showWtError } = useToast()
      
      showWtError(new Error('Regular error'), 'Custom fallback')
      
      expect(toasts.value[0].message).toBe('Custom fallback')
    })

    it('should use longer duration for errors with actions', () => {
      const { toasts, showWtError } = useToast()
      
      // CLI_NOT_FOUND has an associated action
      showWtError({ code: 'CLI_NOT_FOUND', message: 'Not found' })
      
      expect(toasts.value[0].duration).toBe(8000)
    })

    it('should use standard duration for errors without actions', () => {
      const { toasts, showWtError } = useToast()
      
      // GENERIC_ERROR has no associated action
      showWtError({ code: 'GENERIC_ERROR', message: 'Something failed' })
      
      expect(toasts.value[0].duration).toBe(5000)
    })
  })
})
