import { ref, readonly, onUnmounted, getCurrentInstance } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { WorktreeChangedEvent } from '../types';
import { useWt } from './useWt';

/** Debounce delay for file watcher events in milliseconds (reduced from 500ms) */
const WATCHER_DEBOUNCE_MS = 200;

/**
 * Composable for watching worktree file system changes.
 *
 * Uses the Tauri backend's file watcher to monitor git directories for changes.
 * Provides real-time updates when worktrees change (commits, checkouts, etc.).
 *
 * @example
 * ```typescript
 * const { isWatching, startWatching, stopWatching, onWorktreeChanged } = useWorktreeWatcher();
 *
 * // Start watching when repo is selected
 * await startWatching('my-repo');
 *
 * // Handle changes
 * onWorktreeChanged((event) => {
 *   console.log('Worktree changed:', event.change_type);
 *   // Refresh worktree list...
 * });
 *
 * // Stop watching on unmount
 * onUnmounted(() => stopWatching());
 * ```
 */
export function useWorktreeWatcher() {
  const { startWatchingRepo, stopWatchingRepo, isWatchingRepo } = useWt();

  const isWatching = ref(false);
  const currentRepo = ref<string | null>(null);

  let unlisten: UnlistenFn | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
  const changeCallbacks: Array<(event: WorktreeChangedEvent) => void> = [];

  /**
   * Start watching a repository's worktrees for changes.
   *
   * @param repoName - Name of the repository to watch
   */
  async function startWatching(repoName: string): Promise<void> {
    // Stop any existing watcher
    await stopWatching();

    try {
      // Start the backend watcher
      await startWatchingRepo(repoName);

      // Listen for change events with debouncing
      unlisten = await listen<WorktreeChangedEvent>('worktree_changed', (event) => {
        // Only handle events for the current repo
        if (event.payload.repo === currentRepo.value) {
          // Clear any pending debounce
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
          }

          // Debounce the callback to prevent rapid-fire updates
          debounceTimeout = setTimeout(() => {
            debounceTimeout = null;
            // Notify all callbacks
            for (const callback of changeCallbacks) {
              callback(event.payload);
            }
          }, WATCHER_DEBOUNCE_MS);
        }
      });

      currentRepo.value = repoName;
      isWatching.value = true;
    } catch (error) {
      console.error('[useWorktreeWatcher] Failed to start watching:', error);
      isWatching.value = false;
    }
  }

  /**
   * Stop watching the current repository.
   */
  async function stopWatching(): Promise<void> {
    // Clear any pending debounce timeout
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }

    // Unsubscribe from events
    if (unlisten) {
      unlisten();
      unlisten = null;
    }

    // Stop the backend watcher
    if (currentRepo.value) {
      try {
        await stopWatchingRepo(currentRepo.value);
      } catch (error) {
        console.warn('[useWorktreeWatcher] Failed to stop watching:', error);
      }
    }

    currentRepo.value = null;
    isWatching.value = false;
  }

  /**
   * Register a callback to be called when worktrees change.
   *
   * @param callback - Function to call when a change is detected
   * @returns Function to unregister the callback
   */
  function onWorktreeChanged(callback: (event: WorktreeChangedEvent) => void): () => void {
    changeCallbacks.push(callback);

    // Return unregister function
    return () => {
      const index = changeCallbacks.indexOf(callback);
      if (index > -1) {
        changeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Check if a specific repo is currently being watched.
   */
  async function checkIsWatching(repoName: string): Promise<boolean> {
    try {
      return await isWatchingRepo(repoName);
    } catch {
      return false;
    }
  }

  // C1: Auto-unregister callbacks and stop watching on component unmount
  if (getCurrentInstance()) {
    onUnmounted(() => {
      // Clear all callbacks registered by this component instance
      changeCallbacks.length = 0;
      stopWatching();
    });
  }

  return {
    /** Whether file watching is currently active */
    isWatching: readonly(isWatching),
    /** Name of the currently watched repository */
    currentRepo: readonly(currentRepo),
    /** Start watching a repository */
    startWatching,
    /** Stop watching the current repository */
    stopWatching,
    /** Register a callback for worktree changes */
    onWorktreeChanged,
    /** Check if a repo is being watched */
    checkIsWatching,
  };
}
