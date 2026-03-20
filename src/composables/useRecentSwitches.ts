import { ref, computed } from 'vue';

const STORAGE_KEY = 'wt-recent-switches';
const MAX_ENTRIES = 10;

/**
 * A recent worktree switch entry
 */
export interface RecentSwitchEntry {
  /** Repository name */
  repo: string;
  /** Branch name */
  branch: string;
  /** Full filesystem path */
  path: string;
  /** Timestamp when this switch occurred */
  timestamp: number;
}

function loadRecentSwitches(): RecentSwitchEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load recent switches from localStorage:', e);
  }
  return [];
}

function saveRecentSwitches(entries: RecentSwitchEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Failed to save recent switches to localStorage:', e);
  }
}

/**
 * Composable for tracking recent worktree switches.
 *
 * Maintains a list of the last 10 worktrees that were navigated to,
 * persisted across sessions in localStorage.
 * Re-accessing a worktree moves it to the top rather than adding a duplicate.
 */
export function useRecentSwitches() {
  const entries = ref<RecentSwitchEntry[]>(loadRecentSwitches());

  /**
   * Record a worktree switch
   */
  function recordSwitch(repo: string, branch: string, path: string): void {
    // Remove existing entry for the same worktree (dedup)
    const filtered = entries.value.filter(
      (e) => !(e.repo === repo && e.branch === branch)
    );

    // Add new entry at the front
    const newEntry: RecentSwitchEntry = {
      repo,
      branch,
      path,
      timestamp: Date.now(),
    };

    entries.value = [newEntry, ...filtered].slice(0, MAX_ENTRIES);
    saveRecentSwitches(entries.value);
  }

  /**
   * Clear all recent switches
   */
  function clearAll(): void {
    entries.value = [];
    saveRecentSwitches([]);
  }

  /**
   * Remove a specific entry
   */
  function removeEntry(repo: string, branch: string): void {
    entries.value = entries.value.filter(
      (e) => !(e.repo === repo && e.branch === branch)
    );
    saveRecentSwitches(entries.value);
  }

  /**
   * Recent entries, most recent first
   */
  const recentSwitches = computed(() => entries.value);

  return {
    recentSwitches,
    recordSwitch,
    clearAll,
    removeEntry,
  };
}
