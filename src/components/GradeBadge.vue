<script setup lang="ts">
/**
 * GradeBadge Component
 *
 * Displays worktree health grade with letter rating and optional score.
 * Uses semantic colour coding: A=success, B=accent, C=warning, D/F=danger.
 */
import { computed } from 'vue'
import type { HealthGrade } from '../types'

const props = defineProps<{
  grade?: string
  score?: number
}>()

// Grade-to-style mapping using design tokens
const gradeStyles: Record<HealthGrade, { bg: string; text: string; ring: string }> = {
  A: { bg: 'bg-success-muted', text: 'text-success', ring: 'ring-success/20' },
  B: { bg: 'bg-accent-muted', text: 'text-accent', ring: 'ring-accent/20' },
  C: { bg: 'bg-warning-muted', text: 'text-warning', ring: 'ring-warning/20' },
  D: { bg: 'bg-danger-muted', text: 'text-danger', ring: 'ring-danger/20' },
  F: { bg: 'bg-danger-muted', text: 'text-danger', ring: 'ring-danger/20' },
}

const gradeClass = computed(() => {
  const grade = props.grade as HealthGrade | undefined
  if (grade && grade in gradeStyles) {
    const style = gradeStyles[grade]
    return `${style.bg} ${style.text} ${style.ring}`
  }
  return 'bg-surface-overlay text-text-muted ring-border-subtle/20'
})

const gradeLabel = computed(() => props.grade ?? '-')

const scoreLabel = computed(() => {
  if (props.score !== undefined && props.score !== null) {
    return props.score.toString()
  }
  return null
})

</script>

<template>
  <span
    v-if="grade"
    :class="[
      gradeClass,
      'inline-flex items-center gap-1 px-2 py-0.5',
      'text-xs font-semibold rounded-md',
      'ring-1 ring-inset',
      'transition-all duration-150',
    ]"
    :title="scoreLabel ? `Health score: ${scoreLabel}/100` : `Health grade: ${gradeLabel}`"
  >
    <!-- Grade letter with subtle icon -->
    <span class="font-bold tracking-tight">{{ gradeLabel }}</span>

    <!-- Score (smaller, muted) -->
    <span
      v-if="scoreLabel"
      class="text-[10px] opacity-70 font-normal tabular-nums"
    >
      {{ scoreLabel }}
    </span>
  </span>
</template>
