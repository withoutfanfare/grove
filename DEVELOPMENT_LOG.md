# Grove Development Log

## Cycle: 2026-03-20 21:00
- App: Grove
- Items completed:
  - [Feature] Add branch ahead/behind remote indicators on worktree cards (P2/S) — colour-coded ahead/behind badges (green for ahead-only, amber for behind-only, red for diverged) replacing the previous neutral-coloured badge. Added subtle check mark icon for up-to-date worktrees. Tooltips show commit counts relative to remote.
  - [UX/UI] Add worktree dirty state indicators on cards (P2/S) — new `get_dirty_details` Rust command runs `git status --porcelain` on worktree paths to provide staged/modified/untracked file counts. StatusBadge enhanced with three-state colour coding (green clean, amber modified/staged, grey untracked-only) and rich tooltips showing file counts. Dirty details lazy-loaded per worktree on mount for zero performance impact.
  - [UX/UI] Add worktree list filtering and sorting options (P2/S) — new `useWorktreeFilters` composable with filter toggles (All, Dirty, Stale, Unmerged) and sort options (Name, Last Accessed, Branch Age). Filter toolbar added below the header with active filter pill showing count. Filters reset when switching repositories.
- Items attempted but failed: none
- Branch: feature/status-indicators-and-filtering
- Tests passing: yes (cargo test 79/79, cargo check clean, cargo clippy clean, vue-tsc clean)
- Build status: success (Grove-20260320-0223.app copied to ~/Desktop/TauriBuilds/grove/)
- Notes: All three items are S-sized P2 features batched into one cycle. The ahead/behind and dirty state improvements enhance the existing StatusBadge component. The filtering/sorting adds a new composable and toolbar to the Dashboard. The `DirtyDetails` type was added to both Rust (`types.rs`) and TypeScript (`wt.ts`) with the new Tauri command registered in `lib.rs`.
