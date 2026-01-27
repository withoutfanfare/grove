<script setup lang="ts">
/**
 * SettingsModal Component
 *
 * Application settings modal with preferences for editor, terminal,
 * Git client, default base branch, and notification settings.
 */
import { ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore, EDITOR_OPTIONS, TERMINAL_OPTIONS, GIT_CLIENT_OPTIONS } from '../stores'
import type { EditorChoice, TerminalChoice, GitClientChoice } from '../stores'
import { Modal, Button, Input, Select, Toggle } from './ui'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useSettingsStore()
const { settings } = storeToRefs(store)

// Local copies for editing
const editor = ref<EditorChoice>(settings.value.editor)
const customEditorPath = ref(settings.value.customEditorPath)
const terminal = ref<TerminalChoice>(settings.value.terminal)
const gitClient = ref<GitClientChoice>(settings.value.gitClient)
const customGitClientPath = ref(settings.value.customGitClientPath)
const defaultBaseBranch = ref(settings.value.defaultBaseBranch)
const enableNotifications = ref(settings.value.enableNotifications)

// M6: Validation for custom editor path
const customEditorPathError = computed(() => {
  if (editor.value !== 'custom') return ''
  const path = customEditorPath.value.trim()
  if (!path) return 'Editor path is required when using custom editor'
  if (/[;&|`$(){}[\]<>]/.test(path)) return 'Path contains invalid characters'
  if (!path.startsWith('/') && !path.startsWith('~')) {
    return 'Path should be absolute (start with / or ~)'
  }
  return ''
})

// Validation for custom git client path
const customGitClientPathError = computed(() => {
  if (gitClient.value !== 'custom') return ''
  const path = customGitClientPath.value.trim()
  if (!path) return 'Git client path is required when using custom'
  if (/[;&|`$(){}[\]<>]/.test(path)) return 'Path contains invalid characters'
  if (!path.startsWith('/') && !path.startsWith('~')) {
    return 'Path should be absolute (start with / or ~)'
  }
  return ''
})

// L8: Validation for base branch
const baseBranchError = computed(() => {
  const branch = defaultBaseBranch.value.trim()
  if (!branch) return ''
  if (/[;&|`$(){}[\]<>\s]/.test(branch)) return 'Branch name contains invalid characters'
  if (branch.startsWith('-')) return 'Branch name cannot start with a hyphen'
  return ''
})

// Check if form is valid for saving
const isFormValid = computed(() => {
  return !customEditorPathError.value && !customGitClientPathError.value && !baseBranchError.value
})

// Reset local values when modal opens
watch(() => props.isOpen, (open) => {
  if (open) {
    editor.value = settings.value.editor
    customEditorPath.value = settings.value.customEditorPath
    terminal.value = settings.value.terminal
    gitClient.value = settings.value.gitClient
    customGitClientPath.value = settings.value.customGitClientPath
    defaultBaseBranch.value = settings.value.defaultBaseBranch
    enableNotifications.value = settings.value.enableNotifications
  }
})

function handleSave() {
  if (!isFormValid.value) return

  store.setEditor(editor.value)
  store.setCustomEditorPath(customEditorPath.value)
  store.setTerminal(terminal.value)
  store.setGitClient(gitClient.value)
  store.setCustomGitClientPath(customGitClientPath.value)
  store.setDefaultBaseBranch(defaultBaseBranch.value)
  store.setEnableNotifications(enableNotifications.value)
  emit('close')
}

function handleCancel() {
  emit('close')
}

function handleReset() {
  store.resetToDefaults()
  editor.value = settings.value.editor
  customEditorPath.value = settings.value.customEditorPath
  terminal.value = settings.value.terminal
  gitClient.value = settings.value.gitClient
  customGitClientPath.value = settings.value.customGitClientPath
  defaultBaseBranch.value = settings.value.defaultBaseBranch
  enableNotifications.value = settings.value.enableNotifications
}

// Get descriptions
const editorDescription = computed(() => {
  return EDITOR_OPTIONS.find(o => o.value === editor.value)?.description || ''
})

const gitClientDescription = computed(() => {
  return GIT_CLIENT_OPTIONS.find(o => o.value === gitClient.value)?.description || ''
})
</script>

<template>
  <Modal
    :open="isOpen"
    title="Settings"
    size="lg"
    @close="handleCancel"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </template>

    <div class="space-y-6">
      <!-- Editor Section -->
      <section class="space-y-4">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Editor & Terminal
        </h3>

        <div class="space-y-4">
          <Select
            v-model="editor"
            label="Code Editor"
            :options="EDITOR_OPTIONS"
          />
          <p class="text-2xs text-text-muted -mt-2">{{ editorDescription }}</p>

          <Transition
            enter-active-class="transition ease-out duration-150"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-100"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <Input
              v-if="editor === 'custom'"
              v-model="customEditorPath"
              label="Custom Editor Path"
              placeholder="/Applications/YourEditor.app"
              hint="Full path to your editor application"
              :error="customEditorPathError || undefined"
            />
          </Transition>

          <Select
            v-model="terminal"
            label="Terminal Application"
            :options="TERMINAL_OPTIONS"
          />
        </div>
      </section>

      <div class="divider-horizontal" />

      <!-- Git Client Section -->
      <section class="space-y-4">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Git Client
        </h3>

        <div class="space-y-4">
          <Select
            v-model="gitClient"
            label="Git Client Application"
            :options="GIT_CLIENT_OPTIONS"
          />
          <p class="text-2xs text-text-muted -mt-2">{{ gitClientDescription }}</p>

          <Transition
            enter-active-class="transition ease-out duration-150"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition ease-in duration-100"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <Input
              v-if="gitClient === 'custom'"
              v-model="customGitClientPath"
              label="Custom Git Client Path"
              placeholder="/Applications/YourGitClient.app"
              hint="Full path to your Git client application"
              :error="customGitClientPathError || undefined"
            />
          </Transition>
        </div>
      </section>

      <div class="divider-horizontal" />

      <!-- Git Defaults Section -->
      <section class="space-y-4">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Git Defaults
        </h3>

        <Input
          v-model="defaultBaseBranch"
          label="Default Base Branch"
          placeholder="origin/staging"
          hint="Default branch to base new worktrees on"
          :error="baseBranchError || undefined"
        />
      </section>

      <div class="divider-horizontal" />

      <!-- Notifications Section -->
      <section class="space-y-4">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Notifications
        </h3>

        <Toggle
          v-model="enableNotifications"
          label="Enable Notifications"
          description="Show toast notifications for operations"
        />
      </section>
    </div>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <Button
          variant="ghost"
          size="sm"
          @click="handleReset"
        >
          Reset to Defaults
        </Button>
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            @click="handleCancel"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            :disabled="!isFormValid"
            @click="handleSave"
          >
            Save Settings
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>
