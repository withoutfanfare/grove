import { useWorktreeStore } from '../stores';
import { useWt } from './useWt';

/**
 * Composable for recent worktree operations.
 * Wraps the useWt composable with store integration.
 */
export function useRecent() {
  const store = useWorktreeStore();
  const wt = useWt();

  /**
   * Fetch recently accessed worktrees
   */
  async function fetchRecentWorktrees(count = 10): Promise<void> {
    store.setLoadingRecent(true);
    store.clearError();

    try {
      const recent = await wt.getRecentWorktrees(count);
      store.setRecentWorktrees(recent);
    } catch (error) {
      store.setError(wt.toWtError(error));
    } finally {
      store.setLoadingRecent(false);
    }
  }

  /**
   * Open a recent worktree in VS Code
   */
  async function openRecentInEditor(path: string): Promise<void> {
    try {
      await wt.openInEditor(path);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open a terminal at a recent worktree path
   */
  async function openRecentInTerminal(path: string): Promise<void> {
    try {
      await wt.openInTerminal(path);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  /**
   * Open a recent worktree URL in the browser
   */
  async function openRecentInBrowser(url: string): Promise<void> {
    try {
      await wt.openInBrowser(url);
    } catch (error) {
      store.setError(wt.toWtError(error));
    }
  }

  return {
    fetchRecentWorktrees,
    openRecentInEditor,
    openRecentInTerminal,
    openRecentInBrowser,
  };
}
