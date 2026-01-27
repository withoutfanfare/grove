<script setup lang="ts">
/**
 * FileChangesList Component
 *
 * Displays a list of uncommitted file changes for a worktree.
 * Shows status icon, colour-coded status, and file path.
 */
import type { FileChange, FileChangeStatus } from '../types'
import Skeleton from './ui/Skeleton.vue'

defineProps<{
  files: FileChange[]
  loading: boolean
  error: string | null
}>()

/**
 * Get the display configuration for a file change status.
 */
function getStatusConfig(status: FileChangeStatus): {
  label: string
  icon: string
  colorClass: string
  bgClass: string
} {
  switch (status) {
    case 'M':
      return {
        label: 'Modified',
        icon: 'M',
        colorClass: 'text-warning',
        bgClass: 'bg-warning-muted',
      }
    case 'A':
      return {
        label: 'Added',
        icon: 'A',
        colorClass: 'text-success',
        bgClass: 'bg-success-muted',
      }
    case 'D':
      return {
        label: 'Deleted',
        icon: 'D',
        colorClass: 'text-danger',
        bgClass: 'bg-danger-muted',
      }
    case 'R':
      return {
        label: 'Renamed',
        icon: 'R',
        colorClass: 'text-info',
        bgClass: 'bg-info-muted',
      }
    case 'C':
      return {
        label: 'Copied',
        icon: 'C',
        colorClass: 'text-info',
        bgClass: 'bg-info-muted',
      }
    case 'U':
      return {
        label: 'Unmerged',
        icon: 'U',
        colorClass: 'text-danger',
        bgClass: 'bg-danger-muted',
      }
    case '?':
      return {
        label: 'Untracked',
        icon: '?',
        colorClass: 'text-text-muted',
        bgClass: 'bg-surface-overlay',
      }
    case '!':
      return {
        label: 'Ignored',
        icon: '!',
        colorClass: 'text-text-muted',
        bgClass: 'bg-surface-overlay',
      }
    default:
      return {
        label: 'Unknown',
        icon: '?',
        colorClass: 'text-text-muted',
        bgClass: 'bg-surface-overlay',
      }
  }
}

/**
 * Get just the filename from a path.
 */
function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1]
}

/**
 * Get the directory part of a path.
 */
function getDirectory(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/') + '/'
}
</script>

<template>
  <div class="space-y-1">
    <!-- Loading skeletons -->
    <template v-if="loading">
      <div
        v-for="i in 4"
        :key="i"
        class="flex items-center gap-2 p-2 rounded-lg"
      >
        <Skeleton width="w-5" height="h-5" />
        <Skeleton width="w-full" height="h-4" />
      </div>
    </template>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="flex items-center gap-2 p-3 rounded-lg bg-danger-muted text-danger text-sm"
    >
      <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{{ error }}</span>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="files.length === 0"
      class="flex items-center gap-2 py-4 text-text-muted text-sm justify-center"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 13l4 4L19 7"
        />
      </svg>
      <span>No uncommitted changes</span>
    </div>

    <!-- File list -->
    <div
      v-else
      v-for="file in files"
      :key="file.path"
      class="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-overlay/50 transition-colors group"
    >
      <!-- Status badge -->
      <span
        :class="[getStatusConfig(file.status).bgClass, getStatusConfig(file.status).colorClass]"
        class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-bold"
        :title="getStatusConfig(file.status).label"
      >
        {{ getStatusConfig(file.status).icon }}
      </span>

      <!-- File path -->
      <span class="flex-1 min-w-0 font-mono text-sm truncate" :title="file.path">
        <span class="text-text-muted">{{ getDirectory(file.path) }}</span>
        <span class="text-text-primary">{{ getFileName(file.path) }}</span>
      </span>
    </div>
  </div>
</template>
