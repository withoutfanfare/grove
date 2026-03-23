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
const gradeStyles: Record<HealthGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-success-muted', text: 'text-success' },
  B: { bg: 'bg-accent-muted', text: 'text-accent' },
  C: { bg: 'bg-warning-muted', text: 'text-warning' },
  D: { bg: 'bg-danger-muted', text: 'text-danger' },
  F: { bg: 'bg-danger-muted', text: 'text-danger' },
}

const gradeClass = computed(() => {
  const grade = props.grade as HealthGrade | undefined
  if (grade && grade in gradeStyles) {
    const style = gradeStyles[grade]
    return `${style.bg} ${style.text}`
  }
  return 'bg-surface-overlay text-text-muted'
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
      'transition-all duration-150',
    ]"
    :title="scoreLabel ? `Health score: ${scoreLabel}/100` : `Health grade: ${gradeLabel}`"
  >
    <!-- Grade letter with subtle icon -->
    <span class="font-bold tracking-tight">{{ gradeLabel }}</span>

    <!-- Score (smaller, muted) -->
    <span
      v-if="scoreLabel"
      class="text-2xs opacity-70 font-normal tabular-nums"
    >
      {{ scoreLabel }}
    </span>
  </span>
</template>
