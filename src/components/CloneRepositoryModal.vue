<script setup lang="ts">
/**
 * CloneRepositoryModal Component
 *
 * Modal for cloning a new git repository with URL validation
 * and automatic repository name derivation.
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useWt, useToast } from '../composables'
import { SButton, SModal, SInput } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  cloned: []
}>()

const { cloneRepository, deriveRepoName } = useWt()
const { toast } = useToast()

const gitUrl = ref('')
const repoName = ref('')
const defaultBranch = ref('')
const isSubmitting = ref(false)
const error = ref<string | null>(null)
const urlInputRef = ref<HTMLInputElement | null>(null)

// URL validation patterns
const httpsPattern = /^https?:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+(?:\.git)?$/
const sshPattern = /^git@[\w.-]+:[\w/.-]+(?:\.git)?$/

// Validate Git URL
const urlError = computed(() => {
  if (!gitUrl.value) return null
  if (!isValidGitUrl(gitUrl.value)) {
    return 'Please enter a valid Git URL (HTTPS or SSH format)'
  }
  return null
})

function isValidGitUrl(url: string): boolean {
  return httpsPattern.test(url) || sshPattern.test(url)
}

// Auto-derive repo name from URL
watch(gitUrl, async (newUrl) => {
  if (isValidGitUrl(newUrl) && !repoName.value) {
    try {
      const derived = await deriveRepoName(newUrl)
      if (derived) {
        repoName.value = derived
      }
    } catch {
      // Silently fail - user can enter manually
    }
  }
})

// Reset form when modal opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    gitUrl.value = ''
    repoName.value = ''
    defaultBranch.value = ''
    error.value = null

    // Focus the URL input when modal opens
    await nextTick()
    urlInputRef.value?.focus()
  }
})

const isValid = computed(() => {
  return gitUrl.value.trim().length > 0 && isValidGitUrl(gitUrl.value)
})

async function handleSubmit() {
  if (!isValid.value) return

  isSubmitting.value = true
  error.value = null

  try {
    const result = await cloneRepository(
      gitUrl.value.trim(),
      repoName.value.trim() || undefined,
      defaultBranch.value.trim() || undefined
    )

    if (result.success) {
      toast.success(`Repository cloned: ${result.repo}`)
      emit('cloned')
      emit('close')
    } else {
      error.value = result.message || 'Failed to clone repository'
      toast.error(error.value)
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Failed to clone repository'
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
  <SModal
    :open="isOpen"
    max-width="max-w-md"
    @close="handleClose"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <svg class="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <h3 class="text-[14px] font-semibold tracking-tight text-text-primary">Clone Repository</h3>
      </div>
    </template>

    <form @submit.prevent="handleSubmit" class="space-y-5">
      <!-- Git URL -->
      <SInput
        ref="urlInputRef"
        v-model="gitUrl"
        label="Git URL"
        type="url"
        placeholder="https://github.com/user/repo.git"
        :disabled="isSubmitting"
        :error="urlError ?? undefined"
        hint="HTTPS or SSH format"
        required
      />

      <!-- Repository Name (optional) -->
      <SInput
        v-model="repoName"
        label="Repository Name"
        placeholder="Derived from URL if not specified"
        :disabled="isSubmitting"
        hint="Optional — derived from URL if not specified"
      />

      <!-- Default Branch (optional) -->
      <SInput
        v-model="defaultBranch"
        label="Default Branch"
        placeholder="Uses remote default if not specified"
        :disabled="isSubmitting"
        hint="Optional — uses remote default if not specified"
      />

      <!-- Progress indicator during clone -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div v-if="isSubmitting" class="p-4 bg-surface-overlay rounded-lg border border-white/[0.04]">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
              <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div>
              <p class="text-sm font-medium text-text-primary">Cloning repository...</p>
              <p class="text-xs text-text-muted mt-0.5">This may take a while for large repositories</p>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Error message -->
      <Transition
        enter-active-class="transition ease-out duration-150"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div v-if="error && !isSubmitting" class="p-3 bg-danger-muted rounded-lg border border-danger/20">
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
          Clone Repository
        </SButton>
      </div>
    </template>
  </SModal>
</template>
