<script setup lang="ts">
/**
 * RepoList Component (Sidebar)
 *
 * Navigation sidebar with repository list and recent worktrees tabs.
 * Premium desktop-native design with smooth transitions.
 * Width is controlled by parent for resizable sidebar support.
 * Phase 4: Added Clone button and repository actions menu.
 * Phase 5: Enhanced three-dot menu with Edit Config, Manage Hooks, Refresh.
 */
import { computed, ref, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore } from '../stores'
import { useRepos, useWorktrees, useRecent, useListNavigation, useKeyboardShortcuts, useShortcutTooltip, useSearch, useToast, useWt } from '../composables'
import { IconButton, SkeletonList, Skeleton, Dropdown, DropdownItem } from './ui'
import SearchInput from './SearchInput.vue'
import CloneRepositoryModal from './CloneRepositoryModal.vue'
import GlobalConfigPanel from './GlobalConfigPanel.vue'
// Clipboard utility (used by other functions)

const props = withDefaults(defineProps<{
  /** Sidebar width in pixels (for resizable sidebar) */
  width?: number;
}>(), {
  width: 256, // Default: w-64 equivalent
});

const emit = defineEmits<{
  /** Emitted when user wants to open repo management modal */
  openRepoManagement: [tab: 'config' | 'hooks']
}>()

const store = useWorktreeStore()
const { repositories, selectedRepoName, loading, recentWorktrees, loadingRecent } = storeToRefs(store)
const { selectRepository, refreshRepositories } = useRepos()
const { fetchWorktrees, openInEditor, openInTerminal, openInBrowser } = useWorktrees()
const { fetchRecentWorktrees } = useRecent()
const { tooltipWithShortcut } = useShortcutTooltip()
const { toast } = useToast()
const { repairRepository, unlockRepository, saveReportToDesktop } = useWt()

// Clone modal state
const showCloneModal = ref(false)

// Global config panel state
const showConfigPanel = ref(false)

// Repository action states
const repairingRepo = ref<string | null>(null)
const unlockingRepo = ref<string | null>(null)
const generatingReport = ref<string | null>(null)
const refreshingRepo = ref<string | null>(null)

// Repository search functionality
const { query: repoSearchQuery, filterRepositories } = useSearch()
// L6: Sort repositories alphabetically, then apply search filter
const sortedRepositories = computed(() => {
  return [...repositories.value].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  )
})
const filteredRepositories = computed(() => filterRepositories(sortedRepositories.value))

// Tab state
type TabType = 'repos' | 'recent'
const activeTab = ref<TabType>('repos')

// Track which repo is currently loading (for visual feedback)
const loadingRepoName = ref<string | null>(null)

// Keyboard navigation for repository list
const {
  focusedIndex,
  navigateUp,
  navigateDown,
  selectIndex,
  getCurrentItem,
} = useListNavigation(() => repositories.value)

// Update focused index when selected repo changes externally
watch(selectedRepoName, (name) => {
  if (name) {
    const index = repositories.value.findIndex(r => r.name === name)
    if (index !== -1) {
      selectIndex(index)
    }
  }
})

// Handle quick select by number (1-9)
function handleQuickSelect(index: number) {
  if (activeTab.value === 'repos' && index < repositories.value.length) {
    const repo = repositories.value[index]
    if (repo) {
      handleSelectRepo(repo.name)
    }
  }
}

// Handle Enter key to select focused item
function handleSelectFocused() {
  if (activeTab.value === 'repos') {
    const repo = getCurrentItem()
    if (repo) {
      handleSelectRepo(repo.name)
    }
  }
}

// Keyboard shortcuts for navigation
useKeyboardShortcuts({
  onNavigateUp: navigateUp,
  onNavigateDown: navigateDown,
  onSelectItem: handleSelectFocused,
  onQuickSelect: handleQuickSelect,
})

const totalWorktrees = computed(() => {
  return repositories.value.reduce((sum, repo) => sum + repo.worktrees, 0)
})

/** Loading timeout in milliseconds */
const LOADING_TIMEOUT_MS = 10000

async function handleSelectRepo(name: string) {
  // Skip if already loading this repo
  if (loadingRepoName.value === name) return

  loadingRepoName.value = name
  selectRepository(name)

  // Create a timeout promise that rejects after LOADING_TIMEOUT_MS
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timed out')), LOADING_TIMEOUT_MS)
  })

  try {
    // Race between fetch and timeout
    await Promise.race([fetchWorktrees(), timeoutPromise])
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to load worktrees'
    // Show error toast on timeout or fetch failure
    toast.error(errorMessage)
    console.warn('[RepoList] handleSelectRepo failed:', errorMessage)
  } finally {
    // Ensure loading state is always cleared
    loadingRepoName.value = null
  }
}

function switchTab(tab: TabType) {
  activeTab.value = tab
  if (tab === 'recent') {
    fetchRecentWorktrees()
  }
}

function handleOpenRecent(path: string) {
  openInEditor(path)
}

function handleOpenRecentTerminal(path: string) {
  openInTerminal(path)
}

function handleOpenRecentBrowser(url: string) {
  openInBrowser(url)
}

/**
 * Navigate to a recent worktree - selects the repo and focuses the branch with details expanded
 */
async function handleNavigateToRecent(repoName: string, branch: string) {
  // Switch to Repositories tab first
  activeTab.value = 'repos'

  // Check if we need to switch repos
  const needsRepoSwitch = selectedRepoName.value !== repoName

  if (needsRepoSwitch) {
    // Select the repository and fetch worktrees
    selectRepository(repoName)
    // Wait for worktrees to load before focusing
    await fetchWorktrees()
  }

  // Focus the worktree with details expansion flag
  store.focusWorktree(branch, true)
}

// Phase 4: Repository management actions
function handleClone() {
  showCloneModal.value = true
}

// Used in template @cloned event handler - vue-tsc doesn't detect it
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleCloneComplete() {
  // Refresh repositories list after successful clone
  refreshRepositories()
}

async function handleRepair(repoName: string) {
  if (repairingRepo.value) return
  repairingRepo.value = repoName

  try {
    const result = await repairRepository(repoName)
    if (result.success) {
      if (result.issues_fixed > 0) {
        toast.success(`${repoName}: Fixed ${result.issues_fixed} issue${result.issues_fixed === 1 ? '' : 's'}`)
      } else {
        toast.info(`${repoName}: No issues found`)
      }
    } else {
      toast.error(`${repoName}: ${result.message || 'Repair failed'}`)
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Repair failed'
    toast.error(`${repoName}: ${errorMessage}`)
  } finally {
    repairingRepo.value = null
  }
}

async function handleUnlock(repoName: string) {
  if (unlockingRepo.value) return
  unlockingRepo.value = repoName

  try {
    const result = await unlockRepository(repoName)
    if (result.success) {
      if (result.locks_removed > 0) {
        toast.success(`${repoName}: Removed ${result.locks_removed} lock${result.locks_removed === 1 ? '' : 's'}`)
      } else {
        toast.info(`${repoName}: No locks found`)
      }
    } else {
      toast.error(`${repoName}: ${result.message || 'Unlock failed'}`)
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unlock failed'
    toast.error(`${repoName}: ${errorMessage}`)
  } finally {
    unlockingRepo.value = null
  }
}

async function handleGenerateReport(repoName: string) {
  if (generatingReport.value) return
  generatingReport.value = repoName

  try {
    const filePath = await saveReportToDesktop(repoName)
    // Extract just the filename for the toast
    const filename = filePath.split('/').pop() || 'report.md'
    toast.success(`Report saved to Desktop: ${filename}`)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to generate report'
    toast.error(`${repoName}: ${errorMessage}`)
  } finally {
    generatingReport.value = null
  }
}

// Phase 5: New menu actions
async function handleRefreshRepo(repoName: string) {
  if (refreshingRepo.value) return
  refreshingRepo.value = repoName

  try {
    await fetchWorktrees()
    toast.success(`${repoName}: Refreshed`)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to refresh'
    toast.error(`${repoName}: ${errorMessage}`)
  } finally {
    refreshingRepo.value = null
  }
}

function handleEditConfig() {
  // Emit event to open repo management modal on Config tab
  emit('openRepoManagement', 'config')
}

function handleManageHooks() {
  // Emit event to open repo management modal on Hooks tab
  emit('openRepoManagement', 'hooks')
}



onMounted(() => {
  if (activeTab.value === 'recent') {
    fetchRecentWorktrees()
  }
})
</script>

<template>
  <aside class="bg-surface-raised border-r border-border-subtle flex flex-col h-full"
    :style="{ width: `${props.width}px` }">
    <!-- Tab header -->
    <div class="flex-shrink-0 border-b border-border-subtle p-3">
      <div class="flex p-1 bg-surface-overlay/40 rounded-lg relative isolate">
        <!-- Sliding background pill -->
        <div class="absolute inset-y-1 transition-all duration-200 ease-out gradient-tab rounded-md" :class="[
          activeTab === 'repos' ? 'left-1 right-1/2' : 'left-1/2 right-1'
        ]" />

        <button v-for="tab in [
          { id: 'repos' as TabType, label: 'Repositories' },
          { id: 'recent' as TabType, label: 'Recent' },
        ]" :key="tab.id" @click="switchTab(tab.id)" :class="[
          'flex-1 px-3 py-1.5 text-xs font-medium tracking-wide transition-colors duration-200 relative z-10 rounded-md',
          activeTab === tab.id
            ? 'text-text-primary'
            : 'text-text-tertiary hover:text-text-secondary'
        ]">
          {{ tab.label }}
        </button>
      </div>

      <!-- Summary with action buttons -->
      <div class="flex items-center justify-between px-4 py-2">
        <span class="text-2xs text-text-muted">
          <template v-if="activeTab === 'repos'">
            {{ repositories.length }} repos &middot; {{ totalWorktrees }} worktrees
          </template>
          <template v-else>
            {{ recentWorktrees.length }} recent
          </template>
        </span>

        <!-- Action buttons for repos tab -->
        <div v-if="activeTab === 'repos'" class="flex items-center gap-1">
          <!-- Clone button -->
          <IconButton size="sm" tooltip="Clone Repository" @click="handleClone">
            <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </IconButton>

          <!-- Global config button -->
          <IconButton size="sm" tooltip="Global Configuration" :active="showConfigPanel" @click="showConfigPanel = !showConfigPanel">
            <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </IconButton>
        </div>
      </div>

      <!-- Repository search input -->
      <!-- M10: Debounce set to 150ms for responsive filtering -->
      <div v-if="activeTab === 'repos' && repositories.length > 0" class="px-2 pb-2">
        <SearchInput v-model="repoSearchQuery" placeholder="Search repositories..." :debounce-ms="150" />
      </div>
    </div>

    <!-- Repositories Tab -->
    <template v-if="activeTab === 'repos'">
      <!-- L4: Loading state with fade transition and skeleton loaders -->
      <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100"
        leave-to-class="opacity-0">
        <div v-if="loading" class="flex-1 overflow-y-auto py-2 px-2">
          <ul class="space-y-0.5">
            <li v-for="i in 4" :key="i">
              <SkeletonList />
            </li>
          </ul>
        </div>
      </Transition>

      <!-- Empty state -->
      <div v-if="!loading && repositories.length === 0" class="flex-1 flex items-center justify-center p-4">
        <div class="text-center px-2">
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-overlay flex items-center justify-center">
            <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <p class="text-sm text-text-secondary font-medium">No repositories found</p>
          <p class="text-2xs text-text-muted mt-2 leading-relaxed">
            Create a worktree from any git repository to get started.
          </p>
          <div class="mt-4 p-3 bg-surface-overlay rounded-lg text-left">
            <p class="text-2xs text-text-muted mb-2">Quick start:</p>
            <code class="text-2xs font-mono text-accent block">wt add &lt;repo&gt; &lt;branch&gt;</code>
          </div>
          <a href="https://github.com/your-repo/wt#getting-started" target="_blank"
            class="inline-flex items-center gap-1 text-2xs text-accent hover:text-accent-hover mt-3 transition-colors">
            <span>View documentation</span>
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>

      <!-- No search results -->
      <div v-if="!loading && repositories.length > 0 && filteredRepositories.length === 0 && repoSearchQuery.trim()"
        class="flex-1 flex items-center justify-center p-4">
        <!-- L5: Standardised empty state icon size (48px/w-12) for sidebar consistency -->
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-overlay flex items-center justify-center">
            <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p class="text-sm text-text-secondary">No results for '{{ repoSearchQuery }}'</p>
        </div>
      </div>

      <!-- Repository list -->
      <nav v-if="!loading && repositories.length > 0 && (filteredRepositories.length > 0 || !repoSearchQuery.trim())"
        class="flex-1 overflow-y-auto py-2 px-2">
        <ul class="space-y-0.5">
          <li v-for="(repo, index) in filteredRepositories" :key="repo.name" class="relative">
            <button @click="handleSelectRepo(repo.name)" :disabled="loadingRepoName === repo.name" :class="[
              'group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150',
              'flex items-center gap-3',
              repo.name === selectedRepoName
                ? 'bg-accent/10 border border-accent/20'
                : index === focusedIndex && repo.name !== selectedRepoName
                  ? 'bg-white/5 border border-white/10 ring-1 ring-accent/30'
                  : 'hover:bg-white/5 border border-transparent',
              loadingRepoName === repo.name ? 'cursor-wait' : ''
            ]">
              <!-- Icon/Avatar with loading spinner -->
              <div :class="[
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                repo.name === selectedRepoName
                  ? 'bg-accent text-white'
                  : 'bg-surface-overlay text-text-tertiary group-hover:text-text-secondary'
              ]">
                <!-- Loading spinner -->
                <svg v-if="loadingRepoName === repo.name" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <!-- Folder icon -->
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <span :class="[
                  'block text-sm font-semibold truncate transition-colors',
                  repo.name === selectedRepoName ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'
                ]">
                  {{ repo.name }}
                </span>
                <span :class="[
                  'block text-2xs transition-colors',
                  repo.name === selectedRepoName ? 'text-accent' : 'text-text-muted'
                ]">
                  {{ repo.worktrees }} worktree{{ repo.worktrees === 1 ? '' : 's' }}
                </span>
              </div>

              <!-- Quick select shortcut hint (for first 9 repos) -->
              <span v-if="index < 9"
                class="text-2xs text-text-muted font-mono opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
                :title="tooltipWithShortcut(`Select ${repo.name}`, String(index + 1))">
                {{ index + 1 }}
              </span>

              <!-- Chevron -->
              <svg v-if="repo.name === selectedRepoName" class="w-4 h-4 text-accent flex-shrink-0" fill="none"
                stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <!-- Repository actions menu (only for selected repo) -->
            <div v-if="repo.name === selectedRepoName" class="absolute right-1 top-1/2 -translate-y-1/2 z-10">
              <Dropdown align="right">
                <template #trigger>
                  <button
                    class="p-1.5 rounded-md text-text-secondary bg-surface-overlay hover:bg-surface-raised transition-colors"
                    aria-label="Repository actions"
                    title="Repository actions" @contextmenu.prevent>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                </template>

                <template #default="{ close }">
                  <!-- Primary actions group -->
                  <DropdownItem @click="handleEditConfig(); close()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Config
                  </DropdownItem>

                  <DropdownItem @click="handleManageHooks(); close()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Manage Hooks
                  </DropdownItem>

                  <DropdownItem @click="handleRefreshRepo(repo.name); close()" :disabled="refreshingRepo === repo.name">
                    <svg class="w-4 h-4" :class="{ 'animate-spin': refreshingRepo === repo.name }" fill="none"
                      stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {{ refreshingRepo === repo.name ? 'Refreshing...' : 'Refresh' }}
                  </DropdownItem>

                  <!-- Divider -->
                  <div class="my-1 h-px bg-border-subtle mx-2" />

                  <!-- Maintenance actions group -->
                  <DropdownItem @click="handleRepair(repo.name); close()" :disabled="repairingRepo === repo.name">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {{ repairingRepo === repo.name ? 'Repairing...' : 'Repair' }}
                  </DropdownItem>

                  <DropdownItem @click="handleUnlock(repo.name); close()" :disabled="unlockingRepo === repo.name">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    {{ unlockingRepo === repo.name ? 'Unlocking...' : 'Unlock' }}
                  </DropdownItem>

                  <DropdownItem @click="handleGenerateReport(repo.name); close()"
                    :disabled="generatingReport === repo.name">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {{ generatingReport === repo.name ? 'Generating...' : 'Export Report' }}
                  </DropdownItem>
                </template>
              </Dropdown>
            </div>
          </li>
        </ul>
      </nav>
    </template>

    <!-- Recent Tab -->
    <template v-else>
      <!-- Loading state with skeleton loaders -->
      <div v-if="loadingRecent" class="flex-1 overflow-y-auto py-2 px-2">
        <ul class="space-y-1">
          <li v-for="i in 4" :key="i">
            <div class="px-3 py-2.5 rounded-lg bg-surface-overlay/50">
              <!-- Header skeleton -->
              <div class="flex items-start gap-2">
                <!-- Status dot skeleton -->
                <Skeleton width="w-2" height="h-2" rounded class="mt-1.5 flex-shrink-0" />
                <!-- Content skeleton -->
                <div class="flex-1 min-w-0 space-y-1.5">
                  <Skeleton width="w-28" height="h-4" />
                  <Skeleton width="w-20" height="h-3" />
                  <Skeleton width="w-16" height="h-3" />
                </div>
              </div>
              <!-- Action buttons skeleton -->
              <div class="flex items-center gap-1 mt-2.5">
                <Skeleton width="w-6" height="h-6" />
                <Skeleton width="w-6" height="h-6" />
                <Skeleton width="w-6" height="h-6" />
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Empty state -->
      <div v-else-if="recentWorktrees.length === 0" class="flex-1 flex items-center justify-center p-4">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-overlay flex items-center justify-center">
            <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-sm text-text-secondary">No recent worktrees</p>
          <p class="text-2xs text-text-muted mt-1">Worktrees you open will appear here</p>
        </div>
      </div>

      <!-- Recent worktrees list -->
      <nav v-else class="flex-1 overflow-y-auto py-2 px-2">
        <ul class="space-y-1">
          <li v-for="recent in recentWorktrees" :key="recent.path">
            <div class="group px-3 py-2.5 rounded-lg bg-surface-overlay/50 hover:bg-surface-overlay transition-colors">
              <!-- Header - clickable to navigate to worktree -->
              <button class="flex items-start gap-2 w-full text-left"
                @click="handleNavigateToRecent(recent.repo, recent.branch)">
                <!-- Status dot -->
                <span :class="[
                  'mt-1.5 w-2 h-2 rounded-full flex-shrink-0 transition-colors',
                  recent.dirty ? 'bg-warning' : 'bg-success'
                ]" :title="recent.dirty ? 'Uncommitted changes' : 'Clean'" />

                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <span class="block text-sm font-medium text-text-primary truncate">
                    {{ recent.branch }}
                  </span>
                  <span class="block text-2xs text-text-muted truncate">
                    {{ recent.repo }}
                  </span>
                  <span class="block text-2xs text-text-muted mt-0.5">
                    {{ recent.accessed_ago }}
                  </span>
                </div>
              </button>

              <!-- Action buttons -->
              <div class="flex items-center gap-1 mt-2.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <IconButton size="sm" variant="secondary" tooltip="Open in Editor"
                  @click="handleOpenRecent(recent.path)">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </IconButton>

                <IconButton size="sm" tooltip="Open Terminal" @click="handleOpenRecentTerminal(recent.path)">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </IconButton>

                <IconButton v-if="recent.url" size="sm" tooltip="Open in Browser"
                  @click="handleOpenRecentBrowser(recent.url)">
                  <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </IconButton>
              </div>
            </div>
          </li>
        </ul>
      </nav>
    </template>

    <!-- Footer with wt version -->
    <div class="flex-shrink-0 px-4 py-3 border-t border-border-subtle">
      <div class="flex items-center justify-between text-2xs text-text-muted">
        <span>wt CLI</span>
        <span v-if="store.wtVersion" class="font-mono">v{{ store.wtVersion }}</span>
        <span v-else class="animate-pulse-subtle">...</span>
      </div>
    </div>
  </aside>

  <!-- Clone Repository Modal -->
  <CloneRepositoryModal :is-open="showCloneModal" @close="showCloneModal = false" @cloned="handleCloneComplete" />

  <!-- Global Config Panel -->
  <GlobalConfigPanel :is-open="showConfigPanel" @close="showConfigPanel = false" />
</template>
