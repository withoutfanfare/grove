<script setup lang="ts">
/**
 * BatchDeleteDialog
 *
 * Confirm-only dialog for deleting several worktrees at once. Lists any dirty
 * worktrees by name, exposes uniform delete options, and emits `confirm` with
 * the chosen options. The actual deletion + progress is handled by the parent
 * via the shared OperationProgressPanel.
 */
import { ref, computed, watch } from 'vue'
import type { Worktree } from '../types'
import { SButton, SModal, SCheckbox } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
  worktrees: Worktree[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [options: { deleteBranch: boolean; dropDb: boolean; skipBackup: boolean }]
}>()

const deleteBranch = ref(true)
const dropDatabase = ref(false)
const skipBackup = ref(false)

const count = computed(() => props.worktrees.length)
const dirtyWorktrees = computed(() => props.worktrees.filter((w) => w.dirty))

// Reset options each time the dialog opens
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      deleteBranch.value = true
      dropDatabase.value = false
      skipBackup.value = false
    }
  }
)

function handleConfirm() {
  emit('confirm', {
    deleteBranch: deleteBranch.value,
    dropDb: dropDatabase.value,
    skipBackup: skipBackup.value,
  })
}
</script>

<template>
  <SModal :open="isOpen" max-width="max-w-md" @close="emit('close')">
    <template #header>
      <div class="flex items-center gap-3">
        <div class="text-danger">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <h3 class="text-[14px] font-semibold tracking-tight text-text-primary">
          Delete {{ count }} worktree{{ count === 1 ? '' : 's' }}
        </h3>
      </div>
    </template>

    <div class="space-y-5">
      <p class="text-text-secondary text-sm leading-relaxed">
        Are you sure you want to delete {{ count }} worktree{{ count === 1 ? '' : 's' }}?
        This action cannot be undone.
      </p>

      <!-- Dirty warning -->
      <div v-if="dirtyWorktrees.length > 0" class="p-3 bg-warning-muted rounded-lg border border-warning/20">
        <div class="flex items-start gap-2">
          <svg class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p class="text-warning text-sm font-medium">
              {{ dirtyWorktrees.length }} with uncommitted changes
            </p>
            <ul class="text-warning/80 text-xs mt-1 space-y-0.5">
              <li v-for="wt in dirtyWorktrees" :key="wt.path" class="font-mono truncate">{{ wt.branch }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Options (applied to every selected worktree) -->
      <div class="space-y-3 pt-1">
        <SCheckbox
          v-model="deleteBranch"
          label="Delete branches"
          description="Removes each branch from the git repository"
        />
        <SCheckbox
          v-model="dropDatabase"
          label="Drop associated databases"
          description="Deletes the database for each worktree"
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
              danger
            />
          </div>
        </Transition>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <SButton variant="ghost" @click="emit('close')">Cancel</SButton>
        <SButton variant="danger" data-testid="batch-delete-confirm" @click="handleConfirm">
          Delete {{ count }}
        </SButton>
      </div>
    </template>
  </SModal>
</template>
