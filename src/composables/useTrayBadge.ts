import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorktreeStore, useSettingsStore } from '../stores';
import { useStaleDetection } from './useStaleDetection';
import type { Worktree } from '../types';

/**
 * Composable for calculating the system tray badge count.
 *
 * The badge shows the number of worktrees needing attention:
 * - Dirty (uncommitted changes)
 * - Behind remote (needs pull)
 * - Stale (not accessed within threshold)
 *
 * Which states count is configurable in settings.
 */
export function useTrayBadge() {
  const store = useWorktreeStore();
  const settingsStore = useSettingsStore();
  const { worktrees } = storeToRefs(store);
  const { settings } = storeToRefs(settingsStore);
  const { isStale } = useStaleDetection();

  /**
   * Check if a worktree needs attention based on configured states
   */
  function needsAttention(wt: Worktree): boolean {
    const states = settings.value.trayBadgeStates;
    if (states.includes('dirty') && wt.dirty) return true;
    if (states.includes('behind') && wt.behind > 0) return true;
    if (states.includes('stale') && isStale(wt)) return true;
    return false;
  }

  /**
   * Total count of worktrees needing attention
   */
  const badgeCount = computed(() => {
    if (!settings.value.trayBadgeEnabled) return 0;
    return worktrees.value.filter(needsAttention).length;
  });

  /**
   * List of worktrees needing attention with reasons
   */
  const attentionWorktrees = computed(() => {
    if (!settings.value.trayBadgeEnabled) return [];

    const states = settings.value.trayBadgeStates;

    return worktrees.value
      .filter(needsAttention)
      .map((wt) => {
        const reasons: string[] = [];
        if (states.includes('dirty') && wt.dirty) reasons.push('uncommitted changes');
        if (states.includes('behind') && wt.behind > 0) reasons.push(`${wt.behind} behind`);
        if (states.includes('stale') && isStale(wt)) reasons.push('stale');
        return { worktree: wt, reasons };
      });
  });

  return {
    badgeCount,
    attentionWorktrees,
    needsAttention,
  };
}
