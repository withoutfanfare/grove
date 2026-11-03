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
- [ ] Release: pinned CLI bytes/revision, build identity, supported Node/macOS checks and dependency advisory triage (9).
- [ ] Independent cross-review and final frontend/Rust/CLI regression suites after integration.
- [ ] New version, develop commit, release bundle, Applications installation, version/digest comparison and native smoke check.

## Acceptance focus

Failed queries must never produce a positive health/safety claim. Changed refs between preview and execution must not expand destructive scope. Timeout fixtures must leave no delayed descendant writes or hanging pipe readers. Older checkpoint writers must not erase completed items. A cached repository must retain its actual observation time and errors. The installed bundle must identify the exact CLI bytes.

## Ownership

Astra Medium implements runtime/recovery; a separate Astra Medium task implements CLI/report/removal contracts. Opus High implements Vue trust presentation and action UX. The parent integrates Rust IPC/configuration, build provenance, release checks and installation. All work shares the existing checkout with explicit file ownership; no worker commits or ships independently.

## Evidence and release outcome

Implementation is integrated. Astra Medium and Opus High independently reviewed the safety and cross-layer contracts. Their confirmed defects were fixed: native Git checkout protection, locked expected-SHA validation while preserving existing transaction hooks, ordered atomic startup recovery, non-destructive preview-cache eviction, busy checks before panel changes, and the correct Rust toolchain action. A timed-out prune target retains earlier results and is explicitly unknown.

Local evidence before release: 421 frontend tests, 117 Rust tests, frontend type check/build and Clippy pass; npm audit reports zero vulnerabilities after a clean dependency install. The full CLI run and final package verification are recorded below when complete.

Runtime containment covers the owned Unix process group, including background children that redirect output. User hooks which deliberately detach into another session can escape that group; deadline errors explicitly preserve that uncertainty and require refreshed observations before retrying. No rollback or absolute cross-client ownership is promised.

Branch cleanup uses Git's native worktree protection plus a private reference-transaction wrapper. The wrapper chains the repository's original hook and validates the actual locked ref SHA, comparison base and current worktree use before allowing the delete. A preview is advisory under concurrent external Git clients. Git's implementation was checked against [the primary branch implementation](https://github.com/git/git/blob/master/builtin/branch.c).

Hosted CI is separate from local acceptance. The clean Node 22 installation was proved in a fresh temporary npm cache using the exact private UI archive; no registry server was required. Hosted CI still needs authorised private-artifact and CLI read access, and has not been presented as passing.

 This record will be updated with actual commands and the installed version; the earlier discovery report is historical evidence, not completion proof.

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
