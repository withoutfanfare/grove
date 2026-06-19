import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Worktree, HealthResult, HealthIssue, RepoDiskUsage } from '../types';

/**
 * A cached cross-repo snapshot used by the overview dashboard.
 * Worktrees come from the cheap tier (list_worktrees); health and disk
 * usage from the expensive tier (get_repo_health / get_repo_disk_usage).
 */
export interface RepoSnapshot {
  /** Repository name */
  repo: string;
  /** Worktrees from list_worktrees — dirty/ahead/behind/stale/merged */
  worktrees: Worktree[];
  /** Health report (expensive, lazy tier) */
  health?: HealthResult;
  /** Disk usage (expensive, lazy tier) */
  diskUsage?: RepoDiskUsage;
  /** Unix ms when the cheap tier last refreshed this repo */
  refreshedAt: number;
  /** Error message when the repo failed to load (stale data retained) */
  error?: string;
}

/** A worktree needing attention, tagged with its repository */
export interface AttentionWorktreeItem {
  repo: string;
  worktree: Worktree;
}

/** A health issue needing attention, tagged with its repository */
export interface AttentionHealthItem {
  repo: string;
  issue: HealthIssue;
}

/** A repository that failed to load */
export interface AttentionRepoError {
  repo: string;
  error: string;
}

/** Aggregate stat-strip totals derived from snapshots */
export interface OverviewStats {
  worktreeCount: number;
  dirtyCount: number;
  behindCount: number;
  totalDiskBytes: number;
  /** Human-readable disk total, or null when no disk usage has loaded yet */
  diskDisplay: string | null;
}

const STORAGE_KEY = 'grove-overview-snapshots';

/** Minimum interval between expensive-tier refreshes per repo (5 minutes) */
export const EXPENSIVE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function loadSnapshots(): Record<string, RepoSnapshot> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, RepoSnapshot>;
      }
    }
  } catch (e) {
    console.warn('Failed to load overview snapshots from localStorage:', e);
  }
  return {};
}

function saveSnapshots(snapshots: Record<string, RepoSnapshot>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  } catch (e) {
    console.warn('Failed to save overview snapshots to localStorage:', e);
  }
}

/**
 * Format a byte count as a human-readable string (e.g. "1.2 GB").
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const fixed = value.toFixed(1);
  const rounded = exponent === 0 || value >= 10 || fixed.endsWith('.0') ? Math.round(value).toString() : fixed;
  return `${rounded} ${units[exponent]}`;
}

export const useOverviewStore = defineStore('overview', () => {
  // State
  const snapshots = ref<Record<string, RepoSnapshot>>(loadSnapshots());
  // Cheap-tier refresh in flight (drives the "Refreshing…" indicator)
  const refreshing = ref(false);
  // Unix ms of the last expensive-tier refresh per repo (in-memory only)
  const lastExpensiveRefresh = ref<Record<string, number>>({});

  // Persist snapshots so the next launch paints instantly
  watch(snapshots, (snaps) => saveSnapshots(snaps), { deep: true });

  // ── Getters ─────────────────────────────────────────────────────────

  function collectWorktrees(predicate: (wt: Worktree) => boolean): AttentionWorktreeItem[] {
    const items: AttentionWorktreeItem[] = [];
    for (const snap of Object.values(snapshots.value)) {
      for (const worktree of snap.worktrees) {
        if (predicate(worktree)) {
          items.push({ repo: snap.repo, worktree });
        }
      }
    }
    return items.sort(
      (a, b) => a.repo.localeCompare(b.repo) || a.worktree.branch.localeCompare(b.worktree.branch)
    );
  }

  const stats = computed<OverviewStats>(() => {
    let worktreeCount = 0;
    let dirtyCount = 0;
    let behindCount = 0;
    let totalDiskBytes = 0;
    let hasDiskUsage = false;
    for (const snap of Object.values(snapshots.value)) {
      worktreeCount += snap.worktrees.length;
      for (const worktree of snap.worktrees) {
        if (worktree.dirty) dirtyCount++;
        if ((worktree.behind ?? 0) > 0) behindCount++;
      }
      if (snap.diskUsage) {
        hasDiskUsage = true;
        totalDiskBytes += snap.diskUsage.total_bytes;
      }
    }
    return {
      worktreeCount,
      dirtyCount,
      behindCount,
      totalDiskBytes,
      diskDisplay: hasDiskUsage ? formatBytes(totalDiskBytes) : null,
    };
  });

  const dirtyAttention = computed(() => collectWorktrees((wt) => wt.dirty));

  const behindAttention = computed(() => collectWorktrees((wt) => (wt.behind ?? 0) > 0));

  const cleanupAttention = computed(() =>
    collectWorktrees((wt) => Boolean(wt.merged) || Boolean(wt.stale))
  );

  const healthAttention = computed<AttentionHealthItem[]>(() => {
    const items = new Map<string, AttentionHealthItem>();
    for (const snap of Object.values(snapshots.value)) {
      if (!snap.health) continue;
      for (const issue of snap.health.issues) {
        const key = `${snap.repo}\0${issue.worktree}`;
        const existing = items.get(key);
        if (!existing) {
          items.set(key, { repo: snap.repo, issue: { ...issue } });
          continue;
        }

        const messages = new Set(
          `${existing.issue.message},${issue.message}`
            .split(',')
            .map((message) => message.trim())
            .filter(Boolean)
        );
        existing.issue.message = [...messages].join(',');
        if (issue.severity === 'critical') {
          existing.issue.severity = 'critical';
        }
      }
    }
    // Critical first, then by repo name for stable display
    return [...items.values()].sort((a, b) => {
      if (a.issue.severity !== b.issue.severity) {
        return a.issue.severity === 'critical' ? -1 : 1;
      }
      return a.repo.localeCompare(b.repo) || a.issue.worktree.localeCompare(b.issue.worktree);
    });
  });

  const repoErrors = computed<AttentionRepoError[]>(() =>
    Object.values(snapshots.value)
      .filter((snap): snap is RepoSnapshot & { error: string } => Boolean(snap.error))
      .map((snap) => ({ repo: snap.repo, error: snap.error }))
      .sort((a, b) => a.repo.localeCompare(b.repo))
  );

  const hasAttentionItems = computed(
    () =>
      healthAttention.value.length > 0 ||
      dirtyAttention.value.length > 0 ||
      behindAttention.value.length > 0 ||
      cleanupAttention.value.length > 0 ||
      repoErrors.value.length > 0
  );

  // ── Actions ─────────────────────────────────────────────────────────

  function setWorktreeSnapshot(repo: string, worktrees: Worktree[], refreshedAt: number) {
    const existing = snapshots.value[repo];
    snapshots.value[repo] = {
      repo,
      worktrees,
      health: existing?.health,
      diskUsage: existing?.diskUsage,
      refreshedAt,
      error: undefined,
    };
  }

  function setSnapshotError(repo: string, error: string, refreshedAt: number) {
    const existing = snapshots.value[repo];
    // Retain stale data so the overview still shows last-known state
    snapshots.value[repo] = {
      repo,
      worktrees: existing?.worktrees ?? [],
      health: existing?.health,
      diskUsage: existing?.diskUsage,
      refreshedAt: existing?.refreshedAt ?? refreshedAt,
      error,
    };
  }

  function setHealth(repo: string, health: HealthResult) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, health };
  }

  function setDiskUsage(repo: string, diskUsage: RepoDiskUsage) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, diskUsage };
  }

  /** Drop snapshots for repositories that are no longer registered */
  function pruneSnapshots(activeRepos: string[]) {
    const active = new Set(activeRepos);
    for (const repo of Object.keys(snapshots.value)) {
      if (!active.has(repo)) {
        delete snapshots.value[repo];
        delete lastExpensiveRefresh.value[repo];
      }
    }
  }

  function setRefreshing(value: boolean) {
    refreshing.value = value;
  }

  /** Whether the expensive tier may run for this repo (5-minute throttle) */
  function shouldRefreshExpensive(repo: string, now: number): boolean {
    const last = lastExpensiveRefresh.value[repo];
    return last === undefined || now - last >= EXPENSIVE_REFRESH_INTERVAL_MS;
  }

  function markExpensiveRefreshed(repo: string, now: number) {
    lastExpensiveRefresh.value[repo] = now;
  }

  function reset() {
    snapshots.value = {};
    refreshing.value = false;
    lastExpensiveRefresh.value = {};
  }

  return {
    // State
    snapshots,
    refreshing,
    // Getters
    stats,
    dirtyAttention,
    behindAttention,
    cleanupAttention,
    healthAttention,
    repoErrors,
    hasAttentionItems,
    // Actions
    setWorktreeSnapshot,
    setSnapshotError,
    setHealth,
    setDiskUsage,
    pruneSnapshots,
    setRefreshing,
    shouldRefreshExpensive,
    markExpensiveRefreshed,
    reset,
  };
});
