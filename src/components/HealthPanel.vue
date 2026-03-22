<script setup lang="ts">
/**
 * HealthPanel Component
 *
 * Sliding panel displaying repository health report with overall grade,
 * summary statistics, issues list, and per-worktree health breakdown.
 */
import { ref, watch, computed } from 'vue'
import { useWorktrees } from '../composables'
import type { HealthResult, HealthGrade } from '../types'
import { SPanel, SButton, SSkeleton } from '@stuntrocket/ui'
import GradeBadge from './GradeBadge.vue'

const props = defineProps<{
  isOpen: boolean
  repoName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { getRepoHealth } = useWorktrees()

const health = ref<HealthResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Fetch health when panel opens
watch(() => props.isOpen, async (open) => {
  if (open && props.repoName) {
    loading.value = true
    error.value = null

    try {
      const result = await getRepoHealth(props.repoName)
      if (result) {
        health.value = result
      } else {
        // M16: Display more helpful error message
        error.value = 'Unable to fetch health report. The repository may not have any worktrees.'
      }
    } catch (e) {
      // M16: Display actual error message from backend
      error.value = e instanceof Error ? e.message : 'An unexpected error occurred while fetching health report'
    }

    loading.value = false
  }
})

// Grade styling using design tokens
const gradeStyles: Record<HealthGrade, { text: string; bg: string; ring: string }> = {
  A: { text: 'text-success', bg: 'bg-success-muted', ring: 'ring-success/20' },
  B: { text: 'text-accent', bg: 'bg-accent-muted', ring: 'ring-accent/20' },
  C: { text: 'text-warning', bg: 'bg-warning-muted', ring: 'ring-warning/20' },
  D: { text: 'text-danger', bg: 'bg-danger-muted', ring: 'ring-danger/20' },
  F: { text: 'text-danger', bg: 'bg-danger-muted', ring: 'ring-danger/20' },
}

const overallGradeStyle = computed(() => {
  const grade = health.value?.overall_grade as HealthGrade | undefined
  return grade ? gradeStyles[grade] : { text: 'text-text-muted', bg: 'bg-surface-overlay', ring: 'ring-border-subtle' }
})

// Derive issue counts from the actual issues array so the summary
// matches the issues list displayed below it.
const issueCounts = computed(() => {
  const issues = health.value?.issues ?? []
  const warning = issues.filter(i => i.severity === 'warning').length
  const critical = issues.filter(i => i.severity === 'critical').length
  const healthy = (health.value?.worktree_count ?? 0) - warning - critical
  return { healthy: Math.max(0, healthy), warning, critical }
})

function handleClose() {
  emit('close')
}

function getSeverityStyle(severity: string) {
  return severity === 'critical'
    ? { text: 'text-danger', bg: 'bg-danger-muted' }
    : { text: 'text-warning', bg: 'bg-warning-muted' }
}
</script>

<template>
  <SPanel
    :open="isOpen"
    title="Health Report"
    :subtitle="repoName"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    </template>

    <!-- Loading with skeleton content -->
    <div v-if="loading" class="space-y-6">
      <!-- Overall Grade Card skeleton -->
      <div class="p-5 rounded-xl bg-surface-overlay ring-1 ring-inset ring-border-subtle">
        <div class="flex items-center justify-between">
          <div class="space-y-2">
            <SSkeleton width="6rem" height="0.75rem" />
            <SSkeleton width="4rem" height="3rem" />
          </div>
          <div class="text-right space-y-2">
            <SSkeleton width="3rem" height="0.75rem" />
            <SSkeleton width="5rem" height="2rem" />
          </div>
        </div>
      </div>

      <!-- Summary Stats skeleton -->
      <div class="grid grid-cols-3 gap-3">
        <div v-for="i in 3" :key="i" class="rounded-lg p-4 bg-surface-overlay ring-1 ring-inset ring-border-subtle">
          <div class="flex flex-col items-center gap-2">
            <SSkeleton width="2rem" height="1.5rem" />
            <SSkeleton width="3rem" height="0.75rem" />
          </div>
        </div>
      </div>

      <!-- Issues List skeleton -->
      <div class="space-y-3">
        <SSkeleton width="5rem" height="0.75rem" />
        <div class="space-y-2">
          <div
            v-for="i in 2"
            :key="i"
            class="flex items-start gap-3 p-3 bg-surface-overlay rounded-lg border border-border-subtle"
          >
            <SSkeleton width="1.25rem" height="1.25rem" class="flex-shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0 space-y-1.5">
              <SSkeleton width="6rem" height="1rem" />
              <SSkeleton width="100%" height="0.75rem" />
            </div>
            <SSkeleton width="3.5rem" height="1.25rem" class="flex-shrink-0" />
          </div>
        </div>
      </div>

      <!-- Per-Worktree Health skeleton -->
      <div class="space-y-3">
        <SSkeleton width="7rem" height="0.75rem" />
        <div class="space-y-2">
          <div
            v-for="i in 3"
            :key="i"
            class="flex items-center justify-between p-3 bg-surface-overlay rounded-lg border border-border-subtle"
          >
            <div class="flex items-center gap-3 min-w-0">
              <SSkeleton width="2rem" height="1.25rem" />
              <SSkeleton width="8rem" height="1rem" />
            </div>
            <SSkeleton width="4rem" height="0.75rem" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-4 bg-danger-muted rounded-lg border border-danger/20">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-danger text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Health Report -->
    <div v-else-if="health" class="space-y-6">
      <!-- Overall Grade Card -->
      <div
        :class="[overallGradeStyle.bg, overallGradeStyle.ring]"
        class="p-5 rounded-xl ring-1 ring-inset"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Overall Health</p>
            <p :class="overallGradeStyle.text" class="text-5xl font-bold tracking-tight">
              {{ health.overall_grade }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Score</p>
            <p :class="overallGradeStyle.text" class="text-3xl font-semibold tabular-nums">
              {{ health.overall_score }}<span class="text-lg text-text-muted">/100</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-success-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-success/10">
          <p class="text-2xl font-bold text-success tabular-nums">{{ issueCounts.healthy }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Healthy</p>
        </div>
        <div class="bg-warning-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-warning/10">
          <p class="text-2xl font-bold text-warning tabular-nums">{{ issueCounts.warning }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Warning</p>
        </div>
        <div class="bg-danger-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-danger/10">
          <p class="text-2xl font-bold text-danger tabular-nums">{{ issueCounts.critical }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Critical</p>
        </div>
      </div>

      <!-- Issues List -->
      <section v-if="health.issues.length > 0" class="space-y-3">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Issues ({{ health.issues.length }})
        </h3>
        <div class="space-y-2">
          <div
            v-for="(issue, idx) in health.issues"
            :key="idx"
            class="flex items-start gap-3 p-3 bg-surface-overlay rounded-lg border border-border-subtle"
          >
            <svg
              :class="getSeverityStyle(issue.severity).text"
              class="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                :d="issue.severity === 'critical'
                  ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                  : 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'"
              />
            </svg>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-text-primary">{{ issue.worktree }}</p>
              <p class="text-sm text-text-secondary mt-0.5">{{ issue.message }}</p>
            </div>
            <span
              :class="[getSeverityStyle(issue.severity).bg, getSeverityStyle(issue.severity).text]"
              class="px-2 py-0.5 text-2xs font-medium rounded-md capitalize flex-shrink-0"
            >
              {{ issue.severity }}
            </span>
          </div>
        </div>
      </section>

      <!-- Per-Worktree Health -->
      <section class="space-y-3">
        <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
          Worktrees ({{ health.worktree_count }})
        </h3>
        <div class="space-y-2">
          <div
            v-for="wt in health.worktrees"
            :key="wt.branch"
            class="flex items-center justify-between p-3 bg-surface-overlay rounded-lg border border-border-subtle group hover:border-border-default transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <GradeBadge :grade="wt.grade" :score="wt.score" />
              <span class="text-sm text-text-primary font-mono truncate">{{ wt.branch }}</span>
            </div>
            <span v-if="wt.issues.length > 0" class="text-2xs text-text-muted">
              {{ wt.issues.length }} issue{{ wt.issues.length === 1 ? '' : 's' }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <template v-if="health && !loading" #footer>
      <SButton variant="primary" class="w-full" @click="handleClose">
        Done
      </SButton>
    </template>
  </SPanel>
</template>
