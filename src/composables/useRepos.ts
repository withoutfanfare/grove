import { useWorktreeStore } from '../stores';
import { useWt } from './useWt';

/**
 * Composable for repository operations.
 * Wraps the useWt composable with store integration.
 */
export function useRepos() {
  const store = useWorktreeStore();
  const wt = useWt();

  /**
   * Fetch all repositories and update the store
   */
  async function fetchRepositories(): Promise<void> {
    store.setLoading(true);
    store.clearError();

    try {
      const repos = await wt.listRepositories();
      store.setRepositories(repos);
    } catch (error) {
      store.setError(wt.toWtError(error));
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Select a repository by name
   */
  function selectRepository(name: string): void {
    store.selectRepository(name);
  }

  /**
   * Check if wt CLI is available and store the result
   */
  async function checkAvailability(): Promise<boolean> {
    const available = await wt.checkWtAvailable();
    store.setWtAvailable(available);

    if (available) {
      const version = await wt.getWtVersion();
      store.setWtVersion(version);
    }

    return available;
  }

  /**
   * Alias for fetchRepositories - refresh the repository list
   */
  async function refreshRepositories(): Promise<void> {
    return fetchRepositories();
  }

  return {
    fetchRepositories,
    refreshRepositories,
    selectRepository,
    checkAvailability,
  };
}
