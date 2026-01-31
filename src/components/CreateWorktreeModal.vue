<script setup lang="ts">
/**
 * CreateWorktreeModal Component
 *
 * Premium modal for creating new worktrees with branch selection,
 * base branch picker with dropdown, and template selection.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore, useSettingsStore } from '../stores'
import type { ConfigLayer } from '../types'
import { useWorktrees, useWt, useToast } from '../composables'
import { Modal, Button, Input } from './ui'
import type { Branch } from '../types'

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
const { createWorktree, listBranches } = useWorktrees()
const { readConfigFile } = useWt()
const { toast } = useToast()

const branch = ref('')
const baseBranch = ref(settingsStore.settings.defaultBaseBranch)
const isSubmitting = ref(false)
const error = ref<string | null>(null)

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

// Reset form when modal opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    branch.value = ''

    // Use repo-specific default_base_branch if available, otherwise fall back to global setting
    let defaultBase = settingsStore.settings.defaultBaseBranch
    if (selectedRepoName.value) {
      try {
        const repoConfig = await readConfigFile('repo' as ConfigLayer, selectedRepoName.value)
        const entry = repoConfig.entries.find(e => e.key === 'DEFAULT_BASE_BRANCH' && !e.commented)
        if (entry?.value) {
          defaultBase = entry.value
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

    // Fetch branches for the selected repo
    if (selectedRepoName.value) {
      loadingBranches.value = true
      const result = await listBranches(selectedRepoName.value)
      if (result) {
        branches.value = result.branches
      }
      loadingBranches.value = false
    }

    // M9: Focus the branch input when modal opens
    // Use nextTick to ensure DOM is updated
    await nextTick()
    branchInputRef.value?.focus()
  } else {
    // M7: Clear branch filter when modal closes
    branchFilter.value = ''
  }
})

function selectBranch(branchName: string) {
  baseBranch.value = branchName
  branchFilter.value = branchName
  showBranchDropdown.value = false
  dropdownHovered.value = false
  // M7: branchFilter is set to selected branch name for display,
  // will be reset when modal reopens (see watch on isOpen)
}

function handleBranchInputFocus() {
  showBranchDropdown.value = true
}

function handleBranchInputBlur() {
  // Only close dropdown if not hovering over it
  // This prevents race condition where blur fires before click
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

  try {
    const success = await createWorktree({
      repo: selectedRepoName.value,
      branch: branch.value.trim(),
      base: baseBranch.value || undefined,
    })

    if (success) {
      toast.success(`Worktree created: ${branch.value.trim()}`)
      emit('created')
      emit('close')
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to create worktree'
    error.value = errorMessage
    toast.error(errorMessage)
  } finally {
    isSubmitting.value = false
  }
}

function handleClose() {
  if (!isSubmitting.value) {
    emit('close')
  }
}
</script>

<template>
  <Modal
    :open="isOpen"
    title="Create Worktree"
    size="md"
    :closable="!isSubmitting"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    </template>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <!-- Repository (read-only) -->
      <div>
        <label class="block text-sm font-medium text-text-secondary mb-1.5">
          Repository
        </label>
        <div class="px-3 py-2.5 bg-surface-overlay rounded-lg text-text-muted border border-border-subtle font-mono text-sm">
          {{ selectedRepoName || 'No repository selected' }}
        </div>
      </div>

      <!-- Branch name -->
      <!-- M9: Added ref for focus management -->
      <Input
        ref="branchInputRef"
        v-model="branch"
        label="Branch Name"
        placeholder="feature/my-feature"
        :disabled="isSubmitting"
        autofocus
      />

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
          class="w-full px-3 py-2.5 bg-surface-overlay border border-border-default rounded-lg text-text-primary placeholder-text-muted text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
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
            class="absolute z-10 w-full mt-1 bg-surface-raised border border-border-subtle rounded-lg shadow-elevated max-h-48 overflow-y-auto"
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

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <Button
          variant="ghost"
          @click="handleClose"
          :disabled="isSubmitting"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          :loading="isSubmitting"
          :disabled="!isValid"
          @click="handleSubmit"
        >
          Create Worktree
        </Button>
      </div>
    </template>
  </Modal>
</template>
