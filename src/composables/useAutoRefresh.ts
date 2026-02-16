import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { useWindowFocus, useTimestamp, useThrottleFn } from '@vueuse/core';
import { useWorktreeStore } from '../stores';
import { useWt } from './useWt';

/** Auto-refresh interval when user is active (15 seconds) */
const ACTIVE_REFRESH_INTERVAL_MS = 15000;

/** Auto-refresh interval when user is idle (60 seconds) */
const IDLE_REFRESH_INTERVAL_MS = 60000;

/** Time without activity before user is considered idle (30 seconds) */
const IDLE_TIMEOUT_MS = 30000;

/** Stale threshold in milliseconds (10 seconds) */
const STALE_THRESHOLD_MS = 10000;

/** Debounce delay for focus-triggered refresh in milliseconds (reduced from 500ms) */
const FOCUS_DEBOUNCE_MS = 300;

export interface AutoRefreshState {
  /** Whether auto-refresh is currently enabled */
  isEnabled: Ref<boolean>;
  /** Whether a refresh is currently in progress */
  isRefreshing: Ref<boolean>;
  /** Timestamp of the last successful refresh (null if never refreshed) */
  lastRefreshTime: Ref<number | null>;
  /** Whether the data is considered stale (>10 seconds since last refresh) */
  isStale: ComputedRef<boolean>;
  /** Human-readable string describing when data was last updated */
  lastUpdatedText: ComputedRef<string>;
  /** Whether the user is currently active (has interacted within IDLE_TIMEOUT_MS) */
  isUserActive: ComputedRef<boolean>;
  /** Current refresh interval in milliseconds (15s active, 60s idle) */
  currentInterval: ComputedRef<number>;
}

export interface AutoRefreshControls {
  /** Start auto-refresh for the current repository */
  start: () => void;
  /** Stop auto-refresh */
  stop: () => void;
  /** Manually trigger a refresh (resets the timer) */
  refresh: () => Promise<void>;
  /** Pause auto-refresh temporarily (e.g., during operations) */
  pause: () => void;
  /** Resume auto-refresh if it was paused */
  resume: () => void;
}

export type UseAutoRefreshReturn = AutoRefreshState & AutoRefreshControls;

/**
 * Composable for automatic worktree status refresh with adaptive intervals.
 *
 * Uses adaptive refresh intervals based on user activity:
 * - Active (15s): User has interacted within the last 30 seconds
 * - Idle (60s): No user interaction for 30+ seconds
 *
 * Pauses when the window loses focus and resumes when it regains focus.
 * If data is stale (>10 seconds) when focus is regained, triggers an immediate refresh.
 *
 * @example
 * ```typescript
 * const {
 *   isEnabled,
 *   isRefreshing,
 *   lastUpdatedText,
 *   isUserActive,
 *   currentInterval,
 *   start,
 *   stop,
 *   refresh
 * } = useAutoRefresh();
 *
 * // Start auto-refresh when a repo is selected
 * watch(selectedRepoName, (name) => {
 *   if (name) start();
 *   else stop();
 * });
 * ```
 */
export function useAutoRefresh(): UseAutoRefreshReturn {
  const store = useWorktreeStore();
  const wt = useWt();

  // State
  const isEnabled = ref(false);
  const isRefreshing = ref(false);
  const isPaused = ref(false);
  const lastRefreshTime = ref<number | null>(null);
  const lastActivityTime = ref<number>(Date.now());

  // Use VueUse for window focus detection and timestamp
  const windowFocused = useWindowFocus();
  const currentTimestamp = useTimestamp({ interval: 1000 });

  // Track focus debounce timeout and interval timeout
  let focusDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  let intervalTimeout: ReturnType<typeof setTimeout> | null = null;

  // Track activity event listener cleanup
  let activityCleanup: (() => void) | null = null;

  // Computed: is data stale?
  const isStale = computed<boolean>(() => {
    if (lastRefreshTime.value === null) return true;
    return currentTimestamp.value - lastRefreshTime.value > STALE_THRESHOLD_MS;
  });

  // Computed: human-readable last updated text
  const lastUpdatedText = computed<string>(() => {
    if (lastRefreshTime.value === null) return 'Never updated';

    const elapsed = currentTimestamp.value - lastRefreshTime.value;

    if (elapsed < 5000) return 'Updated just now';
    if (elapsed < 60000) {
      const seconds = Math.floor(elapsed / 1000);
      return `Updated ${seconds}s ago`;
    }
    if (elapsed < 3600000) {
      const minutes = Math.floor(elapsed / 60000);
      return `Updated ${minutes}m ago`;
    }

    const hours = Math.floor(elapsed / 3600000);
    return `Updated ${hours}h ago`;
  });

  // Computed: is user currently active?
  const isUserActive = computed<boolean>(() => {
    return currentTimestamp.value - lastActivityTime.value < IDLE_TIMEOUT_MS;
  });

  // Computed: current refresh interval based on user activity
  const currentInterval = computed<number>(() => {
    return isUserActive.value ? ACTIVE_REFRESH_INTERVAL_MS : IDLE_REFRESH_INTERVAL_MS;
  });

  /**
   * Track user activity - throttled to prevent excessive updates.
   */
  const trackActivity = useThrottleFn(() => {
    lastActivityTime.value = Date.now();
  }, 1000);

  /**
   * Set up activity tracking event listeners.
   * Listens for keyboard, mouse, scroll, and touch events.
   */
  function setupActivityTracking(): void {
    if (activityCleanup) return; // Already set up

    const events = ['keydown', 'mousedown', 'mousemove', 'scroll', 'touchstart'];

    for (const event of events) {
      window.addEventListener(event, trackActivity, { passive: true });
    }

    activityCleanup = () => {
      for (const event of events) {
        window.removeEventListener(event, trackActivity);
      }
    };
  }

  /**
   * Clean up activity tracking event listeners.
   */
  function cleanupActivityTracking(): void {
    if (activityCleanup) {
      activityCleanup();
      activityCleanup = null;
    }
  }

  /**
   * Internal function to fetch worktree status.
   * Only fetches if conditions are met (enabled, not paused, repo selected, not already refreshing).
   *
   * H12 Fix: Defensive double-refresh check at the start.
   * H11 Note: Operations should call pause() before starting and resume() after completing.
   */
  async function performRefresh(): Promise<void> {
    const repoName = store.selectedRepoName;

    // H12 Fix: Defensive double-refresh check
    // If already refreshing, log warning and return early
    if (isRefreshing.value) {
      console.warn('[useAutoRefresh] performRefresh called while already refreshing - skipping');
      return;
    }

    // Guard: don't refresh if conditions aren't met
    if (!isEnabled.value || isPaused.value || !repoName) {
      // H11: Log when refresh is skipped for debugging
      if (isPaused.value) {
        console.debug('[useAutoRefresh] Refresh skipped: paused (operations may be in progress)');
      }
      return;
    }

    isRefreshing.value = true;

    try {
      // Try getWorktreeStatus first for richer information
      try {
        const worktrees = await wt.getWorktreeStatus(repoName);

        // Guard against stale responses if repo changed during await
        if (store.selectedRepoName !== repoName) {
          console.debug(`[useAutoRefresh] Stale refresh response for ${repoName}, discarding`);
          return;
        }

        store.setWorktrees(worktrees);
        lastRefreshTime.value = Date.now();
      } catch (primaryError) {
        console.warn('[useAutoRefresh] getWorktreeStatus failed, falling back to listWorktrees:', primaryError);

        // Fall back to list_worktrees if status fails
        try {
          const worktrees = await wt.listWorktrees(repoName);

          // Guard against stale fallback responses
          if (store.selectedRepoName !== repoName) {
            console.debug(`[useAutoRefresh] Stale fallback response for ${repoName}, discarding`);
            return;
          }

          store.setWorktrees(worktrees);
          lastRefreshTime.value = Date.now();
        } catch (fallbackError) {
          // Log but don't set error for auto-refresh failures
          // We don't want to spam the user with errors during background refreshes
          console.warn('[useAutoRefresh] Fallback also failed:', fallbackError);
        }
      }
    } finally {
      // H12 Fix: Ensure isRefreshing is always reset in finally block
      isRefreshing.value = false;
    }
  }

  // Track whether interval is active
  const isIntervalActive = ref(false);

  /**
   * Schedule the next refresh with dynamic interval.
   * Uses setTimeout that re-evaluates the interval each time based on user activity.
   */
  function scheduleNextRefresh(): void {
    // Clear any existing timeout
    if (intervalTimeout) {
      clearTimeout(intervalTimeout);
      intervalTimeout = null;
    }

    // Don't schedule if not active
    if (!isEnabled.value || isPaused.value || !windowFocused.value) {
      isIntervalActive.value = false;
      return;
    }

    isIntervalActive.value = true;

    // Schedule with current interval (15s active, 60s idle)
    // Capture current interval to avoid stale closure
    const interval = currentInterval.value;
    intervalTimeout = setTimeout(async () => {
      intervalTimeout = null;

      // Perform refresh and schedule the next one
      await performRefresh();

      // Schedule next refresh (re-evaluate interval)
      if (isEnabled.value && !isPaused.value && windowFocused.value) {
        scheduleNextRefresh();
      } else {
        isIntervalActive.value = false;
      }
    }, interval);
  }

  /**
   * Pause the interval timer.
   */
  function pauseInterval(): void {
    if (intervalTimeout) {
      clearTimeout(intervalTimeout);
      intervalTimeout = null;
    }
    isIntervalActive.value = false;
  }

  /**
   * Resume the interval timer.
   */
  function resumeInterval(): void {
    if (!isIntervalActive.value) {
      scheduleNextRefresh();
    }
  }

  /**
   * Handle window focus changes.
   * When focus is regained and data is stale, trigger an immediate refresh.
   */
  watch(windowFocused, (focused, wasFocused) => {
    if (!isEnabled.value || isPaused.value) return;

    if (focused && !wasFocused) {
      // Window just gained focus - debounce to prevent rapid refetching
      if (focusDebounceTimeout) {
        clearTimeout(focusDebounceTimeout);
      }

      focusDebounceTimeout = setTimeout(() => {
        focusDebounceTimeout = null;

        // Refresh immediately if data is stale
        if (isStale.value) {
          performRefresh();
        }

        // Resume interval if not active
        if (!isIntervalActive.value) {
          resumeInterval();
        }
      }, FOCUS_DEBOUNCE_MS);
    } else if (!focused && wasFocused) {
      // Window lost focus - pause the interval
      pauseInterval();

      // Clear any pending focus debounce
      if (focusDebounceTimeout) {
        clearTimeout(focusDebounceTimeout);
        focusDebounceTimeout = null;
      }
    }
  });

  /**
   * Start auto-refresh.
   * This enables the interval timer and immediate refresh if data is stale.
   */
  function start(): void {
    if (isEnabled.value) return;

    isEnabled.value = true;
    isPaused.value = false;

    // Set up activity tracking for adaptive intervals
    setupActivityTracking();

    // Reset activity time on start
    lastActivityTime.value = Date.now();

    // Only start if window is focused
    if (windowFocused.value) {
      // Perform immediate refresh if stale
      if (isStale.value) {
        performRefresh();
      }
      resumeInterval();
    }
  }

  /**
   * Stop auto-refresh completely.
   */
  function stop(): void {
    isEnabled.value = false;
    isPaused.value = false;
    pauseInterval();

    // Clean up activity tracking
    cleanupActivityTracking();

    if (focusDebounceTimeout) {
      clearTimeout(focusDebounceTimeout);
      focusDebounceTimeout = null;
    }
  }

  /**
   * Manually trigger a refresh and reset the timer.
   */
  async function refresh(): Promise<void> {
    // Reset the interval timer
    pauseInterval();

    // Perform the refresh
    await performRefresh();

    // Resume interval if enabled and not paused
    if (isEnabled.value && !isPaused.value && windowFocused.value) {
      resumeInterval();
    }
  }

  /**
   * Pause auto-refresh temporarily.
   * Used during operations to prevent conflicts.
   */
  function pause(): void {
    isPaused.value = true;
    pauseInterval();
  }

  /**
   * Resume auto-refresh if it was paused.
   */
  function resume(): void {
    if (!isEnabled.value) return;

    isPaused.value = false;

    if (windowFocused.value) {
      // Refresh immediately if data became stale while paused
      if (isStale.value) {
        performRefresh();
      }
      resumeInterval();
    }
  }

  // Cleanup on unmount (C3 fix: explicitly clear all timeouts)
  onUnmounted(() => {
    stop();
    // C3 Fix: Ensure focusDebounceTimeout is cleared even if stop() is modified
    if (focusDebounceTimeout) {
      clearTimeout(focusDebounceTimeout);
      focusDebounceTimeout = null;
    }
    // Ensure intervalTimeout is cleared
    if (intervalTimeout) {
      clearTimeout(intervalTimeout);
      intervalTimeout = null;
    }
    // Ensure activity tracking is cleaned up
    cleanupActivityTracking();
  });

  return {
    // State
    isEnabled,
    isRefreshing,
    lastRefreshTime,
    isStale,
    lastUpdatedText,
    isUserActive,
    currentInterval,
    // Controls
    start,
    stop,
    refresh,
    pause,
    resume,
  };
}
