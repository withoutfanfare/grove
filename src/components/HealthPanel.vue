<script setup lang="ts">
/**
 * HealthPanel Component
 *
 * Sliding panel displaying a repository health report: overall grade,
 * worktree-bracket summary, issues grouped by worktree with plain-English
 * explanations, exact score impact and inline fix actions, a per-worktree
 * breakdown, and a "How scoring works" explainer.
 */
import { ref, watch, computed } from 'vue'
import { useWorktrees, useWt, useRepos, useToast } from '../composables'
import { useWorktreeStore } from '../stores'
import type { HealthResult, HealthGrade, HealthIssue, Worktree } from '../types'
import {
  parseHealthIssueMessage,
  severityExplanation,
  SCORING_RULES,
  GRADE_BANDS,
  SEVERITY_BRACKETS,
  type HealthFinding,
  type HealthFindingAction,
} from '../utils/healthIssues'
import { SPanel, SButton, SSkeleton, SSectionHeader } from '@stuntrocket/ui'
import GradeBadge from './GradeBadge.vue'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'

const props = defineProps<{
  isOpen: boolean
  repoName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useWorktreeStore()
const { getRepoHealth, fetchWorktrees, openInEditor } = useWorktrees()
const { selectRepository } = useRepos()
const wtApi = useWt()
const { toast } = useToast()

const health = ref<HealthResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
// Branch → worktree map so findings can offer path-dependent actions
const worktreesByBranch = ref<Map<string, Worktree>>(new Map())

async function fetchHealth() {
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

/** Refetch after an action without the skeleton flash */
async function refreshHealthSilently() {
  try {
    const result = await getRepoHealth(props.repoName)
    if (result) health.value = result
  } catch {
    // Keep showing the previous report — the action toast already reported status
  }
}

async function fetchWorktreeMap() {
  try {
    const worktrees = await wtApi.listWorktrees(props.repoName)
    worktreesByBranch.value = new Map(worktrees.map((wt) => [wt.branch, wt]))
  } catch {
    worktreesByBranch.value = new Map()
  }
}

// Fetch health (and the worktree map for actions) when the panel opens
watch(() => props.isOpen, async (open) => {
  if (open && props.repoName) {
    await Promise.all([fetchHealth(), fetchWorktreeMap()])
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

// Worktree counts per score bracket, straight from the CLI summary —
// the tiles describe worktrees (healthy ≥80, warning 60–79, critical <60),
// not issue rows, and stay correct regardless of how issues are split.
const issueCounts = computed(() => health.value?.summary ?? { healthy: 0, warning: 0, critical: 0 })

// ── Issues grouped by worktree ───────────────────────────────────────

interface WorktreeIssueGroup {
  branch: string
  severity: HealthIssue['severity']
  grade?: HealthGrade
  score?: number
  findings: HealthFinding[]
}

const issueGroups = computed<WorktreeIssueGroup[]>(() => {
  const result = health.value
  if (!result) return []
  const groups = new Map<string, WorktreeIssueGroup>()
  for (const issue of result.issues) {
    let group = groups.get(issue.worktree)
    if (!group) {
      const wtHealth = result.worktrees.find((wt) => wt.branch === issue.worktree)
      group = {
        branch: issue.worktree,
        severity: issue.severity,
        grade: wtHealth?.grade,
        score: wtHealth?.score,
        findings: [],
      }
      groups.set(issue.worktree, group)
    }
    // Critical outranks warning if entries disagree
    if (issue.severity === 'critical') group.severity = 'critical'
    group.findings.push(...parseHealthIssueMessage(issue.message))
  }
  return [...groups.values()]
})

const totalFindings = computed(() =>
  issueGroups.value.reduce((sum, group) => sum + group.findings.length, 0)
)

/** Parsed finding count for a worktree row (fixes the joined-token count) */
function worktreeFindingCount(issues: string[]): number {
  return issues.reduce((sum, issue) => sum + parseHealthIssueMessage(issue).length, 0)
}

/** Joined finding titles for a worktree row sub-line */
function worktreeFindingTitles(issues: string[]): string {
  return issues
    .flatMap((issue) => parseHealthIssueMessage(issue).map((finding) => finding.title))
    .join(' · ')
}

// ── Actions ──────────────────────────────────────────────────────────

const busyKeys = ref<string[]>([])

function isBusy(key: string): boolean {
  return busyKeys.value.includes(key)
}

function setBusy(key: string, busy: boolean) {
  if (busy) {
    if (!busyKeys.value.includes(key)) busyKeys.value.push(key)
  } else {
    busyKeys.value = busyKeys.value.filter((k) => k !== key)
  }
}

const showDeleteDialog = ref(false)
const worktreeToDelete = ref<Worktree | null>(null)

function worktreeFor(branch: string): Worktree | undefined {
  return worktreesByBranch.value.get(branch)
}

/** Hide path-dependent actions when the branch can't be resolved to a worktree */
function visibleActions(branch: string, actions: HealthFindingAction[]): HealthFindingAction[] {
  if (worktreeFor(branch)) return actions
  return actions.filter((action) => action.id !== 'open-editor' && action.id !== 'remove')
}

async function runAction(action: HealthFindingAction, branch: string) {
  switch (action.id) {
    case 'pull':
      await handlePull(branch)
      break
    case 'sync':
      await handleSync(branch)
      break
    case 'open-editor': {
      const wt = worktreeFor(branch)
      if (!wt) return
      const success = await openInEditor(wt.path)
      if (!success) toast.error('Failed to open in editor')
      break
    }
    case 'view-worktree':
      await handleViewWorktree(branch)
      break
    case 'remove': {
      const wt = worktreeFor(branch)
      if (!wt) return
      worktreeToDelete.value = wt
      showDeleteDialog.value = true
      break
    }
  }
}

async function handlePull(branch: string) {
  const key = `pull:${branch}`
  if (isBusy(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.pullWorktree(props.repoName, branch)
    if (result.conflicts) {
      toast.error(`${branch}: pull hit merge conflicts — resolve them in the editor`)
    } else if (!result.success) {
      toast.error(`${branch}: ${result.message || 'Pull failed'}`)
    } else if (result.already_up_to_date) {
      toast.info(`${branch} is already up to date`)
    } else {
      toast.success(`Pulled ${branch}`)
    }
    await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
  } catch (e) {
    toast.error(`${branch}: ${wtApi.toWtError(e).message}`)
  } finally {
    setBusy(key, false)
  }
}

async function handleSync(branch: string) {
  const key = `sync:${branch}`
  if (isBusy(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.syncWorktree(props.repoName, branch)
    if (result.conflicts) {
      toast.error(`${branch}: sync hit conflicts — resolve them in the editor`)
    } else if (!result.success) {
      toast.error(`${branch}: ${result.message || 'Sync failed'}`)
    } else {
      toast.success(`Synced ${branch} onto ${result.base}`)
    }
    await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
  } catch (e) {
    toast.error(`${branch}: ${wtApi.toWtError(e).message}`)
  } finally {
    setBusy(key, false)
  }
}

/** Navigate to the worktree in the main list view (same pattern as the overview) */
async function handleViewWorktree(branch: string) {
  const wasCached = store.isRepoLoaded(props.repoName)
  selectRepository(props.repoName)
  await fetchWorktrees({ silent: wasCached })
  store.focusWorktree(branch, true, true)
  emit('close')
}

async function handleDeleteClosed() {
  showDeleteDialog.value = false
  worktreeToDelete.value = null
  await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
}

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
            class="flex items-start gap-3 p-3 bg-surface-overlay rounded-lg border border-white/[0.04]"
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
            class="flex items-center justify-between p-3 bg-surface-overlay rounded-lg border border-white/[0.04]"
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

      <!-- Summary Stats (worktree counts per score bracket) -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-success-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-success/10 cursor-help"
          title="Worktrees scoring 80 or above">
          <p class="text-2xl font-bold text-success tabular-nums">{{ issueCounts.healthy }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Healthy</p>
        </div>
        <div class="bg-warning-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-warning/10 cursor-help"
          title="Worktrees scoring 60–79">
          <p class="text-2xl font-bold text-warning tabular-nums">{{ issueCounts.warning }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Warning</p>
        </div>
        <div class="bg-danger-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-danger/10 cursor-help"
          title="Worktrees scoring below 60">
          <p class="text-2xl font-bold text-danger tabular-nums">{{ issueCounts.critical }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Critical</p>
        </div>
      </div>

      <!-- Issues grouped by worktree -->
      <section v-if="issueGroups.length > 0" class="space-y-3">
        <SSectionHeader title="Issues" :count="totalFindings" />
        <div class="space-y-3">
          <div
            v-for="group in issueGroups"
            :key="group.branch"
            class="p-3 bg-surface-overlay rounded-lg border border-white/[0.04] space-y-2.5"
          >
            <!-- Group header -->
            <div class="flex items-center gap-3">
              <GradeBadge v-if="group.grade" :grade="group.grade" :score="group.score" />
              <span class="text-sm text-text-primary font-mono truncate flex-1 min-w-0">{{ group.branch }}</span>
              <span
                :class="[getSeverityStyle(group.severity).bg, getSeverityStyle(group.severity).text]"
                class="px-2 py-0.5 text-2xs font-medium rounded-md capitalize flex-shrink-0 cursor-help"
                :title="severityExplanation(group.severity)"
              >
                {{ group.severity }}
              </span>
            </div>

            <!-- Findings -->
            <div
              v-for="finding in group.findings"
              :key="finding.raw"
              class="space-y-1.5"
            >
              <div class="flex items-start gap-2.5">
                <svg
                  :class="getSeverityStyle(group.severity).text"
                  class="w-4 h-4 flex-shrink-0 mt-0.5"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-text-primary">{{ finding.title }}</p>
                  <p class="text-xs text-text-secondary mt-0.5 leading-relaxed">{{ finding.explanation }}</p>
                </div>
                <span
                  v-if="finding.scoreImpact < 0"
                  class="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium tabular-nums rounded bg-white/[0.04] text-text-muted"
                  title="Points deducted from this worktree's health score"
                >
                  {{ finding.scoreImpact }} pts
                </span>
              </div>
              <!-- Finding actions -->
              <div class="flex flex-wrap items-center gap-1.5 ml-[26px]">
                <button
                  v-for="action in visibleActions(group.branch, finding.actions)"
                  :key="action.id"
                  class="health-action"
                  :class="{ 'health-action-destructive': action.destructive }"
                  :disabled="isBusy(`${action.id}:${group.branch}`)"
                  :title="action.destructive ? 'Destructive — asks for confirmation first' : undefined"
                  @click="runAction(action, group.branch)"
                >
                  {{ action.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Severity legend -->
        <p class="text-2xs text-text-muted">
          <span class="text-danger font-medium">Critical</span>: score below 60 ·
          <span class="text-warning font-medium">Warning</span>: score 60–79
        </p>
      </section>

      <!-- Per-Worktree Health -->
      <section class="space-y-3">
        <SSectionHeader title="Worktrees" :count="health.worktree_count" />
        <div class="space-y-2">
          <div
            v-for="wt in health.worktrees"
            :key="wt.branch"
            class="flex items-center justify-between gap-3 p-3 bg-surface-overlay rounded-lg border border-white/[0.04] group hover:border-white/[0.06] transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <GradeBadge :grade="wt.grade" :score="wt.score" />
              <div class="min-w-0">
                <span class="block text-sm text-text-primary font-mono truncate">{{ wt.branch }}</span>
                <span v-if="worktreeFindingTitles(wt.issues)" class="block text-2xs text-text-muted truncate mt-0.5">
                  {{ worktreeFindingTitles(wt.issues) }}
                </span>
              </div>
            </div>
            <span v-if="worktreeFindingCount(wt.issues) > 0" class="text-2xs text-text-muted flex-shrink-0">
              {{ worktreeFindingCount(wt.issues) }} finding{{ worktreeFindingCount(wt.issues) === 1 ? '' : 's' }}
            </span>
          </div>
        </div>
      </section>

      <!-- How scoring works -->
      <details class="scoring-details">
        <summary class="scoring-summary">How scoring works</summary>
        <div class="mt-3 space-y-3 text-xs text-text-secondary">
          <p>Every worktree starts at 100 points; each check below deducts points.</p>
          <table class="w-full text-left">
            <tbody>
              <tr v-for="rule in SCORING_RULES" :key="rule.check" class="border-t border-white/[0.04]">
                <td class="py-1.5 pr-2">{{ rule.check }}</td>
                <td class="py-1.5 text-text-muted tabular-nums whitespace-nowrap">{{ rule.deduction }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            Grades:
            <template v-for="(band, index) in GRADE_BANDS" :key="band.grade">{{ index > 0 ? ' · ' : '' }}{{ band.grade }} {{ band.range }}</template>
          </p>
          <p>
            <template v-for="(bracket, index) in SEVERITY_BRACKETS" :key="bracket.label">{{ index > 0 ? ' · ' : '' }}{{ bracket.label }}: {{ bracket.range }}</template>
          </p>
        </div>
      </details>
    </div>

    <template v-if="health && !loading" #footer>
      <SButton variant="primary" class="w-full" @click="handleClose">
        Done
      </SButton>
    </template>
  </SPanel>

  <!-- Destructive Remove… goes through the existing confirmed flow -->
  <DeleteWorktreeDialog
    :is-open="showDeleteDialog"
    :worktree="worktreeToDelete"
    :repo-name="repoName"
    @close="handleDeleteClosed"
  />
</template>

<style scoped>
.health-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease, color 120ms ease;
}

.health-action:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.health-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.health-action-destructive {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 25%, transparent);
}

.health-action-destructive:hover:not(:disabled) {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.scoring-details {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 12px 14px;
}

.scoring-summary {
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  user-select: none;
}

.scoring-summary:hover {
  color: var(--color-text-primary);
}
</style>
