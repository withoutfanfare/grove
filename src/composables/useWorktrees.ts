import { ref } from 'vue';
import { useWorktreeStore, useSettingsStore } from '../stores';
import { useWt } from './useWt';
import type {
  CreateWorktreeOptions,
  RemoveWorktreeOptions,
  PullResult,
  SyncResult,
  BranchesResult,
  HealthResult,
  PruneResult,
  PullAllResult,
} from '../types';

// Debounce delay for refresh operations (prevents UI flickering, reduced from 300ms)
const REFRESH_DEBOUNCE_MS = 200;

// Track pending refresh timeouts per repository
const pendingRefreshes = new Map<string, ReturnType<typeof setTimeout>>();

// ============================================================================
// Race Condition Prevention (C2 Fix)
// ============================================================================

// Global fetch counter for race condition prevention
let globalFetchId = 0;

// Track the expected fetch ID for the current repository
// Only updates from this fetch ID should be applied to the store
const expectedFetchId = new Map<string, number>();

// ============================================================================
// Per-Worktree Operation State Tracking
// ============================================================================

export type WorktreeOperationState = 'idle' | 'pulling' | 'syncing' | 'deleting';

// Global state for per-worktree operations (keyed by `${repoName}:${branchSlug}`)
const worktreeOperations = ref<Record<string, WorktreeOperationState>>({});

/**
 * Get the operation key for a worktree
 */
function getWorktreeKey(repo: string, branch: string): string {
  return `${repo}:${branch}`;
}

/**
 * Set the operation state for a worktree
 */
function setWorktreeOperation(repo: string, branch: string, state: WorktreeOperationState): void {
  const key = getWorktreeKey(repo, branch);
  if (state === 'idle') {
    delete worktreeOperations.value[key];
  } else {
    worktreeOperations.value[key] = state;
  }
}

/**
 * Get the operation state for a worktree
 */
function getWorktreeOperation(repo: string, branch: string): WorktreeOperationState {
  const key = getWorktreeKey(repo, branch);
  return worktreeOperations.value[key] || 'idle';
}

/**
 * Check if a worktree has any operation in progress
 */
function isWorktreeBusy(repo: string, branch: string): boolean {
  return getWorktreeOperation(repo, branch) !== 'idle';
}

/**
 * Composable for worktree operations.
 * Wraps the useWt composable with store integration.
 */
export function useWorktrees() {
  const store = useWorktreeStore();
  const settingsStore = useSettingsStore();
  const wt = useWt();

  /**
   * Internal function to fetch worktrees with proper error handling.
   * Tries getWorktreeStatus first, falls back to listWorktrees.
   * Uses fetch IDs to prevent race conditions when rapidly switching repos (C2 fix).
   */
  async function fetchWorktreesInternal(repoName: string): Promise<void> {
    // Generate a unique fetch ID for this request
    const fetchId = ++globalFetchId;
    expectedFetchId.set(repoName, fetchId);

    store.setLoadingWorktrees(true);
    store.clearError();

    try {
      // Try getWorktreeStatus first for richer information
      try {
        const worktrees = await wt.getWorktreeStatus(repoName);

        // C2 Fix: Validate fetch ID before updating store
        // If the expected fetch ID for this repo has changed, a newer request superseded this one
        if (expectedFetchId.get(repoName) !== fetchId) {
          console.debug(`[useWorktrees] Stale fetch response for ${repoName}, discarding (fetchId: ${fetchId}, expected: ${expectedFetchId.get(repoName)})`);
          return;
        }

        // Also verify this is still the selected repo
        if (store.selectedRepoName !== repoName) {
          console.debug(`[useWorktrees] Repo changed during fetch, discarding response for ${repoName}`);
          return;
        }

        store.setWorktrees(worktrees);
        return;
      } catch (primaryError) {
        console.warn('getWorktreeStatus failed, falling back to listWorktrees:', primaryError);

        // Fall back to list_worktrees if status fails
        try {
          const worktrees = await wt.listWorktrees(repoName);

          // C2 Fix: Validate fetch ID before updating store
          if (expectedFetchId.get(repoName) !== fetchId) {
            console.debug(`[useWorktrees] Stale fallback fetch response for ${repoName}, discarding`);
            return;
          }

          if (store.selectedRepoName !== repoName) {
            console.debug(`[useWorktrees] Repo changed during fallback fetch, discarding response for ${repoName}`);
            return;
          }

          store.setWorktrees(worktrees);
        } catch (fallbackError) {
          // C2 Fix: Only set error if this is still the active fetch
          if (expectedFetchId.get(repoName) === fetchId && store.selectedRepoName === repoName) {
            // Combine both errors for better debugging
            const primaryErr = wt.toWtError(primaryError);
            const fallbackErr = wt.toWtError(fallbackError);

            store.setError({
              code: 'FETCH_FAILED',
              message: `Failed to fetch worktrees: ${primaryErr.message}. Fallback also failed: ${fallbackErr.message}`,
            });
          }
        }
      }
    } finally {
      // Only clear loading state if this is still the active fetch for this repo
      if (expectedFetchId.get(repoName) === fetchId) {
        store.setLoadingWorktrees(false);
      }
    }
  }

  /**
   * Fetch worktrees for the currently selected repository
   */
  async function fetchWorktrees(): Promise<void> {
    const repoName = store.selectedRepoName;
    if (!repoName) {
      return;
    }
    await fetchWorktreesInternal(repoName);
  }

  /**
   * Debounced fetch worktrees - prevents UI flickering during rapid updates.
   * Cancels any pending refresh for the same repo before scheduling a new one.
   */
  function fetchWorktreesDebounced(): void {
    const repoName = store.selectedRepoName;
    if (!repoName) {
      return;
    }

    // Cancel any existing pending refresh for this repo
    const existing = pendingRefreshes.get(repoName);
    if (existing) {
      clearTimeout(existing);
    }

    // Schedule a new debounced refresh
    const timeout = setTimeout(async () => {
      pendingRefreshes.delete(repoName);
      await fetchWorktreesInternal(repoName);
    }, REFRESH_DEBOUNCE_MS);

    pendingRefreshes.set(repoName, timeout);
  }

  /**
   * Cancel any pending debounced refresh
   */
  function cancelPendingRefresh(): void {
    const repoName = store.selectedRepoName;
    if (repoName) {
      const existing = pendingRefreshes.get(repoName);
      if (existing) {
        clearTimeout(existing);
        pendingRefreshes.delete(repoName);
      }
    }
  }

  /**
   * Fetch worktrees for a specific repository
   * @deprecated Use fetchWorktrees() after selecting the repo via useRepos().selectRepository()
   */
  async function fetchWorktreesForRepo(repoName: string): Promise<void> {
    await fetchWorktreesInternal(repoName);
  }

  /**
   * Open a worktree in the configured editor
   */
  async function openInEditor(path: string): Promise<void> {
    try {
      const { editor, customEditorPath } = settingsStore.settings;
      await wt.openInEditor(path, editor, customEditorPath || undefined);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open a terminal at the worktree path using the configured terminal
   */
  async function openInTerminal(path: string): Promise<void> {
    try {
      const { terminal } = settingsStore.settings;
      await wt.openInTerminal(path, terminal);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open the worktree URL in the browser
   */
  async function openInBrowser(url: string): Promise<void> {
    try {
      await wt.openInBrowser(url);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open the worktree path in Finder
   */
  async function openInFinder(path: string): Promise<void> {
    try {
      await wt.openInFinder(path);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open All: Opens terminal, editor, and optionally browser for a worktree.
   * Opens all three (or two if no URL) simultaneously for maximum efficiency.
   *
   * @param path - Full filesystem path to the worktree
   * @param url - Optional development URL (browser skipped if not provided)
   * @returns An object indicating which apps were opened and if browser was skipped
   */
  async function openAll(
    path: string,
    url?: string
  ): Promise<{ terminal: boolean; editor: boolean; browser: boolean; browserSkipped: boolean }> {
    const results = {
      terminal: false,
      editor: false,
      browser: false,
      browserSkipped: !url,
    };

    // Fire all open operations in parallel for speed
    const promises: Promise<void>[] = [
      openInTerminal(path).then(() => {
        results.terminal = true;
      }),
      openInEditor(path).then(() => {
        results.editor = true;
      }),
    ];

    // Only open browser if URL is available
    if (url) {
      promises.push(
        openInBrowser(url).then(() => {
          results.browser = true;
        })
      );
    }

    // Wait for all operations to complete
    await Promise.allSettled(promises);

    return results;
  }

  /**
   * Create a new worktree
   * Returns true on success, false on failure
   */
  async function createWorktree(options: CreateWorktreeOptions): Promise<boolean> {
    store.setLoadingWorktrees(true);
    store.clearError();

    try {
      await wt.createWorktree(options);
      // Refresh the worktree list after creation
      await fetchWorktrees();
      return true;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return false;
    } finally {
      store.setLoadingWorktrees(false);
    }
  }

  /**
   * Remove a worktree
   * Returns true on success, false on failure
   */
  async function removeWorktree(options: RemoveWorktreeOptions): Promise<boolean> {
    store.setLoadingWorktrees(true);
    store.clearError();

    try {
      await wt.removeWorktree(options);
      // Refresh the worktree list after removal
      await fetchWorktrees();
      return true;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return false;
    } finally {
      store.setLoadingWorktrees(false);
    }
  }

  /**
   * Pull changes for a specific worktree
   * Returns the pull result on success, null on failure
   */
  async function pullWorktree(repo: string, branch: string): Promise<PullResult | null> {
    setWorktreeOperation(repo, branch, 'pulling');
    try {
      const result = await wt.pullWorktree(repo, branch);
      // Refresh the worktree list to update status
      await fetchWorktrees();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    } finally {
      setWorktreeOperation(repo, branch, 'idle');
    }
  }

  /**
   * Sync (rebase) a worktree onto its base branch
   * Returns the sync result on success, null on failure
   */
  async function syncWorktree(repo: string, branch: string): Promise<SyncResult | null> {
    setWorktreeOperation(repo, branch, 'syncing');
    try {
      const result = await wt.syncWorktree(repo, branch);
      // Refresh the worktree list to update status
      await fetchWorktrees();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    } finally {
      setWorktreeOperation(repo, branch, 'idle');
    }
  }

  // ============================================================================
  // Phase 3: Branches, Health, Prune, Pull-All
  // ============================================================================

  /**
   * List branches for a repository
   * Returns the branches result on success, null on failure
   */
  async function listBranches(repoName: string): Promise<BranchesResult | null> {
    try {
      return await wt.listBranches(repoName);
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }

  /**
   * Get health report for a repository
   * Returns the health result on success, null on failure
   */
  async function getRepoHealth(repoName: string): Promise<HealthResult | null> {
    try {
      return await wt.getRepoHealth(repoName);
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }

  /**
   * Prune stale worktree refs and merged branches
   * Returns the prune result on success, null on failure
   */
  async function pruneRepo(repoName: string, force?: boolean): Promise<PruneResult | null> {
    try {
      const result = await wt.pruneRepo(repoName, force);
      // Refresh the worktree list after pruning
      await fetchWorktrees();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }

  /**
   * Pull all worktrees in a repository
   * Returns the pull-all result on success, null on failure
   */
  async function pullAllWorktrees(repoName: string): Promise<PullAllResult | null> {
    try {
      const result = await wt.pullAllWorktrees(repoName);
      // Refresh the worktree list after pulling all (debounced to prevent flicker)
      fetchWorktreesDebounced();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }

  /**
   * Pull selected worktrees in a repository (for retry functionality)
   * Returns the pull-all result on success, null on failure
   */
  async function pullSelectedWorktrees(repoName: string, branches: string[]): Promise<PullAllResult | null> {
    try {
      const result = await wt.pullSelectedWorktrees(repoName, branches);
      // Refresh the worktree list after pulling (debounced to prevent flicker)
      fetchWorktreesDebounced();
      return result;
    } catch (error) {
      store.setError(wt.toWtError(error));
      return null;
    }
  }

  // ============================================================================
  // Operation Control
  // ============================================================================

  /**
   * Cancel the current long-running operation.
   * This signals the backend to stop processing remaining items.
   */
  async function cancelOperation(): Promise<void> {
    try {
      await wt.cancelOperation();
    } catch (error) {
      // Log but don't set error - cancellation failure is not critical
      console.warn('Failed to cancel operation:', error);
    }
  }

  // ============================================================================
  // Cleanup (C4 Fix: Memory Leak Prevention)
  // ============================================================================

  /**
   * Clean up all pending operations and state.
   * Call this when the composable is no longer needed (e.g., on unmount).
   * This prevents memory leaks from pending timeouts.
   */
  function cleanup(): void {
    // Clear all pending refresh timeouts
    for (const timeout of pendingRefreshes.values()) {
      clearTimeout(timeout);
    }
    pendingRefreshes.clear();

    // Clear expected fetch IDs
    expectedFetchId.clear();
  }

  return {
    fetchWorktrees,
    fetchWorktreesDebounced,
    cancelPendingRefresh,
    fetchWorktreesForRepo,
    openInEditor,
    openInTerminal,
    openInBrowser,
    openInFinder,
    openAll,
    createWorktree,
    removeWorktree,
    pullWorktree,
    syncWorktree,
    // Phase 3: Branches, Health, Prune, Pull-All
    listBranches,
    getRepoHealth,
    pruneRepo,
    pullAllWorktrees,
    pullSelectedWorktrees,
    // Operation control
    cancelOperation,
    // Per-worktree operation state (Phase 2)
    getWorktreeOperation,
    isWorktreeBusy,
    // Cleanup (C4 fix)
    cleanup,
  };
}
