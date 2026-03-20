# Quality-of-Life Review - 2026-02-16

## Executive Summary
- **Top 3 risks**
  - Command palette actions for browser/open-all are wired but effectively non-functional (`src/components/Dashboard.vue:486`, `src/components/Dashboard.vue:487`, `src/composables/useCommandRegistry.ts:138`, `src/composables/useCommandRegistry.ts:146`).
  - Sidebar keyboard navigation can select the wrong repository when the list is sorted/filtered (`src/components/RepoList.vue:78`, `src/components/RepoList.vue:427`).
  - Auto-refresh can overwrite current repo state with stale results after a repo switch (`src/composables/useAutoRefresh.ts:186`, `src/composables/useAutoRefresh.ts:210`).
- **Quick wins**
  - Fix the two command-palette handler no-ops.
  - Align sidebar keyboard navigation with `filteredRepositories`.
  - Add repo-identity guard in auto-refresh writes.

## Validation Snapshot
- `npm run build`: pass
- `npm test`: pass (`245` tests)
- `cd src-tauri && cargo test`: pass (`87` tests)

## Issue Register

| ID | Severity | File:Line | Finding | Recommendation | Effort |
|----|----------|-----------|---------|----------------|--------|
| QOL-001 | major | `src/components/Dashboard.vue:486` | Command palette "Open in Browser" callback does not call any action (`wt.url` is read and discarded). | Call `openInBrowser(wt.url)` and surface failure feedback via toast. | S |
| QOL-002 | major | `src/components/Dashboard.vue:487` | Command palette "Quick Launch (All)" is registered but mapped to an empty handler. | Wire to `openAll(wt.path, wt.url)` from `useWorktrees` and report partial failures. | S |
| QOL-003 | major | `src/components/Dashboard.vue:488` | Command-palette copy actions use raw `navigator.clipboard.writeText(...)` with no error handling or user feedback. | Reuse `src/utils/clipboard.ts` wrappers and mirror `WorktreeCard` toasts for consistency. | S |
| QOL-004 | major | `src/composables/useWorktrees.ts:223` | `openInEditor/openInTerminal/openInBrowser` swallow errors and resolve; `openAll` then marks them successful, so success toasts can be false positives. | Return explicit success/failure from open helpers (or rethrow), then compute `openAll` result from real outcomes. | M |
| QOL-005 | major | `src/components/RepoList.vue:78` | Keyboard navigation is bound to `repositories`, while UI renders `filteredRepositories` (sorted/searched), causing highlight/select mismatch. | Bind list navigation + quick-select to the same list rendered in the UI. | M |
| QOL-006 | major | `src/composables/useAutoRefresh.ts:186` | Auto-refresh captures `repoName` once and writes results without verifying current selection after await; stale responses can overwrite visible data. | Add repo/fetch-token guard before `store.setWorktrees(...)`, matching `useWorktrees` race protection. | M |
| QOL-007 | minor | `src/components/SearchInput.vue:87` | Shortcut hint always renders `⌘F`, which is inaccurate on non-macOS platforms. | Use `usePlatform().formatShortcut('F')` to render platform-correct hints. | S |
| QOL-008 | minor | `src/components/RepoList.vue:133` | Timeout Promise in repo selection does not clear its timer after successful fetch, creating avoidable pending timers. | Store timeout id and `clearTimeout` in `finally`. | S |
| QOL-009 | minor | `src-tauri/src/wt.rs:400` | Comment says timeout is not implemented, but timeout exists at `SIDECAR_TIMEOUT` and is enforced in `execute_wt`. | Update/remove stale TODO to prevent future maintenance confusion. | S |
| QOL-010 | major | `src/components/CommandPalette.vue` | No focused tests for command palette actions, sidebar filtered navigation, or auto-refresh race behavior; current suite mostly covers stores/composables/utilities. | Add targeted tests for command wiring, filtered repo navigation, clipboard/error UX, and repo-switch race handling. | M |

## Recommended Implementation Order
1. Fix command-palette handler no-ops and clipboard action consistency (`QOL-001`, `QOL-002`, `QOL-003`).
2. Correct sidebar navigation source-of-truth mismatch (`QOL-005`).
3. Harden async consistency for auto-refresh/open-all result reporting (`QOL-004`, `QOL-006`).
4. Apply low-cost polish and cleanup (`QOL-007`, `QOL-008`, `QOL-009`).
5. Add regression tests for all corrected flows (`QOL-010`).

