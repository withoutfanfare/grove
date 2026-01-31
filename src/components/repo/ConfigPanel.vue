<script setup lang="ts">
/**
 * ConfigPanel Component
 *
 * Displays and allows editing of wt configuration files.
 * Shows effective config (resolved values) and individual config layers.
 * Premium UI with glassmorphism and refined styling.
 */
import { ref, computed } from 'vue'
import { useToast } from '../../composables'
import { useWt } from '../../composables'
import { storeToRefs } from 'pinia'
import { useRepoConfigStore } from '../../stores'
import type { ConfigLayer, ConfigFileMeta } from '../../types'
import { getConfigLayerLabel } from '../../types'
import { Button } from '../ui'
import { copyToClipboard } from '../../utils/clipboard'

const props = defineProps<{
  repoName?: string
}>()

const configStore = useRepoConfigStore()
const { toast } = useToast()
const wt = useWt()
const { effectiveConfig, configFiles, openFile, loading, saving } = storeToRefs(configStore)

type ViewMode = 'effective' | 'layers'
const viewMode = ref<ViewMode>('effective')

const isEditing = ref(false)
const isViewOnly = ref(false)
const editContent = ref('')
const editLayer = ref<ConfigLayer | null>(null)

// Track unsaved changes
const hasUnsavedChanges = computed(() => {
  if (!isEditing.value || !openFile.value) return false
  return editContent.value !== openFile.value.content
})

// Line numbers for editor
const lineNumbers = computed(() => {
  if (!editContent.value) return []
  return editContent.value.split('\n').map((_, i) => i + 1)
})

function getFileStatus(file: ConfigFileMeta): { label: string; variant: 'default' | 'success' | 'warning' | 'danger' } {
  if (!file.exists) return { label: 'Not Created', variant: 'default' }
  if (!file.writable) return { label: 'Read Only', variant: 'warning' }
  if (file.is_symlink) return { label: 'Symlink', variant: 'default' }
  return { label: 'Writable', variant: 'success' }
}

async function openForEdit(layer: ConfigLayer, viewOnly = false) {
  try {
    await configStore.openConfigFile(layer, props.repoName)
    editLayer.value = layer
    editContent.value = openFile.value?.content ?? ''
    isEditing.value = true
    isViewOnly.value = viewOnly
  } catch (e) {
    console.error('Failed to open config file:', e)
    toast.error('Failed to open configuration file')
  }
}

async function reloadFile() {
  if (!editLayer.value) return
  try {
    await configStore.openConfigFile(editLayer.value, props.repoName)
    editContent.value = openFile.value?.content ?? ''
    toast.success('File reloaded')
  } catch (e) {
    console.error('Failed to reload file:', e)
    toast.error('Failed to reload file')
  }
}

async function copyFileContents() {
  const result = await copyToClipboard(editContent.value)
  if (result.success) {
    toast.success('Contents copied')
  } else {
    toast.error('Failed to copy contents')
  }
}

async function saveEdit() {
  if (!editLayer.value) return
  try {
    await configStore.saveConfigFile(editLayer.value, editContent.value, props.repoName)
    toast.success('Configuration saved successfully')
    isEditing.value = false
    editLayer.value = null
    editContent.value = ''
  } catch (e) {
    console.error('Failed to save config file:', e)
    toast.error('Failed to save configuration')
  }
}

function cancelEdit() {
  isEditing.value = false
  isViewOnly.value = false
  editLayer.value = null
  editContent.value = ''
  configStore.closeFile()
}

async function createConfigFile(layer: ConfigLayer) {
  const defaultContent = `# wt configuration file
# Created by Grove

# Default base branch for new worktrees
# DEFAULT_BASE=origin/staging

# Protected branches (space-separated)
# PROTECTED_BRANCHES="main staging production"

# Database settings
# DB_CREATE=true
# DB_HOST=127.0.0.1
# DB_USER=root
`
  try {
    await configStore.saveConfigFile(layer, defaultContent, props.repoName)
    await configStore.loadConfigFiles(props.repoName)
    toast.success('Configuration file created')
    await openForEdit(layer)
  } catch (e) {
    console.error('Failed to create config file:', e)
    toast.error('Failed to create configuration file')
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
    await wt.openInEditor(path)
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

function formatTime(isoDate?: string): string {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
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
    <!-- View Mode Toggle - Premium pill switcher -->
    <div class="flex items-center justify-between mb-5 pb-4 border-b border-border-subtle/50">
      <div class="inline-flex items-center p-1 rounded-xl bg-surface-base/80 backdrop-blur-sm border border-border-subtle/30">
        <button
          :class="[
            'px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200',
            viewMode === 'effective'
              ? 'bg-accent text-white shadow-md shadow-accent/25'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/50'
          ]"
          @click="viewMode = 'effective'"
        >
          <span class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Resolved Values
          </span>
        </button>
        <button
          :class="[
            'px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200',
            viewMode === 'layers'
              ? 'bg-accent text-white shadow-md shadow-accent/25'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/50'
          ]"
          @click="viewMode = 'layers'"
        >
          <span class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Config Files
          </span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !effectiveConfig" class="flex-1 flex items-center justify-center">
      <div class="flex flex-col items-center gap-3">
        <div class="relative">
          <div class="w-10 h-10 rounded-full border-2 border-accent/20" />
          <div class="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <span class="text-sm text-text-secondary">Loading configuration...</span>
      </div>
    </div>

    <!-- Effective Config View -->
    <div v-else-if="viewMode === 'effective'" class="flex-1 overflow-y-auto space-y-4 pr-1 config-scroll">
      <div v-if="effectiveConfig" class="grid gap-4">
        <!-- Core Settings Card -->
        <div class="config-card group">
          <div class="config-card-header">
            <div class="config-card-icon bg-gradient-to-br from-accent/20 to-accent/5">
              <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h4 class="text-sm font-semibold text-text-primary">Core Settings</h4>
          </div>
          <div class="config-card-content">
            <dl class="grid grid-cols-2 gap-x-6 gap-y-4">
              <div class="config-field">
                <dt class="config-label">Default Base Branch</dt>
                <dd class="config-value">
                  <span class="config-mono-badge">
                    {{ effectiveConfig.default_base_branch || 'origin/staging' }}
                  </span>
                </dd>
              </div>
              <div class="config-field">
                <dt class="config-label">Protected Branches</dt>
                <dd class="config-value">
                  <span v-if="effectiveConfig.protected_branches.length" class="config-mono-badge">
                    {{ effectiveConfig.protected_branches.join(', ') }}
                  </span>
                  <span v-else class="text-text-muted italic text-xs">None configured</span>
                </dd>
              </div>
              <div class="config-field">
                <dt class="config-label">Hooks Enabled</dt>
                <dd class="config-value">
                  <span
                    :class="[
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
                      effectiveConfig.hooks_enabled
                        ? 'bg-success/10 text-success border border-success/20'
                        : 'bg-surface-overlay text-text-muted border border-border-subtle'
                    ]"
                  >
                    <span
                      :class="[
                        'w-1.5 h-1.5 rounded-full',
                        effectiveConfig.hooks_enabled ? 'bg-success animate-pulse' : 'bg-text-muted'
                      ]"
                    />
                    {{ effectiveConfig.hooks_enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </dd>
              </div>
              <div class="config-field">
                <dt class="config-label">HERD Root</dt>
                <dd class="config-value">
                  <span
                    v-if="effectiveConfig.herd_root"
                    class="config-mono-badge truncate max-w-[200px]"
                    :title="effectiveConfig.herd_root"
                  >
                    {{ effectiveConfig.herd_root }}
                  </span>
                  <span v-else class="text-text-muted italic text-xs">Not configured</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- Paths Card -->
        <div class="config-card group">
          <div class="config-card-header">
            <div class="config-card-icon bg-gradient-to-br from-info/20 to-info/5">
              <svg class="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <h4 class="text-sm font-semibold text-text-primary">Paths</h4>
          </div>
          <div class="config-card-content">
            <dl class="space-y-4">
              <div class="config-field-row">
                <dt class="config-label">Config Directory</dt>
                <dd class="config-mono-badge">
                  {{ effectiveConfig.config_dir || '~/.wt' }}
                </dd>
              </div>
              <div class="config-field-row">
                <dt class="config-label">Hooks Directory</dt>
                <dd class="config-mono-badge">
                  {{ effectiveConfig.hooks_dir || '~/.wt/hooks' }}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- Database Card -->
        <div v-if="effectiveConfig.database" class="config-card group">
          <div class="config-card-header">
            <div class="config-card-icon bg-gradient-to-br from-warning/20 to-warning/5">
              <svg class="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <h4 class="text-sm font-semibold text-text-primary">Database</h4>
          </div>
          <div class="config-card-content">
            <dl class="grid grid-cols-3 gap-4">
              <div class="config-field">
                <dt class="config-label">Auto-create</dt>
                <dd class="config-value">
                  <span
                    :class="[
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
                      effectiveConfig.database.enabled
                        ? 'bg-success/10 text-success border border-success/20'
                        : 'bg-surface-overlay text-text-muted border border-border-subtle'
                    ]"
                  >
                    {{ effectiveConfig.database.enabled ? 'Yes' : 'No' }}
                  </span>
                </dd>
              </div>
              <div class="config-field">
                <dt class="config-label">Host</dt>
                <dd class="config-mono-badge">{{ effectiveConfig.database.host || 'localhost' }}</dd>
              </div>
              <div class="config-field">
                <dt class="config-label">User</dt>
                <dd class="config-mono-badge">{{ effectiveConfig.database.user || 'root' }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div v-else class="flex-1 flex flex-col items-center justify-center py-12 text-center">
        <div class="w-12 h-12 rounded-full bg-surface-overlay/50 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p class="text-text-secondary text-sm">No configuration loaded</p>
        <p class="text-text-muted text-xs mt-1">Select a repository to view its configuration</p>
      </div>
    </div>

    <!-- Config Files View -->
    <div v-else-if="viewMode === 'layers'" class="flex-1 overflow-hidden flex flex-col">
      <!-- Editor Mode -->
      <div v-if="isEditing && openFile" class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between mb-3 flex-shrink-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h4 class="text-sm font-semibold text-text-primary">
                {{ getConfigLayerLabel(openFile.meta.layer) }}
              </h4>
              <span
                v-if="isViewOnly"
                class="px-2 py-0.5 text-2xs font-medium rounded-md bg-warning/10 text-warning border border-warning/20"
              >
                View Only
              </span>
              <span
                v-else
                class="px-2 py-0.5 text-2xs font-medium rounded-md bg-accent/10 text-accent border border-accent/20"
              >
                Editing
              </span>
              <span
                v-if="hasUnsavedChanges"
                class="px-2 py-0.5 text-2xs font-medium rounded-md bg-warning/10 text-warning border border-warning/20 animate-pulse"
              >
                Unsaved
              </span>
            </div>
            <p class="text-xs text-text-muted font-mono truncate mt-1">{{ openFile.meta.path }}</p>
          </div>
          <div class="flex items-center gap-1">
            <button class="editor-action-btn" title="Open in external editor" @click="openInExternalEditor(openFile.meta.path)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
            <button class="editor-action-btn" title="Reveal in Finder" @click="revealInFinder(openFile.meta.path)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            <button class="editor-action-btn" title="Copy path" @click="copyPath(openFile.meta.path)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button class="editor-action-btn" title="Copy contents" @click="copyFileContents">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button class="editor-action-btn" title="Reload" @click="reloadFile">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div class="w-px h-5 bg-border-subtle mx-1" />
            <Button variant="ghost" size="sm" :disabled="saving" @click="cancelEdit">Cancel</Button>
            <Button v-if="!isViewOnly" variant="primary" size="sm" :disabled="saving" @click="saveEdit">
              {{ saving ? 'Saving...' : 'Save' }}
            </Button>
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
            class="flex-1 min-h-0 p-3 bg-surface-base text-sm font-mono text-text-primary resize-none focus:outline-none leading-5 config-editor"
            placeholder="# Configuration file..."
            spellcheck="false"
            @keydown="handleEditorKeydown"
          />
        </div>

        <div class="flex items-center justify-between mt-3 text-2xs text-text-muted flex-shrink-0">
          <span>Press <kbd class="kbd">Tab</kbd> to indent</span>
          <span><kbd class="kbd">⌘S</kbd> save • <kbd class="kbd">Esc</kbd> cancel</span>
        </div>
      </div>

      <!-- File List -->
      <div v-else class="flex-1 overflow-y-auto space-y-3 pr-1 config-scroll">
        <div
          v-for="file in configFiles"
          :key="file.path"
          class="file-card group"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <div class="file-icon">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                    {{ getConfigLayerLabel(file.layer) }}
                  </h4>
                  <p class="text-xs text-text-muted font-mono truncate max-w-[300px]" :title="file.path">
                    {{ file.path }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-3 mt-3 ml-8">
                <span
                  :class="[
                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-2xs font-medium border',
                    getFileStatus(file).variant === 'success' ? 'bg-success/10 text-success border-success/20' :
                    getFileStatus(file).variant === 'warning' ? 'bg-warning/10 text-warning border-warning/20' :
                    getFileStatus(file).variant === 'danger' ? 'bg-danger/10 text-danger border-danger/20' :
                    'bg-surface-overlay text-text-muted border-border-subtle'
                  ]"
                >
                  <span v-if="getFileStatus(file).variant === 'success'" class="w-1.5 h-1.5 rounded-full bg-success" />
                  {{ getFileStatus(file).label }}
                </span>
                <span v-if="file.last_modified" class="text-2xs text-text-muted">
                  Modified {{ formatTime(file.last_modified) }}
                </span>
                <span v-if="file.is_symlink && file.symlink_target" class="text-2xs text-text-muted flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {{ file.symlink_target }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <template v-if="file.exists">
                <button class="file-action-btn" title="Open in editor" @click="openInExternalEditor(file.path)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button class="file-action-btn" title="Reveal in Finder" @click="revealInFinder(file.path)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
                <button class="file-action-btn" title="Copy path" @click="copyPath(file.path)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <div class="w-px h-4 bg-border-subtle mx-1" />
              </template>
              <Button v-if="file.exists && file.writable" variant="ghost" size="sm" @click="openForEdit(file.layer)">Edit</Button>
              <Button v-else-if="!file.exists" variant="primary" size="sm" @click="createConfigFile(file.layer)">
                <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Create
              </Button>
              <Button v-else-if="file.exists" variant="ghost" size="sm" @click="openForEdit(file.layer, true)">View</Button>
            </div>
          </div>
        </div>

        <div v-if="configFiles.length === 0" class="flex-1 flex flex-col items-center justify-center py-12 text-center">
          <div class="w-12 h-12 rounded-full bg-surface-overlay/50 flex items-center justify-center mb-4">
            <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p class="text-text-secondary text-sm">No configuration files found</p>
          <p class="text-text-muted text-xs mt-1">Configuration files will appear here when available</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.config-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}
.config-scroll::-webkit-scrollbar { width: 6px; }
.config-scroll::-webkit-scrollbar-track { background: transparent; }
.config-scroll::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
.config-scroll::-webkit-scrollbar-thumb:hover { background: var(--color-border-default); }

.config-card {
  position: relative;
  padding: 1.25rem;
  border-radius: 0.75rem;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
}
.config-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}
.config-card-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.config-card-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.config-card-content {
  padding-left: 2.75rem;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.config-field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.config-label {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.config-value {
  font-size: 0.875rem;
}
.config-mono-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--color-text-primary);
  background: rgba(9, 9, 11, 0.8);
  padding: 0.25rem 0.625rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.file-card {
  padding: 1rem;
  border-radius: 0.75rem;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.03);
}
.file-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}
.file-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}
.file-card:hover .file-icon {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-secondary);
}

.file-action-btn {
  padding: 0.375rem;
  border-radius: 0.5rem;
  color: var(--color-text-muted);
  transition: all 0.15s;
}
.file-action-btn:hover {
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
.config-editor {
  tab-size: 2;
}
.config-editor::placeholder {
  color: var(--color-text-muted);
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

