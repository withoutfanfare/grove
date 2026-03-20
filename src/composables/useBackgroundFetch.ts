import { ref, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorktreeStore, useSettingsStore } from '../stores';
import { useWt } from './useWt';

/**
 * Composable for periodic background git fetch.
 *
 * Runs `git fetch` for all registered repositories on a configurable interval.
 * Fetches sequentially to avoid saturating network/SSH connections.
 * Errors are logged silently to avoid notification spam during offline periods.
 */
export function useBackgroundFetch() {
  const store = useWorktreeStore();
  const settingsStore = useSettingsStore();
  const { settings } = storeToRefs(settingsStore);
  const wt = useWt();

  const isRunning = ref(false);
  const lastFetchTime = ref<number | null>(null);
  const lastFetchTimes = ref<Record<string, number>>({});

  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Perform a fetch for all repositories sequentially
   */
  async function fetchAll(): Promise<void> {
    if (isRunning.value) return;
    isRunning.value = true;

    try {
      for (const repo of store.repositories) {
        try {
          await wt.fetchRepo(repo.name);
          lastFetchTimes.value[repo.name] = Date.now();
        } catch (error) {
          // Log silently — do not toast or set store error
          console.debug(`[useBackgroundFetch] Fetch failed for ${repo.name}:`, error);
        }
      }
      lastFetchTime.value = Date.now();
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * Start periodic background fetch
   */
  function start(): void {
    stop(); // Clear any existing interval
    const intervalMinutes = settings.value.backgroundFetchInterval;
    if (intervalMinutes <= 0) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    intervalHandle = setInterval(() => {
      void fetchAll();
    }, intervalMs);
  }

  /**
   * Stop periodic background fetch
   */
  function stop(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  /**
   * Get the last fetch time for a specific repository
   */
  function getLastFetchTime(repoName: string): number | null {
    return lastFetchTimes.value[repoName] ?? null;
  }

  // Watch for settings changes and restart the interval
  watch(
    () => settings.value.backgroundFetchInterval,
    () => {
      if (intervalHandle) {
        start(); // Restart with new interval
      }
    }
  );

  onUnmounted(() => {
    stop();
  });

  return {
    isRunning,
    lastFetchTime,
    lastFetchTimes,
    fetchAll,
    start,
    stop,
    getLastFetchTime,
  };
}
