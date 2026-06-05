import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from './useKeyboardShortcuts'

/**
 * Mount a trivial component whose setup runs useKeyboardShortcuts so the
 * onMounted registration (and onUnmounted cleanup) fire on a real window.
 */
function mountWithShortcuts(handlers: KeyboardShortcutHandlers): VueWrapper {
  const Host = defineComponent({
    setup() {
      useKeyboardShortcuts(handlers)
      return () => null
    },
  })
  return mount(Host)
}

/**
 * Dispatch a keydown on window (capture phase listener) and return whether
 * default was prevented.
 */
function dispatchKey(init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('useKeyboardShortcuts focus gating', () => {
  beforeEach(() => {
    // Ensure no input is focused so isInputFocused() is false
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  })

  describe('copy (⌘C → onCopyPath)', () => {
    it('does not fire or preventDefault when no worktree is focused', () => {
      const onCopyPath = vi.fn()
      const wrapper = mountWithShortcuts({
        onCopyPath,
        onHasFocusedWorktree: () => false,
      })

      const prevented = dispatchKey({ key: 'c', metaKey: true })

      expect(onCopyPath).not.toHaveBeenCalled()
      expect(prevented).toBe(false)

      wrapper.unmount()
    })

    it('fires and preventDefault when a worktree is focused', () => {
      const onCopyPath = vi.fn()
      const wrapper = mountWithShortcuts({
        onCopyPath,
        onHasFocusedWorktree: () => true,
      })

      const prevented = dispatchKey({ key: 'c', metaKey: true })

      expect(onCopyPath).toHaveBeenCalledTimes(1)
      expect(prevented).toBe(true)

      wrapper.unmount()
    })
  })

  describe('terminal (⌘T → onOpenTerminal)', () => {
    it('does not fire or preventDefault when no worktree is focused', () => {
      const onOpenTerminal = vi.fn()
      const wrapper = mountWithShortcuts({
        onOpenTerminal,
        onHasFocusedWorktree: () => false,
      })

      const prevented = dispatchKey({ key: 't', metaKey: true })

      expect(onOpenTerminal).not.toHaveBeenCalled()
      expect(prevented).toBe(false)

      wrapper.unmount()
    })

    it('fires and preventDefault when a worktree is focused', () => {
      const onOpenTerminal = vi.fn()
      const wrapper = mountWithShortcuts({
        onOpenTerminal,
        onHasFocusedWorktree: () => true,
      })

      const prevented = dispatchKey({ key: 't', metaKey: true })

      expect(onOpenTerminal).toHaveBeenCalledTimes(1)
      expect(prevented).toBe(true)

      wrapper.unmount()
    })
  })

  describe('open all (⌘Enter → onOpenAll)', () => {
    it('does not fire or preventDefault when no worktree is focused', () => {
      const onOpenAll = vi.fn()
      const wrapper = mountWithShortcuts({
        onOpenAll,
        onHasFocusedWorktree: () => false,
      })

      const prevented = dispatchKey({ key: 'Enter', metaKey: true })

      expect(onOpenAll).not.toHaveBeenCalled()
      expect(prevented).toBe(false)

      wrapper.unmount()
    })

    it('fires and preventDefault when a worktree is focused', () => {
      const onOpenAll = vi.fn()
      const wrapper = mountWithShortcuts({
        onOpenAll,
        onHasFocusedWorktree: () => true,
      })

      const prevented = dispatchKey({ key: 'Enter', metaKey: true })

      expect(onOpenAll).toHaveBeenCalledTimes(1)
      expect(prevented).toBe(true)

      wrapper.unmount()
    })
  })

  it('does not gate ungated shortcuts on focus (⌘R still fires)', () => {
    const onRefresh = vi.fn()
    const wrapper = mountWithShortcuts({
      onRefresh,
      onHasFocusedWorktree: () => false,
    })

    const prevented = dispatchKey({ key: 'r', metaKey: true })

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(prevented).toBe(true)

    wrapper.unmount()
  })

  describe('go to overview (⌘0 → onGoToOverview)', () => {
    it('fires and prevents default with the modifier held', () => {
      const onGoToOverview = vi.fn()
      const wrapper = mountWithShortcuts({ onGoToOverview })

      const prevented = dispatchKey({ key: '0', metaKey: true })

      expect(onGoToOverview).toHaveBeenCalledTimes(1)
      expect(prevented).toBe(true)

      wrapper.unmount()
    })

    it('does not fire without the modifier', () => {
      const onGoToOverview = vi.fn()
      const wrapper = mountWithShortcuts({ onGoToOverview })

      const prevented = dispatchKey({ key: '0' })

      expect(onGoToOverview).not.toHaveBeenCalled()
      expect(prevented).toBe(false)

      wrapper.unmount()
    })
  })
})
