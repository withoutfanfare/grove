<script setup lang="ts">
/**
 * WorktreeCard Component
 *
 * Displays a worktree with status, actions, and toast notifications.
 * Premium design with grouped action buttons and smooth transitions.
 * Includes copy actions and Quick Launch functionality (Phase 1 Quick Actions).
 * Phase 2: Added age display and status badges (MERGED, STALE, MISMATCH).
 */
import { computed, ref, watch } from 'vue'
import type { Worktree } from '../types'
import StatusBadge from './StatusBadge.vue'
import GradeBadge from './GradeBadge.vue'
import WorktreeStatusBadges from './WorktreeStatusBadges.vue'
import WorktreeDetailsPanel from './WorktreeDetailsPanel.vue'
import { useWorktrees, useToast, formatRelativeTime } from '../composables'
import { useSettingsStore } from '../stores/settings'
import { Dropdown, DropdownItem } from './ui'
import { copyPath, copyBranch, copyUrl, copyCdCommand } from '../utils/clipboard'

const props = defineProps<{
  worktree: Worktree
  repoName: string
  focused?: boolean
  initiallyExpanded?: boolean
}>()

const emit = defineEmits<{
  delete: [worktree: Worktree]
}>()

const { openInEditor, openInGitClient, openInTerminal, openInBrowser, openInFinder, openAll, pullWorktree, syncWorktree, getWorktreeOperation, isWorktreeBusy } = useWorktrees()
const { toast } = useToast()
const settingsStore = useSettingsStore()

// Check if git client is configured
const hasGitClient = computed(() => settingsStore.settings.gitClient !== 'none')

// M8: Local refs for double-click prevention on git actions
const isLocalPulling = ref(false)
const isLocalSyncing = ref(false)

// Phase 3: Details panel expansion state
const isDetailsExpanded = ref(false)

// Auto-expand details when card becomes focused with initiallyExpanded flag
watch(
  () => props.focused,
  (isFocused) => {
    if (isFocused && props.initiallyExpanded) {
      isDetailsExpanded.value = true
    }
  },
  { immediate: true }
)

// Also watch initiallyExpanded in case it becomes true after mount (e.g., after worktrees load)
watch(
  () => props.initiallyExpanded,
  (shouldExpand) => {
    if (shouldExpand && props.focused) {
      isDetailsExpanded.value = true
    }
  }
)

function toggleDetails() {
  isDetailsExpanded.value = !isDetailsExpanded.value
}

// Computed properties for operation state from centralised tracking
const operationState = computed(() => getWorktreeOperation(props.repoName, props.worktree.branch))
const isPulling = computed(() => operationState.value === 'pulling' || isLocalPulling.value)
const isSyncing = computed(() => operationState.value === 'syncing' || isLocalSyncing.value)
const isBusy = computed(() => isWorktreeBusy(props.repoName, props.worktree.branch) || isLocalPulling.value || isLocalSyncing.value)

const branchName = computed(() => props.worktree.branch || 'detached HEAD')
// M13: Handle empty/null SHA gracefully
const shortSha = computed(() => {
  const sha = props.worktree.sha
  if (!sha || sha.trim() === '') return 'unknown'
  return sha.slice(0, 7)
})
const hasUrl = computed(() => Boolean(props.worktree.url))

// Get shortened path (just the last folder name)
const shortPath = computed(() => {
  const parts = props.worktree.path.split('/')
  return parts[parts.length - 1] || props.worktree.path
})

// Phase 2: Age display from lastAccessed
const ageDisplay = computed(() => {
  const result = formatRelativeTime(props.worktree.lastAccessed)
  return result
})

// Phase 2: Compute mismatch by comparing directory name to branch slug
const hasMismatch = computed(() => {
  // If mismatch is explicitly set by CLI, use that
  if (props.worktree.mismatch !== undefined) {
    return props.worktree.mismatch
  }

  // Otherwise, compute client-side by comparing directory to branch slug
  const branch = props.worktree.branch
  if (!branch) return false

  // Convert branch to slug: feature/login-form -> feature-login-form
  const branchSlug = branch.replace(/\//g, '-').toLowerCase()
  const dirName = shortPath.value.toLowerCase()

  // Check if directory matches the branch slug
  return dirName !== branchSlug && !dirName.includes(branchSlug)
})

function handleOpenInEditor() {
  openInEditor(props.worktree.path)
}

function handleOpenInTerminal() {
  openInTerminal(props.worktree.path)
}

function handleOpenInBrowser() {
  if (props.worktree.url) {
    openInBrowser(props.worktree.url)
  }
}

function handleOpenInFinder() {
  openInFinder(props.worktree.path)
}

function handleOpenInGitClient() {
  openInGitClient(props.worktree.path)
}

async function handlePull() {
  // M8: Set local flag immediately to prevent double-clicks
  if (isLocalPulling.value) return
  isLocalPulling.value = true

  try {
    const result = await pullWorktree(props.repoName, props.worktree.branch)
    if (result) {
      const branchName = props.worktree.branch
      if (!result.success) {
        // Pull failed - show the error message
        toast.error(`${branchName}: ${result.message || 'Pull failed'}`)
      } else if (result.conflicts) {
        toast.warning(`${branchName}: Conflicts detected during pull`)
      } else if (result.already_up_to_date) {
        toast.info(`${branchName}: Already up to date`)
      } else {
        toast.success(`${branchName}: Pulled ${result.commits_pulled} commit${result.commits_pulled === 1 ? '' : 's'}`)
      }
    }
  } finally {
    isLocalPulling.value = false
  }
}

async function handleSync() {
  // M8: Set local flag immediately to prevent double-clicks
  if (isLocalSyncing.value) return
  isLocalSyncing.value = true

  try {
    const result = await syncWorktree(props.repoName, props.worktree.branch)
    if (result) {
      const branchName = props.worktree.branch
      if (result.dirty) {
        toast.warning(`${branchName}: Uncommitted changes - commit or stash first`)
      } else if (result.conflicts) {
        toast.error(`${branchName}: Conflicts detected during rebase`)
      } else if (result.success) {
        toast.success(`${branchName}: Synced with ${result.base}`)
      } else {
        toast.error(`${branchName}: ${result.message}`)
      }
    }
  } finally {
    isLocalSyncing.value = false
  }
}

function handleDelete() {
  emit('delete', props.worktree)
}

// ============================================================================
// Phase 1 Quick Actions: Copy and Quick Launch
// ============================================================================

async function handleCopyPath() {
  const result = await copyPath(props.worktree.path)
  if (result.success) {
    toast.success('Copied path to clipboard')
  } else {
    toast.error('Failed to copy path')
  }
}

async function handleCopyBranch() {
  const result = await copyBranch(props.worktree.branch)
  if (result.success) {
    toast.success('Copied branch name to clipboard')
  } else {
    toast.error('Failed to copy branch name')
  }
}

async function handleCopyUrl() {
  if (!props.worktree.url) {
    toast.warning('No URL available for this worktree')
    return
  }
  const result = await copyUrl(props.worktree.url)
  if (result.success) {
    toast.success('Copied URL to clipboard')
  } else {
    toast.error('Failed to copy URL')
  }
}

async function handleCopyCdCommand() {
  const result = await copyCdCommand(props.worktree.path)
  if (result.success) {
    toast.success('Copied cd command to clipboard')
  } else {
    toast.error('Failed to copy cd command')
  }
}

async function handleOpenAll() {
  const result = await openAll(props.worktree.path, props.worktree.url)
  if (result.browserSkipped) {
    toast.info('Opened terminal and editor (no URL available for browser)')
  } else {
    toast.success('Opened terminal, editor, and browser')
  }
}
</script>

<template>
  <div class="card card-interactive group relative transition-all duration-300" :class="{
    'opacity-75': isBusy,
    'ring-2 ring-accent ring-offset-2 ring-offset-surface-primary': focused,
    'card-expanded': isDetailsExpanded
  }">
    <!-- Main content row (click to toggle details) -->
    <div class="p-4 flex items-center gap-4 cursor-pointer" @click="toggleDetails">
      <!-- Left: Branch info -->
      <div class="flex-1 min-w-0">
        <!-- Branch name and metadata -->
        <div class="flex items-center gap-3">
          <h3 class="text-text-primary text-base font-semibold truncate tracking-tight" :title="branchName">
            {{ branchName }}
          </h3>

          <!-- SHA -->
          <code class="text-text-muted text-2xs font-mono flex-shrink-0 px-1.5 py-0.5 bg-surface-overlay rounded">
            {{ shortSha }}
          </code>

          <!-- Health grade -->
          <GradeBadge v-if="worktree.health_grade" :grade="worktree.health_grade" :score="worktree.health_score"
            class="flex-shrink-0" />
        </div>

        <!-- Status row -->
        <div class="flex items-center gap-3 mt-1">
          <StatusBadge :dirty="worktree.dirty" :ahead="worktree.ahead" :behind="worktree.behind" />

          <!-- Phase 2: Status badges (MERGED, STALE, MISMATCH) -->
          <WorktreeStatusBadges :merged="worktree.merged" :stale="worktree.stale" :mismatch="hasMismatch" />

          <span class="text-text-muted text-2xs font-mono truncate" :title="worktree.path">
            {{ shortPath }}
          </span>

          <!-- Phase 2: Age display -->
          <span v-if="worktree.lastAccessed" class="text-text-muted text-2xs flex-shrink-0"
            :title="`Last accessed: ${ageDisplay.full}`">
            {{ ageDisplay.short }}
          </span>
        </div>
      </div>

      <!-- Right: Actions menu -->
      <div class="flex-shrink-0" @click.stop>
        <Dropdown align="right">
          <template #trigger>
            <button class="w-8 h-8 rounded-lg text-white flex items-center justify-center transition-colors" style="background-color: #334155" title="Actions">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </template>

          <template #default="{ close }">
            <!-- Toggle details -->
            <DropdownItem @click="() => { toggleDetails(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {{ isDetailsExpanded ? 'Hide Details' : 'Show Details' }}
            </DropdownItem>

            <!-- Quick actions -->
            <DropdownItem @click="() => { handleOpenAll(); close() }">
              <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Quick Launch
            </DropdownItem>
            <DropdownItem :disabled="isBusy && !isPulling" @click="() => { handlePull(); close() }">
              <svg class="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Pull
            </DropdownItem>
            <DropdownItem :disabled="worktree.dirty || (isBusy && !isSyncing)" @click="() => { handleSync(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync with Base
            </DropdownItem>

            <!-- Divider -->
            <div class="my-1 border-t border-border-subtle" />

            <!-- Open actions -->
            <div class="px-2 py-1.5 text-2xs font-medium text-text-muted uppercase tracking-wider">Open in</div>
            <DropdownItem @click="() => { handleOpenInEditor(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Editor
            </DropdownItem>
            <DropdownItem @click="() => { handleOpenInTerminal(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Terminal
            </DropdownItem>
            <DropdownItem v-if="hasGitClient" @click="() => { handleOpenInGitClient(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Git Client
            </DropdownItem>
            <DropdownItem v-if="hasUrl" @click="() => { handleOpenInBrowser(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              Browser
            </DropdownItem>
            <DropdownItem @click="() => { handleOpenInFinder(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Finder
            </DropdownItem>

            <!-- Divider -->
            <div class="my-1 border-t border-border-subtle" />

            <!-- Copy actions -->
            <div class="px-2 py-1.5 text-2xs font-medium text-text-muted uppercase tracking-wider">Copy</div>
            <DropdownItem @click="() => { handleCopyPath(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Path
            </DropdownItem>
            <DropdownItem @click="() => { handleCopyBranch(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Branch Name
            </DropdownItem>
            <DropdownItem v-if="hasUrl" @click="() => { handleCopyUrl(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              URL
            </DropdownItem>
            <DropdownItem @click="() => { handleCopyCdCommand(); close() }">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              cd Command
            </DropdownItem>

            <!-- Divider -->
            <div class="my-1 border-t border-border-subtle" />

            <!-- Danger zone -->
            <DropdownItem danger :disabled="isBusy" @click="() => { handleDelete(); close() }">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Worktree
            </DropdownItem>
          </template>
        </Dropdown>
      </div>
    </div>

    <!-- Phase 3: Details Panel -->
    <WorktreeDetailsPanel :worktree="worktree" :repo-name="repoName" :is-expanded="isDetailsExpanded" />
  </div>
</template>
