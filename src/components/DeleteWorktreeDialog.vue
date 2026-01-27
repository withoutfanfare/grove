<script setup lang="ts">
/**
 * DeleteWorktreeDialog Component
 *
 * Confirmation dialog for deleting worktrees with options for
 * branch deletion, database removal, and backup preferences.
 */
import { ref, watch, nextTick } from 'vue'
import type { Worktree } from '../types'
import { useWorktrees, useToast } from '../composables'
import { Modal, Button, Checkbox } from './ui'

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

const deleteBranch = ref(false)
const dropDatabase = ref(false)
const skipBackup = ref(false)
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// M9: Ref for cancel button focus management
const cancelButtonRef = ref<InstanceType<typeof Button> | null>(null)

// Reset options when dialog opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    deleteBranch.value = false
    dropDatabase.value = false
    skipBackup.value = false
    error.value = null

    // M9: Focus cancel button when dialog opens for safer default
    await nextTick()
    // Access the button element through the component's $el
    const buttonEl = cancelButtonRef.value?.$el as HTMLButtonElement | undefined
    buttonEl?.focus()
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

  try {
    const success = await removeWorktree({
      repo: repoName,
      branch: worktree.branch,
      deleteBranch: deleteBranch.value,
      dropDb: dropDatabase.value,
      skipBackup: skipBackup.value,
      force: true, // Always force in GUI to avoid prompts
    })

    if (success) {
      toast.success(`Worktree deleted: ${worktree.branch}`)
      emit('deleted')
      emit('close')
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to delete worktree'
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
    :open="isOpen && !!worktree"
    title="Delete Worktree"
    size="md"
    :closable="!isSubmitting"
    @close="handleClose"
  >
    <template #icon>
      <div class="text-danger">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>
    </template>

    <template #subtitle>
      <code class="font-mono text-text-primary">{{ worktree?.branch }}</code>
    </template>

    <div class="space-y-5">
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

      <!-- Options -->
      <div class="space-y-3 pt-2">
        <Checkbox
          v-model="deleteBranch"
          label="Delete branch from repository"
          description="Removes the branch from the git repository"
          :disabled="isSubmitting"
        />

        <Checkbox
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
            <Checkbox
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

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <!-- M9: Add ref for focus management -->
        <Button
          ref="cancelButtonRef"
          variant="ghost"
          @click="handleClose"
          :disabled="isSubmitting"
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          :loading="isSubmitting"
          @click="handleDelete"
        >
          Delete Worktree
        </Button>
      </div>
    </template>
  </Modal>
</template>
