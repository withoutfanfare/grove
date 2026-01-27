<script setup lang="ts">
/**
 * CommitList Component
 *
 * Displays a list of recent commits for a worktree.
 * Shows SHA, message, author, and relative date.
 */
import type { Commit } from '../types'
import Skeleton from './ui/Skeleton.vue'

defineProps<{
  commits: Commit[]
  loading: boolean
  error: string | null
}>()

/**
 * Format an ISO date string to a relative time string.
 * E.g., "2 days ago", "3 hours ago", "just now"
 */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSecs < 60) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`
  if (diffMonths < 12) return `${diffMonths}mo ago`
  return date.toLocaleDateString()
}

/**
 * Truncate a commit message to a maximum length.
 */
function truncateMessage(message: string, maxLength = 60): string {
  const firstLine = message.split('\n')[0]
  if (firstLine.length <= maxLength) return firstLine
  return firstLine.slice(0, maxLength - 3) + '...'
}

/**
 * Get short SHA (7 characters).
 */
function getShortSha(sha: string): string {
  return sha.slice(0, 7)
}
</script>

<template>
  <div class="space-y-2">
    <!-- Loading skeletons -->
    <template v-if="loading">
      <div
        v-for="i in 5"
        :key="i"
        class="flex items-center gap-3 p-2.5 rounded-lg bg-surface-overlay/50"
      >
        <Skeleton width="w-14" height="h-4" />
        <div class="flex-1 min-w-0">
          <Skeleton width="w-3/4" height="h-4" />
        </div>
        <Skeleton width="w-16" height="h-3" />
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
      v-else-if="commits.length === 0"
      class="text-center py-6 text-text-muted text-sm"
    >
      No commits found
    </div>

    <!-- Commit list -->
    <div
      v-else
      v-for="commit in commits"
      :key="commit.sha"
      class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-surface-overlay/50 transition-colors group"
    >
      <!-- SHA -->
      <code
        class="flex-shrink-0 font-mono text-xs text-accent bg-accent-muted px-1.5 py-0.5 rounded"
        :title="commit.sha"
      >
        {{ getShortSha(commit.sha) }}
      </code>

      <!-- Message and author -->
      <div class="flex-1 min-w-0">
        <p
          class="text-sm text-text-primary truncate"
          :title="commit.message"
        >
          {{ truncateMessage(commit.message) }}
        </p>
        <p class="text-xs text-text-muted mt-0.5">
          {{ commit.author }}
        </p>
      </div>

      <!-- Date -->
      <time
        class="flex-shrink-0 text-xs text-text-muted tabular-nums"
        :datetime="commit.date"
        :title="new Date(commit.date).toLocaleString()"
      >
        {{ formatRelativeTime(commit.date) }}
      </time>
    </div>
  </div>
</template>
