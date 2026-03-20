import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorktreeStore, useSettingsStore } from '../stores';
import type { Worktree } from '../types';

/**
 * Information about a stale worktree
 */
export interface StaleWorktreeInfo {
  worktree: Worktree;
  repoName: string;
  daysSinceAccess: number;
  isSafeToDelete: boolean;
}

/**
 * Composable for detecting stale worktrees.
 *
 * A worktree is considered stale if it hasn't been accessed within
 * the configured threshold (default: 14 days). Worktrees that are
 * fully merged with no uncommitted changes are flagged as safe to delete.
 */
export function useStaleDetection() {
  const store = useWorktreeStore();
  const settingsStore = useSettingsStore();
  const { worktrees } = storeToRefs(store);
  const { settings } = storeToRefs(settingsStore);

  /**
   * Check if a worktree is stale based on last access time
   */
  function isStale(worktree: Worktree): boolean {
    if (!worktree.lastAccessed) return false;

    const lastAccessed = new Date(worktree.lastAccessed).getTime();
    const thresholdMs = settings.value.staleThresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return now - lastAccessed > thresholdMs;
  }

  /**
   * Calculate the number of days since a worktree was last accessed
   */
  function daysSinceAccess(worktree: Worktree): number {
    if (!worktree.lastAccessed) return -1;
    const lastAccessed = new Date(worktree.lastAccessed).getTime();
    return Math.floor((Date.now() - lastAccessed) / (24 * 60 * 60 * 1000));
  }

  /**
   * Check if a stale worktree is safe to delete
   * (merged into base and no uncommitted changes)
   */
  function isSafeToDelete(worktree: Worktree): boolean {
    return worktree.merged === true && !worktree.dirty;
  }

  /**
   * Get all stale worktrees for the current repository
   */
  const staleWorktrees = computed<StaleWorktreeInfo[]>(() => {
    const repoName = store.selectedRepoName;
    if (!repoName) return [];

    return worktrees.value
      .filter(isStale)
      .map((wt) => ({
        worktree: wt,
        repoName,
        daysSinceAccess: daysSinceAccess(wt),
        isSafeToDelete: isSafeToDelete(wt),
      }))
      .sort((a, b) => b.daysSinceAccess - a.daysSinceAccess);
  });

  /**
   * Count of stale worktrees
   */
  const staleCount = computed(() => staleWorktrees.value.length);

  /**
   * Count of worktrees safe to batch-delete
   */
  const safeToDeleteCount = computed(() =>
    staleWorktrees.value.filter((s) => s.isSafeToDelete).length
  );

  return {
    isStale,
    daysSinceAccess,
    isSafeToDelete,
    staleWorktrees,
    staleCount,
    safeToDeleteCount,
  };
}
