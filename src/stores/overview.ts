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
  /**
   * Unix ms when the expensive tier (health + disk usage) last ran.
   * Persisted with the snapshot so a relaunch within the throttle window
   * doesn't re-run seconds of health checks and disk walks per repository.
   */
  expensiveRefreshedAt?: number;
  /** Error message when the repo failed to load (stale data retained) */
  error?: string;
  /** Unix ms of the latest failed list attempt (refreshedAt stays the last success; 0 = never) */
  failedAt?: number;
  /** Unix ms of the last successful health check, and the latest failure since */
  healthCheckedAt?: number;
  healthError?: string;
  /** Unix ms of the last successful disk measurement, and the latest failure since */
  diskCheckedAt?: number;
  diskError?: string;
}

/** A worktree needing attention, tagged with its repository */
export interface AttentionWorktreeItem {
  repo: string;
  worktree: Worktree;
}

/** A health issue needing attention, tagged with its repository */
export interface AttentionHealthItem {
  repo: string;
  issue: Omit<HealthIssue, 'message'> & { messages: string[] };
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
  /** Worktrees with a known count of commits ahead of their upstream */
  aheadCount: number;
  /** Worktrees whose upstream comparison is unknown (never counted as level) */
  unknownSyncCount: number;
  /** Repositories whose latest list, health or disk check failed */
  failedCheckRepos: number;
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
    let aheadCount = 0;
    let unknownSyncCount = 0;
    let failedCheckRepos = 0;
    for (const snap of Object.values(snapshots.value)) {
      worktreeCount += snap.worktrees.length;
      if (snap.error || snap.healthError || snap.diskError) failedCheckRepos++;
      for (const worktree of snap.worktrees) {
        if (worktree.dirty) dirtyCount++;
        if ((worktree.behind ?? 0) > 0) behindCount++;
        if ((worktree.ahead ?? 0) > 0) aheadCount++;
        if (worktree.ahead === null || worktree.behind === null) unknownSyncCount++;
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
      aheadCount,
      unknownSyncCount,
      failedCheckRepos,
    };
  });

  const dirtyAttention = computed(() => collectWorktrees((wt) => wt.dirty));

  const behindAttention = computed(() => collectWorktrees((wt) => (wt.behind ?? 0) > 0));

  // Merged (Git ancestry) worktrees are review candidates for removal, never a safety verdict.
  const cleanupAttention = computed(() => collectWorktrees((wt) => wt.merged === true));

  // Far behind base but not merged: work to sync, not to remove.
  const staleAttention = computed(() => collectWorktrees((wt) => wt.stale === true && wt.merged !== true));

  const healthAttention = computed<AttentionHealthItem[]>(() => {
    const items = new Map<string, AttentionHealthItem>();
    for (const snap of Object.values(snapshots.value)) {
      if (!snap.health) continue;
      for (const issue of snap.health.issues) {
        const key = `${snap.repo}\0${issue.worktree}`;
        const existing = items.get(key);
        if (!existing) {
          items.set(key, { repo: snap.repo, issue: { worktree: issue.worktree, severity: issue.severity, messages: [issue.message] } });
          continue;
        }

        if (!existing.issue.messages.includes(issue.message)) {
          existing.issue.messages.push(issue.message);
        }
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
      staleAttention.value.length > 0 ||
      cleanupAttention.value.length > 0 ||
      repoErrors.value.length > 0 ||
      // A failed check is not "all clear"
      Object.values(snapshots.value).some((snap) => snap.healthError || snap.diskError)
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
      expensiveRefreshedAt: existing?.expensiveRefreshedAt,
      healthCheckedAt: existing?.healthCheckedAt,
      healthError: existing?.healthError,
      diskCheckedAt: existing?.diskCheckedAt,
      diskError: existing?.diskError,
      error: undefined,
    };
  }

  function setSnapshotError(repo: string, error: string, refreshedAt: number) {
    const existing = snapshots.value[repo];
    // Retain stale data (with its own success time) so the overview still shows last-known state
    snapshots.value[repo] = {
      ...existing,
      repo,
      worktrees: existing?.worktrees ?? [],
      refreshedAt: existing?.refreshedAt ?? 0,
      failedAt: refreshedAt,
      error,
    };
  }

  function setHealth(repo: string, health: HealthResult, checkedAt = Date.now()) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, health, healthCheckedAt: checkedAt, healthError: undefined };
  }

  function setDiskUsage(repo: string, diskUsage: RepoDiskUsage, checkedAt = Date.now()) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, diskUsage, diskCheckedAt: checkedAt, diskError: undefined };
  }

  /** A failed check keeps the last-known result and its old timestamp */
  function setCheckError(repo: string, kind: 'health' | 'disk', error: string) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, [kind === 'health' ? 'healthError' : 'diskError']: error };
  }

  /** Drop snapshots for repositories that are no longer registered */
  function pruneSnapshots(activeRepos: string[]) {
    const active = new Set(activeRepos);
    for (const repo of Object.keys(snapshots.value)) {
      if (!active.has(repo)) {
        delete snapshots.value[repo];
      }
    }
  }

  function setRefreshing(value: boolean) {
    refreshing.value = value;
  }

  /** Whether the expensive tier may run for this repo (5-minute throttle,
   * persisted with the snapshot so it survives an app relaunch) */
  function shouldRefreshExpensive(repo: string, now: number): boolean {
    const last = snapshots.value[repo]?.expensiveRefreshedAt;
    return last === undefined || now - last >= EXPENSIVE_REFRESH_INTERVAL_MS;
  }

  function markExpensiveRefreshed(repo: string, now: number) {
    const existing = snapshots.value[repo];
    if (!existing) return;
    snapshots.value[repo] = { ...existing, expensiveRefreshedAt: now };
  }

  function reset() {
    snapshots.value = {};
    refreshing.value = false;
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
    staleAttention,
    healthAttention,
    repoErrors,
    hasAttentionItems,
    // Actions
    setWorktreeSnapshot,
    setSnapshotError,
    setHealth,
    setDiskUsage,
    setCheckError,
    pruneSnapshots,
    setRefreshing,
    shouldRefreshExpensive,
    markExpensiveRefreshed,
    reset,
  };
});
