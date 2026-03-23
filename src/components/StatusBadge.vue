<script setup lang="ts">
/**
 * StatusBadge Component
 *
 * Displays worktree git status with clean/dirty state and ahead/behind indicators.
 * Uses semantic design tokens for consistent styling.
 *
 * Ahead/behind indicators are colour-coded:
 * - Green: ahead only (local commits to push)
 * - Amber: behind only (remote commits to pull)
 * - Red: diverged (both ahead and behind)
 * - Check mark: up to date (neither ahead nor behind)
 *
 * Dirty state supports optional file counts (staged, modified, untracked)
 * for richer tooltip information when available.
 */
import { computed } from 'vue'
import { SBadge, SStatusDot } from '@stuntrocket/ui'

export interface DirtyDetails {
  staged: number
  modified: number
  untracked: number
}

const props = defineProps<{
  dirty: boolean
  ahead?: number
  behind?: number
  /** Base branch name for tooltip context (e.g., "origin/main") */
  baseBranch?: string
  /** Optional detailed file counts for dirty state tooltip */
  dirtyDetails?: DirtyDetails
}>()

const hasAhead = computed(() => (props.ahead ?? 0) > 0)
const hasBehind = computed(() => (props.behind ?? 0) > 0)
const hasCommitStatus = computed(() => hasAhead.value || hasBehind.value)
const isUpToDate = computed(() => !hasAhead.value && !hasBehind.value)

// Sync state determines the colour of the ahead/behind badge
type SyncState = 'ahead' | 'behind' | 'diverged' | 'synced'
const syncState = computed<SyncState>(() => {
  if (hasAhead.value && hasBehind.value) return 'diverged'
  if (hasAhead.value) return 'ahead'
  if (hasBehind.value) return 'behind'
  return 'synced'
})

// Additional colour classes for the ahead/behind badge (SBadge variant="count" base)
const syncBadgeClasses = computed(() => {
  switch (syncState.value) {
    case 'ahead':
      return '!border-transparent bg-success/5 text-success'
    case 'behind':
      return '!border-transparent bg-warning/5 text-warning'
    case 'diverged':
      return '!border-transparent bg-danger/5 text-danger'
    default:
      return '!border-transparent bg-success/5 text-success'
  }
})

// Tooltip for commit status
const commitStatusTooltip = computed(() => {
  const parts: string[] = []
  const base = props.baseBranch || 'remote'

  if (hasAhead.value) {
    parts.push(`${props.ahead} commit${props.ahead === 1 ? '' : 's'} ahead`)
  }
  if (hasBehind.value) {
    parts.push(`${props.behind} commit${props.behind === 1 ? '' : 's'} behind`)
  }

  if (parts.length === 0) return `Up to date with ${base}`
  return `${parts.join(', ')} of ${base}`
})

// Dirty badge tooltip
const dirtyTooltip = computed(() => {
  if (!props.dirty) return 'Clean working directory'
  const d = props.dirtyDetails
  if (!d) return 'Has uncommitted changes'
  const parts: string[] = []
  if (d.staged > 0) parts.push(`${d.staged} staged`)
  if (d.modified > 0) parts.push(`${d.modified} modified`)
  if (d.untracked > 0) parts.push(`${d.untracked} untracked`)
  return parts.join(', ')
})

// Dirty state colour: green (clean), amber (modified/staged), grey (untracked only)
const isUntracked = computed(() => {
  const d = props.dirtyDetails
  if (!d) return false
  return d.untracked > 0 && d.staged === 0 && d.modified === 0
})

// SStatusDot variant for the dirty/clean indicator
const dirtyDotVariant = computed(() => {
  if (!props.dirty) return 'success' as const
  if (isUntracked.value) return 'neutral' as const
  return 'warning' as const
})

// Short label for dirty badge (keeps badge compact)
const dirtyShortLabel = computed(() => {
  if (!props.dirty) return 'Clean'
  return 'Modified'
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Clean/Dirty badge -->
    <SBadge
      variant="default"
      class="gap-1.5"
      role="status"
      :title="dirtyTooltip"
      :aria-label="dirty ? 'Worktree has uncommitted changes' : 'Worktree is clean'"
    >
      <SStatusDot :variant="dirtyDotVariant" size="sm" />
      {{ dirtyShortLabel }}
    </SBadge>

    <!-- Combined ahead/behind indicator (colour-coded by sync state) -->
    <SBadge
      v-if="hasCommitStatus"
      variant="count"
      :class="syncBadgeClasses"
      :title="commitStatusTooltip"
      role="status"
      :aria-label="commitStatusTooltip"
    >
      <!-- Ahead -->
      <span v-if="hasAhead" class="flex items-center gap-0.5">
        <span aria-hidden="true" class="opacity-80">&#8593;</span>
        <span class="tabular-nums">{{ ahead }}</span>
      </span>

      <span v-if="hasAhead && hasBehind" class="opacity-40">|</span>

      <!-- Behind -->
      <span v-if="hasBehind" class="flex items-center gap-0.5">
        <span aria-hidden="true" class="opacity-80">&#8595;</span>
        <span class="tabular-nums">{{ behind }}</span>
      </span>
    </SBadge>

    <!-- Up to date indicator -->
    <SBadge
      v-else-if="isUpToDate"
      variant="success"
      class="!border-transparent gap-1.5"
      :title="commitStatusTooltip"
      role="status"
      aria-label="Up to date with remote"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
      </svg>
      Synced
    </SBadge>
  </div>
</template>
