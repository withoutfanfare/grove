<script setup lang="ts">
/**
 * HooksPanel Component
 *
 * Displays and allows editing of grove lifecycle hooks.
 * Shows hooks grouped by event type with security status indicators.
 * Premium UI with refined styling and animations.
 */
import { ref, computed } from 'vue'
import { homeDir } from '@tauri-apps/api/path'
import { useToast, useWt } from '../../composables'
import { storeToRefs } from 'pinia'
import { useHooksStore, useSettingsStore } from '../../stores'
import type { HookEvent, HookScope, HookScriptMeta } from '../../types'
import { getHookEventLabel, getHookScopeLabel } from '../../types'
import { SButton } from '@stuntrocket/ui'
import { Input, ConfirmDialog, Dropdown, DropdownItem } from '../ui'
import { copyToClipboard } from '../../utils/clipboard'

const props = defineProps<{
  repoName?: string
}>()

const hooksStore = useHooksStore()
const settingsStore = useSettingsStore()
const { toast } = useToast()
const wt = useWt()
const { hooks, hooksByEvent, openHook, loading, saving } = storeToRefs(hooksStore)

const expandedEvents = ref<Set<HookEvent>>(new Set(['post_add']))
const isEditing = ref(false)
const editContent = ref('')
const isCreating = ref(false)
const newHookEvent = ref<HookEvent>('post_add')
const newHookScope = ref<HookScope>('global_d')
const newHookFileName = ref('')
const createError = ref('')
const showDeleteConfirm = ref(false)
const hookToDelete = ref<HookScriptMeta | null>(null)
const isDeleting = ref(false)

const lineNumbers = computed(() => {
  if (!editContent.value) return []
  return editContent.value.split('\n').map((_, i) => i + 1)
})

const eventOrder: HookEvent[] = [
  'pre_add', 'post_add', 'post_pull', 'post_switch', 'post_sync', 'pre_rm', 'post_rm',
]

const eventDescriptions: Record<HookEvent, string> = {
  pre_add: 'Runs before creating a new worktree',
  post_add: 'Runs after a new worktree is created',
  post_pull: 'Runs after pulling changes',
  post_switch: 'Runs after switching branches',
  post_sync: 'Runs after syncing',
  pre_rm: 'Runs before removing a worktree',
  post_rm: 'Runs after a worktree is removed',
}

const eventIcons: Record<HookEvent, string> = {
  pre_add: 'M12 4v16m8-8H4',
  post_add: 'M5 13l4 4L19 7',
  post_pull: 'M19 14l-7 7m0 0l-7-7m7 7V3',
  post_switch: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  post_sync: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  pre_rm: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  post_rm: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
}

function toggleEvent(event: HookEvent) {
  if (expandedEvents.value.has(event)) {
    expandedEvents.value.delete(event)
  } else {
    expandedEvents.value.add(event)
  }
}

function getSecurityBadge(hook: HookScriptMeta): { label: string; variant: 'success' | 'warning' | 'danger' | 'default' } {
  if (!hook.security.executable) return { label: 'Disabled', variant: 'default' }
  if (!hook.security.allowed_to_run) return { label: 'Blocked', variant: 'danger' }
  if (hook.security.world_writable) return { label: 'Insecure', variant: 'warning' }
  return { label: 'Enabled', variant: 'success' }
}

async function openForEdit(hook: HookScriptMeta) {
  try {
    await hooksStore.readHook(hook.path)
    editContent.value = openHook.value?.content ?? ''
    isEditing.value = true
  } catch (e) {
    console.error('Failed to open hook:', e)
    toast.error('Failed to open hook')
  }
}

async function saveEdit() {
  if (!openHook.value) return
  try {
    await hooksStore.writeHook(openHook.value.meta.path, editContent.value)
    toast.success('Hook saved')
    isEditing.value = false
    editContent.value = ''
  } catch (e) {
    console.error('Failed to save hook:', e)
    toast.error('Failed to save hook')
  }
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
  hooksStore.closeHook()
}

async function toggleExecutable(hook: HookScriptMeta) {
  try {
    await hooksStore.setHookExecutable(hook.path, !hook.security.executable, props.repoName)
    toast.success(hook.security.executable ? 'Hook disabled' : 'Hook enabled')
  } catch (e) {
    console.error('Failed to toggle hook executable:', e)
    toast.error('Failed to update hook')
  }
}

function requestDelete(hook: HookScriptMeta) {
  hookToDelete.value = hook
  showDeleteConfirm.value = true
}

function cancelDelete() {
  showDeleteConfirm.value = false
  hookToDelete.value = null
}

async function confirmDelete() {
  if (!hookToDelete.value) return
  isDeleting.value = true
  try {
    await hooksStore.deleteHook(hookToDelete.value.path, props.repoName)
    toast.success('Hook deleted')
    showDeleteConfirm.value = false
    hookToDelete.value = null
  } catch (e) {
    console.error('Failed to delete hook:', e)
    toast.error('Failed to delete hook')
  } finally {
    isDeleting.value = false
  }
}

async function copyPath(path: string) {
  const result = await copyToClipboard(path)
  if (result.success) {
    toast.success('Path copied')
  } else {
    toast.error('Failed to copy path')
  }
}

async function openInExternalEditor(path: string) {
  try {
    const { editor, customEditorPath } = settingsStore.settings
    await wt.openInEditor(path, editor, customEditorPath || undefined)
    toast.success('Opened in editor')
  } catch (e) {
    console.error('Failed to open in editor:', e)
    toast.error('Failed to open in editor')
  }
}

async function revealInFinder(path: string) {
  try {
    await wt.openInFinder(path)
  } catch (e) {
    console.error('Failed to reveal in Finder:', e)
    toast.error('Failed to reveal in Finder')
  }
}

async function openHooksFolder() {
  // Get the hooks directory from the first hook, or use default
  const firstHook = hooks.value[0]
  if (firstHook) {
    // Get parent directory of the hook (the event.d folder or hooks root)
    const hookPath = firstHook.path
    // Go up to the hooks root directory (past the .d folder if applicable)
    const pathParts = hookPath.split('/')
    // Find the 'hooks' directory in the path
    const hooksIndex = pathParts.findIndex(p => p === 'hooks')
    if (hooksIndex !== -1) {
      const hooksDir = pathParts.slice(0, hooksIndex + 1).join('/')
      try {
        await wt.openInFinder(hooksDir)
      } catch (e) {
        console.error('Failed to open hooks folder:', e)
        toast.error('Failed to open hooks folder')
      }
      return
    }
  }
  // Fallback to default hooks directory
  const homeDir = await getHomeDir()
  const defaultHooksDir = `${homeDir}/.grove/hooks`
  try {
    await wt.openInFinder(defaultHooksDir)
  } catch (e) {
    console.error('Failed to open hooks folder:', e)
    toast.error('Failed to open hooks folder')
  }
}

async function getHomeDir(): Promise<string> {
  try {
    return await homeDir()
  } catch {
    return '~'
  }
}

function startCreate() {
  isCreating.value = true
  newHookFileName.value = ''
  createError.value = ''
}

function cancelCreate() {
  isCreating.value = false
  newHookFileName.value = ''
  newHookEvent.value = 'post_add'
  newHookScope.value = 'global_d'
  createError.value = ''
}

async function createHook() {
  const filename = newHookFileName.value.trim()
  if (!filename) {
    createError.value = 'Filename is required'
    return
  }
  if (newHookScope.value !== 'single' && !/^\d{2}-/.test(filename)) {
    createError.value = 'Must start with two digits (e.g., 01-setup.sh)'
    return
  }
  if (/[/\;&|`$(){}[\]<>]/.test(filename)) {
    createError.value = 'Filename contains invalid characters'
    return
  }

  const defaultContent = `#!/bin/bash
# ${getHookEventLabel(newHookEvent.value)} hook
# Created by Grove

set -e

# Available environment variables:
# - WT_REPO_NAME: Repository name
# - WT_BRANCH: Branch name
# - WT_PATH: Worktree path

echo "Running ${newHookEvent.value} hook..."

# Add your commands here
`

  try {
    await hooksStore.createHook(newHookEvent.value, newHookScope.value, filename, defaultContent, props.repoName)
    toast.success('Hook created')
    cancelCreate()
  } catch (e: any) {
    createError.value = e?.message ?? 'Failed to create hook'
  }
}

function getHooksCount(event: HookEvent): number {
  return hooksByEvent.value[event]?.length ?? 0
}

function handleEditorKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    saveEdit()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    const target = e.target as HTMLTextAreaElement
    const start = target.selectionStart
    const end = target.selectionEnd
    editContent.value = editContent.value.substring(0, start) + '  ' + editContent.value.substring(end)
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + 2
    }, 0)
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-5 pb-4 border-b border-border-subtle/50">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
          <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Lifecycle Hooks</h3>
          <p class="text-xs text-text-muted">
            {{ hooks.length }} hook{{ hooks.length === 1 ? '' : 's' }} configured
          </p>
        </div>
      </div>
      <div v-if="!isEditing && !isCreating" class="flex items-center gap-2">
        <SButton variant="ghost" size="sm" title="Open hooks folder in Finder" @click="openHooksFolder">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </SButton>
        <SButton variant="primary" size="sm" @click="startCreate">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Hook
        </SButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && hooks.length === 0" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="relative">
          <div class="w-10 h-10 rounded-full border-2 border-accent/20" />
          <div class="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <span class="text-sm text-text-secondary">Loading hooks...</span>
      </div>
    </div>

    <!-- Create Form -->
    <div v-else-if="isCreating" class="flex-1 overflow-y-auto">
      <div class="create-form-card">
        <div class="mb-5">
          <h4 class="text-sm font-semibold text-text-primary">Create New Hook</h4>
          <p class="text-xs text-text-muted mt-1">Hooks run automatically during worktree operations</p>
        </div>

        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1.5">Event</label>
            <select
              v-model="newHookEvent"
              class="form-select"
            >
              <option v-for="event in eventOrder" :key="event" :value="event">
                {{ getHookEventLabel(event) }}
              </option>
            </select>
            <p class="text-2xs text-text-muted mt-1.5">{{ eventDescriptions[newHookEvent] }}</p>
          </div>

          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1.5">Scope</label>
            <select v-model="newHookScope" class="form-select">
              <option value="single">Single Hook</option>
              <option value="global_d">Global Script (.d)</option>
              <option value="repo_d" :disabled="!repoName">Repository Script (.d)</option>
            </select>
            <p class="text-2xs text-text-muted mt-1.5">
              {{ newHookScope === 'single' ? 'Replaces all .d scripts' : 'Runs with other .d scripts' }}
            </p>
          </div>
        </div>

        <Input
          v-model="newHookFileName"
          label="Filename"
          :placeholder="newHookScope === 'single' ? 'post-add' : '01-setup.sh'"
          :hint="newHookScope === 'single' ? 'Hook filename without extension' : 'Must start with two digits for ordering'"
          :error="createError || undefined"
        />

        <div class="flex justify-end gap-2 mt-5 pt-4 border-t border-border-subtle/50">
          <SButton variant="ghost" size="sm" @click="cancelCreate">Cancel</SButton>
          <SButton variant="primary" size="sm" :disabled="saving" @click="createHook">
            {{ saving ? 'Creating...' : 'Create Hook' }}
          </SButton>
        </div>
      </div>
    </div>

    <!-- Edit Mode -->
    <div v-else-if="isEditing && openHook" class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between mb-3 flex-shrink-0">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-semibold text-text-primary font-mono">{{ openHook.meta.name }}</h4>
            <span
              :class="[
                'px-2 py-0.5 text-2xs font-medium rounded-md border',
                getSecurityBadge(openHook.meta).variant === 'success' ? 'bg-success/10 text-success border-success/20' :
                getSecurityBadge(openHook.meta).variant === 'warning' ? 'bg-warning/10 text-warning border-warning/20' :
                getSecurityBadge(openHook.meta).variant === 'danger' ? 'bg-danger/10 text-danger border-danger/20' :
                'bg-surface-overlay text-text-muted border-border-subtle'
              ]"
            >
              {{ getSecurityBadge(openHook.meta).label }}
            </span>
          </div>
          <p class="text-xs text-text-muted mt-0.5">
            {{ getHookEventLabel(openHook.meta.event) }} • {{ getHookScopeLabel(openHook.meta.scope) }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <button class="editor-action-btn" title="Open in editor" @click="openInExternalEditor(openHook.meta.path)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
          <button class="editor-action-btn" title="Reveal in Finder" @click="revealInFinder(openHook.meta.path)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </button>
          <button class="editor-action-btn" title="Copy path" @click="copyPath(openHook.meta.path)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <div class="w-px h-5 bg-border-subtle mx-1" />
          <SButton variant="ghost" size="sm" :disabled="saving" @click="cancelEdit">Cancel</SButton>
          <SButton variant="primary" size="sm" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving...' : 'Save' }}
          </SButton>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex rounded-xl overflow-hidden editor-container">
        <div class="flex-shrink-0 py-3 px-3 bg-surface-base border-r border-border-subtle/30 select-none">
          <div
            v-for="num in lineNumbers"
            :key="num"
            class="text-2xs font-mono text-text-muted/60 text-right leading-5 h-5"
            style="min-width: 2.5ch"
          >
            {{ num }}
          </div>
        </div>
        <textarea
          v-model="editContent"
          class="flex-1 min-h-0 p-3 bg-surface-base text-sm font-mono text-text-primary resize-none focus:outline-none leading-5"
          placeholder="#!/bin/bash"
          spellcheck="false"
          @keydown="handleEditorKeydown"
        />
      </div>

      <div class="flex items-center justify-between mt-3 text-2xs text-text-muted flex-shrink-0">
        <span>Press <kbd class="kbd">Tab</kbd> to indent</span>
        <span><kbd class="kbd">⌘S</kbd> save • <kbd class="kbd">Esc</kbd> cancel</span>
      </div>
    </div>

    <!-- Hooks List by Event -->
    <div v-else class="flex-1 overflow-y-auto space-y-2 pr-1 hooks-scroll">
      <div
        v-for="event in eventOrder"
        :key="event"
        class="event-card"
      >
        <button
          class="event-header"
          @click="toggleEvent(event)"
        >
          <div class="flex items-center gap-3">
            <div class="event-icon" :class="{ 'event-icon-active': getHooksCount(event) > 0 }">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventIcons[event]" />
              </svg>
            </div>
            <div class="text-left">
              <span class="text-sm font-medium text-text-primary">{{ getHookEventLabel(event) }}</span>
              <p class="text-xs text-text-muted">{{ eventDescriptions[event] }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span
              :class="[
                'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                getHooksCount(event) > 0 ? 'bg-accent/15 text-accent' : 'bg-surface-overlay text-text-muted'
              ]"
            >
              {{ getHooksCount(event) }}
            </span>
            <svg
              class="w-4 h-4 text-text-muted transition-transform duration-200"
              :class="{ 'rotate-90': expandedEvents.has(event) }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div v-if="expandedEvents.has(event)" class="event-content">
            <div v-if="hooksByEvent[event]?.length" class="divide-y divide-border-subtle/30">
              <div
                v-for="hook in hooksByEvent[event]"
                :key="hook.path"
                class="hook-item group"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-mono text-text-primary">{{ hook.name }}</span>
                    <span
                      :class="[
                        'px-1.5 py-0.5 text-2xs font-medium rounded-md border',
                        getSecurityBadge(hook).variant === 'success' ? 'bg-success/10 text-success border-success/20' :
                        getSecurityBadge(hook).variant === 'warning' ? 'bg-warning/10 text-warning border-warning/20' :
                        getSecurityBadge(hook).variant === 'danger' ? 'bg-danger/10 text-danger border-danger/20' :
                        'bg-surface-overlay text-text-muted border-border-subtle'
                      ]"
                    >
                      {{ getSecurityBadge(hook).label }}
                    </span>
                    <span v-if="hook.scope !== 'single'" class="text-2xs text-text-muted px-1.5 py-0.5 bg-surface-overlay/50 rounded">
                      {{ getHookScopeLabel(hook.scope) }}
                    </span>
                  </div>
                  <p v-if="hook.security.blocked_reason" class="text-2xs text-danger mt-1">
                    {{ hook.security.blocked_reason }}
                  </p>
                </div>
                <div class="flex-shrink-0">
                  <Dropdown align="right">
                    <template #trigger>
                      <button class="w-7 h-7 rounded-lg text-white flex items-center justify-center transition-colors" style="background-color: #334155" title="Actions">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    </template>

                    <template #default="{ close }">
                      <DropdownItem @click="() => { openForEdit(hook); close() }">
                        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit in Grove
                      </DropdownItem>
                      <DropdownItem @click="() => { openInExternalEditor(hook.path); close() }">
                        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in Editor
                      </DropdownItem>
                      <DropdownItem @click="() => { revealInFinder(hook.path); close() }">
                        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        Reveal in Finder
                      </DropdownItem>
                      <DropdownItem @click="() => { copyPath(hook.path); close() }">
                        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Path
                      </DropdownItem>

                      <div class="my-1 border-t border-border-subtle" />

                      <DropdownItem @click="() => { toggleExecutable(hook); close() }">
                        <svg class="w-4 h-4" :class="hook.security.executable ? 'text-success' : 'text-text-muted'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path v-if="hook.security.executable" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {{ hook.security.executable ? 'Disable Hook' : 'Enable Hook' }}
                      </DropdownItem>

                      <div class="my-1 border-t border-border-subtle" />

                      <DropdownItem danger @click="() => { requestDelete(hook); close() }">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Hook
                      </DropdownItem>
                    </template>
                  </Dropdown>
                </div>
              </div>
            </div>
            <div v-else class="empty-event">
              <svg class="w-8 h-8 text-text-muted/50 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p class="text-text-muted text-sm mb-2">No hooks for this event</p>
              <SButton variant="ghost" size="sm" @click="startCreate(); newHookEvent = event">
                Create {{ getHookEventLabel(event) }} hook
              </SButton>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <ConfirmDialog
      :open="showDeleteConfirm"
      title="Delete Hook"
      :message="`Delete '${hookToDelete?.name}'? This cannot be undone.`"
      confirm-label="Delete"
      variant="danger"
      :loading="isDeleting"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.hooks-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}
.hooks-scroll::-webkit-scrollbar { width: 6px; }
.hooks-scroll::-webkit-scrollbar-track { background: transparent; }
.hooks-scroll::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
.hooks-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-border-default); }

.create-form-card {
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
}

.form-select {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  transition: all 0.15s;
  background: var(--color-surface-base);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.form-select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.event-card {
  border-radius: 0.75rem;
  overflow: hidden;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
}
.event-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}

.event-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  transition: background-color 0.15s;
}
.event-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.event-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-muted);
}
.event-icon-active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--color-accent);
}

.event-content {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.hook-item {
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background-color 0.15s;
}
.hook-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.hook-action-btn {
  padding: 0.375rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.15s;
}
.hook-action-btn:hover {
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
}

.editor-action-btn {
  padding: 0.375rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.15s;
}
.editor-action-btn:hover {
  background: var(--color-surface-overlay);
  color: var(--color-accent);
}

.editor-container {
  background: var(--color-surface-base);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
}

.empty-event {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.kbd {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-family: var(--font-mono);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
</style>

