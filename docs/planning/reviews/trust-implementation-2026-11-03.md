# Grove trust improvements implementation and release record

**Goal:** implement all eleven findings in [the approved review](trust-and-qol-review-2026-11-03.md), preserve the earlier CLI integration fixes, and install the tested application in Applications.

**Architecture:** keep the CLI authoritative for Git comparisons and removal checks. Rust owns command lifetime, recovery, effective configuration and build identity. Vue presents evidence, unknown states, precise consequences and session receipts.

**Constraints:** preserve existing changes and live data; use disposable fixtures for destructive paths; no automated main merge; install the latest verified develop build as explicitly requested. Git ancestry, remote fetch freshness and permission to delete remain distinct facts.

## Implementation checks

- [x] CLI: non-mutating exact prune plan, scope-limited revalidation, fail-closed removal preview and helper, unknown merge/stale queries with comparison evidence (findings 1, 2, 5).
- [x] Runtime: bounded owned commands, owned process-group termination/reaping with explicit uncertainty for detached hooks, isolated operation identity/cancellation; atomic ordered recovery and visible persistence failures (3, 4).
- [x] Presentation: unknown sync state, refreshed diagnostics, per-repository observation times and failed-check visibility (5, 6).
- [x] Errors and configuration: retain typed errors and updater failures; authoritative effective config and exact selected file/source information (7, 8).
- [x] Actions and insight: exact prune/deletion consequences, authoritative preview, session receipts, grade explanations and distinct behind-base/folder-age/cached labels (10, 11).
- [x] Release: pinned CLI bytes/revision, build identity, supported Node/macOS checks and dependency advisory triage (9).
- [x] Independent cross-review and final frontend/Rust/CLI regression suites after integration.
- [x] New version, develop commit, release bundle, Applications installation and version/digest comparison.
- [x] Bundled CLI startup acceptance: **0.4.0 FAILED**; the corrected **0.4.2** release package and installed copy passed real bundled-CLI success and missing-resource checks.
- [ ] Native screen interaction acceptance: the earlier computer-use bridge failure left this unverified; process survival and startup logging were insufficient.

## Acceptance focus

Failed queries must never produce a positive health/safety claim. Changed refs between preview and execution must not expand destructive scope. Timeout fixtures must leave no delayed descendant writes or hanging pipe readers. Older checkpoint writers must not erase completed items. A cached repository must retain its actual observation time and errors. The installed bundle must identify the exact CLI bytes.

## Ownership

Astra Medium implements runtime/recovery; a separate Astra Medium task implements CLI/report/removal contracts. Opus High implements Vue trust presentation and action UX. The parent integrates Rust IPC/configuration, build provenance, release checks and installation. All work shares the existing checkout with explicit file ownership; no worker commits or ships independently.

## Evidence and release outcome

Implementation is integrated. Astra Medium and Opus High independently reviewed the safety and cross-layer contracts. Their confirmed defects were fixed: native Git checkout protection, locked expected-SHA validation while preserving existing transaction hooks, ordered atomic startup recovery, non-destructive preview-cache eviction, busy checks before panel changes, and the correct Rust toolchain action. A timed-out prune target retains earlier results and is explicitly unknown.

Local evidence before release: 422 frontend tests, 117 Rust tests, frontend type check/build and Clippy pass; npm audit reports zero vulnerabilities after a clean dependency install. The full CLI run and final package verification are recorded below when complete.

Runtime containment covers the owned Unix process group, including background children that redirect output. User hooks which deliberately detach into another session can escape that group; deadline errors explicitly preserve that uncertainty and require refreshed observations before retrying. No rollback or absolute cross-client ownership is promised.

Branch cleanup uses Git's native worktree protection plus a private reference-transaction wrapper. The wrapper chains the repository's original hook and validates the actual locked ref SHA, comparison base and current worktree use before allowing the delete. A preview is advisory under concurrent external Git clients. Git's implementation was checked against [the primary branch implementation](https://github.com/git/git/blob/master/builtin/branch.c).

Hosted CI is separate from local acceptance. The clean Node 22 installation was proved in a fresh temporary npm cache using the exact private UI archive; no registry server was required. Hosted CI still needs authorised private-artifact and CLI read access, and has not been presented as passing.

This record distinguishes the failed 0.4.0 startup acceptance from the verified 0.4.2 bundled-CLI correction. The earlier discovery report is historical evidence, not completion proof.

## API boundaries

`get_prune_plan` returns an opaque, single-use, in-memory `plan_id`. The oldest
preview can be evicted at 50 entries. `prune_repo_confirmed` accepts only branches
from the same repository's preview and consumes it before execution; missing or
used previews return `PREVIEW_EXPIRED`. Ref/base changes refuse execution and a
timed-out branch outcome remains `unknown`, preserving earlier completed results.
Prune deletes only confirmed local branches: no worktree directories or
registrations are removed, and `stale_refs_pruned` is zero.

Merge evidence establishes Git ancestry into the recorded comparison base using
local refs. It establishes neither pull-request status nor a fresh remote fetch.
The deletion preflight's `database.will_drop` describes request intent, not proof
that a database was dropped. Database refusal cases used disposable fixtures;
no real database deletion was tested or performed.

`get_build_info` returns camelCase fields and hashes the actual bundled CLI at
runtime. A mismatch reports `cliRevision: "unknown"` and a compatibility warning;
a hashing failure returns `PROVENANCE_UNAVAILABLE`. The release pin and observed
installed digest must agree before the local installation is accepted.

## Installed 0.4.0 — 3 November 2026, 09:56 GMT; startup acceptance FAILED

The user's subsequent screenshot showed **CLI Not Found** in the installed app.
This failed bundled-CLI startup acceptance despite the verified version, bytes,
signature, process restart and startup log below. Those observations established
installation identity and process launch only; they did not establish CLI use.

- App **0.4.0**, built from `develop` release commit `7d6b29cf1cf6df88e14c5b22576b91e3e5d2bb6c`, tag `v0.4.0`. This is a minor bump for Activity and the new trust/action screens. No automated main merge was made.
- CLI **4.2.0**, committed and pushed on `fix/respect-herd-skip` at `5697e5467a56b92c8e9bbb89e844e4a0c776c0bd`. Pinned SHA-256: `a0b2c7146b311d34937ff89ff2352ea81dc52433cb921be227594f2fc55c704a`.
- `npm test`: **422 passed, 40 files**, no unhandled errors. `cargo test --manifest-path src-tauri/Cargo.toml`: **117 passed**, no failures. `npm run build` passed; Clippy completed with existing dead-code/style warnings.
- CLI `./run-tests.sh`: **707 passed, 9 skipped, 0 failed (716 cases)**. The separately rerun `trust-plans.bats` has **6 passing cases**, including the additional timeout-receipt regression. Skips concern live MySQL/Herd, real npm builds and unbundled local hooks; they are not claimed as acceptance.
- `npm audit --json --registry=https://registry.npmjs.org`: **0 vulnerabilities**. The Node 22 clean-cache installation and patched formatter/glob API smoke passed.
- Release command: prepare the pinned sidecar, then `npm run tauri -- build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`, with Node 22 and Cargo on PATH. The nested `tauri:build` script did not forward optional flags correctly through npm 12, so the documented direct invocation was used. The build finished in **2m 02s**. No DMG or updater distribution was produced.
- The local bundle initially carried only the linker's ad hoc signature. It was sealed for this local installation, then `codesign --verify --deep --strict --verbose=2` reported **valid on disk / satisfies its Designated Requirement**. This is local ad hoc signing, not Developer ID signing or notarisation.
- Installed at `/Applications/Grove.app`. `PlistBuddy` returned **0.4.0**. Both installed executables match the verified bundle, and the installed CLI digest matches the pin. The old app was quit before replacement and retained in Trash; a fresh process started at **09:56:31** and logged **Grove started successfully** at **09:56:32**.
- The maintained removal checker was also installed from the committed source, with the prior installed copy retained as a backup. The packaged CLI remains self-contained and uses its bundled checker unless explicitly overridden.

The installed screens could not be clicked through: two native computer-use attempts,
including a fresh session, returned `Sky Computer Use native pipe startup failed`.
Native screen acceptance remains open; the installed version, bytes, signature,
process restart and startup log are verified separately and do not override the
subsequent startup failure. The earlier native
acceptance follow-up remains relevant. Hosted CI needs the private inputs described
in the [build guide](../../api/reproducible-macos-build.md); that configuration action
was added to Things. No live worktree deletion, database operation or service switch
was used as proof. No development server was started for this work.

A supporting SnippetsLab entry was created and read back: **grove: inspect merge
evidence and deletion safety**, UUID `1005E4BA-EB43-4F0A-951F-3FFFE71609B6`.

## Installed 0.4.2 correction — 3 November 2026, 10:39 GMT

The runner retained the exited child with `waitid(..., WNOWAIT)` while finishing
process-group cleanup. On macOS, signalling a group containing only zombie
processes can return `EPERM`. The runner treated this as
`TERMINATION_UNCERTAIN`, incorrectly rejecting successful bundled CLI commands.
The correction inspects group members before accepting that macOS result.
Live members, incomplete inspection and genuine permission failures still fail
closed; uncertainty about deliberately detached hooks remains explicit.

Nine runner fixture tests passed, the full Rust suite passed **123 tests**, and
the final frontend suite passed **433 tests** with a successful type check/build.
The corrected debug app's actual `--check-bundled-cli` path reported CLI **4.2.0**
and **10 repositories** with the normal environment. With the minimal system
PATH, an empty `HERD_ROOT` and `GROVE_CONFIG=/dev/null`, it reported **zero
repositories**. These are debug-app observations, not release-package or
installed-0.4.2 proof. The independent Astra review reported no remaining findings.

The startup screen now retains the actual typed failure and offers **Retry**
and **Copy diagnostics**. It no longer advises installing another CLI or changing
PATH; placeholder download URLs were removed.

The actual app now accepts the read-only `--check-bundled-cli` mode described in
the [build guide](../../api/reproducible-macos-build.md#packaged-cli-startup-gate).
It uses the same bundled resolver and runner for the version and repository-list
queries, without windows, application stores or normal UI actions. CI includes
the packaged minimal-PATH check; no hosted pass is claimed here.

The 0.4.1 candidate passed the real packaged version/repository probe, including
minimal PATH, but was never installed. The missing-sidecar package fixture caught
its diagnostic printing an error while returning exit zero on macOS. The diagnostic
now flushes its result and exits with that result explicitly. The packaged regression
script checks success and failure, including refusal to use a fake CLI on PATH.
The existing 0.4.1 tag is retained; the corrected candidate receives a new version.

Release **0.4.2** was built from clean `develop` commit
`c6fb142065217c72e37ce37177517c9feeb73c6a`, tag `v0.4.2`, and installed at
`/Applications/Grove.app` at **10:39:38 GMT**. This patch fixes the macOS startup
regression and makes the packaged diagnostic failure result truthful. No main
merge was made; both release tags retain their original commits.

- Final source checks: `npm test -- --run` reported **433 passed (40 files)**;
  `npm run build` passed; `cargo test --manifest-path src-tauri/Cargo.toml`
  reported **123 passed, 0 failed**. The unchanged CLI retains the full-suite
  evidence recorded above.
- The release build completed in **1m 59s**. The CLI script and then the outer
  app were signed in that order with local ad hoc signatures. Strict deep
  verification reported **valid on disk / satisfies its Designated Requirement**.
  No Developer ID, notarisation, DMG or updater publication is claimed.
- `python3 scripts/check-packaged-cli.py` passed against both the release bundle
  and `/Applications/Grove.app`. Minimal system PATH with empty repository root:
  **exit 0**, app **0.4.2**, CLI **4.2.0**, `repository_count: 0`,
  `source: "bundled-sidecar"`, `success: true`. A temporary copy missing its CLI:
  **exit 1**, `BUNDLED_CLI_MISSING`, `success: false`; the fake PATH CLI was unused.
- `/Applications/Grove.app/Contents/MacOS/grove-app --check-bundled-cli` with the
  normal environment reported **exit 0**, app **0.4.2**, CLI **4.2.0**,
  **10 repositories**, `source: "bundled-sidecar"`, `success: true`.
- Installed `Info.plist` reports **0.4.2**. Main executable and CLI bytes match
  the signed release bundle; CLI SHA-256 matches the existing pin:
  `a0b2c7146b311d34937ff89ff2352ea81dc52433cb921be227594f2fc55c704a`.
  The 0.4.0 app was retained in Trash. The new installed process started at
  **10:39:39 GMT** and is left running. No development server was started.

Native screen interaction remains unverified: the new installed app inspection
again returned `Sky Computer Use native pipe startup failed`. That does not
negate the actual packaged CLI checks, and those checks do not establish native
click-through acceptance. The existing acceptance follow-up remains open.

Hosted CI at this exact release commit [failed before installation and tests](https://github.com/withoutfanfare/grove/actions/runs/41620835634)
because `STUNTROCKET_UI_TARBALL_URL` is missing. The existing private-input CI
configuration follow-up remains open. The installed app also logs a failed
request to its configured updater endpoint; no successful update-feed delivery
is claimed. That service follow-up is tracked separately from this local install.

The new diagnostic command is saved in SnippetsLab as **Grove: verify the app's
bundled CLI**, UUID `5FC2D000-712A-42D1-98E2-B841671F7E1E`.

## Created or newly tracked files

The release also tracks the earlier integration handoff and regression tests that
were already present in the dirty checkout. The complete added-file list is:

- `docs/api/2026-11-03-cli-review-compatibility.md`
- `docs/api/2026-11-03-cli-review-integration-handoff.md`
- `docs/api/reproducible-macos-build.md`
- `docs/planning/reviews/trust-and-qol-review-2026-11-03.md`
- `docs/planning/reviews/trust-implementation-2026-11-03.md`
- `scripts/cache-ui.mjs`
- `scripts/check-packaged-cli.py`
- `src-tauri/sidecar.lock.json`
- `src-tauri/src/build_info.rs`
- `src-tauri/src/process_runner.rs`
- `src-tauri/src/trust_commands.rs`
- `src/components/ActivityPanel.vue`
- `src/components/GlobalConfigPanel.test.ts`
- `src/components/OperationProgressPanel.test.ts`
- `src/components/ServicesPanel.test.ts`
- `src/components/SettingsPanel.test.ts`
- `src/components/StatusBadge.test.ts`
- `src/components/overview/PruneConfirmDialog.test.ts`
- `src/composables/useActivity.test.ts`
- `src/composables/useActivity.ts`
- `src/composables/useOperationProgress.test.ts`
- `src/composables/useUpdater.test.ts`
- `src/stores/freshness.test.ts`

CLI source and regression additions:

- `grove-cli/docs/development/2026-11-02-code-review.md`
- `grove-cli/lib/commands/trust.sh`
- `grove-cli/tests/integration/completion-herd-root.bats`
- `grove-cli/tests/integration/config-resolution.bats`
- `grove-cli/tests/integration/install.bats`
- `grove-cli/tests/integration/migration.bats`
- `grove-cli/tests/integration/report-base.bats`
- `grove-cli/tests/integration/trust-plans.bats`
- `grove-cli/tests/integration/trust-unknown.bats`
- `grove-cli/tests/integration/uninstall.bats`
- `grove-cli/tests/integration/wizard.bats`
- `grove-cli/tests/unit/template-load.bats`
- `grove-cli/tools/prune-plan.py`
- `grove-cli/tools/wt-removal-check`
