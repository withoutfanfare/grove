# Agent handoff: integrate the reviewed Grove CLI into Grove GUI

Prepared 3 November 2026. Give the following brief to the agents implementing
the GUI integration. This is an implementation brief, not a claim that the GUI
has already been updated.

## Job

Update the Grove Tauri/Rust + Vue/TypeScript desktop app to work correctly with
the reviewed Grove CLI changes. Integrate the exact reviewed executable, adapt
the existing calls, error handling and interface where needed, and prove the
behaviour with contract tests, component tests and an isolated native smoke run.
Keep the change focused on compatibility; do not add a new feature for every
CLI command.

The GUI checkout is the repository containing this file (`grove`). The reviewed
CLI lives in the original checkout's sibling `grove-cli` directory. Resolve that
source before creating any isolated GUI worktree, then pass its absolute path
through `GROVE_CLI_SOURCE`; a sibling lookup from a new worktree may be wrong.

## Verified starting state

- GUI: `develop`, HEAD `2745c52e1ccb3fc07fcb0b051c6f487ae2a13ba5`; clean before
  this handoff was added. No GUI implementation changes were made by the handoff
  author. Recheck branch, status and lease before starting.
- CLI: `fix/respect-herd-skip`, HEAD
  `5aa59f77ea12cf987075cca151dd4e233b3c2c37`, with the reviewed fixes still
  **uncommitted**. The HEAD commit alone does not contain the fixes. Preserve
  this working tree; do not reset it or replace it with a fresh checkout of HEAD.
- Reviewed CLI executable SHA-256:
  `0494f5ca8825155849c36713967c788ad7bc876b58fcfda9772936f666bef754`.
- GUI's current `src-tauri/binaries/grove-aarch64-apple-darwin` SHA-256:
  `0be5526d759cc2dcd98992198abb81cdf05862ab7106160174548a339e74795e`.
  It differs from the reviewed CLI. Replacing a PATH-installed CLI does not
  update the app: Rust executes Tauri's bundled `sidecar("grove")`.
- The CLI still reports version `4.1.0`; version-string equality cannot prove
  that the bundle contains these fixes.
- CLI verification recorded on 2 November: build passed; 703 test cases,
  **694 passed, 9 skipped, 0 failed**; ShellCheck, Zsh parsing, diff checks and
  five JSON command checks passed. These checks were not rerun for this brief
  and do not prove GUI compatibility. The executable hash was rechecked today.
- No server or service was started while preparing this handoff. No live
  database, installation or release was exercised.

Read these sources first:

1. Both repositories' applicable instructions, including GUI `AGENTS.md` and
   CLI `CLAUDE.md`.
2. CLI `docs/development/2026-11-02-code-review.md`, its current source diff,
   `docs/reference/commands.md` and `docs/reference/configuration.md`.
3. GUI `docs/api/2026-09-26-cli-pr4-compatibility.md`, existing Rust contract
   tests and `src/components/CliCompatibility.test.ts`.

**Decision confirmed by Danny on 3 November:** `fresh` must refresh dependencies
and assets only, preserving databases. The older CLI report says this preference
was unanswered at the time; that statement is superseded by Danny's confirmation.

## Changes to fold in

### 1. Bundle the actual reviewed CLI

Use `scripts/prepare-sidecar.sh`, not a PATH executable or a hand-edited copy.
From the GUI checkout, with `CLI_ROOT` set to the verified original CLI checkout:

```sh
GROVE_CLI_SOURCE="$CLI_ROOT/grove" npm run prepare-sidecar
shasum -a 256 "$CLI_ROOT/grove" src-tauri/binaries/grove-*
```

The current host's prepared sidecar must match the reviewed source executable.
Do not claim that preparing one host target updates every release architecture.
`src-tauri/tauri.conf.json` declares `externalBin: ["binaries/grove"]`.
The GUI `tauri:build` script prepares the sidecar, while `npm run build` alone
only type-checks/builds the frontend. Check actual bundle provenance in the
native smoke run. Never edit the CLI's generated `grove` directly: its source is
`lib/`, rebuilt with `./build.sh`. Keep upstream CLI changes separate from GUI
adaptation; any new CLI defect needs a clearly identified upstream fix.

### 2. Handle removal safeguards without bypassing them

CLI source: `lib/commands/lifecycle.sh`, `lib/03-paths.sh`,
`lib/05-database.sh`, `lib/13-removal-gate.sh`.

- Removal checks run both before and after pre-removal hooks. New work or an
  agent lease appearing during a hook can block removal.
- JSON/non-interactive removal does not accept the CLI's terminal-only loss
  confirmation. `-f` does **not** bypass `REMOVAL_BLOCKED`.
- Move/removal detect `*-current` links selecting the worktree. Without force,
  they return `WORKTREE_IN_USE`; force can bypass this particular check and
  break the site link, with a warning.
- `--drop-db` requires a recorded `grove-database` identity, agreement with
  `.env` where present, and checks against other registered worktrees. An unsafe
  identity returns `DATABASE_UNSAFE`, including when forced. An unknown identity
  may return `DATABASE_UNKNOWN`; forced worktree removal can instead proceed
  with database backup/drop disabled. Display the actual result, not the request.
- Preserve exact registered worktree identity, including aliases and detached
  worktrees. Do not reconstruct a target or database from a slug/folder name.

**Specific GUI integration risk:** `DeleteWorktreeDialog.vue` currently sends
`force: true` with the comment "Always force in GUI to avoid prompts".
`remove_selected_with_progress` in Rust also hard-codes force. Review both:
routine deletion must not silently override current-site protection. Retain any
legitimate explicit protected-branch confirmation without treating it as consent
to bypass all other safeguards. Do not add automatic forced retries, raw Git
fallbacks, fake ownership sidecars or a new bypass for safety blocks.

Keep the CLI's full actionable error message, including multiline removal
verdicts, subject to existing credential redaction. Explain the reason in the UI.
A blocked item remains visible, the dialogue returns to a usable state, and a
mixed batch reports each outcome accurately. Existing `REMOVAL_BLOCKED` handling
is a starting point, not something to replace wholesale.

### 3. Preserve output and result contracts

- JSON-producing commands emit one JSON document on stdout; progress, hook
  messages and warnings belong on stderr. Successful stderr warnings are not
  command failures. Retain existing parser compatibility where still needed.
- The error envelope remains
  `{"success":false,"error":{"code":"...","message":"..."}}`.
  Handle `DATABASE_UNKNOWN`, `DATABASE_UNSAFE`, `WORKTREE_IN_USE`,
  `REMOVAL_BLOCKED`, `HOOK_FAILED`, `IO_ERROR` and `COMMAND_FAILED` where relevant;
  not every command uses JSON, so preserve a useful stderr fallback too.
- `branch_deleted` is the actual branch-deletion outcome.
  `db_drop_requested` records request intent, not proof that a database was
  deleted. These fields are already present in Rust/TypeScript and tested.
  Keep them; verify single and batch result wording and hook warnings.
- Rust execution helpers already parse structured CLI errors. The frontend
  `useWorktrees().removeWorktree()` catches failures, stores a typed error and
  resolves `null`; tests must exercise that production path, not only a mocked
  rejected promise.
- Treat exit status, JSON `success`, per-item results and hook outcomes as
  distinct signals. In particular, repair can return exit zero with
  `success: false`; fixing its reporting does not guarantee a new exit-code
  contract. Avoid success toasts or optimistic state for failed operations.

### 4. Use each worktree's base in reports

CLI `lib/04-git.sh` now reads a per-worktree `grove-base` sidecar, located with
`git rev-parse --git-path grove-base`, falling back to `DEFAULT_BASE`. Shared
legacy `git config grove.base` is deliberately ignored because linked worktrees
share that configuration. Never enable `extensions.worktreeConfig` to recreate
the old implementation.

`ls`, `status` and health calculations now use the resolved worktree base.
Check GUI merge/stale badges, filters, overview groups, health explanations and
cached results. Prefer CLI-derived results rather than recomputing against one
global base. Preserve existing unknown-state behaviour. Two worktrees in the
same repo can correctly show different merge/stale results.

### 5. Respect service failures and partial state

CLI `lib/commands/services.sh` propagates start/stop/restart/scheduler failures;
doctor counts failed checks. Service switching stops if stopping workers fails,
before repointing the current-site link. Symlink/cache-clear/start failures also
return failure. A later failure can leave services stopped or the link already
changed: do not invent a complete rollback or show the intended state as proven.

Check `run_service_action`, `switch_service_worktree`, `ServicesPanel.vue` and
the services store. Show failure details, refresh observed state, and only
announce success once the operation succeeds. Navigation `grove switch` and
`grove services switch` are different commands; do not conflate their contracts.
Navigation switch now resolves and passes `GROVE_DB_NAME` to hooks, failing on
unknown/empty identity; the example hook refuses an empty identity before edits.

### 6. Honour the new `fresh` behaviour

`fresh` now runs `npm ci`, then `npm run build`, when `package.json` exists.
It does not invoke database resets, even with `--force`, and propagates asset
command failures. `.env` alone cannot establish Laravel's effective database:
cached config, connection URLs and exported settings can override it.

No dedicated `fresh` integration was found in the targeted GUI source scan.
Verify this. Update any exposed action, help or command template that promises a
database reset; do not add a new `fresh` feature just to mirror the CLI. Keep
ordinary GUI data refresh distinct from refreshing dependencies/assets. Do not
assume `fresh` has gained a JSON success schema.

### 7. Account for the other CLI fixes without expanding scope

- Atomic/private `.env` rewrites preserve permissions and symlinks; move failures
  roll back, and restructure reports failures. Do not announce success early.
- Exported `HERD_ROOT` wins over global/project config; completion and migration
  follow this rule. Verify the sidecar/dev app uses the intended isolated root.
- `exec-all` preserves separate arguments while retaining its single shell-string
  form. Bulk prune returns correctly. Repair pruning and upgrade build failures
  no longer claim successful fixes/upgrades.
- Dependency cleanup skips dirty/current/recent worktrees and confirms deletion;
  restoring shared dependencies resolves relative links and preserves links on
  copy failure.
- Installer hook replacement requires a successful backup. Uninstall matches the
  exact Grove binary before deleting a `wt` link.
- Wizard cancellation, literal template parsing, `.env` template ordering,
  migration backup/base handling and dry-run reporting are corrected. Completion
  no longer launches a background fetch.

Classify each as used, already compatible, needs adaptation, or not exposed.
Document evidence; do not build unnecessary screens or duplicate CLI logic.

## Existing integration points

- `scripts/prepare-sidecar.sh`, `src-tauri/tauri.conf.json`, `package.json`:
  packaging and executable provenance.
- `src-tauri/src/wt.rs`: sidecar calls, parsing, error handling, hook results,
  service operations and single/batch removal.
- `src-tauri/src/commands.rs`: Tauri command parameters and return types.
- `src-tauri/src/types.rs`, `src/types/wt.ts`: shared contracts.
- `src/composables/useWt.ts`, `src/composables/useWorktrees.ts`:
  frontend calls, typed errors, refresh/cancellation behaviour.
- `src/components/DeleteWorktreeDialog.vue`, `BatchDeleteDialog.vue`,
  `ServicesPanel.vue`, associated stores and tests: user-visible results.
- `src-tauri/tests/fixtures/cli-pr4.json`, `cli-pr5.json`, Rust contract tests,
  `src/components/CliCompatibility.test.ts`: extend the existing test pattern.

## Acceptance and evidence

Use disposable Git repositories and isolated `HOME`, `HERD_ROOT`, `GROVE_CONFIG`
and `GIT_CONFIG_GLOBAL`. Stub database tools, service managers and app launchers.
Never wipe/import/drop a real database or mutate real current-site links,
certificates, hooks or service registries. Respect worktree leases and unrelated
changes. Use argument arrays across the process boundary, not shell-string
concatenation. These are compatibility changes, not permission for release,
installation or automatic updating of a user's application.

Cover at least:

1. Packaged host sidecar bytes match the reviewed CLI; the native development
   app actually uses that sidecar and the isolated configuration.
2. Removal blocked before hooks and after a hook changes the verdict; complete
   message visible, no success UI, no automatic force escalation.
3. Current-site protection, database-ownership refusal, and unknown identity;
   both single and mixed-batch behaviour; detached/aliased targets preserved.
4. Requested versus actual branch/database outcomes and failed post-hook warnings
   are represented honestly; remaining rows/selections/progress are consistent.
5. Two worktrees with distinct bases produce correct merge/stale/health results
   in the backend contracts and rendered frontend.
6. Service stop failure prevents switching; later cache/start failures remain
   failures and cause observed-state refresh rather than a false success toast.
7. Strict stdout JSON, successful stderr warnings, malformed output, non-zero
   failures and exit-zero `success: false` results take the correct paths.
8. Any existing refresh-assets action/copy preserves the new database-safe
   `fresh` behaviour. No new database-reset action is introduced.

Run focused tests, then the required final checks after implementation settles:

```sh
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run build
git diff --check
```

Use the project's verified Node runtime; diagnose runtime/test-environment
mismatches rather than weakening assertions. Record a native development smoke
pass with the updated sidecar and isolated fixtures. If native interaction is
unavailable, label that gate unverified and name the exact limitation. Stop and
confirm shutdown of any development app/server you start.

## Handover back

Report the exact CLI source/bundled hashes, GUI revision and changed files;
which behaviours needed changes versus already worked; test commands/counts;
native observations and skipped/blocked cases; and remaining work, if any.
Do not treat the earlier CLI test run as GUI evidence or a prepared sidecar as
proof of a released application. Keep one current compatibility record alongside
the existing notes instead of creating competing task lists.

Start by refreshing both checkout identities/status/leases, reading the named
contracts, and mapping the exact sidecar and single/batch removal paths. Then
implement and verify the focused compatibility changes through to completion.
