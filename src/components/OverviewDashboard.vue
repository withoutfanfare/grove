<script setup lang="ts">
/**
 * OverviewDashboard Component
 *
 * Cross-repository home screen ("Mission Control") shown when no repository
 * is selected. Stat strip on top, grouped Needs Attention panel left (~60%),
 * Recent panel right (~40%). Cached snapshots paint instantly; a background
 * refresh runs on mount, window focus, and manual refresh.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWindowFocus } from '@vueuse/core'
import { useWorktreeStore, useOverviewStore } from '../stores'
import { useOverview, useRepos, useWorktrees, useWt, useToast, recordActivity } from '../composables'
import type { Worktree, OperationProgress, ProgressStatus } from '../types'
import AttentionPanel from './overview/AttentionPanel.vue'
import RecentPanel from './overview/RecentPanel.vue'
import PruneConfirmDialog from './overview/PruneConfirmDialog.vue'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import HealthPanel from './HealthPanel.vue'
import OperationProgressPanel from './OperationProgressPanel.vue'

interface BulkPullItem {
  repo: string
  branch: string
  path: string
}

const store = useWorktreeStore()
const overviewStore = useOverviewStore()
const { repositories } = storeToRefs(store)
const { refreshing, stats, behindAttention } = storeToRefs(overviewStore)
const { refreshAll, refreshRepos } = useOverview()
const { selectRepository } = useRepos()
const { fetchWorktrees, openInEditor, openInTerminal } = useWorktrees()
const wtApi = useWt()
const { toast } = useToast()

// ── Refresh: on mount and when the window regains focus ─────────────────

onMounted(() => {
  void refreshAll()
})

const windowFocused = useWindowFocus()
watch(windowFocused, (focused, wasFocused) => {
  if (focused && !wasFocused) {
    void refreshAll()
  }
})

function handleManualRefresh() {
  void refreshAll({ force: true })
}

// ── Navigation: select the repo and focus the worktree in the list view ─

async function handleNavigate(repo: string, branch: string) {
  // Same pattern as RepoList.handleNavigateToRecent: selectRepository seeds
  // the cache (including from the persisted snapshot), so check after.
  selectRepository(repo)
  const wasCached = store.isRepoLoaded(repo)
  await fetchWorktrees({ silent: wasCached })
  store.focusWorktree(branch, true, true)
}

// ── Per-item actions ─────────────────────────────────────────────────────

// Keys with an action in flight (`repo/branch` for worktrees, repo for repairs)
const busyKeys = ref<string[]>([])
// Action failures keyed by `repo/branch` — stay attached to the list item
const itemErrors = ref<Record<string, string>>({})

function setBusy(key: string, busy: boolean) {
  if (busy) {
    if (!busyKeys.value.includes(key)) busyKeys.value.push(key)
  } else {
    busyKeys.value = busyKeys.value.filter((k) => k !== key)
  }
}

async function handleOpenEditor(path: string) {
  const success = await openInEditor(path)
  if (!success) toast.error('Failed to open in editor')
}

async function handleOpenTerminal(path: string) {
  const success = await openInTerminal(path)
  if (!success) toast.error('Failed to open in terminal')
}

async function handlePull(repo: string, branch: string) {
  const key = `${repo}/${branch}`
  if (busyKeys.value.includes(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.pullWorktree(repo, branch)
    recordActivity({ action: 'Pull', repo, target: branch, status: result.success && !result.conflicts ? 'succeeded' : 'failed', details: result.message })
    if (result.conflicts || !result.success) {
      itemErrors.value[key] = result.message
    } else {
      delete itemErrors.value[key]
      toast.success(`Pulled ${branch}`)
    }
  } catch (error) {
    itemErrors.value[key] = wtApi.toWtError(error).message
    recordActivity({ action: 'Pull', repo, target: branch, status: 'failed', details: itemErrors.value[key] })
  } finally {
    setBusy(key, false)
    await refreshRepos([repo])
  }
}

async function handleRepair(repo: string) {
  if (busyKeys.value.includes(repo)) return
  setBusy(repo, true)
  try {
    const result = await wtApi.repairRepository(repo)
    recordActivity({ action: 'Repair repository', repo, target: repo, status: result.success ? 'succeeded' : 'failed', details: result.message })
    if (result.success) {
      toast.success(`${repo}: Fixed ${result.issues_fixed} issue${result.issues_fixed === 1 ? '' : 's'}`)
    } else {
      toast.error(`${repo}: ${result.message || 'Repair failed'}`)
    }
  } catch (error) {
    toast.error(`${repo}: ${wtApi.toWtError(error).message}`)
    recordActivity({ action: 'Repair repository', repo, target: repo, status: 'failed', details: wtApi.toWtError(error).message })
  } finally {
    setBusy(repo, false)
    await refreshRepos([repo])
  }
}

// ── Health panel (per-repo, opened from health attention items) ─────────

const showHealthPanel = ref(false)
const healthPanelRepo = ref('')

function handleOpenHealth(repo: string) {
  healthPanelRepo.value = repo
  showHealthPanel.value = true
}

// ── Delete dialog (cleanup "Remove" action — existing confirmed flow) ───

const showDeleteDialog = ref(false)
const deleteRepo = ref('')
const worktreeToDelete = ref<Worktree | null>(null)

function handleRemove(repo: string, worktree: Worktree) {
  deleteRepo.value = repo
  worktreeToDelete.value = worktree
  showDeleteDialog.value = true
}

async function handleDeleteClosed() {
  showDeleteDialog.value = false
  worktreeToDelete.value = null
  if (deleteRepo.value) {
    await refreshRepos([deleteRepo.value])
  }
}

// ── Bulk: pull all behind worktrees (sequential, grouped by repo) ────────

const showProgressPanel = ref(false)
const bulkProgress = ref<OperationProgress | null>(null)
const isBulkPulling = ref(false)
const bulkCancelled = ref(false)

const progressHasFailures = computed(() =>
  bulkProgress.value?.items.some((i) => i.status === 'failed' || i.status === 'conflict') ?? false
)
const progressHasConflicts = computed(() =>
  bulkProgress.value?.items.some((i) => i.status === 'conflict') ?? false
)

async function runBulkPull(items: BulkPullItem[]): Promise<void> {
  if (isBulkPulling.value || items.length === 0) return
  isBulkPulling.value = true
  bulkCancelled.value = false

  const progress: OperationProgress = {
    operation: 'overview_pull_behind',
    current: 0,
    total: items.length,
    items: items.map((entry) => ({
      item: `${entry.repo}/${entry.branch}`,
      status: 'pending' as ProgressStatus,
      worktreePath: entry.path,
    })),
    isComplete: false,
  }
  bulkProgress.value = progress
  showProgressPanel.value = true

  // Mutate through the ref's reactive proxy — writing to the captured plain
  // object would bypass change tracking and freeze the progress panel.
  const live = bulkProgress.value as OperationProgress

  const affectedRepos = new Set<string>()
  try {
    for (const [index, entry] of items.entries()) {
      const progressItem = live.items[index]
      if (bulkCancelled.value) {
        progressItem.status = 'skipped'
        live.current = index + 1
        continue
      }
      progressItem.status = 'in_progress'
      affectedRepos.add(entry.repo)
      const key = `${entry.repo}/${entry.branch}`
      try {
        const result = await wtApi.pullWorktree(entry.repo, entry.branch)
        progressItem.details = result.message
        if (result.conflicts) {
          progressItem.status = 'conflict'
          progressItem.hasConflict = true
          progressItem.error = result.message
          itemErrors.value[key] = result.message
        } else if (!result.success) {
          progressItem.status = 'failed'
          progressItem.error = result.message
          itemErrors.value[key] = result.message
        } else {
          progressItem.status = result.already_up_to_date ? 'skipped' : 'success'
          delete itemErrors.value[key]
        }
      } catch (error) {
        const message = wtApi.toWtError(error).message
        progressItem.status = 'failed'
        progressItem.error = message
        progressItem.details = message
        itemErrors.value[key] = message
      }
      live.current = index + 1
    }
    live.isComplete = true
    const notStarted = live.items.filter((i) => i.status === 'skipped' && bulkCancelled.value && !i.details)
    recordActivity({
      action: 'Pull behind worktrees',
      repo: [...new Set(items.map((i) => i.repo))].join(', '),
      target: `${items.length} worktree(s)`,
      status: bulkCancelled.value ? 'cancelled' : live.items.some((i) => i.status === 'failed' || i.status === 'conflict') ? 'partial' : 'succeeded',
      warnings: notStarted.length ? [`${notStarted.length} not started: ${notStarted.map((i) => i.item).join(', ')}`] : [],
      details: live.items.map((i) => `${i.status.toUpperCase()}  ${i.item}${i.error ? `: ${i.error}` : ''}`).join('\n'),
    })
  } finally {
    isBulkPulling.value = false
    if (affectedRepos.size > 0) {
      await refreshRepos([...affectedRepos])
    }
  }
}

function handlePullAllBehind() {
  // behindAttention is sorted by repo then branch, so a sequential walk
  // pulls one worktree at a time, grouped by repo (no parallel pulls)
  void runBulkPull(
    behindAttention.value.map((item) => ({
      repo: item.repo,
      branch: item.worktree.branch,
      path: item.worktree.path,
    }))
  )
}

function handleBulkCancel() {
  bulkCancelled.value = true
  if (bulkProgress.value) bulkProgress.value.stopping = true
}

function handleBulkRetry() {
  // Repo names cannot contain '/', so splitting on the first '/' is safe
  const failedItems: BulkPullItem[] = (bulkProgress.value?.items ?? [])
    .filter((i) => i.status === 'failed' || i.status === 'conflict')
    .map((i) => {
      const slash = i.item.indexOf('/')
      return {
        repo: i.item.slice(0, slash),
        branch: i.item.slice(slash + 1),
        path: i.worktreePath ?? '',
      }
    })
  void runBulkPull(failedItems)
}

function handleProgressClose() {
  showProgressPanel.value = false
  bulkProgress.value = null
}

// ── Bulk: branch clean-up from an exact read-only plan per repository ─

const showPruneDialog = ref(false)
// Every registered repo: merged branches without a worktree never appear as cards
const pruneRepos = computed(() => repositories.value.map((repo) => repo.name))

function handlePruneAll() {
  showPruneDialog.value = true
}

async function handlePruneDone(repos: string[]) {
  if (repos.length > 0) await refreshRepos(repos)
}
</script>

<template>
  <div class="min-h-full flex flex-col p-5 gap-4 animate-fade-in">
    <!-- Zero repositories: onboarding hint (drag-and-drop still works here) -->
    <div v-if="repositories.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md">
        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-surface-overlay flex items-center justify-center">
          <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <p class="text-lg font-medium text-text-secondary">No repositories yet</p>
        <p class="text-sm text-text-muted mt-1">
          Drag a git repository folder here to register it, or clone one from the sidebar.
        </p>
      </div>
    </div>

    <template v-else>
      <!-- Stat strip -->
      <div class="overview-statstrip">
        <span class="overview-chip"><strong>{{ repositories.length }}</strong> repos</span>
        <span class="overview-chip"><strong>{{ stats.worktreeCount }}</strong> worktrees</span>
        <span class="overview-chip" :class="{ 'overview-chip-warn': stats.dirtyCount > 0 }">
          <strong>{{ stats.dirtyCount }}</strong> dirty</span>
        <span class="overview-chip" :class="{ 'overview-chip-warn': stats.behindCount > 0 }">
          <strong>{{ stats.behindCount }}</strong> behind</span>
        <span v-if="stats.aheadCount > 0" class="overview-chip" title="Known commits ahead of the upstream, as of the last fetch">
          <strong>{{ stats.aheadCount }}</strong> ahead</span>
        <span v-if="stats.unknownSyncCount > 0" class="overview-chip" title="No upstream, or the comparison failed. Not counted as up to date.">
          <strong>{{ stats.unknownSyncCount }}</strong> sync unknown</span>
        <span v-if="stats.failedCheckRepos > 0" class="overview-chip overview-chip-warn" title="Repositories whose latest list, health or disk check failed; older results are shown">
          <strong>{{ stats.failedCheckRepos }}</strong> checks failed</span>
        <span v-if="stats.diskDisplay" class="overview-chip" title="Estimated total size of worktree folders. Not a promise of reclaimable space.">
          <strong>~{{ stats.diskDisplay }}</strong> on disk</span>

        <span class="flex-1" />

        <Transition name="fade">
          <span v-if="refreshing" class="overview-refreshing">Refreshing…</span>
        </Transition>
        <button class="overview-chip hover:text-text-primary" title="Plan deletion of merged branches that have no worktree, repository by repository" @click="handlePruneAll">
          Clean up branches…</button>
        <button class="overview-refresh-btn" title="Refresh overview" @click="handleManualRefresh">
          <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': refreshing }" fill="none" stroke="currentColor"
            viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Panels: attention left (~60%), recent right (~40%) -->
      <div class="flex-1 grid grid-cols-5 gap-4 items-start">
        <div class="col-span-3 min-w-0">
          <AttentionPanel
            :item-errors="itemErrors"
            :busy-keys="busyKeys"
            :bulk-pulling="isBulkPulling"
            :pruning="showPruneDialog"
            @navigate="handleNavigate"
            @open-health="handleOpenHealth"
            @repair="handleRepair"
            @open-editor="handleOpenEditor"
            @pull="handlePull"
            @remove="handleRemove"
            @pull-all-behind="handlePullAllBehind"
            @prune-all="handlePruneAll"
          />
        </div>
        <div class="col-span-2 min-w-0">
          <RecentPanel
            @navigate="handleNavigate"
            @open-editor="handleOpenEditor"
            @open-terminal="handleOpenTerminal"
          />
        </div>
      </div>
    </template>

    <!-- Dialogs and panels (self-contained — repo chosen per action) -->
    <HealthPanel :is-open="showHealthPanel" :repo-name="healthPanelRepo" @close="showHealthPanel = false" />

    <DeleteWorktreeDialog :is-open="showDeleteDialog" :worktree="worktreeToDelete" :repo-name="deleteRepo"
      @close="handleDeleteClosed" />

    <PruneConfirmDialog :is-open="showPruneDialog" :repos="pruneRepos"
      @close="showPruneDialog = false" @done="handlePruneDone" />

    <OperationProgressPanel :is-open="showProgressPanel" title="Pulling Behind Worktrees" :progress="bulkProgress"
      :has-failures="progressHasFailures" :has-conflicts="progressHasConflicts" @close="handleProgressClose"
      @cancel="handleBulkCancel" @retry="handleBulkRetry" @open-in-editor="handleOpenEditor"
      @open-in-terminal="handleOpenTerminal" />
  </div>
</template>

<style scoped>
.overview-statstrip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.overview-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.overview-chip strong {
  color: var(--color-text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.overview-chip-warn strong {
  color: var(--color-warning);
}

.overview-refreshing {
  color: var(--color-text-muted);
  font-size: 11px;
  animation: pulse-subtle var(--duration-pulse) infinite;
}

.overview-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  transition: background-color 120ms ease, color 120ms ease;
}

.overview-refresh-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.055);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
