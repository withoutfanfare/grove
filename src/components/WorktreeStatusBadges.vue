<script setup lang="ts">
/**
 * WorktreeStatusBadges Component
 *
 * Displays status badges for worktree conditions:
 * - MERGED: Branch has been merged into the base branch (green tag)
 * - UNMERGED: Branch has not been merged into the base branch (orange warning)
 * - STALE: Worktree is >50 commits behind (orange clock icon)
 * - MISMATCH: Directory name doesn't match branch slug (yellow warning)
 *
 * Each badge has a tooltip explaining its meaning.
 */
import { computed } from 'vue'
import { SBadge } from '@stuntrocket/ui'

const props = defineProps<{
  /** Whether the branch has been merged into the base branch */
  merged?: boolean
  /** Whether the worktree is stale (>50 commits behind) */
  stale?: boolean
  /** Whether there's a mismatch between directory name and branch slug */
  mismatch?: boolean
}>()

const showMerged = computed(() => props.merged === true)
const showUnmerged = computed(() => props.merged === false)
const showStale = computed(() => props.stale === true)
const showMismatch = computed(() => props.mismatch === true)
const hasAnyBadge = computed(() => showMerged.value || showUnmerged.value || showStale.value || showMismatch.value)
</script>

<template>
  <div
    v-if="hasAnyBadge"
    class="flex items-center gap-1"
    role="group"
    aria-label="Worktree status badges"
  >
    <!-- MERGED badge -->
    <SBadge
      v-if="showMerged"
      variant="success"
      class="!border-transparent gap-1.5"
      title="This branch has been merged into the base branch and can be safely removed"
      role="status"
      aria-label="Branch merged into base"
    >
      <!-- Merge icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7a4 4 0 108 0 4 4 0 00-8 0zM12 14v7m-4-4l4 4 4-4"
        />
      </svg>
      Merged
    </SBadge>

    <!-- UNMERGED badge -->
    <SBadge
      v-if="showUnmerged"
      variant="warning"
      class="!border-transparent gap-1.5"
      title="This branch has not been merged into the base branch"
      role="status"
      aria-label="Branch not merged"
    >
      <!-- Branch icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      Unmerged
    </SBadge>

    <!-- STALE badge -->
    <SBadge
      v-if="showStale"
      variant="warning"
      class="!border-transparent gap-1.5"
      title="This worktree is significantly behind the base branch (>50 commits). Consider syncing or removing it."
      role="status"
      aria-label="Worktree is stale"
    >
      <!-- Clock icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Stale
    </SBadge>

    <!-- MISMATCH badge -->
    <SBadge
      v-if="showMismatch"
      variant="error"
      class="!border-transparent gap-1.5"
      title="The directory name does not match the branch name. This may cause confusion when navigating between worktrees."
      role="status"
      aria-label="Directory name mismatch"
    >
      <!-- Warning triangle icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      Mismatch
    </SBadge>
  </div>
</template>
