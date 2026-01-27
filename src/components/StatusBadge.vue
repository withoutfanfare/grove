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
  <div class="flex items-center gap-1.5">
    <!-- Clean/Dirty badge -->
    <span
      :class="[
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md',
        'transition-colors duration-150',
        dirty
          ? 'bg-warning-muted text-warning'
          : 'bg-success-muted text-success'
      ]"
      role="status"
      :aria-label="dirty ? 'Worktree has uncommitted changes' : 'Worktree is clean'"
    >
      <!-- Status dot with subtle pulse for dirty -->
      <span
        :class="[
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          dirty
            ? 'bg-warning animate-pulse-subtle'
            : 'bg-success'
        ]"
        aria-hidden="true"
      />
      {{ statusLabel }}
    </span>

    <!-- Combined ahead/behind indicator with arrow format -->
    <span
      v-if="hasCommitStatus"
      class="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-md bg-surface-overlay transition-colors duration-150"
      :title="commitStatusTooltip"
      role="status"
      :aria-label="commitStatusTooltip"
    >
      <!-- Ahead (up arrow, green) -->
      <span
        v-if="hasAhead"
        class="inline-flex items-center text-success"
      >
        <span aria-hidden="true">&#8593;</span>
        <span class="tabular-nums">{{ ahead }}</span>
      </span>

      <!-- Behind (down arrow, orange/warning) -->
      <span
        v-if="hasBehind"
        class="inline-flex items-center text-warning"
      >
        <span aria-hidden="true">&#8595;</span>
        <span class="tabular-nums">{{ behind }}</span>
      </span>
    </span>
  </div>
</template>
