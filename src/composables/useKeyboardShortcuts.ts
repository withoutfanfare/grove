import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useMagicKeys } from '@vueuse/core'

/**
 * Platform detection and modifier key handling
 */
export function usePlatform() {
  const isMac = computed(() => {
    // Check for macOS platform
    if (typeof navigator !== 'undefined') {
      return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    }
    return false
  })

  const modifierKey = computed(() => (isMac.value ? 'Meta' : 'Control'))
  const modifierSymbol = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

  /**
   * Format a shortcut for display (e.g., "⌘R" or "Ctrl+R")
   */
  function formatShortcut(key: string, includeModifier = true): string {
    if (!includeModifier) {
      return key.toUpperCase()
    }
    return isMac.value
      ? `${modifierSymbol.value}${key.toUpperCase()}`
      : `${modifierSymbol.value}+${key.toUpperCase()}`
  }

  return {
    isMac,
    modifierKey,
    modifierSymbol,
    formatShortcut,
  }
}

/**
 * Check if the current focus is on an input element
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement
  if (!activeElement) return false

  const tagName = activeElement.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  // Check for contenteditable
  if (activeElement.getAttribute('contenteditable') === 'true') {
    return true
  }

  return false
}

/**
 * Shortcut definition interface
 */
export interface ShortcutDefinition {
  key: string
  description: string
  action: () => void
  /** Whether this shortcut requires the modifier key (Cmd/Ctrl) */
  requiresModifier?: boolean
  /** Whether this shortcut requires the Shift key */
  requiresShift?: boolean
  /** Whether this shortcut requires the Alt/Option key */
  requiresAlt?: boolean
  /** Whether this shortcut should work even when input is focused */
  allowInInput?: boolean
}

/**
 * Shortcut handlers interface for the composable
 */
export interface KeyboardShortcutHandlers {
  onRefresh?: () => void
  onCreateWorktree?: () => void
  onOpenSettings?: () => void
  onCloseModal?: () => void
  onNavigateUp?: () => void
  onNavigateDown?: () => void
  onSelectItem?: () => void
  onQuickSelect?: (index: number) => void
  onOpenEditor?: () => void
  onOpenTerminal?: () => void
  onOpenBrowser?: () => void
  // L12: Focus search input
  onFocusSearch?: () => void
  // Repo management modal
  onOpenRepoManagement?: () => void
  // Help
  onOpenHelp?: () => void
  // Phase 1 Quick Actions: Copy and Open All
  onCopyPath?: () => void
  onCopyBranch?: () => void
  onCopyUrl?: () => void
  onCopyCdCommand?: () => void
  onOpenAll?: () => void
  onCommandPalette?: () => void
}

/**
 * Keyboard shortcuts composable for wt-app
 *
 * Provides comprehensive keyboard navigation and shortcuts for power users.
 * Automatically detects platform for correct modifier key display.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers = {}) {
  const { isMac, formatShortcut } = usePlatform()
  const isEnabled = ref(true)

  // Track registered shortcuts for cleanup
  const registeredShortcuts: Array<() => void> = []

  // Use VueUse's magic keys for modifier detection (kept for potential future use)
  useMagicKeys()

  /**
   * Register a keyboard shortcut
   */
  function registerShortcut(definition: ShortcutDefinition): () => void {
    const handler = (event: KeyboardEvent) => {
      if (!isEnabled.value) return

      // Check if we should skip due to input focus
      if (!definition.allowInInput && isInputFocused()) return

      // Check modifier key requirement (Cmd/Ctrl)
      const hasModifier = event.metaKey || event.ctrlKey
      const requiresModifier = definition.requiresModifier !== false

      if (requiresModifier && !hasModifier) return
      if (!requiresModifier && hasModifier) return

      // Check Shift key requirement
      const requiresShift = definition.requiresShift === true
      if (requiresShift !== event.shiftKey) return

      // Check Alt/Option key requirement
      const requiresAlt = definition.requiresAlt === true
      if (requiresAlt !== event.altKey) return

      // Check the key
      if (event.key.toLowerCase() !== definition.key.toLowerCase()) return

      // Prevent default browser behaviour
      event.preventDefault()
      event.stopPropagation()

      // C5 Fix: Wrap handler execution in try-catch to prevent unhandled errors
      // from crashing the app or leaving it in an inconsistent state
      try {
        definition.action()
      } catch (error) {
        console.error('[useKeyboardShortcuts] Handler error:', error)
      }
    }

    window.addEventListener('keydown', handler, { capture: true })

    const cleanup = () => {
      window.removeEventListener('keydown', handler, { capture: true })
    }

    registeredShortcuts.push(cleanup)
    return cleanup
  }

  /**
   * Enable/disable all shortcuts
   */
  function setEnabled(enabled: boolean) {
    isEnabled.value = enabled
  }

  // Global shortcuts with Cmd/Ctrl modifier
  const globalShortcuts: ShortcutDefinition[] = [
    {
      key: 'r',
      description: 'Refresh current view',
      action: () => handlers.onRefresh?.(),
      requiresModifier: true,
    },
    {
      key: 'n',
      description: 'Create new worktree',
      action: () => handlers.onCreateWorktree?.(),
      requiresModifier: true,
    },
    {
      key: ',',
      description: 'Open settings',
      action: () => handlers.onOpenSettings?.(),
      requiresModifier: true,
    },
    {
      key: "m",
      description: "Open repository management",
      action: () => handlers.onOpenRepoManagement?.(),
      requiresModifier: true,
    },
    {
      key: 'o',
      description: 'Open in editor',
      action: () => handlers.onOpenEditor?.(),
      requiresModifier: true,
    },
    {
      key: 't',
      description: 'Open in terminal',
      action: () => handlers.onOpenTerminal?.(),
      requiresModifier: true,
    },
    {
      key: 'b',
      description: 'Open in browser',
      action: () => handlers.onOpenBrowser?.(),
      requiresModifier: true,
    },
    // L12: Cmd+F to focus search
    {
      key: 'f',
      description: 'Focus search input',
      action: () => handlers.onFocusSearch?.(),
      requiresModifier: true,
    },
  ]

  // ? key without modifier to open help
  const helpShortcut: ShortcutDefinition = {
    key: '?',
    description: 'Open help',
    action: () => handlers.onOpenHelp?.(),
    requiresModifier: false,
    requiresShift: true, // ? requires shift on most keyboards
  }

  // L12: / key without modifier to focus search (like many apps)
  const searchShortcut: ShortcutDefinition = {
    key: '/',
    description: 'Focus search input',
    action: () => handlers.onFocusSearch?.(),
    requiresModifier: false,
  }

  // Phase 1 Quick Actions: Copy shortcuts
  const copyShortcuts: ShortcutDefinition[] = [
    {
      key: 'c',
      description: 'Copy worktree path',
      action: () => handlers.onCopyPath?.(),
      requiresModifier: true,
      requiresShift: false,
      requiresAlt: false,
    },
    {
      key: 'c',
      description: 'Copy branch name',
      action: () => handlers.onCopyBranch?.(),
      requiresModifier: true,
      requiresShift: true,
      requiresAlt: false,
    },
    {
      key: 'c',
      description: 'Copy URL',
      action: () => handlers.onCopyUrl?.(),
      requiresModifier: true,
      requiresShift: false,
      requiresAlt: true,
    },
    {
      key: 'd',
      description: 'Copy cd command',
      action: () => handlers.onCopyCdCommand?.(),
      requiresModifier: true,
      requiresShift: true,
      requiresAlt: false,
    },
  ]

  // Phase 1 Quick Actions: Open All shortcut (Cmd+Return)
  const openAllShortcut: ShortcutDefinition = {
    key: 'Enter',
    description: 'Open all (terminal, editor, browser)',
    action: () => handlers.onOpenAll?.(),
    requiresModifier: true,
    requiresShift: false,
    requiresAlt: false,
  }

  // Navigation shortcuts without modifier
  const navigationShortcuts: ShortcutDefinition[] = [
    {
      key: 'Escape',
      description: 'Close modal/panel',
      action: () => handlers.onCloseModal?.(),
      requiresModifier: false,
    },
    {
      key: 'ArrowUp',
      description: 'Navigate up',
      action: () => handlers.onNavigateUp?.(),
      requiresModifier: false,
    },
    {
      key: 'ArrowDown',
      description: 'Navigate down',
      action: () => handlers.onNavigateDown?.(),
      requiresModifier: false,
    },
    {
      key: 'Enter',
      description: 'Select item',
      action: () => handlers.onSelectItem?.(),
      requiresModifier: false,
    },
  ]

  // Quick select shortcuts (Cmd/Ctrl + 1-9)
  const quickSelectShortcuts: ShortcutDefinition[] = []
  for (let i = 1; i <= 9; i++) {
    quickSelectShortcuts.push({
      key: String(i),
      description: `Quick select repository ${i}`,
      action: () => handlers.onQuickSelect?.(i - 1),
      requiresModifier: true,
    })
  }

  /**
   * Initialise all shortcuts
   */
  function init() {
    // Register global shortcuts
    globalShortcuts.forEach((shortcut) => {
      registerShortcut(shortcut)
    })

    // Register navigation shortcuts
    navigationShortcuts.forEach((shortcut) => {
      registerShortcut(shortcut)
    })

    // Register quick select shortcuts
    quickSelectShortcuts.forEach((shortcut) => {
      registerShortcut(shortcut)
    })

    // Command palette (Cmd+K)
    registerShortcut({
      key: 'k',
      description: 'Open command palette',
      action: () => handlers.onCommandPalette?.(),
      requiresModifier: true,
    })

    // L12: Register search shortcut (/ key)
    registerShortcut(searchShortcut)

    // Register help shortcut (? key)
    registerShortcut(helpShortcut)

    // Phase 1 Quick Actions: Register copy shortcuts
    copyShortcuts.forEach((shortcut) => {
      registerShortcut(shortcut)
    })

    // Phase 1 Quick Actions: Register Open All shortcut
    registerShortcut(openAllShortcut)
  }

  /**
   * Cleanup all shortcuts
   */
  function cleanup() {
    registeredShortcuts.forEach((unregister) => unregister())
    registeredShortcuts.length = 0
  }

  // Auto-initialise and cleanup on mount/unmount
  onMounted(() => {
    init()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    isEnabled,
    setEnabled,
    registerShortcut,
    formatShortcut,
    isMac,
    cleanup,
  }
}

/**
 * Generate tooltip text with keyboard shortcut hint
 */
export function useShortcutTooltip() {
  const { formatShortcut } = usePlatform()

  /**
   * Create a tooltip with shortcut hint
   * @param label - The base label text
   * @param shortcutKey - The keyboard shortcut key (e.g., 'R')
   * @param hasModifier - Whether the shortcut requires Cmd/Ctrl
   */
  function tooltipWithShortcut(
    label: string,
    shortcutKey: string,
    hasModifier = true
  ): string {
    const shortcut = formatShortcut(shortcutKey, hasModifier)
    return `${label} (${shortcut})`
  }

  return {
    tooltipWithShortcut,
    formatShortcut,
  }
}

/**
 * Hook for handling focused item navigation in lists
 */
export function useListNavigation<T>(items: () => T[]) {
  const focusedIndex = ref(-1)

  function navigateUp() {
    if (isInputFocused()) return

    const itemList = items()
    if (itemList.length === 0) return

    if (focusedIndex.value <= 0) {
      focusedIndex.value = itemList.length - 1
    } else {
      focusedIndex.value--
    }
  }

  function navigateDown() {
    if (isInputFocused()) return

    const itemList = items()
    if (itemList.length === 0) return

    if (focusedIndex.value >= itemList.length - 1) {
      focusedIndex.value = 0
    } else {
      focusedIndex.value++
    }
  }

  function selectIndex(index: number) {
    const itemList = items()
    if (index >= 0 && index < itemList.length) {
      focusedIndex.value = index
    }
  }

  function getCurrentItem(): T | null {
    const itemList = items()
    if (focusedIndex.value >= 0 && focusedIndex.value < itemList.length) {
      return itemList[focusedIndex.value]
    }
    return null
  }

  function reset() {
    focusedIndex.value = -1
  }

  return {
    focusedIndex,
    navigateUp,
    navigateDown,
    selectIndex,
    getCurrentItem,
    reset,
  }
}
