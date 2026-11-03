<script setup lang="ts">
/**
 * WorktreeDetailsPanel Component
 *
 * An expandable details panel showing rich worktree information
 * including path, URL, health info, recent commits, and uncommitted files.
 */
import { ref, watch, computed } from 'vue'
import type { Worktree, Commit, FileChange, HealthGrade } from '../types'
import { useWt, useToast, formatRelativeTime } from '../composables'
import { useOverviewStore, useWorktreeStore } from '../stores'
import { copyPath, copyUrl } from '../utils/clipboard'
import { parseHealthIssueMessage } from '../utils/healthIssues'
import CommitList from './CommitList.vue'
import FileChangesList from './FileChangesList.vue'
import GradeBadge from './GradeBadge.vue'
import { SIconButton, SSectionHeader } from '@stuntrocket/ui'

const props = defineProps<{
  worktree: Worktree
  repoName: string
  isExpanded: boolean
}>()

// No emits needed - toggle is handled by parent card click

const { getRecentCommits, getUncommittedFiles, toWtError } = useWt()
const overviewStore = useOverviewStore()
const worktreeStore = useWorktreeStore()
const { toast } = useToast()

// State for commits
const commits = ref<Commit[]>([])
const commitsLoading = ref(false)
const commitsError = ref<string | null>(null)
const commitsFetched = ref(false)

// State for file changes
const files = ref<FileChange[]>([])
const filesLoading = ref(false)
const filesError = ref<string | null>(null)
const filesFetched = ref(false)

// Fetch data when panel expands (lazy loading). Immediate so a panel
// mounted already expanded (card focused with initiallyExpanded) still
// fetches — a non-immediate watch never fires when the prop starts true.
watch(() => props.isExpanded, async (expanded) => {
  if (expanded) {
    // Fetch commits if not already fetched
    if (!commitsFetched.value) {
      await fetchCommits()
    }

    // Fetch files if not already fetched
    if (!filesFetched.value) {
      await fetchFiles()
    }
  }
}, { immediate: true })

async function fetchCommits() {
  commitsLoading.value = true
  commitsError.value = null

  try {
    const result = await getRecentCommits(props.repoName, props.worktree.branch, 5)
    commits.value = result.commits
    commitsFetched.value = true
  } catch (e) {
    commitsError.value = toWtError(e).message
  } finally {
    commitsLoading.value = false
  }
}

async function fetchFiles() {
  filesLoading.value = true
  filesError.value = null

  try {
    const result = await getUncommittedFiles(props.repoName, props.worktree.branch)
    files.value = result.files
    filesFetched.value = true
  } catch (e) {
    filesError.value = toWtError(e).message
  } finally {
    filesLoading.value = false
  }
}

// Refresh data when explicitly requested
async function refreshData() {
  commitsFetched.value = false
  filesFetched.value = false
  await Promise.all([fetchCommits(), fetchFiles()])
  toast.success('Details refreshed')
}

// Copy actions
async function handleCopyPath() {
  const result = await copyPath(props.worktree.path)
  if (result.success) {
    toast.success('Path copied to clipboard')
  } else {
    toast.error('Failed to copy path')
  }
}

async function handleCopyUrl() {
  if (!props.worktree.url) {
    toast.warning('No URL available')
    return
  }
  const result = await copyUrl(props.worktree.url)
  if (result.success) {
    toast.success('URL copied to clipboard')
  } else {
    toast.error('Failed to copy URL')
  }
}

// Computed values
const hasUrl = computed(() => Boolean(props.worktree.url))
const fileCount = computed(() => files.value.length)

// Only the grade band is stated here; the reasons come from the CLI's own findings below.
const healthExplanation = computed(() => {
  const grade = props.worktree.health_grade as HealthGrade | undefined
  if (!grade) return null
  if (grade === '?') return 'Health unknown: the CLI could not score this worktree.'
  const score = props.worktree.health_score
  return `Grade ${grade}${typeof score === 'number' ? `, score ${score}/100` : ''}, from the last list refresh.`
})

// Sync status explanation. A null count is an unknown comparison, never zero.
const syncExplanation = computed(() => {
  const { dirty, ahead, behind } = props.worktree
  const parts: string[] = [dirty ? 'Has uncommitted changes' : 'No uncommitted changes']

  if (ahead === null || behind === null) {
    parts.push('Comparison with its upstream is unknown (none configured, or the check failed)')
  } else if (ahead === 0 && behind === 0) {
    parts.push('Level with its upstream as of the last fetch')
  } else {
    if (ahead > 0) parts.push(`${ahead} commit${ahead === 1 ? '' : 's'} ahead of its upstream`)
    if (behind > 0) parts.push(`${behind} commit${behind === 1 ? '' : 's'} behind its upstream`)
  }

  return `${parts.join('. ')}. Remote figures come from the last fetch, not a live check.`
})

// Evidence behind the Merged/Stale badges: exact base, commits and check time
const short = (sha?: string) => (sha ? sha.slice(0, 7) : 'unknown')
const comparisonFacts = computed(() => {
  const w = props.worktree
  const base = w.base_ref || 'the base branch'
  const facts: { label: string; value: string }[] = []
  if (w.merged === true) facts.push({ label: 'Merged', value: `Yes, by Git ancestry: ${short(w.head_sha || w.sha)} is contained in ${base} @ ${short(w.base_sha)}. This does not check the pull request or squash merges, and is not a removal safety check.` })
  else if (w.merged === false) facts.push({ label: 'Merged', value: `No: ${short(w.head_sha || w.sha)} is not contained in ${base}${w.base_sha ? ` @ ${short(w.base_sha)}` : ''}. Squash or rebase merges also show here.` })
  else if (w.merged === null) facts.push({ label: 'Merged', value: `Unknown: the ancestry check against ${base} failed.` })
  if (typeof w.behind_base === 'number') {
    const threshold = w.behind_threshold !== undefined ? ` (stale threshold ${w.behind_threshold})` : ''
    facts.push({ label: 'Behind base', value: `${w.behind_base} commit${w.behind_base === 1 ? '' : 's'} behind ${base}${threshold}` })
  } else if (w.behind_base === null || w.stale === null) {
    facts.push({ label: 'Behind base', value: `Unknown: counting commits behind ${base} failed.` })
  }
  const remoteAt = worktreeStore.remoteFetchedAt[props.repoName]
  facts.push({ label: 'Remote last fetched', value: remoteAt ? formatRelativeTime(new Date(remoteAt).toISOString()).full : 'Unknown; no successful fetch observed this session' })
  const remoteError = worktreeStore.remoteFetchErrors[props.repoName]
  if (remoteError) facts.push({ label: 'Latest fetch failed', value: remoteError })
  if (w.checked_at) facts.push({ label: 'Checked', value: `${formatRelativeTime(w.checked_at).full} (local Git; remote refs as of the last fetch)` })
  if (w.lastAccessed) facts.push({ label: 'Folder last modified', value: `${formatRelativeTime(w.lastAccessed).full} (file-system time, not when it was last opened)` })
  return facts
})

// "Why this grade?": the repository health check's findings for this worktree
const healthSnapshot = computed(() => overviewStore.snapshots[props.repoName])
const gradeFindings = computed(() => {
  const entry = healthSnapshot.value?.health?.worktrees.find((w) => w.branch === props.worktree.branch)
  return entry ? entry.issues.flatMap(parseHealthIssueMessage) : null
})
const healthCheckedText = computed(() => {
  const at = healthSnapshot.value?.healthCheckedAt
  return at ? formatRelativeTime(new Date(at).toISOString()).full : null
})
</script>

<template>
  <div class="details-grid" :class="{ 'is-expanded': isExpanded }">
    <div class="details-inner">
      <div
        class="border-t border-white/[0.04] bg-surface-base/50"
      >
        <div class="px-4 py-4 space-y-5 relative">
          <!-- Refresh button -->
          <div class="absolute top-3 right-3">
            <SIconButton
              tooltip="Refresh details"
              size="sm"
              @click="refreshData"
            >
              <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </SIconButton>
          </div>

          <!-- Path and URL section -->
          <section class="space-y-2">
            <SSectionHeader title="Location" />

            <!-- Path -->
            <div class="flex items-center gap-2 group">
              <svg class="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <code class="flex-1 text-sm font-mono text-text-secondary truncate" :title="worktree.path">
                {{ worktree.path }}
              </code>
              <SIconButton
                tooltip="Copy path"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleCopyPath"
              >
                <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </SIconButton>
            </div>

            <!-- URL (if available) -->
            <div v-if="hasUrl" class="flex items-center gap-2 group">
              <svg class="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <a
                :href="worktree.url!"
                target="_blank"
                rel="noopener noreferrer"
                class="flex-1 text-sm font-mono text-accent hover:text-accent-hover truncate transition-colors"
                :title="worktree.url!"
              >
                {{ worktree.url }}
              </a>
              <SIconButton
                tooltip="Copy URL"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleCopyUrl"
              >
                <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </SIconButton>
            </div>
          </section>

          <!-- Health and Sync Status -->
          <section class="space-y-2">
            <SSectionHeader title="Status" />

            <!-- Health breakdown -->
            <div v-if="worktree.health_grade" class="flex items-start gap-3 p-3 rounded-lg bg-surface-overlay/50">
              <GradeBadge :grade="worktree.health_grade" :score="worktree.health_score" />
              <div class="flex-1 min-w-0">
                <p class="text-sm text-text-primary">Health Grade</p>
                <p v-if="healthExplanation" class="text-xs text-text-muted mt-0.5">
                  {{ healthExplanation }}
                </p>
                <div v-if="gradeFindings" class="mt-2" data-testid="grade-findings">
                  <p class="text-xs font-medium text-text-secondary">
                    Why this grade?
                    <span v-if="healthCheckedText" class="font-normal text-text-muted">(health check {{ healthCheckedText }})</span>
                  </p>
                  <ul v-if="gradeFindings.length" class="mt-1 space-y-1">
                    <li v-for="finding in gradeFindings" :key="finding.raw" class="text-xs text-text-muted">
                      <span class="text-text-secondary">{{ finding.title }}</span>
                      <span v-if="finding.scoreImpact" class="tabular-nums"> ({{ finding.scoreImpact }})</span>
                      — {{ finding.explanation }}
                    </li>
                  </ul>
                  <p v-else class="text-xs text-text-muted mt-1">The last health check found no issues.</p>
                </div>
                <p v-else class="text-xs text-text-muted mt-1">
                  Open the Health panel to see the findings behind this grade.
                </p>
              </div>
            </div>

            <!-- Sync status -->
            <div class="flex items-start gap-3 p-3 rounded-lg bg-surface-overlay/50">
              <svg
                class="w-5 h-5 flex-shrink-0"
                :class="worktree.dirty ? 'text-warning' : 'text-success'"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  v-if="worktree.dirty"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  v-else
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-text-primary">Sync Status</p>
                <p class="text-xs text-text-muted mt-0.5">
                  {{ syncExplanation }}
                </p>
              </div>
            </div>
          </section>

          <!-- Stale / merged evidence -->
          <section v-if="comparisonFacts.length" class="space-y-2" data-testid="comparison-facts">
            <SSectionHeader title="Base comparison" />
            <dl class="space-y-1 p-3 rounded-lg bg-surface-overlay/50">
              <div v-for="fact in comparisonFacts" :key="fact.label" class="text-xs">
                <dt class="inline text-text-secondary">{{ fact.label }}:</dt>
                <dd class="inline text-text-muted"> {{ fact.value }}</dd>
              </div>
            </dl>
          </section>

          <!-- Recent Commits -->
          <section class="space-y-2">
            <SSectionHeader title="Recent Commits" />
            <CommitList
              :commits="commits"
              :loading="commitsLoading"
              :error="commitsError"
            />
          </section>

          <!-- Uncommitted Files -->
          <section class="space-y-2">
            <SSectionHeader title="Uncommitted Files" :count="!filesLoading && fileCount > 0 ? fileCount : undefined" />
            <FileChangesList
              :files="files"
              :loading="filesLoading"
              :error="filesError"
            />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* CSS Grid expand/collapse - no max-height hack */
.details-grid {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--duration-panel) var(--ease-spring);
}

.details-grid.is-expanded {
  grid-template-rows: 1fr;
}

.details-inner {
  overflow: hidden;
}

/* Fade content in after expansion begins */
.details-inner > * {
  opacity: 0;
  transition: opacity var(--duration-slow) var(--ease-out);
}

.details-grid.is-expanded .details-inner > * {
  opacity: 1;
  transition-delay: 100ms;
}

/* Respect reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  .details-grid,
  .details-inner > * {
    transition: none !important;
    opacity: 1;
  }

  .details-grid {
    grid-template-rows: 0fr;
  }

  .details-grid.is-expanded {
    grid-template-rows: 1fr;
  }
}
</style>
