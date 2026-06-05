<script setup lang="ts">
/**
 * AttentionPanel Component (Overview)
 *
 * The "Needs Attention" panel: grouped sections for repository errors,
 * health issues (critical first), dirty worktrees, behind-remote worktrees,
 * and cleanup candidates — each with a count badge, and per-group bulk
 * actions for Behind (Pull all) and Cleanup (Prune all).
 *
 * Reads attention groups from the overview store; emits actions for the
 * parent (OverviewDashboard) to perform. Clicking an item body navigates;
 * the trailing button performs the inline action.
 */
import { storeToRefs } from 'pinia'
import { useOverviewStore } from '../../stores'
import type { Worktree } from '../../types'
import { parseHealthIssueMessage, severityExplanation } from '../../utils/healthIssues'

const props = withDefaults(
  defineProps<{
    /** Action errors keyed by `repo/branch` (bulk or inline pull failures) */
    itemErrors?: Record<string, string>
    /** Keys (`repo/branch` for worktrees, repo name for repairs) with an action in flight */
    busyKeys?: string[]
    /** Whether the bulk pull is running (disables Pull all) */
    bulkPulling?: boolean
    /** Whether the bulk prune is running (disables Prune all) */
    pruning?: boolean
  }>(),
  {
    itemErrors: () => ({}),
    busyKeys: () => [],
    bulkPulling: false,
    pruning: false,
  }
)

const emit = defineEmits<{
  navigate: [repo: string, branch: string]
  openHealth: [repo: string]
  repair: [repo: string]
  openEditor: [path: string]
  pull: [repo: string, branch: string]
  remove: [repo: string, worktree: Worktree]
  pullAllBehind: []
  pruneAll: []
}>()

const overviewStore = useOverviewStore()
const {
  healthAttention,
  dirtyAttention,
  behindAttention,
  cleanupAttention,
  repoErrors,
  hasAttentionItems,
} = storeToRefs(overviewStore)

function isBusy(key: string): boolean {
  return props.busyKeys.includes(key)
}

function errorFor(repo: string, branch: string): string | undefined {
  return props.itemErrors[`${repo}/${branch}`]
}

function cleanupLabel(worktree: Worktree): string {
  if (worktree.merged && worktree.stale) return 'merged · stale'
  if (worktree.merged) return 'merged'
  return 'stale'
}

/** Translate a raw CLI issue message into joined human titles */
function healthSummary(message: string): string {
  const titles = parseHealthIssueMessage(message).map((finding) => finding.title)
  return titles.length > 0 ? titles.join(' · ') : message
}
</script>

<template>
  <section class="attention-panel" aria-label="Needs attention">
    <h2 class="attention-title">Needs Attention</h2>

    <!-- All-clear state -->
    <div v-if="!hasAttentionItems" class="py-12 text-center">
      <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-success-muted flex items-center justify-center">
        <svg class="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p class="text-sm font-medium text-text-secondary">Everything's tidy</p>
      <p class="text-xs text-text-muted mt-1">No dirty worktrees, nothing behind, no health issues.</p>
    </div>

    <div v-else class="space-y-5">
      <!-- Repository errors -->
      <div v-if="repoErrors.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label text-danger">Repository errors</span>
          <span class="attention-count">{{ repoErrors.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="item in repoErrors" :key="item.repo" class="attention-item">
            <div class="attention-item-body">
              <span class="attention-item-title">Couldn't read <span class="font-mono">{{ item.repo }}</span></span>
              <span class="attention-item-sub text-danger">{{ item.error }}</span>
              <span class="attention-item-sub">Showing last-known data for this repository.</span>
            </div>
            <button class="attention-action" :disabled="isBusy(item.repo)" @click="emit('repair', item.repo)">
              {{ isBusy(item.repo) ? 'Repairing…' : 'Repair' }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Health issues (critical first) -->
      <div v-if="healthAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Health issues</span>
          <span class="attention-count">{{ healthAttention.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="item in healthAttention"
            :key="`${item.repo}-${item.issue.worktree}-${item.issue.severity}-${item.issue.message}`"
            class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.issue.worktree)">
              <span class="attention-item-title">
                <span class="severity-dot" :class="item.issue.severity === 'critical' ? 'bg-danger' : 'bg-warning'"
                  :title="severityExplanation(item.issue.severity)" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.issue.worktree }}</span>
              </span>
              <span class="attention-item-sub">{{ healthSummary(item.issue.message) }}</span>
            </button>
            <button class="attention-action" @click="emit('openHealth', item.repo)">View</button>
          </li>
        </ul>
      </div>

      <!-- Dirty worktrees -->
      <div v-if="dirtyAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Dirty</span>
          <span class="attention-count">{{ dirtyAttention.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="item in dirtyAttention" :key="item.worktree.path" class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
              <span class="attention-item-title">
                <span class="severity-dot bg-warning" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.worktree.branch }}</span>
              </span>
              <span class="attention-item-sub">Uncommitted changes</span>
            </button>
            <button class="attention-action" @click="emit('openEditor', item.worktree.path)">Editor</button>
          </li>
        </ul>
      </div>

      <!-- Behind remote -->
      <div v-if="behindAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Behind remote</span>
          <span class="attention-count">{{ behindAttention.length }}</span>
          <span class="flex-1" />
          <button class="attention-bulk-action" :disabled="bulkPulling" @click="emit('pullAllBehind')">
            {{ bulkPulling ? 'Pulling…' : 'Pull all' }}
          </button>
        </div>
        <ul class="attention-items">
          <li v-for="item in behindAttention" :key="item.worktree.path" class="attention-item-stack">
            <div class="attention-item">
              <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
                <span class="attention-item-title">
                  <span class="severity-dot bg-accent" />
                  <span class="font-mono">{{ item.repo }}</span>
                  <span class="text-text-muted">·</span>
                  <span class="truncate">{{ item.worktree.branch }}</span>
                </span>
                <span class="attention-item-sub">
                  {{ item.worktree.behind }} commit{{ item.worktree.behind === 1 ? '' : 's' }} behind
                </span>
              </button>
              <button class="attention-action"
                :disabled="isBusy(`${item.repo}/${item.worktree.branch}`) || bulkPulling"
                @click="emit('pull', item.repo, item.worktree.branch)">
                {{ isBusy(`${item.repo}/${item.worktree.branch}`) ? 'Pulling…' : 'Pull' }}
              </button>
            </div>
            <p v-if="errorFor(item.repo, item.worktree.branch)" class="attention-item-error">
              {{ errorFor(item.repo, item.worktree.branch) }}
            </p>
          </li>
        </ul>
      </div>

      <!-- Cleanup candidates -->
      <div v-if="cleanupAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Cleanup candidates</span>
          <span class="attention-count">{{ cleanupAttention.length }}</span>
          <span class="flex-1" />
          <button class="attention-bulk-action" :disabled="pruning" @click="emit('pruneAll')">
            {{ pruning ? 'Pruning…' : 'Prune all' }}
          </button>
        </div>
        <ul class="attention-items">
          <li v-for="item in cleanupAttention" :key="item.worktree.path" class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
              <span class="attention-item-title">
                <span class="severity-dot bg-text-muted" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.worktree.branch }}</span>
              </span>
              <span class="attention-item-sub">{{ cleanupLabel(item.worktree) }}</span>
            </button>
            <button class="attention-action" @click="emit('remove', item.repo, item.worktree)">Remove</button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.attention-panel {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  padding: 16px;
}

.attention-title {
  margin-bottom: 12px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.attention-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.attention-group-label {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.attention-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.attention-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  transition: background-color 120ms ease;
}

.attention-item:hover {
  background: rgba(255, 255, 255, 0.045);
}

.attention-item-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.attention-item-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.attention-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-weight: 500;
}

.attention-item-sub {
  color: var(--color-text-muted);
  font-size: 11px;
}

.attention-item-error {
  padding: 0 8px 4px 22px;
  color: var(--color-danger);
  font-size: 11px;
}

.severity-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
}

.attention-action {
  flex-shrink: 0;
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

.attention-action:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.attention-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.attention-bulk-action {
  height: 22px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease;
}

.attention-bulk-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.attention-bulk-action:disabled {
  cursor: wait;
  opacity: 0.55;
}
</style>
