# CLI integration and app bug review — 3 November 2026

Historical integration evidence. The later [trust implementation and release record](../planning/reviews/trust-implementation-2026-11-03.md) supersedes the installation and release status below.

Local changes based on GUI `develop` at `2745c52e1ccb3fc07fcb0b051c6f487ae2a13ba5`
and the existing dirty CLI checkout at `5aa59f77ea12cf987075cca151dd4e233b3c2c37`.
Nothing was committed, installed or released. The original integration handoff
has been preserved. This is the current compatibility and verification record.

GPT Astra at Medium effort reviewed the backend and the combined app diff.
Claude Opus 5.5 at High effort reviewed/fixed the frontend and implemented the
narrow upstream protected-branch option. Findings were checked against source
and regression tests; one final overview-cache race was reproduced and fixed.

## Reported deletion failure

The running installed app still had the screenshot's result panel open. Reading
its expanded error showed:

```text
no matching worktree registered for 'scooda' branch 'fix/deploy-env-guard'
```

An independent read of Git's registered worktree list confirmed that this branch
was absent. The app nevertheless displayed the cached `envguard` row, alongside
`Never updated` and a refresh timeout. No real worktree was removed during this
investigation. This incident establishes stale UI state, rather than a reason to
force deletion or bypass the CLI's safeguards.

## Changes

| Area | Result |
| --- | --- |
| Missing or removed worktrees | Confirmed successful removals and `WORKTREE_NOT_FOUND` results retire the exact target from the visible list, repository cache, saved overview snapshot and selection. Other failures retain their rows. Batch failures preserve an optional `error_code`; messages are not parsed to infer identity or success. |
| Older requests | Removal invalidates an earlier worktree listing. Callers joining a listing await its corrective refresh. Overview requests also check a per-repository removal generation, preventing older list/health/disk captures from restoring a removed row or stale diagnostics. |
| Refresh lifecycle | Automatic and user-triggered worktree refreshes share the same request coordinator. Failed background validation leaves cached rows visible with `Cached data · refresh failed` and the diagnostic in the toolbar title. The sidebar no longer reports a separate 60-second timeout while a backend request remains active; the backend's existing five-minute deadline applies. |
| Protected branches | Routine and batch deletion no longer force removal. A typed protected-branch confirmation maps to the new CLI `--allow-protected` option. It permits only the branch-protection check; current-site, unknown-database, removal-gate and Git-lock refusals remain enabled. The existing IPC parameter is still named `force` for compatibility. |
| Errors and progress | Full multiline CLI diagnostics survive fallback parsing and credential redaction, including lines resembling progress messages. Structured error envelopes are failures even with exit zero. Failed batch rows show their reasons immediately; a hard batch failure no longer leaves a permanently pending panel. Removal errors are not misclassified as merge conflicts because their text contains `CONFLICT`. |
| Removal outcomes | Single removal checks the result's `success` field. Batch messages retain the actual branch-deletion result, unconfirmed database-drop request and failed post-hook names. A requested database drop is never displayed as proof that a database was dropped. |
| Services | Failed actions/switches retain typed failure details, show no success toast and re-read observed state. A late failure is not presented as a complete rollback. |
| Worktree bases | Card diff statistics read the selected worktree's `grove-base` sidecar before the existing fallback. A real disposable linked-worktree test proves that identical tips with different recorded bases produce different statistics. Shared legacy `grove.base` configuration is not used. Merge/stale/health badges continue to consume CLI fields. |

The additional upstream CLI change touches `lib/00-header.sh`,
`lib/99-main.sh`, `lib/commands/lifecycle.sh`, `_grove`,
`docs/reference/commands.md` and `tests/integration/review-regressions.bats`.
The generated executable was rebuilt with `build.sh`; earlier unrelated CLI
changes remain intact. Five new regressions first failed with `Unknown flag`,
then passed: protected removal, current-site refusal, unknown database refusal,
removal-gate refusal and locked-worktree refusal.

## Executable provenance

The original reviewed CLI SHA-256 was:

```text
0494f5ca8825155849c36713967c788ad7bc876b58fcfda9772936f666bef754
```

After the additional `--allow-protected` fix, the CLI, prepared macOS arm64
sidecar and native debug build's copied `grove` executable all have SHA-256:

```text
3e59c76e53eeb0e500ffdbed32a0b65be5a72d842c4fb40da33469e3a24edff9
```

Preparation used `GROVE_CLI_SOURCE` with `scripts/prepare-sidecar.sh`.
Only the host arm64 target was prepared. Both executables still report version
4.1.0 in their source; version equality does not establish provenance.
The installed application still contains the older sidecar, SHA-256
`0be5526d759cc2dcd98992198abb81cdf05862ab7106160174548a339e74795e`.
The installation was left running and unchanged.

## Other CLI changes

| Handoff area | Classification and evidence |
| --- | --- |
| Removal gates, identity checks, aliases and detached paths | Used. Existing registered target arguments are preserved, without slug reconstruction, forced retries or raw Git removal fallbacks. CLI safeguard tests and GUI error/result tests cover their respective boundaries. |
| Strict JSON, warnings, malformed output, repair failures | Already compatible or hardened. Rust parser/contract tests cover valid output, malformed output, full errors, redaction and successful stderr warnings. Existing repair consumers inspect `success` even on exit zero. |
| Per-worktree `ls`/status/health bases | Used. CLI report-base tests exercise distinct recorded bases; the app consumes the returned flags. The card's separate native diff calculation needed the sidecar adaptation above. |
| Services failure propagation | Used and adapted. CLI failure statuses remain authoritative; component tests cover typed failures, absence of success toasts and observed-state refresh. Real Supervisor/Herd services were not changed. |
| `fresh` | Not exposed as a dedicated GUI action. No new action was added. The updated CLI preserves databases and propagates dependency/asset failures. Ordinary GUI list refresh still means fetching status. |
| Atomic environment rewrites and move/restructure | Environment rewrites support existing creation hooks. Move/restructure are not exposed as GUI operations; no duplicate implementation was introduced. |
| `HERD_ROOT` precedence, templates and hook corrections | Used through the bundled CLI and its existing configuration/hook interfaces. No new configuration-writing path was introduced. |
| `exec-all`, build-all, dependency sharing/cleanup, migration, completion, wizard, installer/uninstaller | Not exposed as matching GUI actions. Their upstream fixes travel with the sidecar. No additional screens or shell-string invocation paths were added. |
| Repair pruning and upgrade | Repair is used and its result is checked. CLI self-upgrade is not the desktop app updater. |

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`: **108 passed**, no failures.
- `npm test` with the project's Herd Node 22.23.2 runtime: **381 passed**,
  33 files, no failures.
- `npm run build` with Node 22.23.2: passed.
- `cargo build --manifest-path src-tauri/Cargo.toml`: passed. The copied host
  sidecar hash matches the rebuilt CLI.
- GUI and CLI `git diff --check`: passed.
- CLI `./run-tests.sh`, rerun after integration settled: **699 passed,
  9 skipped, 0 failed**, 708 cases; exit zero and static analysis passed.
- `zsh -n ../grove-cli/_grove`: passed.

The frontend dependencies were initially absent and the local package registry
was offline. The exact local `@stuntrocket/ui` 0.9.3 tarball was verified against
the lockfile's SHA-512 integrity, cached, and installed with `npm ci`. Package
versions and lockfiles were not changed. Existing component-test warnings and
the Rust unused `WorktreeTemplate` warning remain; neither failed verification.

## Limits and remaining gates

The edited development app has **not** had an isolated native click-through
smoke run. The database safety hook blocked even a direct read-only CLI help
invocation because it scans database-removal code in the generated script.
That block was not bypassed. Native inspection of the already-running installed
app established the incident's error only; it does not prove the edited app's
runtime sidecar/configuration. Disposable CLI tests and Vue/Rust tests are
distinct from that remaining native gate. No development server was started.

No real database, site link, service registry, certificate or lifecycle hook was
modified. No release or installation is authorised by the integration handoff.
Before release, run the isolated native smoke against the new sidecar and verify
single/mixed-batch deletion, readable refusals, per-base badges and service
partial failures. Check every release architecture's sidecar separately.

Dependency audit output also reports existing advisories (21 in the full npm
tree; the production-filtered audit still includes build-tool dependencies).
This review did not establish exploitability in the shipped WebView or change
dependency versions. Triage and patching are recorded separately, rather than
treating a successful build as security clearance.

The saved CLI correction is `grove: refresh dependencies and assets without
resetting a database`, SnippetsLab UUID `BF9E4B1A-6709-42BA-AF1A-BB05477EB1D0`.
It corrects the older cheatsheet's database-reset description; no snippets were
deleted.
