<script setup lang="ts">
/**
 * DeleteWorktreeDialog Component
 *
 * Multi-phase modal for deleting worktrees with progress feedback:
 * 1. Confirm - branch deletion, database removal, and backup preferences
 * 2. Deleting - progress view while CLI runs hooks
 * 3. Results - summary of deletion with hook execution details
 */
import { ref, computed, watch, nextTick } from 'vue'
import type { Worktree, RemoveWorktreeResponse } from '../types'
import { useWorktrees, useToast } from '../composables'
import { useRepoConfigStore } from '../stores/repoConfig'
import { SButton, SModal, SCheckbox, SBadge, SInput } from '@stuntrocket/ui'

type ModalPhase = 'confirm' | 'deleting' | 'results'

const props = defineProps<{
  isOpen: boolean
  worktree: Worktree | null
  repoName: string
}>()

const emit = defineEmits<{
  close: []
  deleted: []
}>()

const { removeWorktree } = useWorktrees()
const { toast } = useToast()
const repoConfigStore = useRepoConfigStore()

const deleteBranch = ref(false)
const dropDatabase = ref(false)
const skipBackup = ref(false)
const isSubmitting = ref(false)
const error = ref<string | null>(null)
const protectionConfirmText = ref('')

// Multi-phase state
const phase = ref<ModalPhase>('confirm')
const deletionResult = ref<RemoveWorktreeResponse | null>(null)
const requestedDropDb = ref(false)

// Deleting phase elapsed timer
const elapsedSeconds = ref(0)
let elapsedInterval: ReturnType<typeof setInterval> | null = null

// M9: Ref for cancel button focus management
const cancelButtonRef = ref<InstanceType<typeof SButton> | null>(null)

// Branch protection
const isProtectedBranch = computed(() => {
  if (!props.worktree) return false
  const branch = props.worktree.branch
  const patterns = repoConfigStore.effectiveConfig?.protected_branches ?? []
  return patterns.some(pattern => {
    if (pattern === branch) return true
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp(`^${escaped}$`).test(branch)
  })
})

const protectionOverridden = computed(() => {
  if (!isProtectedBranch.value) return true
  return protectionConfirmText.value === props.worktree?.branch
})

// Computed helpers for results phase
const hasHooks = computed(() => (deletionResult.value?.hooks.length ?? 0) > 0)
const failedHooks = computed(() => deletionResult.value?.hooks.filter(h => h.status === 'failed') ?? [])
const hasFailedHooks = computed(() => failedHooks.value.length > 0)

// Modal title based on phase
const modalTitle = computed(() => {
  switch (phase.value) {
    case 'confirm': return 'Delete Worktree'
    case 'deleting': return 'Deleting Worktree'
    case 'results': return 'Worktree Deleted'
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

// Reset options when dialog opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    deleteBranch.value = true
    dropDatabase.value = false
    skipBackup.value = false
    error.value = null
    phase.value = 'confirm'
    deletionResult.value = null
    requestedDropDb.value = false
    protectionConfirmText.value = ''

    // Load config for branch protection check
    try {
      await repoConfigStore.loadEffectiveConfig(props.repoName)
    } catch {
      // Non-fatal: protection check defaults to empty (no protection)
    }

    // M9: Focus cancel button when dialog opens for safer default
    await nextTick()
    const buttonEl = cancelButtonRef.value?.$el as HTMLButtonElement | undefined
    buttonEl?.focus()
  } else {
    stopElapsedTimer()
  }
})

async function handleDelete() {
  // Store worktree and repoName in local variables at function start
  // to prevent potential null issues if props change during async operation
  const worktree = props.worktree
  const repoName = props.repoName

  if (!worktree || !repoName) return

  isSubmitting.value = true
  error.value = null
  requestedDropDb.value = dropDatabase.value
  phase.value = 'deleting'
  startElapsedTimer()

  try {
    const response = await removeWorktree({
      repo: repoName,
      branch: worktree.branch,
      deleteBranch: deleteBranch.value,
      dropDb: dropDatabase.value,
      skipBackup: skipBackup.value,
      force: true, // Always force in GUI to avoid prompts
    })

    if (response) {
      deletionResult.value = response
      phase.value = 'results'
      emit('deleted')
    } else {
      error.value = 'Failed to delete worktree'
      phase.value = 'confirm'
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to delete worktree'
    error.value = errorMessage
    toast.error(errorMessage)
    phase.value = 'confirm'
  } finally {
    isSubmitting.value = false
    stopElapsedTimer()
  }
}

function handleClose() {
  if (phase.value === 'deleting') return
  emit('close')
}
</script>

<template>
  <SModal
    :open="isOpen && !!worktree"
    :max-width="modalSize === 'xl' ? 'max-w-2xl' : 'max-w-md'"
    @close="handleClose"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <!-- Confirm phase: trash icon -->
        <div v-if="phase === 'confirm'" class="text-danger">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <!-- Deleting phase: spinner icon -->
        <svg v-else-if="phase === 'deleting'" class="w-5 h-5 animate-spin text-text-muted" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <!-- Results phase: check icon -->
        <svg v-else class="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h3 class="text-[14px] font-semibold tracking-tight text-text-primary">{{ modalTitle }}</h3>
          <code v-if="phase === 'confirm'" class="text-xs font-mono text-text-secondary">{{ worktree?.branch }}</code>
        </div>
      </div>
    </template>

    <!-- ============================================================ -->
    <!-- Phase 1: Confirm -->
    <!-- ============================================================ -->
    <div v-if="phase === 'confirm'" class="space-y-5">
      <!-- Warning text -->
      <p class="text-text-secondary text-sm leading-relaxed">
        Are you sure you want to delete this worktree? This action cannot be undone.
      </p>

      <!-- Dirty warning -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
      >
        <div
          v-if="worktree?.dirty"
          class="p-3 bg-warning-muted rounded-lg border border-warning/20"
        >
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p class="text-warning text-sm font-medium">Uncommitted changes</p>
              <p class="text-warning/80 text-xs mt-0.5">
                This worktree has uncommitted changes that will be lost.
              </p>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Protected branch warning -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
      >
        <div
          v-if="isProtectedBranch"
          class="p-3 bg-danger-muted rounded-lg border border-danger/20 space-y-3"
        >
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-danger flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div class="flex-1">
              <p class="text-danger text-sm font-medium">Protected branch</p>
              <p class="text-danger/80 text-xs mt-0.5">
                This branch is protected. Type the branch name to confirm deletion.
              </p>
              <div class="mt-2">
                <SInput
                  v-model="protectionConfirmText"
                  :placeholder="worktree?.branch"
                  size="sm"
                  class="font-mono"
                  :disabled="isSubmitting"
                />
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Options -->
      <div class="space-y-3 pt-2">
        <SCheckbox
          v-model="deleteBranch"
          label="Delete branch from repository"
          description="Removes the branch from the git repository"
          :disabled="isSubmitting"
        />

        <SCheckbox
          v-model="dropDatabase"
          label="Drop associated database"
          description="Deletes the database for this worktree"
          :disabled="isSubmitting"
        />

        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="dropDatabase" class="ml-7">
            <SCheckbox
              v-model="skipBackup"
              label="Skip database backup"
              description="Delete without creating a backup (dangerous)"
              :disabled="isSubmitting"
              danger
            />
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
    </div>

    <!-- ============================================================ -->
    <!-- Phase 2: Deleting (progress) -->
    <!-- ============================================================ -->
    <div v-else-if="phase === 'deleting'" class="py-8 text-center space-y-4">
      <div class="flex justify-center">
        <div class="relative">
          <svg class="w-12 h-12 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
      <div>
        <p class="text-text-primary font-medium">Deleting worktree...</p>
        <p class="text-text-muted text-sm mt-1">Running hooks and removing worktree files</p>
        <p v-if="elapsedDisplay" class="text-text-muted text-xs mt-2 tabular-nums">{{ elapsedDisplay }} elapsed</p>
      </div>
      <!-- Animated progress steps -->
      <div class="mt-4 mx-auto max-w-[220px] text-left space-y-2">
        <div class="flex items-center gap-2 text-xs text-text-muted">
          <svg class="w-3.5 h-3.5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <span>Running pre-remove hooks</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-text-muted animate-pulse">
          <svg class="w-3.5 h-3.5 text-accent flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Removing worktree files...</span>
        </div>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- Phase 3: Results -->
    <!-- ============================================================ -->
    <div v-else-if="phase === 'results' && deletionResult" class="space-y-5">
      <!-- Success header -->
      <div class="flex items-center gap-3 p-3 bg-success-muted/50 rounded-lg border border-success/20">
        <svg class="w-5 h-5 text-success flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p class="text-text-primary font-medium text-sm">Worktree deleted successfully</p>
          <p class="text-text-muted text-xs font-mono mt-0.5">{{ deletionResult.result.branch }}</p>
        </div>
      </div>

      <!-- Deletion details -->
      <div class="space-y-2">
        <h4 class="text-xs font-medium text-text-muted uppercase tracking-wider">Details</h4>
        <div class="bg-surface-overlay rounded-lg border border-white/[0.04] divide-y divide-white/[0.04]">
          <!-- Path -->
          <div class="px-3 py-2.5 flex items-center gap-3">
            <span class="text-text-muted text-xs flex-shrink-0 w-20">Path</span>
            <span class="text-text-secondary text-xs font-mono truncate">
              {{ deletionResult.result.path }}
            </span>
          </div>

          <!-- Branch deleted -->
          <div class="px-3 py-2.5 flex items-center gap-3">
            <span class="text-text-muted text-xs flex-shrink-0 w-20">Branch deleted</span>
            <SBadge :variant="deletionResult.result.branch_deleted ? 'success' : 'default'">
              {{ deletionResult.result.branch_deleted ? 'yes' : 'no' }}
            </SBadge>
          </div>

          <!-- Database dropped (only show if drop was requested) -->
          <div
            v-if="requestedDropDb"
            class="px-3 py-2.5 flex items-center gap-3"
          >
            <span class="text-text-muted text-xs flex-shrink-0 w-20">Database dropped</span>
            <SBadge :variant="deletionResult.result.db_dropped ? 'success' : 'default'">
              {{ deletionResult.result.db_dropped ? 'yes' : 'no' }}
            </SBadge>
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
            {{ failedHooks.length }} hook{{ failedHooks.length > 1 ? 's' : '' }} failed. The worktree was deleted but some cleanup may be incomplete.
          </p>
        </div>

        <div v-if="hasHooks" class="bg-surface-overlay rounded-lg border border-white/[0.04] divide-y divide-white/[0.04] max-h-48 overflow-y-auto">
          <div
            v-for="hook in deletionResult.hooks"
            :key="hook.name"
            class="px-3 py-2 flex items-center justify-between"
          >
            <span class="text-text-secondary text-xs font-mono truncate mr-3">
              {{ hook.name }}
            </span>
            <SBadge :variant="hook.status === 'success' ? 'success' : 'error'" class="flex-shrink-0">
              {{ hook.status === 'success' ? 'passed' : 'failed' }}
            </SBadge>
          </div>
        </div>

        <p v-else class="text-text-muted text-xs italic px-1">
          No hooks ran during deletion.
        </p>
      </div>
    </div>

    <template #footer>
      <!-- Confirm phase footer -->
      <div v-if="phase === 'confirm'" class="flex items-center justify-end gap-3">
        <!-- M9: Add ref for focus management -->
        <SButton
          ref="cancelButtonRef"
          variant="ghost"
          @click="handleClose"
          :disabled="isSubmitting"
        >
          Cancel
        </SButton>
        <SButton
          variant="danger"
          :loading="isSubmitting"
          :disabled="!protectionOverridden"
          @click="handleDelete"
        >
          Delete Worktree
        </SButton>
      </div>

      <!-- Deleting phase footer (no actions) -->
      <div v-else-if="phase === 'deleting'" />

      <!-- Results phase footer -->
      <div v-else-if="phase === 'results'" class="flex items-center justify-end gap-3">
        <SButton
          variant="ghost"
          @click="handleClose"
        >
          Close
        </SButton>
      </div>
    </template>
  </SModal>
</template>
