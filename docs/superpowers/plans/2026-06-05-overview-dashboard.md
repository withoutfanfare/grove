# Overview Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cross-repository overview that becomes Grove's home screen (shown when no repo is selected), answering "what needs my attention?" and "where was I?" with a stat strip, grouped attention panel, recent panel, inline and bulk actions.

**Architecture:** A new Pinia store (`overview.ts`) caches per-repo snapshots (worktrees + lazy health/disk) in localStorage and derives all attention groups and stat totals as computeds. A new composable (`useOverview.ts`) orchestrates two refresh tiers in the frontend, reusing existing per-repo Tauri commands — no new Rust code. A new `OverviewDashboard.vue` renders in `Dashboard.vue`'s content area whenever no repository is selected, with self-contained dialogs (health panel, delete dialog, prune confirmation, bulk-pull progress).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript strict, Pinia, Tailwind + design tokens, Vitest + @vue/test-utils, existing Tauri commands via `useWt()`.

**Spec:** `docs/superpowers/specs/2026-06-05-overview-dashboard-design.md`

**Deliberate decisions (deviations/clarifications vs spec):**

- Cheap tier uses `list_worktrees` exactly as specced (in this codebase `get_worktree_status` is an alias for the same `grove ls --json` call, so `list_worktrees` already carries dirty/ahead/behind/merged/stale).
- "Prune all" calls `prune_repo` with `force=true` (actually deletes merged branches). The spec mandates a confirmation dialog *because* it's destructive; the existing single-repo Clean button passes `force=false` (preview-only) without confirmation. With mandatory confirmation, force is correct.
- `setRepositories` no longer auto-selects the first repo and no longer restores the last-selected repo — launch lands on the overview per spec. `restoreLastSelectedRepo` becomes orphaned and is removed.
- Bulk pull progress is frontend-driven: a local `OperationProgress` object fed to the existing `OperationProgressPanel` (its `progress` prop is plain data, no Tauri events required).

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/stores/overview.ts` | Snapshot cache, localStorage persistence, attention derivation, stat totals, expensive-tier throttle state |
| `src/stores/overview.test.ts` | Store unit tests |
| `src/composables/useOverview.ts` | Refresh orchestration (cheap tier w/ concurrency 3, expensive tier staggered + throttled) |
| `src/composables/useOverview.test.ts` | Composable unit tests |
| `src/components/OverviewDashboard.vue` | Layout, stat strip, refresh wiring, navigation, inline + bulk actions, owns dialogs |
| `src/components/OverviewDashboard.test.ts` | Component tests (loading, populated, all-clear, repo-error) |
| `src/components/overview/AttentionPanel.vue` | Grouped "Needs Attention" list (presentational; reads store, emits actions) |
| `src/components/overview/RecentPanel.vue` | Recent worktrees list (fetches recent, emits actions) |
| `src/components/overview/PruneConfirmDialog.vue` | Mandatory confirmation listing exactly what will be pruned per repo |

**Modify:**

| File | Change |
|---|---|
| `src/stores/worktrees.ts` | Remove auto-select + `restoreLastSelectedRepo`; add `deselectRepository()` |
| `src/stores/worktrees.test.ts` | Update 3 tests; add deselect tests |
| `src/stores/index.ts` | Export overview store + types |
| `src/composables/index.ts` | Export `useOverview` |
| `src/components/Dashboard.vue` | Render `OverviewDashboard` when no repo selected; header title; ⌘R on overview; `onGoToOverview` handlers |
| `src/components/Dashboard.test.ts` | Stub `OverviewDashboard` |
| `src/components/RepoList.vue` | Sidebar "Overview" button |
| `src/composables/useKeyboardShortcuts.ts` | ⌘0 shortcut + handler type |
| `src/composables/useKeyboardShortcuts.test.ts` | ⌘0 tests |
| `src/composables/useCommandRegistry.ts` | "Go to Overview" palette command |
| `src/components/HelpModal.vue` | Document ⌘0 |

---

### Task 1: Overview store — snapshots, derivation, persistence, throttle

**Files:**
- Create: `src/stores/overview.ts`
- Test: `src/stores/overview.test.ts`
- Modify: `src/stores/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/stores/overview.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  useOverviewStore,
  formatBytes,
  EXPENSIVE_REFRESH_INTERVAL_MS,
} from './overview'
import type { Worktree, HealthResult, RepoDiskUsage } from '@/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/demo/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

function makeHealth(overrides: Partial<HealthResult> = {}): HealthResult {
  return {
    repo: 'demo',
    overall_grade: 'B',
    overall_score: 82,
    worktree_count: 2,
    summary: { healthy: 1, warning: 1, critical: 0 },
    issues: [],
    worktrees: [],
    ...overrides,
  }
}

function makeDiskUsage(overrides: Partial<RepoDiskUsage> = {}): RepoDiskUsage {
  return {
    repo: 'demo',
    total_bytes: 1024,
    total_display: '1 KB',
    worktrees: [],
    ...overrides,
  }
}

describe('useOverviewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('attention derivation', () => {
    it('groups dirty worktrees across repos', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [
        makeWorktree({ path: '/repos/api/a', branch: 'a', dirty: true }),
        makeWorktree({ path: '/repos/api/b', branch: 'b', dirty: false }),
      ], 1000)
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.dirtyAttention).toHaveLength(2)
      expect(store.dirtyAttention.map((i) => `${i.repo}/${i.worktree.branch}`))
        .toEqual(['api/a', 'demo/c'])
    })

    it('groups worktrees behind their remote', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/a', branch: 'a', behind: 3 }),
        makeWorktree({ path: '/repos/demo/b', branch: 'b', behind: 0 }),
      ], 1000)

      expect(store.behindAttention).toHaveLength(1)
      expect(store.behindAttention[0].worktree.branch).toBe('a')
    })

    it('classifies merged or stale worktrees as cleanup candidates', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/repos/demo/a', branch: 'a', merged: true }),
        makeWorktree({ path: '/repos/demo/b', branch: 'b', stale: true }),
        makeWorktree({ path: '/repos/demo/c', branch: 'c' }),
      ], 1000)

      expect(store.cleanupAttention.map((i) => i.worktree.branch)).toEqual(['a', 'b'])
    })

    it('orders health issues critical first', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)
      store.setHealth('demo', makeHealth({
        issues: [
          { severity: 'warning', worktree: 'a', message: 'warn issue' },
          { severity: 'critical', worktree: 'b', message: 'critical issue' },
        ],
      }))

      expect(store.healthAttention[0].issue.severity).toBe('critical')
      expect(store.healthAttention[1].issue.severity).toBe('warning')
    })

    it('sorts worktree attention items by repo then branch', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('zeta', [
        makeWorktree({ path: '/z/b', branch: 'b', dirty: true }),
      ], 1000)
      store.setWorktreeSnapshot('alpha', [
        makeWorktree({ path: '/a/d', branch: 'd', dirty: true }),
        makeWorktree({ path: '/a/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.dirtyAttention.map((i) => `${i.repo}/${i.worktree.branch}`))
        .toEqual(['alpha/c', 'alpha/d', 'zeta/b'])
    })

    it('reports hasAttentionItems false when everything is clean', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)

      expect(store.hasAttentionItems).toBe(false)
    })
  })

  describe('stats', () => {
    it('totals worktrees, dirty and behind counts across snapshots', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [
        makeWorktree({ path: '/a/a', branch: 'a', dirty: true, behind: 2 }),
        makeWorktree({ path: '/a/b', branch: 'b' }),
      ], 1000)
      store.setWorktreeSnapshot('demo', [
        makeWorktree({ path: '/d/c', branch: 'c', dirty: true }),
      ], 1000)

      expect(store.stats.worktreeCount).toBe(3)
      expect(store.stats.dirtyCount).toBe(2)
      expect(store.stats.behindCount).toBe(1)
    })

    it('sums disk usage and formats the total', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('api', [makeWorktree()], 1000)
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)
      store.setDiskUsage('api', makeDiskUsage({ repo: 'api', total_bytes: 1024 * 1024 }))
      store.setDiskUsage('demo', makeDiskUsage({ repo: 'demo', total_bytes: 1024 * 1024 }))

      expect(store.stats.totalDiskBytes).toBe(2 * 1024 * 1024)
      expect(store.stats.diskDisplay).toBe('2 MB')
    })

    it('reports null diskDisplay before any disk usage has loaded', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree()], 1000)

      expect(store.stats.diskDisplay).toBeNull()
    })
  })

  describe('per-repo error isolation', () => {
    it('records an error while retaining stale worktree data', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree({ dirty: true })], 1000)

      store.setSnapshotError('demo', 'cannot read repository', 2000)

      expect(store.snapshots['demo'].error).toBe('cannot read repository')
      expect(store.snapshots['demo'].worktrees).toHaveLength(1)
      // Stale data still feeds attention derivation
      expect(store.dirtyAttention).toHaveLength(1)
    })

    it('clears the error on the next successful snapshot', () => {
      const store = useOverviewStore()
      store.setSnapshotError('demo', 'boom', 1000)
      store.setWorktreeSnapshot('demo', [makeWorktree()], 2000)

      expect(store.snapshots['demo'].error).toBeUndefined()
      expect(store.repoErrors).toHaveLength(0)
    })

    it('lists repo errors as attention items', () => {
      const store = useOverviewStore()
      store.setSnapshotError('broken', 'cannot read repository', 1000)

      expect(store.repoErrors).toEqual([{ repo: 'broken', error: 'cannot read repository' }])
      expect(store.hasAttentionItems).toBe(true)
    })
  })

  describe('localStorage persistence', () => {
    it('round-trips snapshots through localStorage', async () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('demo', [makeWorktree({ dirty: true })], 1234)
      await nextTick()

      // A fresh pinia simulates an app relaunch
      setActivePinia(createPinia())
      const fresh = useOverviewStore()

      expect(fresh.snapshots['demo'].refreshedAt).toBe(1234)
      expect(fresh.snapshots['demo'].worktrees[0].dirty).toBe(true)
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('grove-overview-snapshots', 'invalid json{')

      const store = useOverviewStore()

      expect(store.snapshots).toEqual({})
    })
  })

  describe('expensive-tier throttling', () => {
    it('allows refresh when the repo has never been refreshed', () => {
      const store = useOverviewStore()
      expect(store.shouldRefreshExpensive('demo', 1_000_000)).toBe(true)
    })

    it('blocks refresh within the 5-minute window', () => {
      const store = useOverviewStore()
      store.markExpensiveRefreshed('demo', 1_000_000)

      expect(store.shouldRefreshExpensive('demo', 1_000_000 + EXPENSIVE_REFRESH_INTERVAL_MS - 1)).toBe(false)
    })

    it('allows refresh after the window elapses', () => {
      const store = useOverviewStore()
      store.markExpensiveRefreshed('demo', 1_000_000)

      expect(store.shouldRefreshExpensive('demo', 1_000_000 + EXPENSIVE_REFRESH_INTERVAL_MS)).toBe(true)
    })
  })

  describe('pruneSnapshots', () => {
    it('drops snapshots for repos that are no longer registered', () => {
      const store = useOverviewStore()
      store.setWorktreeSnapshot('keep', [makeWorktree()], 1000)
      store.setWorktreeSnapshot('drop', [makeWorktree()], 1000)

      store.pruneSnapshots(['keep'])

      expect(Object.keys(store.snapshots)).toEqual(['keep'])
    })
  })

  describe('formatBytes', () => {
    it('formats byte counts at sensible precision', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(512)).toBe('512 B')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
      expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe('1.2 GB')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/overview.test.ts`
Expected: FAIL — cannot resolve `./overview`

- [ ] **Step 3: Implement the store**

Create `src/stores/overview.ts`:

```ts
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
  const rounded = exponent === 0 || value >= 10 ? Math.round(value).toString() : value.toFixed(1);
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
        if (worktree.behind > 0) behindCount++;
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

  const behindAttention = computed(() => collectWorktrees((wt) => wt.behind > 0));

  const cleanupAttention = computed(() =>
    collectWorktrees((wt) => Boolean(wt.merged) || Boolean(wt.stale))
  );

  const healthAttention = computed<AttentionHealthItem[]>(() => {
    const items: AttentionHealthItem[] = [];
    for (const snap of Object.values(snapshots.value)) {
      if (!snap.health) continue;
      for (const issue of snap.health.issues) {
        items.push({ repo: snap.repo, issue });
      }
    }
    // Critical first, then by repo name for stable display
    return items.sort((a, b) => {
      if (a.issue.severity !== b.issue.severity) {
        return a.issue.severity === 'critical' ? -1 : 1;
      }
      return a.repo.localeCompare(b.repo);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/overview.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Export from the stores index**

In `src/stores/index.ts`, after the `useTemplateStore` export line, add:

```ts
export { useOverviewStore, formatBytes, EXPENSIVE_REFRESH_INTERVAL_MS } from './overview';
export type { RepoSnapshot, AttentionWorktreeItem, AttentionHealthItem, AttentionRepoError, OverviewStats } from './overview';
```

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add overview snapshot store with attention derivation"
```

---

### Task 2: Worktree store — land on overview at launch, add deselect

**Files:**
- Modify: `src/stores/worktrees.ts:52-67` (setRepositories / restoreLastSelectedRepo)
- Modify: `src/stores/worktrees.test.ts:52-103`

- [ ] **Step 1: Update the failing tests first**

In `src/stores/worktrees.test.ts`, replace the test at line 52:

```ts
    it('should not auto-select a repository (launch lands on the overview)', () => {
      const store = useWorktreeStore()
      const repos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]

      store.setRepositories(repos)

      expect(store.selectedRepoName).toBeNull()
    })
```

Replace the test `'should not change selection if already selected'` (lines 65–84) with:

```ts
    it('should not change selection if already selected', () => {
      const store = useWorktreeStore()

      const repos: Repository[] = [
        { name: 'repo-a', worktrees: 3 },
        { name: 'repo-b', worktrees: 5 },
      ]
      store.setRepositories(repos)

      // Manually select repo-b
      store.selectRepository('repo-b')
      expect(store.selectedRepoName).toBe('repo-b')

      // Setting repos again should not change the selection
      store.setRepositories(repos)

      expect(store.selectedRepoName).toBe('repo-b')
    })
```

Replace the test `'should not select non-existent repository'` with (adds an explicit select since nothing auto-selects any more):

```ts
    it('should not select non-existent repository', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'existing', worktrees: 1 }])
      store.selectRepository('existing')

      store.selectRepository('non-existent')

      expect(store.selectedRepoName).toBe('existing')
    })
```

Add a new describe block after the `selectRepository` describe block:

```ts
  describe('deselectRepository', () => {
    it('clears the selection and focused worktree', () => {
      const store = useWorktreeStore()
      store.setRepositories([{ name: 'repo-a', worktrees: 1 }])
      store.selectRepository('repo-a')
      store.focusWorktree('main')

      store.deselectRepository()

      expect(store.selectedRepoName).toBeNull()
      expect(store.focusedBranch).toBeNull()
    })

    it('is a no-op when nothing is selected', () => {
      const store = useWorktreeStore()

      store.deselectRepository()

      expect(store.selectedRepoName).toBeNull()
    })
  })
```

- [ ] **Step 2: Run tests to verify the new/changed ones fail**

Run: `npx vitest run src/stores/worktrees.test.ts`
Expected: FAIL — `should not auto-select` fails (auto-select still happens), `deselectRepository is not a function`

- [ ] **Step 3: Implement the store changes**

In `src/stores/worktrees.ts`, replace `setRepositories` and delete `restoreLastSelectedRepo` (lines 52–67):

```ts
  function setRepositories(repos: Repository[]) {
    repositories.value = repos;
  }
```

Add after `selectRepository` (line 109):

```ts
  /**
   * Deselect the current repository — the dashboard shows the overview.
   */
  function deselectRepository() {
    selectedRepoName.value = null;
    focusedBranch.value = null;
    focusTransient.value = false;
    // Persist so future launches also land on the overview
    appStore.setLastSelectedRepo(null);
  }
```

Add `deselectRepository,` to the returned object (after `selectRepository,`).

- [ ] **Step 4: Run the full frontend suite to catch fallout**

Run: `npx vitest run`
Expected: PASS — other suites select repos explicitly, so only the three updated tests were affected. If any other test fails on a null `selectedRepoName`, add an explicit `store.selectRepository(...)` to that test's setup (the pattern every other test already uses).

- [ ] **Step 5: Commit**

```bash
gitaddall
git commit -m "feat: land on overview at launch and add repository deselect"
```

---

### Task 3: useOverview composable — tiered refresh orchestration

**Files:**
- Create: `src/composables/useOverview.ts`
- Test: `src/composables/useOverview.test.ts`
- Modify: `src/composables/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/composables/useOverview.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOverview } from './useOverview'
import { useWorktreeStore, useOverviewStore } from '../stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Worktree, HealthResult, RepoDiskUsage } from '../types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/demo/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

const healthFixture: HealthResult = {
  repo: 'demo',
  overall_grade: 'B',
  overall_score: 82,
  worktree_count: 1,
  summary: { healthy: 0, warning: 1, critical: 0 },
  issues: [{ severity: 'warning', worktree: 'main', message: 'Behind by 12 commits' }],
  worktrees: [],
}

const diskFixture: RepoDiskUsage = {
  repo: 'demo',
  total_bytes: 2048,
  total_display: '2 KB',
  worktrees: [],
}

/** Mock all overview-related commands; per-repo worktree lists or errors */
function mockCommands(worktreesByRepo: Record<string, Worktree[] | { error: string }>) {
  mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    const repoName = (args?.repoName as string) ?? ''
    if (command === 'list_worktrees') {
      const entry = worktreesByRepo[repoName]
      if (entry && 'error' in entry && !Array.isArray(entry)) {
        return Promise.reject({ code: 'GIT_ERROR', message: entry.error })
      }
      return Promise.resolve(entry ?? [])
    }
    if (command === 'get_repo_health') return Promise.resolve({ ...healthFixture, repo: repoName })
    if (command === 'get_repo_disk_usage') return Promise.resolve({ ...diskFixture, repo: repoName })
    return Promise.resolve(undefined)
  })
}

function healthCallCount(): number {
  return mockTauriInvoke.mock.calls.filter((call) => call[0] === 'get_repo_health').length
}

describe('useOverview', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
  })

  it('populates a snapshot per repo from list_worktrees', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'api', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])
    mockCommands({
      api: [makeWorktree({ path: '/repos/api/main', branch: 'main', dirty: true })],
      demo: [makeWorktree()],
    })

    const { refreshAll } = useOverview()
    await refreshAll()

    const overviewStore = useOverviewStore()
    expect(Object.keys(overviewStore.snapshots).sort()).toEqual(['api', 'demo'])
    expect(overviewStore.snapshots['api'].worktrees[0].dirty).toBe(true)
    expect(overviewStore.refreshing).toBe(false)
  })

  it('isolates per-repo failures and retains stale data', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'broken', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])

    const overviewStore = useOverviewStore()
    // Stale data from a previous session
    overviewStore.setWorktreeSnapshot('broken', [makeWorktree({ branch: 'stale-branch' })], 1)

    mockCommands({
      broken: { error: 'cannot read repository' },
      demo: [makeWorktree()],
    })

    const { refreshAll } = useOverview()
    await refreshAll()

    expect(overviewStore.snapshots['broken'].error).toBe('cannot read repository')
    expect(overviewStore.snapshots['broken'].worktrees[0].branch).toBe('stale-branch')
    expect(overviewStore.snapshots['demo'].error).toBeUndefined()
  })

  it('runs the expensive tier after the cheap tier and stores health + disk usage', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockCommands({ demo: [makeWorktree()] })

    const { refreshAll } = useOverview()
    await refreshAll()

    const overviewStore = useOverviewStore()
    expect(overviewStore.snapshots['demo'].health?.issues).toHaveLength(1)
    expect(overviewStore.snapshots['demo'].diskUsage?.total_bytes).toBe(2048)
  })

  it('skips the expensive tier inside the throttle window unless forced', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockCommands({ demo: [makeWorktree()] })

    const { refreshAll } = useOverview()
    await refreshAll()
    expect(healthCallCount()).toBe(1)

    // Within the 5-minute window: expensive tier throttled
    await refreshAll()
    expect(healthCallCount()).toBe(1)

    // Forced (manual refresh): throttle bypassed
    await refreshAll({ force: true })
    expect(healthCallCount()).toBe(2)
  })

  it('refreshRepos only re-fetches the given repos', async () => {
    const worktreeStore = useWorktreeStore()
    worktreeStore.setRepositories([
      { name: 'api', worktrees: 1 },
      { name: 'demo', worktrees: 1 },
    ])
    mockCommands({ api: [makeWorktree()], demo: [makeWorktree()] })

    const { refreshRepos } = useOverview()
    await refreshRepos(['api'])

    const listCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'list_worktrees')
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0][1]).toEqual({ repoName: 'api' })
  })

  it('does nothing when no repositories are registered (cache retained)', async () => {
    const overviewStore = useOverviewStore()
    overviewStore.setWorktreeSnapshot('cached', [makeWorktree()], 1)
    mockCommands({})

    const { refreshAll } = useOverview()
    await refreshAll()

    expect(Object.keys(overviewStore.snapshots)).toEqual(['cached'])
    expect(mockTauriInvoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/useOverview.test.ts`
Expected: FAIL — cannot resolve `./useOverview`

- [ ] **Step 3: Implement the composable**

Create `src/composables/useOverview.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/useOverview.test.ts`
Expected: PASS

- [ ] **Step 5: Export from the composables index**

In `src/composables/index.ts`, after the `export { useRecent } from './useRecent';` line, add:

```ts
export { useOverview } from './useOverview';
```

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add overview refresh orchestration composable"
```

---

### Task 4: RecentPanel component

**Files:**
- Create: `src/components/overview/RecentPanel.vue`

(Covered by OverviewDashboard component tests in Task 7; verify compilation here.)

- [ ] **Step 1: Create the component**

Create `src/components/overview/RecentPanel.vue`:

```vue
<script setup lang="ts">
/**
 * RecentPanel Component (Overview)
 *
 * "Where was I?" — recent worktrees with relative timestamps and
 * editor/terminal quick-open actions. Clicking an entry navigates to the
 * repo with that worktree focused (handled by the parent).
 */
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorktreeStore } from '../../stores'
import { useRecent } from '../../composables'
import { SIconButton, SSkeleton } from '@stuntrocket/ui'

const emit = defineEmits<{
  navigate: [repo: string, branch: string]
  openEditor: [path: string]
  openTerminal: [path: string]
}>()

const store = useWorktreeStore()
const { recentWorktrees, loadingRecent } = storeToRefs(store)
const { fetchRecentWorktrees } = useRecent()

onMounted(() => {
  void fetchRecentWorktrees(10)
})
</script>

<template>
  <section class="recent-panel" aria-label="Recent worktrees">
    <h2 class="recent-title">Recent</h2>

    <!-- Loading skeleton -->
    <ul v-if="loadingRecent && recentWorktrees.length === 0" class="space-y-1.5">
      <li v-for="i in 4" :key="i" class="px-3 py-2.5 rounded-lg bg-surface-overlay/50">
        <div class="space-y-1.5">
          <SSkeleton width="7rem" height="0.9rem" />
          <SSkeleton width="5rem" height="0.7rem" />
        </div>
      </li>
    </ul>

    <!-- Empty state -->
    <div v-else-if="recentWorktrees.length === 0" class="py-10 text-center">
      <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-overlay flex items-center justify-center">
        <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm text-text-secondary">No recent worktrees</p>
      <p class="text-2xs text-text-muted mt-1">Worktrees you open will appear here</p>
    </div>

    <!-- Recent list -->
    <ul v-else class="space-y-1.5">
      <li v-for="recent in recentWorktrees" :key="recent.path">
        <div class="group px-3 py-2.5 rounded-lg bg-surface-overlay/50 hover:bg-surface-overlay transition-colors">
          <button class="flex items-start gap-2 w-full text-left"
            @click="emit('navigate', recent.repo, recent.branch)">
            <span :class="[
              'mt-1.5 w-2 h-2 rounded-full flex-shrink-0 transition-colors',
              recent.dirty ? 'bg-warning' : 'bg-success'
            ]" :title="recent.dirty ? 'Uncommitted changes' : 'Clean'" />
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium text-text-primary truncate">{{ recent.branch }}</span>
              <span class="block text-[10px] leading-4 text-text-muted truncate mt-0.5">{{ recent.repo }}</span>
              <span class="block text-[10px] leading-4 text-text-muted">{{ recent.accessed_ago }}</span>
            </span>
          </button>

          <div class="flex items-center gap-1 mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
            <SIconButton size="sm" variant="secondary" tooltip="Open in Editor"
              @click="emit('openEditor', recent.path)">
              <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </SIconButton>

            <SIconButton size="sm" tooltip="Open Terminal" @click="emit('openTerminal', recent.path)">
              <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </SIconButton>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.recent-panel {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  padding: 16px;
}

.recent-title {
  margin-bottom: 12px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
gitaddall
git commit -m "feat: add overview recent panel component"
```

---

### Task 5: AttentionPanel component

**Files:**
- Create: `src/components/overview/AttentionPanel.vue`

- [ ] **Step 1: Create the component**

Create `src/components/overview/AttentionPanel.vue`:

```vue
<script setup lang="ts">
/**
 * AttentionPanel Component (Overview)
 *
 * The "Needs Attention" panel: grouped sections for repository errors,
 * health issues (critical first), dirty worktrees, behind-remote worktrees,
 * and cleanup candidates — each with a count badge, and per-group bulk
 * actions for Behind (Pull all) and Cleanup (Prune all).
 *
 * Reads attention groups from the overview store; emits actions for the
 * parent (OverviewDashboard) to perform. Clicking an item body navigates;
 * the trailing button performs the inline action.
 */
import { storeToRefs } from 'pinia'
import { useOverviewStore } from '../../stores'
import type { Worktree } from '../../types'

const props = withDefaults(
  defineProps<{
    /** Action errors keyed by `repo/branch` (bulk or inline pull failures) */
    itemErrors?: Record<string, string>
    /** Keys (`repo/branch` for worktrees, repo name for repairs) with an action in flight */
    busyKeys?: string[]
    /** Whether the bulk pull is running (disables Pull all) */
    bulkPulling?: boolean
    /** Whether the bulk prune is running (disables Prune all) */
    pruning?: boolean
  }>(),
  {
    itemErrors: () => ({}),
    busyKeys: () => [],
    bulkPulling: false,
    pruning: false,
  }
)

const emit = defineEmits<{
  navigate: [repo: string, branch: string]
  openHealth: [repo: string]
  repair: [repo: string]
  openEditor: [path: string]
  pull: [repo: string, branch: string]
  remove: [repo: string, worktree: Worktree]
  pullAllBehind: []
  pruneAll: []
}>()

const overviewStore = useOverviewStore()
const {
  healthAttention,
  dirtyAttention,
  behindAttention,
  cleanupAttention,
  repoErrors,
  hasAttentionItems,
} = storeToRefs(overviewStore)

function isBusy(key: string): boolean {
  return props.busyKeys.includes(key)
}

function errorFor(repo: string, branch: string): string | undefined {
  return props.itemErrors[`${repo}/${branch}`]
}

function cleanupLabel(worktree: Worktree): string {
  if (worktree.merged && worktree.stale) return 'merged · stale'
  if (worktree.merged) return 'merged'
  return 'stale'
}
</script>

<template>
  <section class="attention-panel" aria-label="Needs attention">
    <h2 class="attention-title">Needs Attention</h2>

    <!-- All-clear state -->
    <div v-if="!hasAttentionItems" class="py-12 text-center">
      <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-success-muted flex items-center justify-center">
        <svg class="w-7 h-7 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p class="text-sm font-medium text-text-secondary">Everything's tidy</p>
      <p class="text-xs text-text-muted mt-1">No dirty worktrees, nothing behind, no health issues.</p>
    </div>

    <div v-else class="space-y-5">
      <!-- Repository errors -->
      <div v-if="repoErrors.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label text-danger">Repository errors</span>
          <span class="attention-count">{{ repoErrors.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="item in repoErrors" :key="item.repo" class="attention-item">
            <div class="attention-item-body">
              <span class="attention-item-title">Couldn't read <span class="font-mono">{{ item.repo }}</span></span>
              <span class="attention-item-sub text-danger">{{ item.error }}</span>
              <span class="attention-item-sub">Showing last-known data for this repository.</span>
            </div>
            <button class="attention-action" :disabled="isBusy(item.repo)" @click="emit('repair', item.repo)">
              {{ isBusy(item.repo) ? 'Repairing…' : 'Repair' }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Health issues (critical first) -->
      <div v-if="healthAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Health issues</span>
          <span class="attention-count">{{ healthAttention.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="(item, index) in healthAttention" :key="`${item.repo}-${item.issue.worktree}-${index}`"
            class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.issue.worktree)">
              <span class="attention-item-title">
                <span class="severity-dot" :class="item.issue.severity === 'critical' ? 'bg-danger' : 'bg-warning'" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.issue.worktree }}</span>
              </span>
              <span class="attention-item-sub">{{ item.issue.message }}</span>
            </button>
            <button class="attention-action" @click="emit('openHealth', item.repo)">View</button>
          </li>
        </ul>
      </div>

      <!-- Dirty worktrees -->
      <div v-if="dirtyAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Dirty</span>
          <span class="attention-count">{{ dirtyAttention.length }}</span>
        </div>
        <ul class="attention-items">
          <li v-for="item in dirtyAttention" :key="item.worktree.path" class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
              <span class="attention-item-title">
                <span class="severity-dot bg-warning" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.worktree.branch }}</span>
              </span>
              <span class="attention-item-sub">Uncommitted changes</span>
            </button>
            <button class="attention-action" @click="emit('openEditor', item.worktree.path)">Editor</button>
          </li>
        </ul>
      </div>

      <!-- Behind remote -->
      <div v-if="behindAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Behind remote</span>
          <span class="attention-count">{{ behindAttention.length }}</span>
          <span class="flex-1" />
          <button class="attention-bulk-action" :disabled="bulkPulling" @click="emit('pullAllBehind')">
            {{ bulkPulling ? 'Pulling…' : 'Pull all' }}
          </button>
        </div>
        <ul class="attention-items">
          <li v-for="item in behindAttention" :key="item.worktree.path" class="attention-item-stack">
            <div class="attention-item">
              <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
                <span class="attention-item-title">
                  <span class="severity-dot bg-accent" />
                  <span class="font-mono">{{ item.repo }}</span>
                  <span class="text-text-muted">·</span>
                  <span class="truncate">{{ item.worktree.branch }}</span>
                </span>
                <span class="attention-item-sub">
                  {{ item.worktree.behind }} commit{{ item.worktree.behind === 1 ? '' : 's' }} behind
                </span>
              </button>
              <button class="attention-action"
                :disabled="isBusy(`${item.repo}/${item.worktree.branch}`) || bulkPulling"
                @click="emit('pull', item.repo, item.worktree.branch)">
                {{ isBusy(`${item.repo}/${item.worktree.branch}`) ? 'Pulling…' : 'Pull' }}
              </button>
            </div>
            <p v-if="errorFor(item.repo, item.worktree.branch)" class="attention-item-error">
              {{ errorFor(item.repo, item.worktree.branch) }}
            </p>
          </li>
        </ul>
      </div>

      <!-- Cleanup candidates -->
      <div v-if="cleanupAttention.length > 0" class="attention-group">
        <div class="attention-group-header">
          <span class="attention-group-label">Cleanup candidates</span>
          <span class="attention-count">{{ cleanupAttention.length }}</span>
          <span class="flex-1" />
          <button class="attention-bulk-action" :disabled="pruning" @click="emit('pruneAll')">
            {{ pruning ? 'Pruning…' : 'Prune all' }}
          </button>
        </div>
        <ul class="attention-items">
          <li v-for="item in cleanupAttention" :key="item.worktree.path" class="attention-item">
            <button class="attention-item-body" @click="emit('navigate', item.repo, item.worktree.branch)">
              <span class="attention-item-title">
                <span class="severity-dot bg-text-muted" />
                <span class="font-mono">{{ item.repo }}</span>
                <span class="text-text-muted">·</span>
                <span class="truncate">{{ item.worktree.branch }}</span>
              </span>
              <span class="attention-item-sub">{{ cleanupLabel(item.worktree) }}</span>
            </button>
            <button class="attention-action" @click="emit('remove', item.repo, item.worktree)">Remove</button>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.attention-panel {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  padding: 16px;
}

.attention-title {
  margin-bottom: 12px;
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.attention-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.attention-group-label {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.attention-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.attention-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.attention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  transition: background-color 120ms ease;
}

.attention-item:hover {
  background: rgba(255, 255, 255, 0.045);
}

.attention-item-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.attention-item-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.attention-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  color: var(--color-text-primary);
  font-size: 12.5px;
  font-weight: 500;
}

.attention-item-sub {
  color: var(--color-text-muted);
  font-size: 11px;
}

.attention-item-error {
  padding: 0 8px 4px 22px;
  color: var(--color-danger);
  font-size: 11px;
}

.severity-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 999px;
}

.attention-action {
  flex-shrink: 0;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease, color 120ms ease;
}

.attention-action:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.attention-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.attention-bulk-action {
  height: 22px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--color-accent) 28%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  color: var(--color-text-primary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease;
}

.attention-bulk-action:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 22%, transparent);
}

.attention-bulk-action:disabled {
  cursor: wait;
  opacity: 0.55;
}
</style>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
gitaddall
git commit -m "feat: add overview attention panel component"
```

---

### Task 6: PruneConfirmDialog component

**Files:**
- Create: `src/components/overview/PruneConfirmDialog.vue`

- [ ] **Step 1: Create the component**

Create `src/components/overview/PruneConfirmDialog.vue`:

```vue
<script setup lang="ts">
/**
 * PruneConfirmDialog Component (Overview)
 *
 * Mandatory confirmation before the cross-repo "Prune all" bulk action.
 * Lists exactly what will be pruned per repository — pruning deletes
 * merged branches, which cannot be undone.
 */
import { computed } from 'vue'
import { SModal, SButton } from '@stuntrocket/ui'

const props = defineProps<{
  isOpen: boolean
  /** Branches to prune, grouped per repository */
  groups: { repo: string; branches: string[] }[]
  isPruning: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const totalBranches = computed(() =>
  props.groups.reduce((sum, group) => sum + group.branches.length, 0)
)
</script>

<template>
  <SModal :open="isOpen" max-width="max-w-md" @close="emit('close')">
    <template #header>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary">Prune Merged &amp; Stale Worktrees</h2>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-text-secondary">
        This will prune {{ totalBranches }} branch{{ totalBranches === 1 ? '' : 'es' }} across
        {{ groups.length }} repositor{{ groups.length === 1 ? 'y' : 'ies' }}.
        Merged branches are deleted — this cannot be undone.
      </p>

      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div v-for="group in groups" :key="group.repo" class="rounded-lg bg-surface-overlay/50 p-3">
          <p class="text-xs font-semibold text-text-primary mb-1.5">{{ group.repo }}</p>
          <ul class="space-y-0.5">
            <li v-for="branch in group.branches" :key="branch"
              class="text-xs font-mono text-text-secondary truncate">{{ branch }}</li>
          </ul>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <SButton variant="ghost" :disabled="isPruning" @click="emit('close')">Cancel</SButton>
        <SButton variant="danger" :disabled="isPruning" @click="emit('confirm')">
          {{ isPruning ? 'Pruning…' : 'Prune All' }}
        </SButton>
      </div>
    </template>
  </SModal>
</template>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
gitaddall
git commit -m "feat: add prune confirmation dialog for overview bulk action"
```

---

### Task 7: OverviewDashboard component — layout, refresh, actions, tests

**Files:**
- Create: `src/components/OverviewDashboard.vue`
- Test: `src/components/OverviewDashboard.test.ts`

- [ ] **Step 1: Write the failing component tests**

Create `src/components/OverviewDashboard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import OverviewDashboard from './OverviewDashboard.vue'
import { useWorktreeStore, useOverviewStore } from '@/stores'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { Worktree, RecentWorktree } from '@/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/demo/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

const recentFixture: RecentWorktree = {
  repo: 'api',
  branch: 'feature/recent-work',
  path: '/repos/api/feature-recent-work',
  accessed_at: 1717500000,
  accessed_ago: '2 hours ago',
  dirty: false,
}

/** Mock the Tauri commands the overview triggers on mount */
function mockWtCommands(
  worktreesByRepo: Record<string, Worktree[] | { error: string }>,
  recent: RecentWorktree[] = []
) {
  mockTauriInvoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === 'list_worktrees') {
      const entry = worktreesByRepo[(args?.repoName as string) ?? '']
      if (entry && 'error' in entry && !Array.isArray(entry)) {
        return Promise.reject({ code: 'GIT_ERROR', message: entry.error })
      }
      return Promise.resolve(entry ?? [])
    }
    if (command === 'get_recent_worktrees') return Promise.resolve(recent)
    if (command === 'get_repo_health') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
    if (command === 'get_repo_disk_usage') return Promise.reject({ code: 'COMMAND_FAILED', message: 'unavailable in test' })
    return Promise.resolve(undefined)
  })
}

function mountOverview() {
  return mount(OverviewDashboard, {
    global: {
      stubs: {
        HealthPanel: true,
        DeleteWorktreeDialog: true,
        OperationProgressPanel: true,
        PruneConfirmDialog: true,
        SIconButton: true,
        SSkeleton: true,
      },
    },
  })
}

describe('OverviewDashboard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
  })

  it('shows the onboarding state when no repositories are registered', async () => {
    mockWtCommands({})

    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain('No repositories yet')
    wrapper.unmount()
  })

  it('renders grouped attention items and stats from refreshed snapshots', async () => {
    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'api', worktrees: 2 },
      { name: 'demo', worktrees: 1 },
    ])
    mockWtCommands(
      {
        api: [
          makeWorktree({ path: '/repos/api/main', branch: 'main', dirty: true }),
          makeWorktree({ path: '/repos/api/old', branch: 'old', merged: true }),
        ],
        demo: [makeWorktree({ path: '/repos/demo/main', branch: 'main', behind: 3 })],
      },
      [recentFixture]
    )

    const wrapper = mountOverview()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Needs Attention')
    expect(text).toContain('Dirty')
    expect(text).toContain('Behind remote')
    expect(text).toContain('Cleanup candidates')
    expect(text).toContain('2 repos')
    expect(text).toContain('3 worktrees')
    // Recent panel shows the recent worktree
    expect(text).toContain('feature/recent-work')
    wrapper.unmount()
  })

  it('shows the all-clear state when nothing needs attention', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockWtCommands({ demo: [makeWorktree()] })

    const wrapper = mountOverview()
    await flushPromises()

    expect(wrapper.text()).toContain("Everything's tidy")
    wrapper.unmount()
  })

  it('shows a repo error attention item with a repair action', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'broken', worktrees: 0 }])
    mockWtCommands({ broken: { error: 'cannot read repository' } })

    const wrapper = mountOverview()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain("Couldn't read")
    expect(text).toContain('broken')
    expect(text).toContain('cannot read repository')
    expect(text).toContain('Repair')
    wrapper.unmount()
  })

  it('shows the refreshing indicator while the cheap tier is in flight', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'demo', worktrees: 1 }])
    mockWtCommands({ demo: [makeWorktree()] })

    const wrapper = mountOverview()
    await flushPromises()

    const overviewStore = useOverviewStore()
    overviewStore.setRefreshing(true)
    await nextTick()

    expect(wrapper.text()).toContain('Refreshing')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/OverviewDashboard.test.ts`
Expected: FAIL — cannot resolve `./OverviewDashboard.vue`

- [ ] **Step 3: Implement the component**

Create `src/components/OverviewDashboard.vue`:

```vue
<script setup lang="ts">
/**
 * OverviewDashboard Component
 *
 * Cross-repository home screen ("Mission Control") shown when no repository
 * is selected. Stat strip on top, grouped Needs Attention panel left (~60%),
 * Recent panel right (~40%). Cached snapshots paint instantly; a background
 * refresh runs on mount, window focus, and manual refresh.
 */
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWindowFocus } from '@vueuse/core'
import { useWorktreeStore, useOverviewStore } from '../stores'
import { useOverview, useRepos, useWorktrees, useWt, useToast } from '../composables'
import type { Worktree, OperationProgress, ProgressStatus } from '../types'
import AttentionPanel from './overview/AttentionPanel.vue'
import RecentPanel from './overview/RecentPanel.vue'
import PruneConfirmDialog from './overview/PruneConfirmDialog.vue'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'
import HealthPanel from './HealthPanel.vue'
import OperationProgressPanel from './OperationProgressPanel.vue'

interface BulkPullItem {
  repo: string
  branch: string
  path: string
}

const store = useWorktreeStore()
const overviewStore = useOverviewStore()
const { repositories } = storeToRefs(store)
const { refreshing, stats, behindAttention, cleanupAttention } = storeToRefs(overviewStore)
const { refreshAll, refreshRepos } = useOverview()
const { selectRepository } = useRepos()
const { fetchWorktrees, openInEditor, openInTerminal } = useWorktrees()
const wtApi = useWt()
const { toast } = useToast()

// ── Refresh: on mount and when the window regains focus ─────────────────

onMounted(() => {
  void refreshAll()
})

const windowFocused = useWindowFocus()
watch(windowFocused, (focused, wasFocused) => {
  if (focused && !wasFocused) {
    void refreshAll()
  }
})

function handleManualRefresh() {
  void refreshAll({ force: true })
}

// ── Navigation: select the repo and focus the worktree in the list view ─

async function handleNavigate(repo: string, branch: string) {
  // Same pattern as RepoList.handleNavigateToRecent: stale-while-revalidate
  const wasCached = store.isRepoLoaded(repo)
  selectRepository(repo)
  await fetchWorktrees({ silent: wasCached })
  store.focusWorktree(branch, true, true)
}

// ── Per-item actions ─────────────────────────────────────────────────────

// Keys with an action in flight (`repo/branch` for worktrees, repo for repairs)
const busyKeys = ref<string[]>([])
// Action failures keyed by `repo/branch` — stay attached to the list item
const itemErrors = ref<Record<string, string>>({})

function setBusy(key: string, busy: boolean) {
  if (busy) {
    if (!busyKeys.value.includes(key)) busyKeys.value.push(key)
  } else {
    busyKeys.value = busyKeys.value.filter((k) => k !== key)
  }
}

async function handleOpenEditor(path: string) {
  const success = await openInEditor(path)
  if (!success) toast.error('Failed to open in editor')
}

async function handleOpenTerminal(path: string) {
  const success = await openInTerminal(path)
  if (!success) toast.error('Failed to open in terminal')
}

async function handlePull(repo: string, branch: string) {
  const key = `${repo}/${branch}`
  if (busyKeys.value.includes(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.pullWorktree(repo, branch)
    if (result.conflicts || !result.success) {
      itemErrors.value[key] = result.message
    } else {
      delete itemErrors.value[key]
      toast.success(`Pulled ${branch}`)
    }
  } catch (error) {
    itemErrors.value[key] = wtApi.toWtError(error).message
  } finally {
    setBusy(key, false)
    await refreshRepos([repo])
  }
}

async function handleRepair(repo: string) {
  if (busyKeys.value.includes(repo)) return
  setBusy(repo, true)
  try {
    const result = await wtApi.repairRepository(repo)
    if (result.success) {
      toast.success(`${repo}: Fixed ${result.issues_fixed} issue${result.issues_fixed === 1 ? '' : 's'}`)
    } else {
      toast.error(`${repo}: ${result.message || 'Repair failed'}`)
    }
  } catch (error) {
    toast.error(`${repo}: ${wtApi.toWtError(error).message}`)
  } finally {
    setBusy(repo, false)
    await refreshRepos([repo])
  }
}

// ── Health panel (per-repo, opened from health attention items) ─────────

const showHealthPanel = ref(false)
const healthPanelRepo = ref('')

function handleOpenHealth(repo: string) {
  healthPanelRepo.value = repo
  showHealthPanel.value = true
}

// ── Delete dialog (cleanup "Remove" action — existing confirmed flow) ───

const showDeleteDialog = ref(false)
const deleteRepo = ref('')
const worktreeToDelete = ref<Worktree | null>(null)

function handleRemove(repo: string, worktree: Worktree) {
  deleteRepo.value = repo
  worktreeToDelete.value = worktree
  showDeleteDialog.value = true
}

async function handleDeleteClosed() {
  showDeleteDialog.value = false
  worktreeToDelete.value = null
  if (deleteRepo.value) {
    await refreshRepos([deleteRepo.value])
  }
}

// ── Bulk: pull all behind worktrees (sequential, grouped by repo) ────────

const showProgressPanel = ref(false)
const bulkProgress = ref<OperationProgress | null>(null)
const isBulkPulling = ref(false)
const bulkCancelled = ref(false)

const progressHasFailures = computed(() =>
  bulkProgress.value?.items.some((i) => i.status === 'failed' || i.status === 'conflict') ?? false
)
const progressHasConflicts = computed(() =>
  bulkProgress.value?.items.some((i) => i.status === 'conflict') ?? false
)

async function runBulkPull(items: BulkPullItem[]): Promise<void> {
  if (isBulkPulling.value || items.length === 0) return
  isBulkPulling.value = true
  bulkCancelled.value = false

  const progress: OperationProgress = {
    operation: 'overview_pull_behind',
    current: 0,
    total: items.length,
    items: items.map((entry) => ({
      item: `${entry.repo}/${entry.branch}`,
      status: 'pending' as ProgressStatus,
      worktreePath: entry.path,
    })),
    isComplete: false,
  }
  bulkProgress.value = progress
  showProgressPanel.value = true

  const affectedRepos = new Set<string>()
  try {
    for (const [index, entry] of items.entries()) {
      const progressItem = progress.items[index]
      if (bulkCancelled.value) {
        progressItem.status = 'skipped'
        progress.current = index + 1
        continue
      }
      progressItem.status = 'in_progress'
      affectedRepos.add(entry.repo)
      const key = `${entry.repo}/${entry.branch}`
      try {
        const result = await wtApi.pullWorktree(entry.repo, entry.branch)
        progressItem.details = result.message
        if (result.conflicts) {
          progressItem.status = 'conflict'
          progressItem.hasConflict = true
          progressItem.error = result.message
          itemErrors.value[key] = result.message
        } else if (!result.success) {
          progressItem.status = 'failed'
          progressItem.error = result.message
          itemErrors.value[key] = result.message
        } else {
          progressItem.status = result.already_up_to_date ? 'skipped' : 'success'
          delete itemErrors.value[key]
        }
      } catch (error) {
        const message = wtApi.toWtError(error).message
        progressItem.status = 'failed'
        progressItem.error = message
        progressItem.details = message
        itemErrors.value[key] = message
      }
      progress.current = index + 1
    }
    progress.isComplete = true
  } finally {
    isBulkPulling.value = false
    if (affectedRepos.size > 0) {
      await refreshRepos([...affectedRepos])
    }
  }
}

function handlePullAllBehind() {
  // behindAttention is sorted by repo then branch, so a sequential walk
  // pulls one worktree at a time, grouped by repo (no parallel pulls)
  void runBulkPull(
    behindAttention.value.map((item) => ({
      repo: item.repo,
      branch: item.worktree.branch,
      path: item.worktree.path,
    }))
  )
}

function handleBulkCancel() {
  bulkCancelled.value = true
}

function handleBulkRetry() {
  // Repo names cannot contain '/', so splitting on the first '/' is safe
  const failedItems: BulkPullItem[] = (bulkProgress.value?.items ?? [])
    .filter((i) => i.status === 'failed' || i.status === 'conflict')
    .map((i) => {
      const slash = i.item.indexOf('/')
      return {
        repo: i.item.slice(0, slash),
        branch: i.item.slice(slash + 1),
        path: i.worktreePath ?? '',
      }
    })
  void runBulkPull(failedItems)
}

function handleProgressClose() {
  showProgressPanel.value = false
  bulkProgress.value = null
}

// ── Bulk: prune all cleanup candidates (mandatory confirmation) ─────────

const showPruneDialog = ref(false)
const isPruning = ref(false)

const pruneGroups = computed(() => {
  const byRepo = new Map<string, string[]>()
  for (const item of cleanupAttention.value) {
    const branches = byRepo.get(item.repo) ?? []
    branches.push(item.worktree.branch)
    byRepo.set(item.repo, branches)
  }
  return [...byRepo.entries()].map(([repo, branches]) => ({ repo, branches }))
})

function handlePruneAll() {
  if (pruneGroups.value.length === 0) return
  showPruneDialog.value = true
}

async function handlePruneConfirmed() {
  if (isPruning.value) return
  isPruning.value = true
  const repos = pruneGroups.value.map((group) => group.repo)
  let deleted = 0
  let failures = 0
  try {
    for (const repo of repos) {
      try {
        const result = await wtApi.pruneRepo(repo, true)
        deleted += result.summary.branches_deleted
      } catch (error) {
        failures++
        toast.error(`${repo}: ${wtApi.toWtError(error).message}`)
      }
    }
    if (failures === 0) {
      toast.success(
        deleted > 0
          ? `Pruned ${deleted} merged branch${deleted === 1 ? '' : 'es'}`
          : 'Nothing to prune — everything was already tidy'
      )
    }
  } finally {
    isPruning.value = false
    showPruneDialog.value = false
    await refreshRepos(repos)
  }
}
</script>

<template>
  <div class="min-h-full flex flex-col p-5 gap-4 animate-fade-in">
    <!-- Zero repositories: onboarding hint (drag-and-drop still works here) -->
    <div v-if="repositories.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-center max-w-md">
        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-surface-overlay flex items-center justify-center">
          <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <p class="text-lg font-medium text-text-secondary">No repositories yet</p>
        <p class="text-sm text-text-muted mt-1">
          Drag a git repository folder here to register it, or clone one from the sidebar.
        </p>
      </div>
    </div>

    <template v-else>
      <!-- Stat strip -->
      <div class="overview-statstrip">
        <span class="overview-chip"><strong>{{ repositories.length }}</strong> repos</span>
        <span class="overview-chip"><strong>{{ stats.worktreeCount }}</strong> worktrees</span>
        <span class="overview-chip" :class="{ 'overview-chip-warn': stats.dirtyCount > 0 }">
          <strong>{{ stats.dirtyCount }}</strong> dirty</span>
        <span class="overview-chip" :class="{ 'overview-chip-warn': stats.behindCount > 0 }">
          <strong>{{ stats.behindCount }}</strong> behind</span>
        <span v-if="stats.diskDisplay" class="overview-chip">
          <strong>{{ stats.diskDisplay }}</strong> on disk</span>

        <span class="flex-1" />

        <Transition name="fade">
          <span v-if="refreshing" class="overview-refreshing">Refreshing…</span>
        </Transition>
        <button class="overview-refresh-btn" title="Refresh overview" @click="handleManualRefresh">
          <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': refreshing }" fill="none" stroke="currentColor"
            viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Panels: attention left (~60%), recent right (~40%) -->
      <div class="flex-1 grid grid-cols-5 gap-4 items-start">
        <div class="col-span-3 min-w-0">
          <AttentionPanel
            :item-errors="itemErrors"
            :busy-keys="busyKeys"
            :bulk-pulling="isBulkPulling"
            :pruning="isPruning"
            @navigate="handleNavigate"
            @open-health="handleOpenHealth"
            @repair="handleRepair"
            @open-editor="handleOpenEditor"
            @pull="handlePull"
            @remove="handleRemove"
            @pull-all-behind="handlePullAllBehind"
            @prune-all="handlePruneAll"
          />
        </div>
        <div class="col-span-2 min-w-0">
          <RecentPanel
            @navigate="handleNavigate"
            @open-editor="handleOpenEditor"
            @open-terminal="handleOpenTerminal"
          />
        </div>
      </div>
    </template>

    <!-- Dialogs and panels (self-contained — repo chosen per action) -->
    <HealthPanel :is-open="showHealthPanel" :repo-name="healthPanelRepo" @close="showHealthPanel = false" />

    <DeleteWorktreeDialog :is-open="showDeleteDialog" :worktree="worktreeToDelete" :repo-name="deleteRepo"
      @close="handleDeleteClosed" />

    <PruneConfirmDialog :is-open="showPruneDialog" :groups="pruneGroups" :is-pruning="isPruning"
      @close="showPruneDialog = false" @confirm="handlePruneConfirmed" />

    <OperationProgressPanel :is-open="showProgressPanel" title="Pulling Behind Worktrees" :progress="bulkProgress"
      :has-failures="progressHasFailures" :has-conflicts="progressHasConflicts" @close="handleProgressClose"
      @cancel="handleBulkCancel" @retry="handleBulkRetry" @open-in-editor="handleOpenEditor"
      @open-in-terminal="handleOpenTerminal" />
  </div>
</template>

<style scoped>
.overview-statstrip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.overview-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.overview-chip strong {
  color: var(--color-text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.overview-chip-warn strong {
  color: var(--color-warning);
}

.overview-refreshing {
  color: var(--color-text-muted);
  font-size: 11px;
  animation: pulse-subtle var(--duration-pulse) infinite;
}

.overview-refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  transition: background-color 120ms ease, color 120ms ease;
}

.overview-refresh-btn:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.055);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--duration-modal) var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/OverviewDashboard.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
gitaddall
git commit -m "feat: add overview dashboard with inline and bulk actions"
```

---

### Task 8: Render the overview from Dashboard.vue

**Files:**
- Modify: `src/components/Dashboard.vue` (imports ~line 19-35, header ~line 906, empty state ~line 1086-1098, `handleRefresh` ~line 361-367)
- Modify: `src/components/Dashboard.test.ts` (stubs ~line 14-34)

- [ ] **Step 1: Import the component and composable**

In `src/components/Dashboard.vue`, add to the component imports (after `import RepoList from './RepoList.vue'`):

```ts
import OverviewDashboard from './OverviewDashboard.vue'
```

Add `useOverview` to the existing composables import list (the long `import { useRepos, useWorktrees, ... } from '../composables'` line), then add near the other composable setups (after the `useAutoRefresh` destructure block):

```ts
// Overview refresh (used by ⌘R when no repository is selected)
const { refreshAll: refreshOverview } = useOverview()
```

- [ ] **Step 2: Replace the "Select a repository" empty state**

Replace this block (lines 1086–1098):

```html
              <!-- No repo selected -->
              <div v-if="!selectedRepo" :key="contentKey" class="h-full flex items-center justify-center p-8">
                <div class="text-center animate-fade-in">
                  <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-surface-overlay flex items-center justify-center">
                    <svg class="w-10 h-10 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                        d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
                    </svg>
                  </div>
                  <p class="text-lg font-medium text-text-secondary">Select a repository</p>
                  <p class="text-sm text-text-muted mt-1">to view its worktrees</p>
                </div>
              </div>
```

with:

```html
              <!-- No repo selected: cross-repository overview -->
              <OverviewDashboard v-if="!selectedRepo" :key="contentKey" />
```

- [ ] **Step 3: Update the header title**

Change line 907:

```html
                  {{ selectedRepo?.name || 'Select a Repository' }}
```

to:

```html
                  {{ selectedRepo?.name || 'Overview' }}
```

- [ ] **Step 4: Make ⌘R refresh the overview when no repo is selected**

Replace `handleRefresh` (lines 361–367):

```ts
// Debounced refresh - uses auto-refresh to reset timer
const handleRefresh = useDebounceFn(async () => {
  await fetchRepositories()
  if (selectedRepoName.value) {
    // Use triggerAutoRefresh to fetch worktrees and reset the auto-refresh timer
    await triggerAutoRefresh()
  } else {
    // Overview is showing — force a full snapshot refresh (bypasses throttle)
    await refreshOverview({ force: true })
  }
}, 300)
```

- [ ] **Step 5: Stub the new component in Dashboard tests**

In `src/components/Dashboard.test.ts`, add to the `stubs` object in `mountDashboard()` (after `RepoList: true,`):

```ts
        OverviewDashboard: true,
```

- [ ] **Step 6: Run tests and type check**

Run: `npx vitest run src/components/Dashboard.test.ts && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
gitaddall
git commit -m "feat: render overview dashboard when no repository is selected"
```

---

### Task 9: Sidebar "Overview" button

**Files:**
- Modify: `src/components/RepoList.vue` (template ~line 370, script)

- [ ] **Step 1: Add the handler**

In `src/components/RepoList.vue` script, after the `handleSelectRepo` function, add:

```ts
/**
 * Show the cross-repo overview by deselecting the current repository.
 */
function handleGoToOverview() {
  store.deselectRepository()
}
```

- [ ] **Step 2: Add the button to the template**

In the tab header block, immediately after `<div class="flex-shrink-0 border-b border-white/[0.04] p-2.5 pt-7">` and before the tab pill `<div class="flex p-0.5 bg-surface-overlay/40 ...">`, add:

```html
      <!-- Overview button: tab-style, distinct from repo rows -->
      <button
        class="w-full flex items-center gap-2 px-2.5 py-1.5 mb-2 rounded-md text-[13px] font-medium transition-colors"
        :class="selectedRepoName === null
          ? 'bg-accent/15 text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'"
        aria-label="Go to Overview"
        @click="handleGoToOverview"
      >
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
        Overview
      </button>
```

- [ ] **Step 3: Run RepoList tests and type check**

Run: `npx vitest run src/components/RepoList.test.ts && npm run build`
Expected: PASS (existing tests count `li.relative` elements — the new `button` doesn't affect them)

- [ ] **Step 4: Commit**

```bash
gitaddall
git commit -m "feat: add sidebar overview button"
```

---

### Task 10: ⌘0 shortcut, command palette action, help documentation

**Files:**
- Modify: `src/composables/useKeyboardShortcuts.ts` (handlers interface ~line 81, globalShortcuts ~line 191)
- Modify: `src/composables/useKeyboardShortcuts.test.ts`
- Modify: `src/composables/useCommandRegistry.ts` (CommandHandlers ~line 15, Navigation commands ~line 53)
- Modify: `src/components/Dashboard.vue` (both handler objects)
- Modify: `src/components/HelpModal.vue` (~line 40)

- [ ] **Step 1: Write the failing shortcut tests**

In `src/composables/useKeyboardShortcuts.test.ts`, add a new describe block at the end of the outer `describe('useKeyboardShortcuts focus gating', ...)` block (same level as the existing inner describes):

```ts
  describe('go to overview (⌘0 → onGoToOverview)', () => {
    it('fires and prevents default with the modifier held', () => {
      const onGoToOverview = vi.fn()
      const wrapper = mountWithShortcuts({ onGoToOverview })

      const prevented = dispatchKey({ key: '0', metaKey: true })

      expect(onGoToOverview).toHaveBeenCalledTimes(1)
      expect(prevented).toBe(true)

      wrapper.unmount()
    })

    it('does not fire without the modifier', () => {
      const onGoToOverview = vi.fn()
      const wrapper = mountWithShortcuts({ onGoToOverview })

      const prevented = dispatchKey({ key: '0' })

      expect(onGoToOverview).not.toHaveBeenCalled()
      expect(prevented).toBe(false)

      wrapper.unmount()
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/useKeyboardShortcuts.test.ts`
Expected: FAIL — TypeScript error (`onGoToOverview` not in `KeyboardShortcutHandlers`) / handler never called

- [ ] **Step 3: Register the shortcut**

In `src/composables/useKeyboardShortcuts.ts`:

Add to the `KeyboardShortcutHandlers` interface (after `onCommandPalette?: () => void`):

```ts
  /** Go to the cross-repo overview (deselect repository) */
  onGoToOverview?: () => void
```

Add to the `globalShortcuts` array (after the `'f'` focus-search entry):

```ts
    {
      key: '0',
      description: 'Go to Overview',
      action: () => handlers.onGoToOverview?.(),
      requiresModifier: true,
    },
```

(No conflict: quick-select registers ⌘1–⌘9 only.)

- [ ] **Step 4: Run shortcut tests to verify they pass**

Run: `npx vitest run src/composables/useKeyboardShortcuts.test.ts`
Expected: PASS

- [ ] **Step 5: Add the command palette action**

In `src/composables/useCommandRegistry.ts`:

Add to the `CommandHandlers` interface (after `onSelectRepo: (index: number) => void`):

```ts
  /** Go to the cross-repo overview */
  onGoToOverview: () => void
```

Add to the Navigation section of `commands` (after the `focus-search` entry):

```ts
    cmds.push({
      id: 'go-to-overview',
      title: 'Go to Overview',
      category: 'Navigation',
      shortcut: formatShortcut('0'),
      action: handlers.onGoToOverview,
    })
```

- [ ] **Step 6: Wire the handler in Dashboard.vue**

In `src/components/Dashboard.vue`:

Add to the `useCommandRegistry({...})` handlers object (after `onSelectRepo: ...`):

```ts
  onGoToOverview: () => store.deselectRepository(),
```

Add to the `useKeyboardShortcuts({...})` handlers object (after `onCommandPalette: ...`):

```ts
  onGoToOverview: () => store.deselectRepository(),
```

- [ ] **Step 7: Document in HelpModal**

In `src/components/HelpModal.vue`, in the `shortcuts` array, after `{ keys: ['⌘', 'K'], action: 'Command palette' },` add:

```ts
  { keys: ['⌘', '0'], action: 'Go to Overview' },
```

- [ ] **Step 8: Run tests and type check**

Run: `npx vitest run && npm run build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
gitaddall
git commit -m "feat: add overview navigation via shortcut, palette and help docs"
```

---

### Task 11: Full verification

- [ ] **Step 1: Full frontend test suite**

Run: `npx vitest run`
Expected: PASS — all suites green (245+ pre-existing tests plus the new overview suites)

- [ ] **Step 2: TypeScript type check**

Run: `npm run build`
Expected: PASS — no type errors

- [ ] **Step 3: Rust unchanged sanity check**

Run: `git status --porcelain src-tauri/`
Expected: empty output — no Rust changes were needed (spec: no new commands)

- [ ] **Step 4: Manual smoke test**

Run: `npm run tauri dev`

Verify:
1. App launches onto the overview (no repo auto-selected); cached state paints instantly on second launch.
2. Stat strip shows repos / worktrees / dirty / behind counts; disk appears after the expensive tier completes.
3. Clicking an attention item or recent entry selects the repo and scrolls/focuses the worktree.
4. Sidebar "Overview" button, ⌘0, and the palette's "Go to Overview" all return to the overview.
5. "Pull all" shows the progress panel and only pulls behind worktrees; "Prune all" shows the confirmation dialog first.
6. Drag-and-drop registration still works on the overview screen.

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
gitaddall
git commit -m "test: verify overview dashboard end to end"
```
