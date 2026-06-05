# Overview Dashboard — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorm complete, pending implementation plan)

## Summary

A cross-repository overview that becomes Grove's home screen, replacing the
"Select a repository" empty state. It answers two questions the moment the app
opens: **what needs my attention?** and **where was I?** — with aggregate
portfolio stats as secondary garnish.

## Decisions Made During Brainstorm

| Question | Decision |
|---|---|
| Placement | Home screen (cross-repo), shown when no repo is selected |
| Primary job | Attention + resume blend; stats secondary |
| Attention categories | Dirty, behind remote, stale/merged (cleanup), health issues |
| Action depth | Inline quick actions **and** portfolio-level bulk actions |
| Data freshness | Cached snapshot shown instantly + background refresh |
| Layout | "Mission Control": stat strip on top, attention panel left, recent panel right |
| Attention panel structure | Grouped by category with per-group bulk actions |

## Structure & Navigation

**Component:** new `src/components/OverviewDashboard.vue`, rendered by
`Dashboard.vue` in the main content area whenever no repository is selected.

**Navigation in:**

- App launch lands on the overview (no repo auto-selected).
- A tab-style **"Overview" button at the top of the sidebar** (`RepoList.vue`),
  visually distinct from repo rows (icon + label, active state when showing).
  Clicking it deselects the current repo.
- Keyboard shortcut **⌘0**, registered in `useKeyboardShortcuts.ts`,
  documented in `HelpModal.vue`.
- Command palette action: "Go to Overview".

**Navigation out:**

- Clicking an attention item or recent worktree selects that repo and focuses
  that worktree in the existing list view (via the worktree store's
  `focusedBranch` / `expandOnFocus`).
- Stat chips are display-only in v1 (clickable filter-jumps are a future idea).

Existing drag-and-drop repository registration continues to work on the
overview screen.

## Layout Regions

1. **Stat strip** — full-width row of chips: repos · worktrees · dirty count ·
   behind count · total disk usage.
2. **Needs Attention panel** (left, ~60%) — grouped sections, each with a
   count badge:
   - **Health issues** (critical first) — from `HealthResult.issues`
   - **Dirty** — worktrees with uncommitted changes
   - **Behind remote** — worktrees with `behind > 0`; per-group **Pull all**
   - **Cleanup candidates** — merged or stale worktrees; per-group **Prune all**
3. **Recent panel** (right, ~40%) — recent worktrees from
   `get_recent_worktrees`, relative timestamps, editor/terminal quick-open
   icons.
4. **All-clear state** — when no attention items exist, the left panel shows a
   calm "Everything's tidy" state; the recent panel still renders.

## Data Model & Refresh

**New Pinia store: `src/stores/overview.ts`**

```ts
interface RepoSnapshot {
  repo: string;
  worktrees: Worktree[];        // from list_worktrees — dirty/ahead/behind/stale/merged
  health?: HealthResult;        // from get_repo_health — expensive, lazy tier
  diskUsage?: RepoDiskUsage;    // expensive, lazy tier
  refreshedAt: number;          // unix ms
  error?: string;               // repo failed to load
}
```

Stat totals and attention items are **computed** from snapshots — no derived
state is stored. Attention derivation per category:

- Dirty: `worktree.dirty === true`
- Behind: `worktree.behind > 0`
- Cleanup: `worktree.merged || worktree.stale`
- Health: `health.issues[]` (severity-ordered, critical first)

**Persistence:** snapshots serialise to localStorage (same pattern as the
settings store). On launch the last-known state renders instantly with a
subtle "refreshing…" indicator.

**Refresh tiers:**

- **Cheap tier** — `list_worktrees` per repo. Runs on launch, window focus,
  and manual ⌘R. Repos are queried with limited concurrency (~3 at once) and
  the store updates progressively as each repo answers.
- **Expensive tier** — `get_repo_health` and disk usage. Staggered after the
  cheap tier completes; throttled to at most once per 5 minutes per repo
  unless manually refreshed.

**Technical approach:** orchestrate in the **frontend**, reusing existing
per-repo Tauri commands. No new Rust commands. Trade-off accepted: more IPC
round-trips, negligible at typical repo counts (<20). A Rust aggregate command
only pays off at much larger scale and can be revisited if needed.

**Per-repo failure isolation:** a repo that errors does not break the
overview. It appears as its own attention item ("Couldn't read `repo-x`") with
a **Repair** action wired to `repair_repository`, and its stale snapshot data
is retained with a warning.

## Actions

### Inline (per item — all reuse existing commands/flows)

| Group | Action | Wired to |
|---|---|---|
| Health issues | View → opens existing `HealthPanel` for that repo | existing panel |
| Repo load failure | Repair | `repair_repository` |
| Dirty | Open in editor | `open_in_editor` |
| Behind | Pull | `pull_worktree` |
| Cleanup | Remove → opens existing `DeleteWorktreeDialog` | existing confirmed flow |

Clicking the item body (not the action button) navigates to the repo with the
worktree focused.

### Bulk

- **Pull all** (Behind group): pulls only the behind worktrees across all
  repos — one worktree at a time, grouped by repo (no parallel pulls).
  Progress drives the existing `OperationProgressPanel` with a
  frontend-driven item list.
- **Prune all** (Cleanup group): confirmation dialog listing exactly what will
  be pruned per repo, then `prune_repo` per affected repo. Confirmation is
  mandatory — this is destructive.

After any action, only the affected repos' cheap-tier snapshots re-fetch.
Failures stay in the list with the error attached to the item.

## Edge States

- **wt CLI unavailable** — existing `wtAvailable` handling; overview shows the
  setup state.
- **Zero repos registered** — existing onboarding with drag-and-drop hint.
- **All healthy** — all-clear state (see Layout Regions).

## Testing

- **Vitest (store)** — attention derivation (grouping, ordering,
  merged/stale classification), stat totals, localStorage round-trip,
  per-repo error isolation, refresh-tier throttling.
- **Vitest (component)** — `OverviewDashboard` rendered from store fixtures:
  loading, populated, all-clear, repo-error.
- **Rust** — no new commands, no new cargo tests required.

## Out of Scope (Future Ideas)

Captured during brainstorm, deliberately excluded from v1:

- Clickable stat chips as filtered jumps (e.g. "5 dirty" → dirty filter).
- Activity timeline across worktrees (already on the roadmap separately).
- Worktree comparison view (roadmap item).
- A Rust-side `get_overview` aggregate command (only if repo counts grow).
