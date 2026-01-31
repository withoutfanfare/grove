<script setup lang="ts">
/**
 * StatusBadge Component
 *
 * Displays worktree git status with clean/dirty state and ahead/behind indicators.
 * Uses semantic design tokens for consistent styling.
 * Shows commit counts in arrow format: upward green for ahead, downward orange for behind.
 */
import { computed } from 'vue'

const props = defineProps<{
  dirty: boolean
  ahead?: number
  behind?: number
  /** Base branch name for tooltip context (e.g., "origin/main") */
  baseBranch?: string
}>()

const statusLabel = computed(() => props.dirty ? 'Modified' : 'Clean')
const hasAhead = computed(() => (props.ahead ?? 0) > 0)
const hasBehind = computed(() => (props.behind ?? 0) > 0)
const hasCommitStatus = computed(() => hasAhead.value || hasBehind.value)

// Tooltip for commit status
const commitStatusTooltip = computed(() => {
  const parts: string[] = []
  const base = props.baseBranch || 'origin'

  if (hasAhead.value) {
    parts.push(`${props.ahead} commit${props.ahead === 1 ? '' : 's'} ahead`)
  }
  if (hasBehind.value) {
    parts.push(`${props.behind} commit${props.behind === 1 ? '' : 's'} behind`)
  }

  if (parts.length === 0) return ''
  return `${parts.join(', ')} of ${base}`
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Clean/Dirty badge -->
    <span :class="[
      'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border',
      'transition-colors duration-150',
      dirty
        ? 'border-warning/20 text-warning bg-warning/5'
        : 'border-success/20 text-success bg-success/5'
    ]" role="status" :aria-label="dirty ? 'Worktree has uncommitted changes' : 'Worktree is clean'">
      <!-- Status dot -->
      <span :class="[
        'w-1.5 h-1.5 rounded-full flex-shrink-0',
        dirty
          ? 'bg-warning animate-pulse-subtle'
          : 'bg-success'
      ]" aria-hidden="true" />
      {{ statusLabel }}
    </span>

    <!-- Combined ahead/behind indicator -->
    <span v-if="hasCommitStatus"
      class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border border-border-default bg-surface-base/50 text-text-secondary transition-colors duration-150"
      :title="commitStatusTooltip" role="status" :aria-label="commitStatusTooltip">
      <!-- Ahead -->
      <span v-if="hasAhead" class="flex items-center gap-0.5 text-text-primary">
        <span aria-hidden="true" class="opacity-70">↑</span>
        <span class="tabular-nums">{{ ahead }}</span>
      </span>

      <span v-if="hasAhead && hasBehind" class="text-border-default">|</span>

      <!-- Behind -->
      <span v-if="hasBehind" class="flex items-center gap-0.5 text-text-primary">
        <span aria-hidden="true" class="opacity-70">↓</span>
        <span class="tabular-nums">{{ behind }}</span>
      </span>
    </span>
  </div>
</template>
