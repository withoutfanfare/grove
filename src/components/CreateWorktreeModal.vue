<script setup lang="ts">
/**
 * CreateWorktreeModal Component
 *
 * Premium modal for creating new worktrees with branch selection,
 * base branch picker with dropdown, and template selection.
 *
 * Multi-phase modal:
 * 1. Form - branch name + base branch selection
 * 2. Creating - progress view while CLI runs hooks
 * 3. Results - summary of creation with hook execution details
 */
import { ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore, useSettingsStore } from '../stores'
import { useTemplateStore } from '../stores/templates'
import type { ConfigLayer, CreateWorktreeResponse, WorktreeTemplate } from '../types'
import { useWorktrees, useWt, useToast } from '../composables'
import { copyPath } from '../utils/clipboard'
import { SButton, SModal, SInput } from '@stuntrocket/ui'
import type { Branch } from '../types'

type ModalPhase = 'form' | 'creating' | 'results'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const store = useWorktreeStore()
const settingsStore = useSettingsStore()
const { selectedRepoName } = storeToRefs(store)
const { createWorktree, listBranches, openInEditor, openInBrowser } = useWorktrees()
const { readConfigFile, fetchPrBranch } = useWt()
const { toast } = useToast()

const templateStore = useTemplateStore()

const branch = ref('')
const baseBranch = ref(settingsStore.settings.defaultBaseBranch)
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// Template selection state
const selectedTemplate = ref<WorktreeTemplate | null>(null)

// Remote branches state
const remoteBranches = ref<Branch[]>([])
const loadingRemoteBranches = ref(false)
const showRemoteBranchPicker = ref(false)
const remoteBranchFilter = ref('')

// PR creation state
const prNumber = ref('')
const prTitle = ref('')
const loadingPr = ref(false)
const prError = ref<string | null>(null)

// Filtered remote branches
const filteredRemoteBranches = computed(() => {
  const filter = remoteBranchFilter.value.toLowerCase()
  return remoteBranches.value
    .filter(b => b.name.toLowerCase().includes(filter))
    .slice(0, 30)
})

// Apply template to form
function applyTemplate(template: WorktreeTemplate) {
  selectedTemplate.value = template
  baseBranch.value = template.default_base
  branchFilter.value = template.default_base
  // Pre-fill the branch prefix if branch is empty
  if (!branch.value) {
    branch.value = template.branch_prefix
  }
}

function clearTemplate() {
  selectedTemplate.value = null
}

// Fetch remote branches
async function fetchRemoteBranches() {
  if (!selectedRepoName.value) return
  loadingRemoteBranches.value = true
  try {
    const wtApi = useWt()
    const result = await wtApi.getRemoteBranches(selectedRepoName.value)
    remoteBranches.value = result.branches
  } catch (e) {
    console.warn('Failed to fetch remote branches:', e)
  } finally {
    loadingRemoteBranches.value = false
  }
}

// Select a remote branch for checkout
function selectRemoteBranch(branchName: string) {
  // Strip origin/ prefix for the branch name
  const localName = branchName.replace(/^origin\//, '')
  branch.value = localName
  showRemoteBranchPicker.value = false
}

// Fetch branch from a GitHub PR number
async function handleFetchPr() {
  const num = parseInt(prNumber.value, 10)
  if (isNaN(num) || num <= 0 || !selectedRepoName.value) return

  loadingPr.value = true
  prError.value = null
  prTitle.value = ''

  try {
    const result = await fetchPrBranch(selectedRepoName.value, num)
    branch.value = result.headRefName
    prTitle.value = result.title
    toast.success(`PR #${num}: ${result.headRefName}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    prError.value = msg
    toast.error(`Failed to fetch PR #${num}`)
  } finally {
    loadingPr.value = false
  }
}

// Multi-phase state
const phase = ref<ModalPhase>('form')
const creationResult = ref<CreateWorktreeResponse | null>(null)

// Track whether the repo has database creation enabled
const dbEnabled = ref(false)

// Creating phase elapsed timer
const elapsedSeconds = ref(0)
let elapsedInterval: ReturnType<typeof setInterval> | null = null

// Branches state
const branches = ref<Branch[]>([])
const loadingBranches = ref(false)
const showBranchDropdown = ref(false)
const branchFilter = ref('')
const dropdownHovered = ref(false)

// M9: Ref for branch input focus management
const branchInputRef = ref<HTMLInputElement | null>(null)

// Filter branches for dropdown
const filteredBranches = computed(() => {
  const filter = branchFilter.value.toLowerCase()
  return branches.value
    .filter(b => b.name.toLowerCase().includes(filter))
    .slice(0, 20)
})

// Computed helpers for results phase
const hasHooks = computed(() => (creationResult.value?.hooks.length ?? 0) > 0)
const failedHooks = computed(() => creationResult.value?.hooks.filter(h => h.status === 'failed') ?? [])
const hasFailedHooks = computed(() => failedHooks.value.length > 0)

// Modal title based on phase
const modalTitle = computed(() => {
  switch (phase.value) {
    case 'form': return 'Create Worktree'
    case 'creating': return 'Creating Worktree'
    case 'results': return 'Worktree Created'
  }
})

// Modal size: wider for results phase to show full paths
const modalSize = computed(() => {
  return phase.value === 'results' ? 'xl' as const : 'md' as const
})

// Elapsed time display
const elapsedDisplay = computed(() => {
  if (elapsedSeconds.value < 5) return ''
  const mins = Math.floor(elapsedSeconds.value / 60)
  const secs = elapsedSeconds.value % 60
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
})

function startElapsedTimer() {
  elapsedSeconds.value = 0
  elapsedInterval = setInterval(() => {
    elapsedSeconds.value++
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedInterval) {
    clearInterval(elapsedInterval)
    elapsedInterval = null
  }
}

// Reset form when modal opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    branch.value = ''
    phase.value = 'form'
    creationResult.value = null
    dbEnabled.value = false

    // Use repo-specific config if available
    let defaultBase = settingsStore.settings.defaultBaseBranch
    if (selectedRepoName.value) {
      try {
        const repoConfig = await readConfigFile('repo' as ConfigLayer, selectedRepoName.value)
        const baseEntry = repoConfig.entries.find(e => e.key === 'DEFAULT_BASE' && !e.commented)
        if (baseEntry?.value) {
          defaultBase = baseEntry.value
        }
        const dbEntry = repoConfig.entries.find(e => e.key === 'DB_CREATE' && !e.commented)
        if (dbEntry?.value?.toLowerCase() === 'true') {
          dbEnabled.value = true
        }
      } catch (_) {
        // Repo may not have a config file — fall back to global setting
      }
    }

    baseBranch.value = defaultBase
    branchFilter.value = defaultBase
    error.value = null
    showBranchDropdown.value = false
    dropdownHovered.value = false

    // Clear template selection
    selectedTemplate.value = null
    remoteBranchFilter.value = ''
    showRemoteBranchPicker.value = false

    // Clear PR state
    prNumber.value = ''
    prTitle.value = ''
    prError.value = null

    // Fetch branches for the selected repo
    if (selectedRepoName.value) {
      loadingBranches.value = true
      const result = await listBranches(selectedRepoName.value)
      if (result) {
        branches.value = result.branches
      }
      loadingBranches.value = false

      // Also fetch remote branches for the browser
      fetchRemoteBranches()
    }

    // M9: Focus the branch input when modal opens
    // Use nextTick to ensure DOM is updated
    await nextTick()
    branchInputRef.value?.focus()
  } else {
    // M7: Clear branch filter when modal closes
    branchFilter.value = ''
    stopElapsedTimer()
  }
})

function selectBranch(branchName: string) {
  baseBranch.value = branchName
  branchFilter.value = branchName
  showBranchDropdown.value = false
  dropdownHovered.value = false
}

function handleBranchInputFocus() {
  showBranchDropdown.value = true
}

function handleBranchInputBlur() {
  if (!dropdownHovered.value) {
    showBranchDropdown.value = false
  }
}

function handleDropdownMouseEnter() {
  dropdownHovered.value = true
}

function handleDropdownMouseLeave() {
  dropdownHovered.value = false
}

const isValid = computed(() => {
  return branch.value.trim().length > 0 && selectedRepoName.value
})

async function handleSubmit() {
  if (!isValid.value || !selectedRepoName.value) return

  isSubmitting.value = true
  error.value = null
  phase.value = 'creating'
  startElapsedTimer()

  try {
    const response = await createWorktree({
      repo: selectedRepoName.value,
      branch: branch.value.trim(),
      base: baseBranch.value || undefined,
    })

    if (response) {
      creationResult.value = response
      phase.value = 'results'
      emit('created')
    } else {
      error.value = store.error?.message ?? 'Failed to create worktree'
      phase.value = 'form'
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to create worktree'
    error.value = errorMessage
    toast.error(errorMessage)
    phase.value = 'form'
  } finally {
    isSubmitting.value = false
    stopElapsedTimer()
  }
}

async function handleCopyPath() {
  if (!creationResult.value?.result.path) return
  const result = await copyPath(creationResult.value.result.path)
  if (result.success) {
    toast.success('Path copied to clipboard')
  } else {
    toast.error('Failed to copy path')
  }
}

async function handleOpenUrl() {
  if (!creationResult.value?.result.url) return
  await openInBrowser(creationResult.value.result.url)
}

async function handleOpenInEditor() {
  if (creationResult.value?.result.path) {
    await openInEditor(creationResult.value.result.path)
  }
  emit('close')
}

function handleClose() {
  if (phase.value === 'creating') return
  emit('close')
}
</script>

<template>
  <SModal
    :open="isOpen"
    :max-width="modalSize === 'xl' ? 'max-w-2xl' : 'max-w-md'"
    @close="handleClose"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <!-- Form phase: plus icon -->
        <svg v-if="phase === 'form'" class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        <!-- Creating phase: spinner icon -->
        <svg v-else-if="phase === 'creating'" class="w-5 h-5 animate-spin text-text-muted" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <!-- Results phase: check icon -->
        <svg v-else class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="text-[14px] font-semibold tracking-tight text-text-primary">{{ modalTitle }}</h3>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- Phase 1: Form -->
    <!-- ============================================================ -->
    <form v-if="phase === 'form'" @submit.prevent="handleSubmit" class="space-y-5">
      <!-- Repository (read-only) -->
      <div>
        <label class="block text-sm font-medium text-text-secondary mb-1.5">
          Repository
        </label>
        <div class="px-3 py-2.5 bg-surface-overlay rounded-lg text-text-muted border border-white/[0.04] font-mono text-sm">
          {{ selectedRepoName || 'No repository selected' }}
        </div>
      </div>

      <!-- Template selector -->
      <div>
        <label class="block text-sm font-medium text-text-secondary mb-1.5">
          Template
          <span class="text-text-muted text-xs">(optional)</span>
        </label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="template in templateStore.allTemplates"
            :key="template.name"
            type="button"
            :class="[
              'px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors border',
              selectedTemplate?.name === template.name
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-overlay border-transparent'
            ]"
            @click="selectedTemplate?.name === template.name ? clearTemplate() : applyTemplate(template)">
            {{ template.name }}
          </button>
        </div>
      </div>

      <!-- Create from PR -->
      <div>
        <label class="block text-sm font-medium text-text-secondary mb-1.5">
          Create from PR
          <span class="text-text-muted text-xs">(optional — requires gh CLI)</span>
        </label>
        <div class="flex items-center gap-2">
          <input
            v-model="prNumber"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="w-24 px-3 py-2 bg-surface-overlay border border-white/[0.06] rounded-lg text-text-primary placeholder-text-muted text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            placeholder="#123"
            :disabled="isSubmitting || loadingPr"
            @keydown.enter.prevent="handleFetchPr"
          />
          <button
            type="button"
            class="px-3 py-2 text-xs font-medium rounded-lg bg-surface-overlay text-text-secondary hover:text-text-primary hover:bg-surface-raised border border-white/[0.04] transition-colors flex-shrink-0"
            :disabled="!prNumber || loadingPr || isSubmitting"
            @click="handleFetchPr">
            <svg v-if="loadingPr" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span v-else>Fetch Branch</span>
          </button>
          <span v-if="prTitle" class="text-xs text-text-muted truncate flex-1" :title="prTitle">
            {{ prTitle }}
          </span>
        </div>
        <p v-if="prError" class="text-danger text-xs mt-1">{{ prError }}</p>
      </div>

      <!-- Branch name -->
      <div class="flex items-end gap-2">
        <div class="flex-1">
          <SInput
            ref="branchInputRef"
            v-model="branch"
            label="Branch Name"
            placeholder="feature/my-feature"
            :disabled="isSubmitting"
          />
        </div>
        <!-- Browse remote branches button -->
        <button
          type="button"
          class="px-3 py-2 text-xs font-medium rounded-lg bg-surface-overlay text-text-secondary hover:text-text-primary hover:bg-surface-raised border border-white/[0.04] transition-colors flex-shrink-0"
          :disabled="loadingRemoteBranches"
          @click="showRemoteBranchPicker = !showRemoteBranchPicker"
          title="Browse remote branches">
          <svg v-if="loadingRemoteBranches" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>

      <!-- Remote branch picker -->
      <div v-if="showRemoteBranchPicker" class="border border-white/[0.04] rounded-lg bg-surface-overlay p-3">
        <div class="flex items-center gap-2 mb-2">
          <input
            v-model="remoteBranchFilter"
            type="text"
            class="flex-1 text-sm bg-surface-base text-text-primary border border-white/[0.04] rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            placeholder="Filter remote branches..."
          />
          <button
            type="button"
            class="text-xs text-accent hover:text-accent-hover transition-colors"
            :disabled="loadingRemoteBranches"
            @click="fetchRemoteBranches">
            Refresh
          </button>
        </div>
        <div class="max-h-40 overflow-y-auto space-y-0.5">
          <button
            v-for="rb in filteredRemoteBranches"
            :key="rb.name"
            type="button"
            class="w-full text-left px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded transition-colors truncate"
            @click="selectRemoteBranch(rb.name)">
            {{ rb.name }}
          </button>
          <p v-if="filteredRemoteBranches.length === 0" class="text-xs text-text-muted text-center py-2">
            {{ loadingRemoteBranches ? 'Loading...' : 'No matching remote branches' }}
          </p>
        </div>
      </div>

      <!-- Base branch with dropdown -->
      <div class="relative">
        <label class="block text-sm font-medium text-text-secondary mb-1.5">
          Base Branch
          <span v-if="loadingBranches" class="ml-2 text-text-muted text-xs animate-pulse">
            Loading branches...
          </span>
        </label>
        <input
          v-model="branchFilter"
          type="text"
          :placeholder="baseBranch || settingsStore.settings.defaultBaseBranch"
          class="w-full px-3 py-2.5 bg-surface-overlay border border-white/[0.06] rounded-lg text-text-primary placeholder-text-muted text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          :disabled="isSubmitting"
          @focus="handleBranchInputFocus"
          @blur="handleBranchInputBlur"
          @input="baseBranch = branchFilter"
          autocomplete="off"
        />

        <!-- Dropdown -->
        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="showBranchDropdown && filteredBranches.length > 0"
            class="absolute z-10 w-full mt-1 bg-surface-raised border border-white/[0.04] rounded-lg shadow-elevated max-h-48 overflow-y-auto"
            @mouseenter="handleDropdownMouseEnter"
            @mouseleave="handleDropdownMouseLeave"
          >
            <button
              v-for="b in filteredBranches"
              :key="b.name"
              type="button"
              class="w-full px-3 py-2.5 text-left text-sm hover:bg-surface-overlay transition-colors flex items-center justify-between group"
              @mousedown.prevent="selectBranch(b.name)"
            >
              <span class="truncate font-mono" :class="b.has_worktree ? 'text-text-primary' : 'text-text-secondary'">
                {{ b.name }}
              </span>
              <span
                v-if="b.has_worktree"
                class="flex-shrink-0 ml-2 text-2xs font-medium px-1.5 py-0.5 rounded bg-success-muted text-success"
              >
                worktree
              </span>
              <span v-else class="flex-shrink-0 ml-2 text-2xs text-text-muted">
                {{ b.type }}
              </span>
            </button>
          </div>
        </Transition>
      </div>

      <!-- Error message -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div v-if="error" class="p-3 bg-danger-muted rounded-lg border border-danger/20">
          <p class="text-danger text-sm flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ error }}
          </p>
        </div>
      </Transition>
    </form>

    <!-- ============================================================ -->
    <!-- Phase 2: Creating (progress) -->
    <!-- ============================================================ -->
    <div v-else-if="phase === 'creating'" class="py-8 text-center space-y-4">
      <div class="flex justify-center">
        <div class="relative">
          <svg class="w-12 h-12 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
      <div>
        <p class="text-text-primary font-medium">Creating worktree...</p>
        <p class="text-text-muted text-sm mt-1">Setting up branch, running hooks, and configuring environment</p>
        <p v-if="elapsedDisplay" class="text-text-muted text-xs mt-2 tabular-nums">{{ elapsedDisplay }} elapsed</p>
      </div>
      <!-- Animated progress steps -->
      <div class="mt-4 mx-auto max-w-[220px] text-left space-y-2">
        <div class="flex items-center gap-2 text-xs text-text-muted">
          <svg class="w-3.5 h-3.5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <span>Creating git worktree</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-text-muted animate-pulse">
          <svg class="w-3.5 h-3.5 text-accent flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Running post-add hooks...</span>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Phase 3: Results -->
    <!-- ============================================================ -->
    <div v-else-if="phase === 'results' && creationResult" class="space-y-5">
      <!-- Success header -->
      <div class="flex items-center gap-3 p-3 bg-success-muted/50 rounded-lg border border-success/20">
        <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p class="text-text-primary font-medium text-sm">Worktree created successfully</p>
          <p class="text-text-muted text-xs font-mono mt-0.5">{{ creationResult.result.branch }}</p>
        </div>
      </div>

      <!-- Worktree details -->
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider">Details</h4>
        <div class="bg-surface-overlay rounded-lg border border-white/[0.04] divide-y divide-white/[0.04]">
          <!-- Path: click to copy -->
          <button
            type="button"
            class="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-surface-base/50 transition-colors group text-left"
            title="Click to copy path"
            @click="handleCopyPath"
          >
            <span class="text-text-muted text-xs flex-shrink-0 w-14">Path</span>
            <span class="text-text-secondary text-xs font-mono truncate">
              {{ creationResult.result.path }}
            </span>
            <svg class="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>

          <!-- URL: click to open in browser -->
          <button
            v-if="creationResult.result.url"
            type="button"
            class="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-surface-base/50 transition-colors group text-left"
            title="Click to open in browser"
            @click="handleOpenUrl"
          >
            <span class="text-text-muted text-xs flex-shrink-0 w-14">URL</span>
            <span class="text-accent text-xs font-mono truncate group-hover:underline">
              {{ creationResult.result.url }}
            </span>
            <svg class="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          <!-- Database: only show if DB creation is enabled for this repo -->
          <div
            v-if="dbEnabled && creationResult.result.database"
            class="px-3 py-2.5 flex items-center gap-3"
          >
            <span class="text-text-muted text-xs flex-shrink-0 w-14">Database</span>
            <span class="text-text-secondary text-xs font-mono truncate">
              {{ creationResult.result.database }}
            </span>
          </div>
        </div>
      </div>

      <!-- Hook results -->
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider">Hooks</h4>

        <!-- Warning banner for failed hooks -->
        <div v-if="hasFailedHooks" class="p-2.5 bg-warning-muted/50 rounded-lg border border-warning/20">
          <p class="text-warning text-xs flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            {{ failedHooks.length }} hook{{ failedHooks.length > 1 ? 's' : '' }} failed. The worktree was created but some setup may be incomplete.
          </p>
        </div>

        <div v-if="hasHooks" class="bg-surface-overlay rounded-lg border border-white/[0.04] divide-y divide-white/[0.04] max-h-48 overflow-y-auto">
          <div
            v-for="hook in creationResult.hooks"
            :key="hook.name"
            class="px-3 py-2 flex items-center justify-between"
          >
            <span class="text-text-secondary text-xs font-mono truncate mr-3">
              {{ hook.name }}
            </span>
            <span
              class="flex-shrink-0 text-2xs font-medium px-1.5 py-0.5 rounded"
              :class="hook.status === 'success'
                ? 'bg-success-muted text-success'
                : 'bg-danger-muted text-danger'"
            >
              {{ hook.status === 'success' ? 'passed' : 'failed' }}
            </span>
          </div>
        </div>

        <p v-else class="text-text-muted text-xs italic px-1">
          No hooks configured for this repository.
        </p>
      </div>
    </div>

    <template #footer>
      <!-- Form phase footer -->
      <div v-if="phase === 'form'" class="flex items-center justify-end gap-3">
        <SButton
          variant="ghost"
          @click="handleClose"
          :disabled="isSubmitting"
        >
          Cancel
        </SButton>
        <SButton
          variant="primary"
          :loading="isSubmitting"
          :disabled="!isValid"
          @click="handleSubmit"
        >
          Create Worktree
        </SButton>
      </div>

      <!-- Creating phase footer (no actions) -->
      <div v-else-if="phase === 'creating'" />

      <!-- Results phase footer -->
      <div v-else-if="phase === 'results'" class="flex items-center justify-end gap-3">
        <SButton
          variant="ghost"
          @click="handleClose"
        >
          Close
        </SButton>
        <SButton
          v-if="creationResult?.result.path"
          variant="primary"
          @click="handleOpenInEditor"
        >
          Open in Editor
        </SButton>
      </div>
    </template>
  </SModal>
</template>
