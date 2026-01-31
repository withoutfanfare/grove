import { ref, readonly, type DeepReadonly, type Ref } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  OperationProgress,
  OperationProgressEvent,
  ProgressItem,
  ProgressStatus,
  StatusCounts,
} from '../types';
import {
  isTerminalStatus,
  determineEnhancedStatus,
} from '../types/progress';

/**
 * Composable for managing operation progress state and Tauri event subscriptions.
 *
 * Provides real-time progress tracking for long-running operations like pull-all and prune.
 * Subscribes to Tauri events and updates reactive state as events arrive.
 *
 * @example
 * ```typescript
 * const { progress, startListening, reset } = useOperationProgress();
 *
 * // Before invoking the operation
 * await startListening('pull_all', ['main', 'develop', 'feature/login']);
 *
 * // After operation completes or user dismisses
 * reset();
 * ```
 */
export function useOperationProgress() {
  const progress = ref<OperationProgress | null>(null);
  let unlisten: UnlistenFn | null = null;

  /**
   * Start listening for progress events for an operation.
   *
   * Initialises progress state with expected items in 'pending' status,
   * then subscribes to Tauri events to update status as operations proceed.
   *
   * @param operation - Operation type (e.g., 'pull_all', 'prune')
   * @param expectedItems - List of item identifiers (e.g., branch names)
   * @param worktreePaths - Optional map of branch names to worktree paths for Phase 5 actions
   */
  async function startListening(
    operation: string,
    expectedItems: string[],
    worktreePaths?: Map<string, string>
  ): Promise<void> {
    // Clean up any existing subscription
    await stopListening();

    // Initialise progress state
    progress.value = {
      operation,
      current: 0,
      total: expectedItems.length,
      items: expectedItems.map((item): ProgressItem => ({
        item,
        status: 'pending' as ProgressStatus,
        worktreePath: worktreePaths?.get(item),
      })),
      isComplete: false,
    };

    // Subscribe to progress events
    unlisten = await listen<OperationProgressEvent>('operation_progress', (event) => {
      // Filter events for this operation only
      if (event.payload.operation !== operation) return;

      const p = progress.value;
      if (!p) return;

      // Update total from event (this should be consistent)
      p.total = event.payload.total;

      // Phase 5: Enhance status detection based on output content
      // Detect conflicts in failure messages, and already-up-to-date in success messages
      let enhancedStatus = event.payload.status;
      let hasConflict = false;
      const details = event.payload.details || '';

      if (isTerminalStatus(event.payload.status)) {
        const enhanced = determineEnhancedStatus(event.payload.status, details);
        enhancedStatus = enhanced.status;
        hasConflict = enhanced.hasConflict;
      }

      // Find and update the item
      const itemIndex = p.items.findIndex((i) => i.item === event.payload.item);
      if (itemIndex >= 0) {
        // Update existing item with enhanced status
        p.items[itemIndex].status = enhancedStatus;
        p.items[itemIndex].details = event.payload.details;
        p.items[itemIndex].hasConflict = hasConflict;

        // Store error details for failed/conflict items
        if (enhancedStatus === 'failed' || enhancedStatus === 'conflict') {
          p.items[itemIndex].error = event.payload.details;
        }
      } else {
        // Dynamic item addition (for prune which may discover items during operation)
        const newItem: ProgressItem = {
          item: event.payload.item,
          status: enhancedStatus,
          details: event.payload.details,
          hasConflict,
          worktreePath: worktreePaths?.get(event.payload.item),
        };

        // Store error details for failed/conflict items
        if (enhancedStatus === 'failed' || enhancedStatus === 'conflict') {
          newItem.error = event.payload.details;
        }

        p.items.push(newItem);
      }

      // Calculate current based on completed items (terminal status = success/failed/conflict/skipped)
      // This ensures accurate progress even with parallel execution
      p.current = p.items.filter((i) => isTerminalStatus(i.status)).length;

      // Check if operation is complete
      // Complete when all items are in terminal state
      const allTerminal = p.items.every((i) => isTerminalStatus(i.status));
      p.isComplete = allTerminal && p.items.length === p.total;
    });
  }

  /**
   * Stop listening to progress events.
   *
   * Unsubscribes from Tauri events. Does not clear progress state.
   */
  async function stopListening(): Promise<void> {
    if (unlisten) {
      const fn = unlisten;
      unlisten = null;
      await fn();
    }
  }

  /**
   * Reset all progress state and stop listening.
   *
   * Call this when dismissing the progress panel or starting a new operation.
   */
  async function reset(): Promise<void> {
    await stopListening();
    progress.value = null;
  }

  /**
   * Get the percentage complete (0-100).
   *
   * Returns 0 if no progress state exists.
   */
  function getPercentage(): number {
    if (!progress.value || progress.value.total === 0) return 0;
    return Math.round((progress.value.current / progress.value.total) * 100);
  }

  /**
   * Get counts of items by status.
   *
   * Useful for showing summary statistics in the UI.
   * Phase 5: Added 'conflict' status tracking.
   */
  function getStatusCounts(): StatusCounts {
    const counts: StatusCounts = {
      pending: 0,
      in_progress: 0,
      success: 0,
      failed: 0,
      conflict: 0,
      skipped: 0,
    };

    if (progress.value) {
      for (const item of progress.value.items) {
        counts[item.status]++;
      }
    }

    return counts;
  }

  /**
   * Get the list of failed items (item identifiers).
   *
   * Useful for retry functionality where only failed items need to be re-processed.
   * Phase 5: Includes both 'failed' and 'conflict' items for retry.
   */
  function getFailedItems(): string[] {
    if (!progress.value) return [];
    return progress.value.items
      .filter((item) => item.status === 'failed' || item.status === 'conflict')
      .map((item) => item.item);
  }

  /**
   * Check if there are any failed items.
   * Phase 5: Includes 'conflict' status as a failure type.
   */
  function hasFailures(): boolean {
    if (!progress.value) return false;
    return progress.value.items.some(
      (item) => item.status === 'failed' || item.status === 'conflict'
    );
  }

  /**
   * Phase 5: Get items with merge conflicts.
   */
  function getConflictItems(): ProgressItem[] {
    if (!progress.value) return [];
    return progress.value.items.filter((item) => item.status === 'conflict');
  }

  /**
   * Phase 5: Check if there are any items with merge conflicts.
   */
  function hasConflicts(): boolean {
    if (!progress.value) return false;
    return progress.value.items.some((item) => item.status === 'conflict');
  }

  /**
   * Phase 5: Get items that were skipped (already up to date).
   */
  function getSkippedItems(): ProgressItem[] {
    if (!progress.value) return [];
    return progress.value.items.filter((item) => item.status === 'skipped');
  }

  /**
   * Phase 5: Get items that succeeded with actual changes.
   */
  function getSuccessItems(): ProgressItem[] {
    if (!progress.value) return [];
    return progress.value.items.filter((item) => item.status === 'success');
  }

  /**
   * Phase 5: Build a summary string for display.
   * e.g., "3 succeeded, 1 conflict, 2 skipped"
   */
  function getSummaryText(): string {
    const counts = getStatusCounts();
    const parts: string[] = [];

    if (counts.success > 0) {
      parts.push(`${counts.success} succeeded`);
    }
    if (counts.failed > 0) {
      parts.push(`${counts.failed} failed`);
    }
    if (counts.conflict > 0) {
      parts.push(`${counts.conflict} conflict${counts.conflict !== 1 ? 's' : ''}`);
    }
    if (counts.skipped > 0) {
      parts.push(`${counts.skipped} skipped`);
    }

    return parts.join(', ') || 'No results';
  }

  return {
    /** Readonly reactive progress state */
    progress: readonly(progress) as DeepReadonly<Ref<OperationProgress | null>>,
    /** Start listening for progress events */
    startListening,
    /** Stop listening to progress events */
    stopListening,
    /** Reset progress state and stop listening */
    reset,
    /** Get percentage complete (0-100) */
    getPercentage,
    /** Get counts of items by status */
    getStatusCounts,
    /** Get list of failed item identifiers (includes conflicts) */
    getFailedItems,
    /** Check if there are any failures (includes conflicts) */
    hasFailures,
    /** Phase 5: Get items with merge conflicts */
    getConflictItems,
    /** Phase 5: Check if there are any conflicts */
    hasConflicts,
    /** Phase 5: Get items that were skipped */
    getSkippedItems,
    /** Phase 5: Get items that succeeded */
    getSuccessItems,
    /** Phase 5: Get summary text for display */
    getSummaryText,
  };
}
