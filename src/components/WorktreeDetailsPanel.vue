<script setup lang="ts">
/**
 * WorktreeDetailsPanel Component
 *
 * An expandable details panel showing rich worktree information
 * including path, URL, health info, recent commits, and uncommitted files.
 */
import { ref, watch, computed } from 'vue'
import type { Worktree, Commit, FileChange, HealthGrade } from '../types'
import { useWt, useToast } from '../composables'
import { copyPath, copyUrl } from '../utils/clipboard'
import CommitList from './CommitList.vue'
import FileChangesList from './FileChangesList.vue'
import GradeBadge from './GradeBadge.vue'
import { IconButton } from './ui'

const props = defineProps<{
  worktree: Worktree
  repoName: string
  isExpanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const { getRecentCommits, getUncommittedFiles } = useWt()
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

// Fetch data when panel expands (lazy loading)
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
})

async function fetchCommits() {
  commitsLoading.value = true
  commitsError.value = null

  try {
    const result = await getRecentCommits(props.repoName, props.worktree.branch, 5)
    commits.value = result.commits
    commitsFetched.value = true
  } catch (e) {
    commitsError.value = e instanceof Error ? e.message : 'Failed to fetch commits'
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
    filesError.value = e instanceof Error ? e.message : 'Failed to fetch file changes'
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

// Health status explanations
const healthExplanation = computed(() => {
  const grade = props.worktree.health_grade as HealthGrade | undefined
  if (!grade) return null

  switch (grade) {
    case 'A':
      return 'Excellent health - worktree is clean and up to date'
    case 'B':
      return 'Good health - minor issues may need attention'
    case 'C':
      return 'Fair health - some issues should be addressed'
    case 'D':
      return 'Poor health - significant issues need attention'
    case 'F':
      return 'Critical health - immediate attention required'
    default:
      return null
  }
})

// Sync status explanation
const syncExplanation = computed(() => {
  const { ahead = 0, behind = 0, dirty } = props.worktree
  const parts: string[] = []

  if (dirty) {
    parts.push('Has uncommitted changes')
  }
  if (ahead > 0) {
    parts.push(`${ahead} commit${ahead === 1 ? '' : 's'} ahead of remote`)
  }
  if (behind > 0) {
    parts.push(`${behind} commit${behind === 1 ? '' : 's'} behind remote`)
  }

  if (parts.length === 0) {
    return 'Clean and synchronised with remote'
  }

  return parts.join('. ')
})
</script>

<template>
  <div class="overflow-hidden">
    <!-- Toggle button row -->
    <button
      class="w-full flex items-center justify-between px-4 py-2 text-xs text-text-muted hover:text-text-secondary hover:bg-surface-overlay/30 transition-colors"
      @click="emit('toggle')"
    >
      <span class="flex items-center gap-2">
        <!-- Chevron icon -->
        <svg
          class="w-4 h-4 transition-transform"
          :class="{ 'rotate-90': isExpanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span>Details</span>
        <span v-if="!isExpanded && fileCount > 0" class="text-warning">
          ({{ fileCount }} uncommitted file{{ fileCount === 1 ? '' : 's' }})
        </span>
      </span>

      <!-- Refresh button (when expanded) -->
      <IconButton
        v-if="isExpanded"
        tooltip="Refresh details"
        size="sm"
        @click.stop="refreshData"
      >
        <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </IconButton>
    </button>

    <!-- Expandable content with animation -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-[1000px]"
      leave-from-class="opacity-100 max-h-[1000px]"
      leave-to-class="opacity-0 max-h-0"
    >
      <div
        v-show="isExpanded"
        class="border-t border-border-subtle bg-surface-base/50"
      >
        <div class="px-4 py-4 space-y-5">
          <!-- Path and URL section -->
          <section class="space-y-2">
            <h4 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Location
            </h4>

            <!-- Path -->
            <div class="flex items-center gap-2 group">
              <svg class="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <code class="flex-1 text-sm font-mono text-text-secondary truncate" :title="worktree.path">
                {{ worktree.path }}
              </code>
              <IconButton
                tooltip="Copy path"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleCopyPath"
              >
                <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </IconButton>
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
              <IconButton
                tooltip="Copy URL"
                size="sm"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleCopyUrl"
              >
                <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </IconButton>
            </div>
          </section>

          <!-- Health and Sync Status -->
          <section class="space-y-2">
            <h4 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Status
            </h4>

            <!-- Health breakdown -->
            <div v-if="worktree.health_grade" class="flex items-start gap-3 p-3 rounded-lg bg-surface-overlay/50">
              <GradeBadge :grade="worktree.health_grade" :score="worktree.health_score" />
              <div class="flex-1 min-w-0">
                <p class="text-sm text-text-primary">Health Grade</p>
                <p v-if="healthExplanation" class="text-xs text-text-muted mt-0.5">
                  {{ healthExplanation }}
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

          <!-- Recent Commits -->
          <section class="space-y-2">
            <h4 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Recent Commits
            </h4>
            <CommitList
              :commits="commits"
              :loading="commitsLoading"
              :error="commitsError"
            />
          </section>

          <!-- Uncommitted Files -->
          <section class="space-y-2">
            <h4 class="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Uncommitted Files
              <span v-if="!filesLoading && fileCount > 0" class="text-warning">
                ({{ fileCount }})
              </span>
            </h4>
            <FileChangesList
              :files="files"
              :loading="filesLoading"
              :error="filesError"
            />
          </section>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Respect reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  .transition-all,
  .transition-transform,
  .transition-opacity,
  .transition-colors {
    transition: none !important;
  }
}
</style>
