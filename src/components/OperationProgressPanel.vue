<script setup lang="ts">
/**
 * OperationProgressPanel Component
 *
 * Real-time progress panel for long-running operations like pull-all or prune.
 * Shows progress bar, per-item status, and completion state.
 *
 * Phase 5 enhancements:
 * - Categorised results (Success, Failed, Conflict, Skipped)
 * - Summary counts display
 * - Filtering by result type
 * - Expandable error details
 * - Copy error functionality
 * - Conflict resolution guidance
 * - Open in Editor/Terminal actions
 */
import { computed, ref } from 'vue'
import type { ProgressItem, ProgressStatus, ResultFilter, StatusCounts } from '../types'
import { Panel, Button } from './ui'
import { useToast } from '../composables'

/**
 * Props type for the progress panel.
 * Uses a custom interface to support readonly arrays from the composable.
 */
interface OperationProgressProp {
  operation: string
  current: number
  total: number
  items: readonly ProgressItem[] | ProgressItem[]
  isComplete: boolean
}

const props = defineProps<{
  isOpen: boolean
  title: string
  progress: OperationProgressProp | null
  hasFailures?: boolean
  hasConflicts?: boolean
}>()

const emit = defineEmits<{
  close: []
  cancel: []
  retry: []
  openInEditor: [path: string]
  openInTerminal: [path: string]
}>()

const { toast } = useToast()

// Phase 5: Active filter for categorised results
const activeFilter = ref<ResultFilter>('all')

// Phase 5: Track which items have expanded error details
const expandedErrors = ref<Set<string>>(new Set())

// Computed properties
const percentage = computed(() => {
  if (!props.progress || props.progress.total === 0) return 0
  return Math.round((props.progress.current / props.progress.total) * 100)
})

const progressText = computed(() => {
  if (!props.progress) return ''
  return `${props.progress.current}/${props.progress.total}`
})

const isComplete = computed(() => props.progress?.isComplete ?? false)

// Phase 5: Status counts for summary and filter tabs
const statusCounts = computed((): StatusCounts => {
  const counts: StatusCounts = {
    pending: 0,
    in_progress: 0,
    success: 0,
    failed: 0,
    conflict: 0,
    skipped: 0,
  }

  if (props.progress) {
    for (const item of props.progress.items) {
      counts[item.status]++
    }
  }

  return counts
})

// Phase 5: Summary text for completed operations
const summaryText = computed(() => {
  if (!isComplete.value) return ''

  const counts = statusCounts.value
  const parts: string[] = []

  if (counts.success > 0) {
    parts.push(`${counts.success} succeeded`)
  }
  if (counts.failed > 0) {
    parts.push(`${counts.failed} failed`)
  }
  if (counts.conflict > 0) {
    parts.push(`${counts.conflict} conflict${counts.conflict !== 1 ? 's' : ''}`)
  }
  if (counts.skipped > 0) {
    parts.push(`${counts.skipped} skipped`)
  }

  return parts.join(', ') || 'No results'
})

// Phase 5: Filtered items based on active filter
const filteredItems = computed(() => {
  if (!props.progress) return []

  if (activeFilter.value === 'all') {
    return props.progress.items
  }

  return props.progress.items.filter((item) => item.status === activeFilter.value)
})

// Phase 5: Filter tabs configuration
const filterTabs = computed(() => [
  { key: 'all' as ResultFilter, label: 'All', count: props.progress?.items.length ?? 0 },
  { key: 'success' as ResultFilter, label: 'Success', count: statusCounts.value.success },
  { key: 'failed' as ResultFilter, label: 'Failed', count: statusCounts.value.failed },
  { key: 'conflict' as ResultFilter, label: 'Conflicts', count: statusCounts.value.conflict },
  { key: 'skipped' as ResultFilter, label: 'Skipped', count: statusCounts.value.skipped },
])

// Phase 5: Status configuration with conflict status added
const statusConfig: Record<ProgressStatus, { icon: string; colour: string; bg: string; label: string }> = {
  pending: {
    icon: 'M12 4.75a7.25 7.25 0 1 1 0 14.5 7.25 7.25 0 0 1 0-14.5Z',
    colour: 'text-text-muted',
    bg: 'bg-surface-overlay',
    label: 'Pending',
  },
  in_progress: {
    icon: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z',
    colour: 'text-accent',
    bg: 'bg-accent-muted',
    label: 'In progress',
  },
  success: {
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    colour: 'text-success',
    bg: 'bg-success-muted',
    label: 'Success',
  },
  failed: {
    icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    colour: 'text-danger',
    bg: 'bg-danger-muted',
    label: 'Failed',
  },
  conflict: {
    icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    colour: 'text-warning',
    bg: 'bg-warning-muted',
    label: 'Conflict',
  },
  skipped: {
    icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    colour: 'text-text-tertiary',
    bg: 'bg-surface-overlay',
    label: 'Skipped',
  },
}

function getStatusConfig(status: ProgressStatus) {
  return statusConfig[status] || statusConfig.pending
}

function handleClose() {
  // Reset filter on close
  activeFilter.value = 'all'
  expandedErrors.value.clear()
  emit('close')
}

function handleCancel() {
  emit('cancel')
}

function handleRetry() {
  emit('retry')
}

// Phase 5: Toggle error details expansion
function toggleErrorDetails(itemKey: string) {
  if (expandedErrors.value.has(itemKey)) {
    expandedErrors.value.delete(itemKey)
  } else {
    expandedErrors.value.add(itemKey)
  }
}

function isErrorExpanded(itemKey: string): boolean {
  return expandedErrors.value.has(itemKey)
}

// Phase 5: Copy error to clipboard
async function copyError(error: string) {
  try {
    await navigator.clipboard.writeText(error)
    toast.success('Error copied to clipboard')
  } catch {
    toast.error('Failed to copy error')
  }
}

// Phase 5: Open worktree in editor
function handleOpenInEditor(item: ProgressItem) {
  if (item.worktreePath) {
    emit('openInEditor', item.worktreePath)
  }
}

// Phase 5: Open worktree in terminal
function handleOpenInTerminal(item: ProgressItem) {
  if (item.worktreePath) {
    emit('openInTerminal', item.worktreePath)
  }
}

// Phase 5: Check if item has actionable error
function hasError(item: ProgressItem): boolean {
  return !!(item.error && item.error.length > 0)
}
</script>

<template>
  <Panel
    :open="isOpen"
    :title="title"
    size="lg"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </template>

    <template #subtitle>
      <span v-if="progress">
        <template v-if="isComplete">
          {{ summaryText }}
        </template>
        <template v-else>
          {{ progressText }} items
        </template>
      </span>
    </template>

    <div class="space-y-4">
      <!-- Progress Bar -->
      <div v-if="progress" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-text-muted uppercase tracking-wider">Progress</span>
          <span class="text-sm font-semibold text-text-primary tabular-nums">{{ percentage }}%</span>
        </div>
        <div class="h-2 bg-surface-overlay rounded-full overflow-hidden ring-1 ring-inset ring-border-subtle">
          <div
            :class="[
              isComplete && !hasFailures && !hasConflicts ? 'bg-success' : '',
              isComplete && (hasFailures || hasConflicts) ? 'bg-warning' : '',
              !isComplete ? 'bg-accent' : ''
            ]"
            class="h-full progress-bar-transition rounded-full"
            :style="{ width: `${percentage}%` }"
          />
        </div>
      </div>

      <!-- Phase 5: Summary counts when complete -->
      <div v-if="isComplete && progress" class="flex flex-wrap gap-2">
        <div
          v-if="statusCounts.success > 0"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success-muted text-success text-xs font-medium"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ statusCounts.success }} succeeded
        </div>
        <div
          v-if="statusCounts.failed > 0"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-danger-muted text-danger text-xs font-medium"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {{ statusCounts.failed }} failed
        </div>
        <div
          v-if="statusCounts.conflict > 0"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning-muted text-warning text-xs font-medium"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" />
          </svg>
          {{ statusCounts.conflict }} conflict{{ statusCounts.conflict !== 1 ? 's' : '' }}
        </div>
        <div
          v-if="statusCounts.skipped > 0"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-overlay text-text-tertiary text-xs font-medium"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
          </svg>
          {{ statusCounts.skipped }} skipped
        </div>
      </div>

      <!-- Phase 5: Filter tabs when complete -->
      <div v-if="isComplete && progress" class="flex gap-1 p-1 bg-surface-overlay rounded-lg">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          :class="[
            'flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            activeFilter === tab.key
              ? 'bg-surface-raised text-text-primary shadow-sm'
              : 'text-text-tertiary hover:text-text-secondary'
          ]"
          @click="activeFilter = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.count > 0" class="ml-1 opacity-70">({{ tab.count }})</span>
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="!progress" class="flex items-center justify-center h-48">
        <div class="flex flex-col items-center gap-3">
          <svg class="w-8 h-8 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="text-sm text-text-tertiary">Waiting for operation to start...</span>
        </div>
      </div>

      <!-- Items list -->
      <div v-else class="space-y-2 max-h-[400px] overflow-y-auto">
        <TransitionGroup name="list">
          <div
            v-for="item in filteredItems"
            :key="item.item"
            :class="[
              'p-3 bg-surface-overlay rounded-lg border',
              item.status === 'conflict' ? 'border-warning/30' : 'border-border-subtle'
            ]"
          >
            <div class="flex items-start gap-3">
              <!-- Status icon -->
              <div class="flex-shrink-0 mt-0.5">
                <!-- Spinning icon for in_progress -->
                <svg
                  v-if="item.status === 'in_progress'"
                  :class="getStatusConfig(item.status).colour"
                  class="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" :d="getStatusConfig(item.status).icon" />
                </svg>
                <!-- Static icons for other statuses -->
                <svg
                  v-else
                  :class="getStatusConfig(item.status).colour"
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    :d="getStatusConfig(item.status).icon"
                  />
                </svg>
              </div>

              <!-- Item content -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-text-primary font-mono truncate">{{ item.item }}</p>
                <p v-if="item.details && !hasError(item)" class="text-xs text-text-tertiary mt-0.5">{{ item.details }}</p>

                <!-- Phase 5: Conflict warning banner -->
                <div
                  v-if="item.status === 'conflict'"
                  class="mt-2 p-2 rounded bg-warning-muted/50 border border-warning/20"
                >
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-warning flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01" />
                    </svg>
                    <div class="text-xs text-warning">
                      <p class="font-medium">Merge conflicts detected</p>
                      <p class="mt-1 text-warning/80">
                        Resolve conflicts manually, then stage and commit the changes.
                      </p>
                    </div>
                  </div>
                  <!-- Conflict action buttons -->
                  <div class="flex gap-2 mt-2 ml-6">
                    <button
                      v-if="item.worktreePath"
                      class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-warning hover:text-warning bg-warning-muted hover:bg-warning-strong rounded transition-colors"
                      @click="handleOpenInEditor(item)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Open in Editor
                    </button>
                    <button
                      v-if="item.worktreePath"
                      class="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-overlay hover:bg-surface-elevated rounded transition-colors"
                      @click="handleOpenInTerminal(item)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Open in Terminal
                    </button>
                  </div>
                </div>

                <!-- Phase 5: Expandable error details for failed items -->
                <div v-if="hasError(item) && item.status === 'failed'" class="mt-2">
                  <button
                    class="flex items-center gap-1 text-xs text-danger hover:text-danger/80 transition-colors"
                    @click="toggleErrorDetails(item.item)"
                  >
                    <svg
                      :class="isErrorExpanded(item.item) ? 'rotate-90' : ''"
                      class="w-3.5 h-3.5 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    {{ isErrorExpanded(item.item) ? 'Hide error details' : 'Show error details' }}
                  </button>

                  <!-- Expanded error content -->
                  <Transition name="expand">
                    <div v-if="isErrorExpanded(item.item)" class="mt-2">
                      <div class="p-2 rounded bg-danger-muted/30 border border-danger/20">
                        <pre class="text-xs text-danger/90 whitespace-pre-wrap font-mono overflow-x-auto max-h-32 overflow-y-auto">{{ item.error }}</pre>
                      </div>
                      <button
                        class="flex items-center gap-1 mt-1.5 px-2 py-1 text-xs font-medium text-danger hover:text-danger/80 bg-danger-muted hover:bg-danger-strong rounded transition-colors"
                        @click="copyError(item.error!)"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Error
                      </button>
                    </div>
                  </Transition>
                </div>
              </div>

              <!-- Status label -->
              <span
                :class="[getStatusConfig(item.status).bg, getStatusConfig(item.status).colour]"
                class="px-2 py-0.5 text-2xs font-medium rounded-md flex-shrink-0"
              >
                {{ getStatusConfig(item.status).label }}
              </span>
            </div>
          </div>
        </TransitionGroup>

        <!-- Empty state for filtered results -->
        <div
          v-if="filteredItems.length === 0 && progress.items.length > 0"
          class="flex flex-col items-center justify-center py-8 text-text-tertiary"
        >
          <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm">No items match this filter</p>
        </div>
      </div>
    </div>

    <!-- Cancel button when in progress -->
    <template v-if="!isComplete && progress" #footer>
      <Button variant="ghost" class="w-full" @click="handleCancel">
        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Cancel Operation
      </Button>
    </template>

    <!-- Footer buttons when complete -->
    <template v-if="isComplete" #footer>
      <div class="flex gap-3 w-full">
        <!-- Retry Failed button when there are failures or conflicts -->
        <Button
          v-if="hasFailures || hasConflicts"
          variant="danger"
          class="flex-1"
          @click="handleRetry"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Retry Failed
        </Button>

        <!-- Done button -->
        <Button
          :variant="hasFailures || hasConflicts ? 'ghost' : 'success'"
          :class="hasFailures || hasConflicts ? 'flex-1' : 'w-full'"
          @click="handleClose"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Done
        </Button>
      </div>
    </template>
  </Panel>
</template>

<style scoped>
/* Progress panel animations using design tokens */

/* Progress bar fill animation */
.progress-bar-transition {
  transition: all var(--duration-progress) var(--ease-out);
}

/* List item animations */
.list-enter-active,
.list-leave-active {
  transition: all var(--duration-modal) var(--ease-out);
}

.list-enter-from {
  opacity: 0;
  transform: translateX(-8px);
}

.list-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

/* Expand/collapse animation for error details */
.expand-enter-active,
.expand-leave-active {
  transition: all var(--duration-normal) var(--ease-out);
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>
