# Grove Roadmap Log

## Cycle: 2026-03-19 08:00
- **Items added:**
  - [UX/UI] Add drag-and-drop repository registration (P2, S)
  - [Feature] Add worktree quick-switch command palette (P2, M)
  - [Quality] Add accessibility improvements for keyboard-only navigation (P3, M)
- **Items archived:** none
- **Observations:** Initial roadmap seeding. Grove is the most production-ready app in the portfolio — all critical and high-severity issues resolved, 245+ frontend tests, 87+ backend tests. The focus shifts to UX polish and power-user workflows. The command palette would be the highest-impact addition for daily-use productivity.

## Cycle: 2026-03-19 15:00
- **Items added:** none
- **Items archived:** none
- **Observations:** No new items added. Grove is the most polished app in the portfolio and the existing 3 items (drag-and-drop onboarding, command palette, accessibility) are well-chosen for its maturity stage. As the most production-ready app, Grove is the strongest candidate for a Distribution item (Tauri auto-updater, Homebrew cask) in a future cycle — worth prioritising once the command palette ships, as it would be the first app ready for real distribution.

## Cycle: 2026-03-19 22:00
- **Items added:**
  - [Performance] Add lazy loading for repository worktree lists (P2, S)
  - [Distribution] Add Tauri auto-updater with release channel support (P2, M)
  - [Innovation] Add worktree templates for common branching workflows (P3, M)
- **Items archived:** none
- **Observations:** Acted on the previous cycle's Distribution recommendation — Grove is the most production-ready app and should be first to ship auto-update. The release channel support (stable/beta) adds distribution sophistication appropriate for a tool nearing real-world use. Lazy loading addresses a scalability concern for power users with many repositories. Worktree templates (Innovation) encode team branching conventions, differentiating Grove from basic worktree GUIs. Grove now has 6 pending items across all 6 categories — the most balanced and complete roadmap in the portfolio.

## Cycle: 2026-03-20 06:00
- **Items added:** none
- **Items archived:** none
- **Observations:** No new items added. Grove has a fully balanced roadmap — 9 pending items across all 6 categories plus Design System. As the most production-ready app, Grove's priority should be executing existing items rather than expanding scope. The command palette (P2, M) and auto-updater (P2, M) are the highest-impact items for moving Grove toward real-world distribution. Next cycle should check whether any items have moved to in-progress.

## Cycle: 2026-03-20 12:00
- **Items added:**
  - [Quality] Add stale worktree detection with cleanup suggestions (P2, S)
- **Items archived:** none
- **Observations:** Added a practical quality-of-life improvement for power users. Stale worktrees are an inevitable consequence of worktree-based workflows — developers create them for reviews and experiments and forget to clean up. Detection with smart cleanup suggestions (showing merge status and uncommitted changes before deletion) makes Grove a proactive workspace guardian rather than just a creation tool. The item complements the existing prune functionality from the wt CLI by adding UI-driven intelligence. Grove now has 10 pending items (7 functional + 3 design system). The command palette (P2, M) and auto-updater (P2, M) remain the highest-priority items for moving Grove toward real-world distribution.

## Cycle: 2026-03-19 22:30
- **Items added (Design System Adoption section):**
  - [Foundation] Integrate @stuntrocket/ui shared component library and design tokens (P1, M)
  - [UI Migration] Replace bespoke components with @stuntrocket/ui shared components (P1, XL)
  - [Polish] Achieve full Scooda styleguide visual conformance (P2, L)
- **Items archived:** none
- **Observations:** Added Design System Adoption section. Grove is the most production-ready app and already has a polished design with animation custom properties — the migration path is clear: remap existing duration tokens to Scooda values, replace src/components/ui/ primitives with @stuntrocket/ui imports. Grove's existing 245+ frontend tests provide confidence for the visual migration. As the most mature app, Grove should be an early adopter (after Dalil validates the package).

## Cycle: 2026-03-20 18:00
- **Items added:**
  - [UX/UI] Add worktree dirty state indicators on cards (P2, S)
- **Items archived:** none
- **Observations:** Added a small item that fills the last major information gap on worktree cards. The existing ahead/behind indicator (P2) shows remote sync status, but local working directory state (uncommitted changes, staged files) is a different and equally important dimension. Together, these two items would make worktree cards a complete status dashboard without opening a terminal. Grove is now at 13 pending items (10 functional + 3 design system). The P2 cluster (command palette, auto-updater, stale detection, ahead/behind, dirty state, lazy loading) is substantial — recommend starting with the command palette as it enables the most workflow improvement.

## Cycle: 2026-03-20 22:00
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove is at 13 pending items (10 functional + 3 design system) with zero execution progress despite being the most production-ready app in the portfolio. The backlog is comprehensive and approaching the rebalancing threshold. No further additions warranted. As the app most ready for real-world use, Grove should prioritise the command palette (P2, M) and auto-updater (P2, M) as the pair that unlocks both daily productivity and distribution. The worktree card enrichment items (ahead/behind, dirty state) would then form a natural follow-up batch.

## Cycle: 2026-03-20 23:30
- **Items added:**
  - [UX/UI] Add worktree list filtering and sorting options (P2, S)
  - [Feature] Add recent worktree switch history for quick navigation (P3, S)
- **Items archived:** none
- **Observations:** Both additions target sidebar usability as worktree counts grow. Filtering (P2, S) directly complements the stale detection and dirty state items — once those indicators exist, users need a way to filter by them. Sorting options (by name, last accessed, branch age) let users find relevant worktrees without scanning the full list. The recents list (P3, S) addresses the most common navigation pattern: switching between the same 3-4 active worktrees during a work session. Grove is now at 14 pending items (12 functional + 2 design system). The Foundation design system item is completed — Grove is the second app (after Dalil's extraction) ready for the UI Migration phase. The P2 cluster (command palette, auto-updater, stale detection, ahead/behind, dirty state, lazy loading, filtering) is the strongest batch for next execution.

## Cycle: 2026-03-21 02:09
- **Items added:**
  - [UX/UI] Add system tray badge for worktrees needing attention (P2, S)
- **Items archived:** none
- **Observations:** Added one item that leverages Grove's existing system tray integration to create passive awareness. The tray badge surfaces information from three other roadmap items (dirty state, ahead/behind, stale detection) as a single numeric indicator visible without opening the app. This transforms Grove from a tool users actively check into one that signals when attention is needed — matching how macOS developers expect system tray apps to behave. Grove is now at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. The Foundation design system item is completed, and the UI Migration item is marked as needing Danny's input due to its size. The P2 cluster (command palette, auto-updater, stale detection, ahead/behind, dirty state, lazy loading, filtering, tray badge) is the strongest batch for next execution.

## Cycle: 2026-03-19 23:29
- **Items added:**
  - [Feature] Add branch ahead/behind remote indicators on worktree cards (P2, S)
  - [UX/UI] Add per-repository disk usage display for worktree storage management (P3, S)
- **Items archived:** none
- **Observations:** Both additions address daily workflow information gaps. Branch ahead/behind indicators (P2) fill the most frequently needed data point missing from worktree cards — developers glance at worktrees to decide what needs attention, and sync status is the primary signal. Disk usage display (P3) complements the stale worktree detection item by adding a storage dimension to cleanup decisions. Both are small (S) and build on existing wt CLI data. Grove now has 12 pending items (9 functional + 3 design system). The P2 cluster (command palette, lazy loading, auto-updater, stale detection, branch indicators) forms a strong next batch.

## Cycle: 2026-03-21 08:00
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove is at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. Four items completed this period (Foundation design system integration, branch ahead/behind indicators, dirty state indicators, worktree list filtering/sorting), showing the strongest execution progress after Dalil. The Foundation design system completion makes Grove the second app ready for the UI Migration phase, though the XL migration item is marked as needing Danny's input. Reviewed P3 items: accessibility (M), worktree templates (M), disk usage display (S), recent worktree history (S), background fetch (S) — all retain value and none qualify for archival. The P2 cluster (command palette, auto-updater, stale detection, system tray badge, diff stats, worktree creation wizard, lazy loading) provides ample execution targets. Recommend the command palette as the highest-impact starting point.

## Cycle: 2026-03-20 20:00
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove remains at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. Four completed items (Foundation DS, ahead/behind, dirty state, filtering/sorting) show strong execution velocity. The UI Migration item (P1, XL) is marked as needing Danny's input due to its size. Reviewed P3 items again — all retain value. The command palette (P2, M) remains the highest-impact item for daily productivity. No additions until execution reduces the pending count.

## Cycle: 2026-03-21 14:00
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove remains at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. Four completed items (Foundation DS, ahead/behind indicators, dirty state indicators, filtering/sorting) give Grove the second-strongest execution velocity after Dalil. The UI Migration item (P1, XL) is marked as needing Danny's input due to its size. The command palette (P2, M) remains the highest-impact item for daily productivity — it would make worktree switching instant across all repositories. The auto-updater (P2, M) is the key distribution item that would make Grove the first app ready for real-world distribution. No additions until execution reduces the pending count.

## Cycle: 2026-03-20 08:14
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove remains at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. Four completed items (Foundation DS, ahead/behind indicators, dirty state indicators, filtering/sorting) give Grove the second-strongest execution velocity after Dalīl. The UI Migration item (P1, XL) is marked as needing Danny's input due to its size — this is the main design system blocker. Reviewed P3 items for archival: accessibility (M), worktree templates (M), disk usage display (S), recent worktree history (S), background fetch (S) — all retain value and none are stale. The command palette (P2, M) remains the highest-impact item for daily productivity, followed by the auto-updater (P2, M) for distribution readiness. No additions until execution reduces the pending count.

## Cycle: 2026-03-20 22:30
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove remains at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. No new completions since last cycle. Four completed items (Foundation DS, ahead/behind, dirty state, filtering) give Grove one of the strongest execution track records. The worktree creation wizard (P2, S) and stale detection (P2, S) pair would deliver the most immediate quality-of-life improvement — creating worktrees from remote branches and cleaning up forgotten ones are the two most common friction points in daily worktree management. The command palette (P2, M) remains the highest-value power-user feature. No additions until execution reduces the pending count.

## Cycle: 2026-03-20 20:30
- **Items added:** none
- **Items archived:** none
- **Observations:** Grove remains at 15 pending items (13 functional + 2 design system) — at the rebalancing threshold. Four completed items (Foundation DS, ahead/behind indicators, dirty state indicators, filtering/sorting) give Grove the joint-strongest execution velocity. The UI Migration item (P1, XL) is marked as needing Danny's input. The command palette (P2, M) remains the highest-impact power-user feature. The worktree creation wizard (P2, S) and stale detection (P2, S) pair provides the best quality-of-life improvement for daily use. No additions until execution reduces the pending count.

## Cycle: 2026-03-20 — Batch implementation of all pending functional items
- **Items completed (12):**
  - [UX/UI] Drag-and-drop repository registration (P2, S) — Finder drop zone with validation
  - [Feature] Worktree quick-switch command palette (P2, M) — Cmd+K fuzzy search via existing CommandPalette
  - [Quality] Accessibility improvements for keyboard-only navigation (P3, M) — ARIA labels, roles, focus management
  - [Performance] Lazy loading for repository worktree lists (P2, S) — Session-cached worktree data per repo
  - [Innovation] Worktree templates for common branching workflows (P3, M) — Built-in feature/hotfix/release templates
  - [Quality] Stale worktree detection with cleanup suggestions (P2, S) — Configurable threshold (default 14 days)
  - [UX/UI] Per-repository disk usage display (P3, S) — Async size calculation per worktree
  - [Feature] Recent worktree switch history (P3, S) — Last 10 switches persisted in localStorage
  - [UX/UI] System tray badge for worktrees needing attention (P2, S) — Badge count from dirty/behind/stale
  - [Feature] Worktree diff stats (P2, S) — Files changed, lines +/- vs base branch
  - [Performance] Periodic background fetch (P3, S) — Configurable interval (default 5 minutes)
  - [Feature] Worktree creation wizard with remote branch browsing (P2, S) — Searchable remote branch picker
- **Items skipped:**
  - [Distribution] Tauri auto-updater — Requires update endpoint infrastructure
  - [UI Migration] Replace bespoke components — XL item needing Danny's input
  - [Polish] Scooda visual conformance — Depends on UI Migration
- **Items archived:** none
- **Observations:** Massive execution cycle completing all 12 functional pending items in one batch. The implementation follows the existing architecture patterns: Rust backend (wt.rs → commands.rs), TypeScript types (types/wt.ts), useWt.ts composable, and Vue component integration. New Rust commands: get_repo_disk_usage, get_diff_stats, fetch_repo, get_remote_branches, register_repository. New composables: useBackgroundFetch, useStaleDetection, useTrayBadge, useRecentSwitches. New store: templates.ts. Settings extended with backgroundFetchInterval, staleThresholdDays, trayBadgeEnabled. Grove now has 3 pending items (1 functional + 2 design system) and 16 completed items — the highest execution velocity in the portfolio.
