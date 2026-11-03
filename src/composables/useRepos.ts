import { useWorktreeStore } from '../stores';
import { useWt } from './useWt';
import { ref } from 'vue';
import type { WtError } from '../types';

/** Why the bundled CLI failed its startup check (null when it started) */
export const startupError = ref<WtError | null>(null);

/** Hide the user's home folder name in text shown or copied */
export function redactHome(text: string): string {
  return text.replace(/\/Users\/[^/\s:'"]+/g, '~');
}

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
   * Check the bundled grove CLI starts; keep the real reason when it doesn't
   */
  async function checkAvailability(): Promise<boolean> {
    try {
      await wt.checkWtAvailable();
      const version = await wt.getWtVersion();
      startupError.value = null;
      store.setWtVersion(version);
      store.setWtAvailable(true);
      return true;
    } catch (error) {
      const err = wt.toWtError(error);
      startupError.value = { code: err.code, message: redactHome(err.message) };
      store.setWtAvailable(false);
      return false;
    }
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
    startupError,
  };
}
