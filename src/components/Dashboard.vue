<script setup lang="ts">
/**
 * Dashboard Component
 *
 * The main application shell with sidebar, header, and content area.
 * Premium desktop-native design inspired by Linear, Raycast, and Arc.
 */
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDebounceFn } from '@vueuse/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useWorktreeStore } from '../stores'
import { useRepos, useWorktrees, useOperationProgress, useAutoRefresh, useSearch, useKeyboardShortcuts, useShortcutTooltip, useToast, useWorktreeWatcher, useResizableSidebar, useCommandRegistry } from '../composables'
import type { Worktree } from '../types'

// Components
import RepoList from './RepoList.vue'
import WorktreeCard from './WorktreeCard.vue'
import VirtualWorktreeList from './VirtualWorktreeList.vue'
import CreateWorktreeModal from './CreateWorktreeModal.vue'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import SettingsPanel from './SettingsPanel.vue'
import HelpModal from './HelpModal.vue'
import RepoManagementPanel from './RepoManagementPanel.vue'
import HealthPanel from './HealthPanel.vue'
import OperationProgressPanel from './OperationProgressPanel.vue'
import ErrorBoundary from './ErrorBoundary.vue'
import SearchInput from './SearchInput.vue'
import CommandPalette from './CommandPalette.vue'
import { Button, IconButton, SkeletonCard, ResizeHandle } from './ui'
import { copyPath, copyBranch, copyUrl, copyCdCommand } from '../utils/clipboard'

/**
 * L4: Number of worktrees above which the list switches from animated
 * TransitionGroup to a virtualised scroller for performance.
 * Below this count, smooth enter/leave animations provide better UX.
 */
const VIRTUALISATION_THRESHOLD = 50

// Store and composables
const store = useWorktreeStore()
const {
  selectedRepo,
  selectedRepoName,
  worktrees,
  loadingWorktrees,
  error,
  wtAvailable,
  focusedBranch,
  expandOnFocus,
} = storeToRefs(store)

const { fetchRepositories } = useRepos()
const {
  fetchWorktrees,
  pruneRepo,
  pullAllWorktrees,
  pullSelectedWorktrees,
  cancelOperation,
  openInEditor,
  openInTerminal,
  openInBrowser,
  openAll,
  pullWorktree,
  syncWorktree,
  cleanup: cleanupWorktrees,
} = useWorktrees()
const {
  isRefreshing: isAutoRefreshing,
  lastUpdatedText,
  start: startAutoRefresh,
  stop: stopAutoRefresh,
  refresh: triggerAutoRefresh,
  pause: pauseAutoRefresh,
  resume: resumeAutoRefresh,
} = useAutoRefresh()

// Search functionality
const { query: worktreeSearchQuery, filterWorktrees, clearQuery: clearWorktreeSearch } = useSearch()

// L12: Ref for search input focus
const searchInputRef = ref<{ focus: () => void } | null>(null)

// Filtered worktrees based on search
const filteredWorktrees = computed(() => filterWorktrees(worktrees.value))

// Content key for crossfade transitions when switching states
const contentKey = computed(() => {
  if (!selectedRepo.value) return 'empty'
  if (loadingWorktrees.value) return 'loading'
  return `repo-${selectedRepoName.value}`
})

// List stagger animation hooks
function onListBeforeEnter(el: Element) {
  const element = el as HTMLElement
  const index = Number(element.dataset.index) || 0
  const delay = Math.min(index * 40, 400)
  element.style.transitionDelay = `${delay}ms`
}

function onListAfterEnter(el: Element) {
  ;(el as HTMLElement).style.transitionDelay = ''
}

// M7: Use virtual scrolling based on filtered count, not total
const useVirtualScroll = computed(() => filteredWorktrees.value.length >= VIRTUALISATION_THRESHOLD)

// Shortcut tooltip helper
const { tooltipWithShortcut } = useShortcutTooltip()

// Toast notifications
const { toast } = useToast()

// File system watching for real-time updates
const { isWatching, startWatching, stopWatching, onWorktreeChanged } = useWorktreeWatcher()

// Resizable sidebar
const {
  width: sidebarWidth,
  isResizing: isSidebarResizing,
  startResize: startSidebarResize,
  resetWidth: resetSidebarWidth,
} = useResizableSidebar({
  defaultWidth: 300,
  minWidth: 200,
  maxWidth: 400,
  storageKey: 'wt-sidebar-width',
})

// Track the latest fetch request to handle race conditions
const fetchCounter = ref(0)

// Handle file system change events - triggers refresh (debounced)
const handleWorktreeChange = useDebounceFn(async () => {
  if (selectedRepoName.value) {
    await fetchWorktrees()
  }
}, 500)

// Register worktree change handler
const unregisterWatcher = onWorktreeChanged(() => {
  handleWorktreeChange()
})

// Initial load
onMounted(async () => {
  // Repository list is already loaded by App.vue during loading screen
  // Just set up auto-refresh and file watching if a repo is selected
  if (selectedRepoName.value) {
    await fetchWorktrees()
    // Start auto-refresh after initial load
    startAutoRefresh()
    // Start file watching for real-time updates
    await startWatching(selectedRepoName.value)
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopAutoRefresh()
  stopWatching()
  unregisterWatcher()
  cleanupWorktrees()
  // H3: Debounced handler is 500ms; unregisterWatcher() above prevents new
  // triggers, and cleanupWorktrees() clears state, so pending calls are harmless.
})

// Watch for repo selection changes with race condition protection
watch(selectedRepoName, async (newName, oldName) => {
  if (newName && newName !== oldName) {
    // Clear search when switching repositories
    clearWorktreeSearch()
    // Stop watching the old repo
    await stopWatching()
    const currentFetch = ++fetchCounter.value
    await fetchWorktrees()
    // H2: Guard against stale fetch — abort if another switch occurred during await
    if (currentFetch !== fetchCounter.value) return
    // Start auto-refresh for the new repository
    startAutoRefresh()
    // Start file watching for real-time updates
    if (currentFetch !== fetchCounter.value) return
    await startWatching(newName)
  } else if (!newName) {
    // Stop auto-refresh and watching when no repository is selected
    stopAutoRefresh()
    await stopWatching()
  }
})

function dismissError() {
  store.clearError()
}

// Helper to scroll focused worktree into view (retries until element appears in DOM)
function scrollToFocusedWorktree() {
  const branch = focusedBranch.value
  if (!branch) return

  let attempts = 0
  const maxAttempts = 15

  const tryScroll = () => {
    // Stop if focus was cleared while we were retrying
    if (focusedBranch.value !== branch) return

    const element = document.getElementById(`worktree-${branch}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => store.clearExpandOnFocus(), 500)
      setTimeout(() => store.clearFocusedWorktree(), 3000)
    } else if (++attempts < maxAttempts) {
      // Element not in DOM yet — retry (worktrees may still be loading)
      setTimeout(tryScroll, 200)
    }
  }

  setTimeout(tryScroll, 100)
}

// Watch for focused branch changes and scroll into view
watch(focusedBranch, (branch) => {
  if (branch) {
    scrollToFocusedWorktree()
  }
})

// Debounced refresh - uses auto-refresh to reset timer
const handleRefresh = useDebounceFn(async () => {
  await fetchRepositories()
  if (selectedRepoName.value) {
    // Use triggerAutoRefresh to fetch worktrees and reset the auto-refresh timer
    await triggerAutoRefresh()
  }
}, 300)

// Modal state
const showCreateModal = ref(false)
const showDeleteDialog = ref(false)
const showSettingsPanel = ref(false)
const showRepoManagementPanel = ref(false)
const repoManagementInitialTab = ref<'config' | 'hooks'>('config')
const showHelpModal = ref(false)
const showHealthPanel = ref(false)
const worktreeToDelete = ref<Worktree | null>(null)

// Operation state
const isPruning = ref(false)
const isPullingAll = ref(false)

// Progress panel state
const { progress, startListening, reset: resetProgress, getFailedItems, hasFailures, hasConflicts } = useOperationProgress()
const showProgressPanel = ref(false)
const progressTitle = ref('')
const progressValue = computed(() => progress.value)
const progressHasFailures = computed(() => hasFailures())
const progressHasConflicts = computed(() => hasConflicts())

function openCreateModal() {
  showCreateModal.value = true
}

function closeAllPanels() {
  showSettingsPanel.value = false
  showRepoManagementPanel.value = false
  showHealthPanel.value = false
  if (showProgressPanel.value) {
    handleProgressPanelClose()
  }
}

function openSettingsPanel() {
  if (showSettingsPanel.value) {
    showSettingsPanel.value = false
    return
  }
  closeAllPanels()
  showSettingsPanel.value = true
}

function openRepoManagementPanel(tab: 'config' | 'hooks' = 'config') {
  if (showRepoManagementPanel.value) {
    showRepoManagementPanel.value = false
    return
  }
  closeAllPanels()
  repoManagementInitialTab.value = tab
  showRepoManagementPanel.value = true
}

function openHelpModal() {
  showHelpModal.value = !showHelpModal.value
}

function handleDeleteWorktree(worktree: Worktree) {
  worktreeToDelete.value = worktree
  showDeleteDialog.value = true
}

function openHealthPanel() {
  closeAllPanels()
  showHealthPanel.value = true
}

async function handlePrune() {
  if (!selectedRepoName.value || isPruning.value) return

  closeAllPanels()
  progressTitle.value = 'Pruning Branches'
  await startListening('prune', [])
  showProgressPanel.value = true

  // Pause auto-refresh during operation
  pauseAutoRefresh()
  isPruning.value = true
  try {
    const result = await pruneRepo(selectedRepoName.value, false)
    // Close the progress panel — prune doesn't emit granular progress events
    handleProgressPanelClose()
    if (result) {
      const refs = result.stale_refs_pruned
      const merged = result.merged_branches?.length ?? 0
      if (refs === 0 && merged === 0) {
        toast.info('Nothing to clean up — repository is already tidy')
      } else {
        const parts: string[] = []
        if (refs > 0) parts.push(`${refs} stale ref${refs === 1 ? '' : 's'} pruned`)
        if (merged > 0) parts.push(`${merged} merged branch${merged === 1 ? '' : 'es'} found`)
        toast.success(parts.join(', '))
      }
    }
  } catch {
    handleProgressPanelClose()
    toast.error('Failed to clean up branches')
  } finally {
    isPruning.value = false
    resumeAutoRefresh()
  }
}

async function handlePullAll() {
  if (!selectedRepoName.value || isPullingAll.value) return

  // Phase 5: Build a map of branch names to worktree paths for conflict resolution actions
  const worktreePathMap = new Map<string, string>()
  for (const wt of worktrees.value) {
    if (wt.branch) {
      worktreePathMap.set(wt.branch, wt.path)
    }
  }

  // Don't pre-populate expected items - let the backend's progress events
  // tell us what's being processed (ensures we show the correct repo's worktrees)
  closeAllPanels()
  progressTitle.value = 'Pulling All Worktrees'
  await startListening('pull_all', [], worktreePathMap)
  showProgressPanel.value = true

  // Pause auto-refresh during operation
  pauseAutoRefresh()
  isPullingAll.value = true
  try {
    await pullAllWorktrees(selectedRepoName.value)
    toast.success('Pull all completed successfully')
  } catch {
    toast.error('Failed to pull worktrees')
  } finally {
    isPullingAll.value = false
    resumeAutoRefresh()
  }
}

function handleProgressPanelClose() {
  showProgressPanel.value = false
  resetProgress()
}

// M16: Auto-close progress panel after successful completion (no failures/conflicts)
watch(progressValue, (val) => {
  if (!val || !showProgressPanel.value) return
  const allDone = val.items.length > 0 && val.items.every(
    (item) => item.status === 'success' || item.status === 'skipped'
  )
  if (allDone && val.current >= val.total) {
    setTimeout(() => {
      // Re-check in case user interacted
      if (showProgressPanel.value && !hasFailures() && !hasConflicts()) {
        handleProgressPanelClose()
      }
    }, 2000)
  }
})

async function handleCancelOperation() {
  await cancelOperation()
  // The operation will complete with remaining items marked as 'skipped'
  // We don't close the panel - user can see the final state
}

async function handleRetryFailed() {
  const failedBranches = getFailedItems()
  if (failedBranches.length === 0 || !selectedRepoName.value) return

  // Phase 5: Build a map of branch names to worktree paths for conflict resolution actions
  const worktreePathMap = new Map<string, string>()
  for (const wt of worktrees.value) {
    if (wt.branch && failedBranches.includes(wt.branch)) {
      worktreePathMap.set(wt.branch, wt.path)
    }
  }

  // Reset progress and start new operation for failed items only
  await resetProgress()
  progressTitle.value = `Retrying ${failedBranches.length} Failed`
  await startListening('pull_all', failedBranches, worktreePathMap)

  // Pause auto-refresh during retry
  pauseAutoRefresh()

  try {
    await pullSelectedWorktrees(selectedRepoName.value, failedBranches)
  } finally {
    resumeAutoRefresh()
  }
}

// Phase 5: Handle open in editor from progress panel (for conflict resolution)
async function handleOpenInEditor(path: string) {
  const success = await openInEditor(path)
  if (!success) {
    toast.error('Failed to open in editor')
  }
}

// Phase 5: Handle open in terminal from progress panel (for conflict resolution)
async function handleOpenInTerminal(path: string) {
  const success = await openInTerminal(path)
  if (!success) {
    toast.error('Failed to open in terminal')
  }
}

// Close all modals/panels (for Escape key)
function closeAllModals() {
  if (showCommandPalette.value) {
    showCommandPalette.value = false
  } else if (showProgressPanel.value) {
    handleProgressPanelClose()
  } else if (showHealthPanel.value) {
    showHealthPanel.value = false
  } else if (showRepoManagementPanel.value) {
    showRepoManagementPanel.value = false
  } else if (showSettingsPanel.value) {
    showSettingsPanel.value = false
  } else if (showHelpModal.value) {
    showHelpModal.value = false
  } else if (showDeleteDialog.value) {
    showDeleteDialog.value = false
  } else if (showCreateModal.value) {
    showCreateModal.value = false
  }
}

// L12: Focus search input handler
function focusSearch() {
  // Try to focus the worktree search input if visible
  if (selectedRepo.value && worktrees.value.length > 0) {
    searchInputRef.value?.focus()
  }
}

// Command palette state
const showCommandPalette = ref(false)

function toggleCommandPalette() {
  showCommandPalette.value = !showCommandPalette.value
}

// Helper to get the currently focused worktree object
function getFocusedWorktree() {
  return worktrees.value.find((wt) => wt.branch === focusedBranch.value) ?? null
}

async function copyFocusedWorktreeValue(
  getValue: (worktree: Worktree) => string | null,
  copier: (value: string) => Promise<{ success: boolean }>,
  successMessage: string,
  missingMessage?: string
) {
  const wt = getFocusedWorktree()
  if (!wt) return

  const value = getValue(wt)
  if (!value) {
    if (missingMessage) {
      toast.warning(missingMessage)
    }
    return
  }

  const result = await copier(value)
  if (result.success) {
    toast.success(successMessage)
  } else {
    toast.error('Failed to copy to clipboard')
  }
}

async function handlePaletteOpenInEditor() {
  const wt = getFocusedWorktree()
  if (!wt) return
  const success = await openInEditor(wt.path)
  if (!success) {
    toast.error('Failed to open in editor')
  }
}

async function handlePaletteOpenInTerminal() {
  const wt = getFocusedWorktree()
  if (!wt) return
  const success = await openInTerminal(wt.path)
  if (!success) {
    toast.error('Failed to open in terminal')
  }
}

async function handlePaletteOpenInBrowser() {
  const wt = getFocusedWorktree()
  if (!wt) return
  if (!wt.url) {
    toast.warning('No URL available for this worktree')
    return
  }

  const success = await openInBrowser(wt.url)
  if (!success) {
    toast.error('Failed to open in browser')
  }
}

async function handlePaletteOpenAll() {
  const wt = getFocusedWorktree()
  if (!wt) return

  const result = await openAll(wt.path, wt.url)
  const openedCount = Number(result.terminal) + Number(result.editor) + Number(result.browser)
  const expectedCount = result.browserSkipped ? 2 : 3

  if (openedCount === 0) {
    toast.error('Failed to open any tools')
    return
  }

  if (openedCount < expectedCount) {
    toast.warning(`Opened ${openedCount}/${expectedCount} tools`)
    return
  }

  if (result.browserSkipped) {
    toast.info('Opened terminal and editor (no URL available for browser)')
  } else {
    toast.success('Opened terminal, editor, and browser')
  }
}

// Command registry for palette
const { commands: paletteCommands } = useCommandRegistry({
  onRefresh: () => handleRefresh(),
  onCreateWorktree: () => { if (selectedRepo.value) openCreateModal() },
  onOpenSettings: () => openSettingsPanel(),
  onOpenRepoManagement: () => { if (selectedRepo.value) openRepoManagementPanel() },
  onOpenHelp: () => openHelpModal(),
  onFocusSearch: () => focusSearch(),
  onPullAll: () => handlePullAll(),
  onPrune: () => handlePrune(),
  onOpenHealthPanel: () => openHealthPanel(),
  onOpenEditor: () => { void handlePaletteOpenInEditor() },
  onOpenTerminal: () => { void handlePaletteOpenInTerminal() },
  onOpenBrowser: () => { void handlePaletteOpenInBrowser() },
  onOpenAll: () => { void handlePaletteOpenAll() },
  onCopyPath: () => {
    void copyFocusedWorktreeValue(
      (wt) => wt.path,
      copyPath,
      'Copied path to clipboard'
    )
  },
  onCopyBranch: () => {
    void copyFocusedWorktreeValue(
      (wt) => wt.branch,
      copyBranch,
      'Copied branch name to clipboard'
    )
  },
  onCopyUrl: () => {
    void copyFocusedWorktreeValue(
      (wt) => wt.url ?? null,
      copyUrl,
      'Copied URL to clipboard',
      'No URL available for this worktree'
    )
  },
  onCopyCdCommand: () => {
    void copyFocusedWorktreeValue(
      (wt) => wt.path,
      copyCdCommand,
      'Copied cd command to clipboard'
    )
  },
  onPullWorktree: () => {
    const wt = getFocusedWorktree()
    if (wt && selectedRepoName.value) pullWorktree(selectedRepoName.value, wt.branch)
  },
  onSyncWorktree: () => {
    const wt = getFocusedWorktree()
    if (wt && selectedRepoName.value) syncWorktree(selectedRepoName.value, wt.branch)
  },
  onDeleteWorktree: () => { const wt = getFocusedWorktree(); if (wt) handleDeleteWorktree(wt) },
  onSelectRepo: (index: number) => store.selectRepository(store.repositories[index]?.name),
})

// Keyboard shortcuts
useKeyboardShortcuts({
  onRefresh: () => handleRefresh(),
  onCreateWorktree: () => {
    if (selectedRepo.value) {
      openCreateModal()
    }
  },
  onOpenSettings: () => openSettingsPanel(),
  onOpenRepoManagement: () => {
    if (selectedRepo.value) {
      openRepoManagementPanel()
    }
  },
  onOpenHelp: () => openHelpModal(),
  onCloseModal: () => closeAllModals(),
  onFocusSearch: () => focusSearch(),  // L12
  onCommandPalette: () => toggleCommandPalette(),
})

async function handleTitlebarDrag(e: MouseEvent) {
  if (e.button === 0) {
    await getCurrentWindow().startDragging()
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-surface-base text-text-primary overflow-hidden">
    <!-- Draggable title bar region for window movement (overlay titlebar mode) -->
    <div class="titlebar-drag-region" @mousedown.left="handleTitlebarDrag" />

    <!-- grove CLI not available state -->
    <div v-if="!wtAvailable" class="flex-1 flex items-center justify-center p-8">
      <div class="max-w-md text-center animate-fade-in">
        <div class="w-20 h-20 mx-auto mb-8 rounded-2xl bg-danger-muted flex items-center justify-center shadow-lg">
          <svg class="w-10 h-10 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 class="text-2xl font-semibold text-text-primary mb-3 tracking-tight">
          grove CLI Not Found
        </h2>
        <p class="text-text-secondary mb-8 leading-relaxed">
          The grove command-line tool is not installed or not in your PATH.
          Please install grove to use this application.
        </p>
        <a href="https://github.com/your-org/grove" target="_blank"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all duration-150 hover:shadow-glow">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
          </svg>
          Installation Guide
        </a>
      </div>
    </div>

    <!-- Main layout when grove is available -->
    <template v-else>
      <div class="flex-1 flex min-h-0" :class="{ 'select-none': isSidebarResizing }">
        <!-- Sidebar -->
        <RepoList class="flex-shrink-0" :width="sidebarWidth" @open-repo-management="openRepoManagementPanel" />

        <!-- Resize handle -->
        <ResizeHandle :is-resizing="isSidebarResizing" @drag-start="startSidebarResize" @reset="resetSidebarWidth" />

        <!-- Main content area -->
        <main class="flex-1 flex flex-col min-w-0 bg-surface-base overflow-y-auto relative">
          <!-- Header (Sticky & Glassmorphic) -->
          <header class="sticky top-0 border-b border-white/5"
            style="background-color: rgba(3, 7, 18, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 100;">
            <div class="px-6 py-3 pt-8 flex items-center gap-4">
              <!-- Left: repo info -->
              <div class="flex items-center gap-3 flex-shrink-0">
                <h1 class="text-xl font-bold text-text-primary tracking-tight truncate">
                  {{ selectedRepo?.name || 'Select a Repository' }}
                </h1>
                <span v-if="selectedRepo" class="text-sm text-text-tertiary">
                  {{ selectedRepo.worktrees }} worktree{{ selectedRepo.worktrees === 1 ? '' : 's' }}
                </span>
                <span v-if="selectedRepo" class="flex items-center gap-2 text-xs text-text-muted">
                  <Transition name="fade">
                    <span v-if="isAutoRefreshing" class="inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      Refreshing...
                    </span>
                  </Transition>
                  <span v-if="isWatching" class="inline-flex items-center gap-1" title="Watching for changes">
                    <span class="w-1.5 h-1.5 bg-success rounded-full animate-pulse-subtle" />
                    <span class="text-success">Live</span>
                  </span>
                  <span>{{ lastUpdatedText }}</span>
                </span>
              </div>

              <!-- Centre: search (fills remaining space) -->
              <div v-if="selectedRepo && worktrees.length > 0" class="flex-1 min-w-0">
                <SearchInput ref="searchInputRef" v-model="worktreeSearchQuery"
                  placeholder="Search worktrees..." shortcut />
              </div>
              <div v-else class="flex-1" />

              <!-- Right: action buttons -->
              <div v-if="selectedRepo" class="flex items-center gap-2 flex-shrink-0">
                <Button variant="secondary" size="sm" :loading="isPullingAll" @click="handlePullAll">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span class="hidden sm:inline">Pull All</span>
                </Button>
                <Button variant="secondary" size="sm" @click="openHealthPanel">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span class="hidden sm:inline">Health</span>
                </Button>
                <Button variant="secondary" size="sm" :loading="isPruning" title="Clean up stale references and find merged branches that can be safely removed" @click="handlePrune">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span class="hidden sm:inline">Clean Up</span>
                </Button>

                <div class="divider-vertical mx-1 h-6" />

                <Button variant="primary" size="sm" @click="openCreateModal">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Create
                </Button>

                <IconButton :tooltip="tooltipWithShortcut('Refresh', 'R')" @click="handleRefresh">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </IconButton>
                <IconButton :tooltip="tooltipWithShortcut('Repository Management', 'M')"
                  :active="showRepoManagementPanel"
                  @click="() => openRepoManagementPanel()">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </IconButton>
                <IconButton tooltip="Help" :active="showHelpModal" @click="openHelpModal">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </IconButton>
                <IconButton :tooltip="tooltipWithShortcut('Settings', ',')" :active="showSettingsPanel" @click="openSettingsPanel">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </IconButton>
              </div>
            </div>

          </header>

          <!-- Error banner -->
          <Transition name="slide-down">
            <div v-if="error"
              class="flex-shrink-0 bg-danger-muted border-b border-danger/20 px-6 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-danger/20 flex items-center justify-center">
                  <svg class="w-4 h-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-danger truncate">{{ error.code }}</p>
                  <p class="text-xs text-text-tertiary truncate">{{ error.message }}</p>
                </div>
              </div>
              <IconButton variant="danger" size="sm" tooltip="Dismiss error" @click="dismissError">
                <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
            </div>
          </Transition>

          <!-- Content area -->
          <div class="flex-1">
            <ErrorBoundary title="Failed to display worktrees"
              description="There was an error displaying the worktree list. Please try again." @retry="handleRefresh">
              <Transition name="crossfade" mode="out-in">
              <!-- No repo selected -->
              <div v-if="!selectedRepo" :key="contentKey" class="h-full flex items-center justify-center p-8">
                <div class="text-center animate-fade-in">
                  <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-surface-overlay flex items-center justify-center">
                    <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                    </svg>
                  </div>
                  <p class="text-lg font-medium text-text-secondary">Select a repository</p>
                  <p class="text-sm text-text-muted mt-1">to view its worktrees</p>
                </div>
              </div>

              <!-- Loading worktrees with skeleton cards -->
              <div v-else-if="loadingWorktrees" key="loading" class="p-6 space-y-3">
                <SkeletonCard v-for="i in 6" :key="i" />
              </div>

              <!-- No worktrees -->
              <div v-else-if="worktrees.length === 0" key="no-worktrees" class="h-full flex items-center justify-center p-8">
                <div class="text-center animate-fade-in max-w-md">
                  <!-- Illustration -->
                  <div class="w-24 h-24 mx-auto mb-8 rounded-2xl bg-accent/10 flex items-center justify-center">
                    <svg class="w-12 h-12 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M12 4v16m8-8H4" />
                    </svg>
                  </div>

                  <h2 class="text-xl font-bold text-text-primary tracking-tight">Get started with worktrees</h2>
                  <p class="text-sm text-text-muted mt-3 mb-8 leading-relaxed">
                    Worktrees let you work on multiple branches at the same time, each in its own directory. Create one to get started.
                  </p>

                  <Button variant="primary" size="lg" @click="openCreateModal">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Your First Worktree
                  </Button>
                </div>
              </div>

              <!-- Worktree list -->
              <div v-else :key="contentKey" class="p-6 space-y-4">
                <!-- No search results -->
                <div v-if="filteredWorktrees.length === 0 && worktreeSearchQuery.trim()"
                  class="py-12 text-center animate-fade-in">
                  <div class="w-16 h-16 mx-auto mb-4 rounded-xl bg-surface-overlay flex items-center justify-center">
                    <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p class="text-sm font-medium text-text-secondary">No results for '{{ worktreeSearchQuery }}'</p>
                  <p class="text-xs text-text-muted mt-1 mb-4">No matches in {{ worktrees.length }} worktree{{ worktrees.length !== 1 ? 's' : '' }}</p>
                  <Button variant="ghost" size="sm" @click="clearWorktreeSearch">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear search
                  </Button>
                </div>

                <!-- Worktree cards: virtual scroll for large lists, animated TransitionGroup for smaller lists -->
                <template v-else>
                  <!-- Virtual scrolling for 50+ items (performance optimisation) -->
                  <VirtualWorktreeList v-if="useVirtualScroll" :worktrees="filteredWorktrees"
                    :repo-name="selectedRepoName!" :focused-branch="focusedBranch" :expand-on-focus="expandOnFocus"
                    @delete="handleDeleteWorktree" />

                  <!-- Animated list for smaller lists (better UX with transitions) -->
                  <div v-else class="space-y-3">
                    <TransitionGroup name="list" appear @before-enter="onListBeforeEnter" @after-enter="onListAfterEnter">
                      <WorktreeCard v-for="(wt, index) in filteredWorktrees" :id="`worktree-${wt.branch}`" :key="wt.path"
                        :data-index="index"
                        :worktree="wt" :repo-name="selectedRepoName!" :focused="focusedBranch === wt.branch"
                        :initially-expanded="expandOnFocus && focusedBranch === wt.branch"
                        @delete="handleDeleteWorktree" />
                    </TransitionGroup>
                  </div>
                </template>
              </div>
              </Transition>
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </template>

    <!-- Modals and Panels -->
    <CreateWorktreeModal :is-open="showCreateModal" @close="showCreateModal = false" />

    <DeleteWorktreeDialog :is-open="showDeleteDialog" :worktree="worktreeToDelete" :repo-name="selectedRepoName || ''"
      @close="showDeleteDialog = false" />

    <SettingsPanel :is-open="showSettingsPanel" @close="showSettingsPanel = false" />

    <RepoManagementPanel :is-open="showRepoManagementPanel" :initial-tab="repoManagementInitialTab"
      @close="showRepoManagementPanel = false" />

    <HelpModal :is-open="showHelpModal" @close="showHelpModal = false" />

    <CommandPalette :is-open="showCommandPalette" :commands="paletteCommands"
      @close="showCommandPalette = false" />

    <HealthPanel :is-open="showHealthPanel" :repo-name="selectedRepoName || ''" @close="showHealthPanel = false" />

    <!-- M6: ErrorBoundary around progress panel to prevent malformed data crashing app -->
    <ErrorBoundary>
      <OperationProgressPanel :is-open="showProgressPanel" :title="progressTitle" :progress="progressValue"
        :has-failures="progressHasFailures" :has-conflicts="progressHasConflicts" @close="handleProgressPanelClose"
        @cancel="handleCancelOperation" @retry="handleRetryFailed" @open-in-editor="handleOpenInEditor"
        @open-in-terminal="handleOpenInTerminal" />
    </ErrorBoundary>
  </div>
</template>

<style scoped>
/* Draggable title bar region for overlay mode (no native chrome) */
.titlebar-drag-region {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 28px;
  -webkit-app-region: drag;
  app-region: drag;
  z-index: 9999;
  pointer-events: auto;
}

/* Prevent drag on interactive elements within the title bar zone */
button, a, input, select, textarea,
[role="button"], [role="menuitem"] {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

/* Dashboard animations using design tokens */

/* Fade animation for refresh indicator */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Slide down animation for error banner */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all var(--duration-modal) var(--ease-out);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

/* List animation for worktree cards with stagger support */
.list-enter-active,
.list-leave-active {
  transition: all var(--duration-slow) var(--ease-spring);
}

.list-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(-10px) scale(0.95);
}

.list-move {
  transition: transform var(--duration-slow) var(--ease-spring);
}

/* Crossfade animation for content switching */
.crossfade-enter-active,
.crossfade-leave-active {
  transition: opacity var(--duration-slow) var(--ease-out);
}

.crossfade-enter-from,
.crossfade-leave-to {
  opacity: 0;
}
</style>
