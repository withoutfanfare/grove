import { useWorktreeStore, useOverviewStore } from '../stores';
import { useWt } from './useWt';

/** Maximum repos queried concurrently during the cheap tier */
const CHEAP_TIER_CONCURRENCY = 3;

/**
 * Refresh orchestration for the overview dashboard.
 *
 * Cheap tier: list_worktrees per repo with limited concurrency; the store
 * updates progressively as each repo answers. Expensive tier: health and
 * disk usage, one repo at a time after the cheap tier completes, throttled
 * to once per 5 minutes per repo unless forced (manual refresh).
 *
 * Orchestrated entirely in the frontend, reusing existing per-repo Tauri
 * commands — no Rust aggregate command (negligible IPC cost at <20 repos).
 */
export function useOverview() {
  const worktreeStore = useWorktreeStore();
  const overviewStore = useOverviewStore();
  const wt = useWt();

  async function runWithConcurrency(
    repoNames: string[],
    limit: number,
    worker: (repo: string) => Promise<void>
  ): Promise<void> {
    const queue = [...repoNames];
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      let repo = queue.shift();
      while (repo !== undefined) {
        await worker(repo);
        repo = queue.shift();
      }
    });
    await Promise.all(runners);
  }

  /** Cheap tier: refresh worktree lists, updating the store per repo */
  async function refreshCheap(repoNames: string[]): Promise<void> {
    await runWithConcurrency(repoNames, CHEAP_TIER_CONCURRENCY, async (repo) => {
      try {
        const worktrees = await wt.listWorktrees(repo);
        overviewStore.setWorktreeSnapshot(repo, worktrees, Date.now());
      } catch (error) {
        // Per-repo failure isolation: record the error, keep stale data
        overviewStore.setSnapshotError(repo, wt.toWtError(error).message, Date.now());
      }
    });
  }

  /** Expensive tier: health + disk usage, staggered and throttled */
  async function refreshExpensive(repoNames: string[], force = false): Promise<void> {
    for (const repo of repoNames) {
      const now = Date.now();
      if (!force && !overviewStore.shouldRefreshExpensive(repo, now)) continue;
      // Skip repos whose cheap tier failed — health would fail the same way
      if (overviewStore.snapshots[repo]?.error) continue;
      try {
        const health = await wt.getRepoHealth(repo);
        overviewStore.setHealth(repo, health);
      } catch (error) {
        console.warn(`[useOverview] Health refresh failed for ${repo}:`, error);
      }
      try {
        const diskUsage = await wt.getRepoDiskUsage(repo);
        overviewStore.setDiskUsage(repo, diskUsage);
      } catch (error) {
        console.warn(`[useOverview] Disk usage refresh failed for ${repo}:`, error);
      }
      overviewStore.markExpensiveRefreshed(repo, now);
    }
  }

  /**
   * Full refresh: cheap tier first (progressive), then the expensive tier.
   * Pass force to bypass the expensive-tier throttle (manual ⌘R).
   */
  async function refreshAll(opts?: { force?: boolean }): Promise<void> {
    if (overviewStore.refreshing) return;
    const repoNames = worktreeStore.repositories.map((r) => r.name);
    // A transient empty repo list must not wipe the snapshot cache
    if (repoNames.length === 0) return;
    overviewStore.pruneSnapshots(repoNames);
    overviewStore.setRefreshing(true);
    try {
      await refreshCheap(repoNames);
    } finally {
      overviewStore.setRefreshing(false);
    }
    await refreshExpensive(repoNames, opts?.force ?? false);
  }

  /** Re-fetch the cheap tier for specific repos only (after an action) */
  async function refreshRepos(repoNames: string[]): Promise<void> {
    if (repoNames.length === 0) return;
    await refreshCheap(repoNames);
  }

  return { refreshAll, refreshRepos };
}
