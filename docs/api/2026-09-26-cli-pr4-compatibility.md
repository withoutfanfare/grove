# grove-cli PR #4 compatibility — 26 September 2026

Checked on macOS arm64, Grove `develop` based on `74f3f21`. The CLI was built from an archive of merged `main` at `7538a341229217979b79bd565a87804b2b854b4a`, then copied into the app's ignored local sidecar using `GROVE_CLI_SOURCE` and `scripts/prepare-sidecar.sh`. The sibling CLI checkout and source were not changed.

## Command and parser inventory

All CLI execution is in `src-tauri/src/wt.rs`: `execute_wt`, `execute_wt_with_stderr`, `execute_wt_json_result`, plus the availability probe. JSON passes through `extract_json_array` or `extract_json_object` into types in `src-tauri/src/types.rs`.

Commands used: `repos`, `ls`, `--version`, `add`, `rm`, `pull`, `sync`, `recent`, `branches`, `health`, `services status`, service actions/switch, `prune`, `pull-all` (legacy helper), `log`, `changes`, `config`, `clone`, `repair`, `unlock`, `fetch`, and `register`. Progress operations loop over individual worktree commands. `get_worktree_status` uses `ls`, not `status`. Editor, terminal, URL and folder opening use native commands in `commands.rs`, not the CLI's `cd`, `code`, `open` or `switch` shortcuts.

Frontend consumers were checked in `useWt`, `useWorktrees`, worktree/overview stores, filters, stale/orphan detection, tray badges, cards/details, health/attention panels, file/commit lists and repository actions.

## Numbered outcomes

| Item | Result | Evidence / change |
| --- | --- | --- |
| 1. Untracked-only dirty | Fixed | Dirty counts, filters and removal predicates already use the boolean. Removed the unconditional safe-removal claim from the merged badge: `src/components/WorktreeStatusBadges.vue:50`. |
| 2. Status staleness | Not used by the app | Status requests use `ls` (`src-tauri/src/wt.rs:838`). A base-stale, upstream-synced fixture renders correctly. Access-age tray warnings remain a separate setting. |
| 3. Per-repo config | Fixed | CLI values are consumed directly; stale tooltip no longer assumes 50 commits: `src/components/WorktreeStatusBadges.vue:104`. Verified a threshold of 100 with a branch 60 commits behind. |
| 4. Merge unknown | Fixed | Human explanation with zero score penalty: `src/utils/healthIssues.ts:131`. Generic unknown-token fallback remains. The badge says merge is not confirmed (`src/components/WorktreeStatusBadges.vue:77`); false never passes the merged-only removal predicate. |
| 5. Separate health issues | Fixed | `info` itself is unused, but the shared health workaround was removed: `src/utils/healthIssues.ts:172`. Overview grouping retains arrays instead of joining and splitting tokens: `src/stores/overview.ts:167`. |
| 6. Empty repos | Already handled | Empty arrays parse normally; no empty-output special case existed. |
| 7. Pipe in commit subject | Already handled | JSON strings go directly to the commit list; verified subject and author remain separate. |
| 8. Exact file paths | Already handled | No unquoting or arrow splitting existed. Tested Unicode, literal quotes/spaces/arrows and an edited rename with `R`. |
| 9. Seven-character SHA | Already handled | SHAs are displayed/copied and used as commit-list keys; no cross-source equality comparisons found. |
| 10. Unknown health grade | Fixed | Rust now accepts and serialises `?`: `src-tauri/src/types.rs:57`. Neutral grade mappings were added to GradeBadge and HealthPanel; score zero remains visible. |
| 11. Valid error JSON | Already handled | Structured errors use serde; regression checks cover escaped newline, tab and control characters. No malformed-error workaround existed. |
| 12. Successful stderr warning | Already handled | Execution checks exit status, not presence of stderr. Invalid-base fixture exits zero with parseable stdout and warning on stderr. |
| 13. Pull-all messages | Already handled | CLI results use boolean/numeric fields. Resume reconstruction reads app-generated progress summaries, not CLI messages. Captured mixed success/no-upstream output parses correctly. |
| 14. Exec separator | Not used by the app | No `exec` or `exec-all` CLI invocation. |
| 15. Cross-repo partial failure | Not used by the app | No `exec-all`, `build-all` or `prune --all-repos`. App progress operations run their own per-worktree loops. |
| 16. Removal gate | Already handled | No stdin confirmation. Existing structured-error test preserves `REMOVAL_BLOCKED` and its multiline account. |
| 17. Unlock | Fixed | Actual CLI emits text on stderr even with `--json`. App captures that text, strips colour codes and explains retained locks: `src-tauri/src/wt.rs:2426`; UI displays it: `src/components/RepoList.vue:298`. No `-f`: protect recent locks and running Git operations. Removed the unsupported JSON lock-count field. |
| 18. Bad shortcut | Not used by the app | Native opening uses validated paths; the app does not call these CLI shortcut commands. Structured `WORKTREE_NOT_FOUND` parsing is also covered. |
| 19. Repair failure | Already handled | Actual CLI emits `success: false` with exit zero. Existing consumers inspect `success` and show the message. Damaged fixture reports one issue found, zero fixed, with recovery advice. |

The existing five-minute timeout is shared by cloning and other long operations. It was not reduced based solely on faster listing.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`: **103 passed**.
- `npm test` under the existing Herd Node 20.20.2 runtime: **362 passed**, 30 files. Node 26's localStorage behaviour breaks existing test setup; no unrelated test-environment changes were made.
- `npm run build` under Homebrew Node 26.9.0: **passed** (type checking and production frontend build).
- `git diff --check`: **passed**.
- Real isolated local repositories exercised `ls`, `status`, `health`, `info`, `branches`, `repos`, `recent`, `log`, `changes`, `summary`, `pull-all`, `prune`, `repair`, `services status`, `services apps` and `unlock`. All JSON-producing commands parsed. Unlock's text-only result is deliberately adapted in the app.
- Captured output is retained in `src-tauri/tests/fixtures/cli-pr4.json`, with temporary paths normalised. Rust tests feed it through the app's real parsers. `src/components/CliCompatibility.test.ts` checks rendering/counts/removal predicates against those same fixtures.
- Cases covered: untracked-only dirty; pushed/upstream-synced work 60 commits behind base; no worktrees/no repos; missing base/merge unknown; invalid-base stderr warning; threshold override; exact filenames/edited rename; pipe-bearing subject; partial pull-all failure; recent and old locks; damaged repair.
- The native development app started successfully with the rebuilt sidecar and isolated repository configuration. It and its Vite server were stopped afterwards.

## Limits

Native visual interaction remains **unverified**: the UI automation tool could not attach to the unbundled development executable by identifier or absolute path. Fixture-backed component rendering tests passed, but they are not a native click-through acceptance test. The rare CLI scoring failure was tested with synthetic `?`/zero JSON; it was not induced in a real repository. Services checks used an empty isolated services registry, not running services.

No release, installation, commit or push was performed. The local sidecar is rebuilt, but packaging a distributable app remains a separate release step. The private UI dependency was installed from the exact local registry tarball after the registry server proved unavailable; package files were unchanged.
