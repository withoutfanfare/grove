# Grove trust and quality-of-life review — 3 November 2026

This discovery report was subsequently approved for implementation. Current delivery and installation evidence is in the [implementation and release record](trust-implementation-2026-11-03.md).

What this repo does: Grove manages Git worktrees, repository maintenance and
development services through a Vue/Tauri desktop app and its bundled CLI.
This review assumes one macOS developer with roughly ten repositories,
35 or more worktrees in a busy repository, and other agents/tools changing
those repositories concurrently.

**Result:** there are worthwhile improvements, including several concrete
reliability defects. Start with authoritative action scope and safety checks,
honest unknown/freshness states, and owned command execution. More dashboard
information is useful once those foundations are reliable.

## Danny's confirmed priority

Danny clarified during the review that the main concern is whether the stale
report is correct, whether the merge report is correct, and whether something
is safe to delete. Those three answers take priority over the broader QoL
ideas below.

| Question | Evidence Grove should show | What must stay separate |
| --- | --- | --- |
| Is this stale? | Exact per-worktree base/ref, commit count behind it, configured threshold, checked-at time and last successful remote fetch. | Behind-base state, a folder modification time and old cached information are different facts. |
| Is this merged? | The checked worktree commit, exact base commit/ref, successful ancestry result and check time. Missing refs and failed queries must remain unknown. | Git ancestry does not establish a GitHub PR's state, squash/cherry-pick equivalence or safe deletion. |
| Can I safely remove it? | A fresh authoritative verdict with separate results for unsaved work/commit coverage, live lease, Git lock, current-site use, branch and database consequences. | A merged/clean badge is only a possible candidate. Preview is advisory; the checks run again immediately before execution. |

The existing per-worktree-base regression test was rerun after this
clarification: `./run-tests.sh report-base.bats` passed all three cases,
including real linked-worktree merge/stale/health comparisons. The happy path
has evidence, but error paths still need work: a fixture Git failure after
successful base resolution yielded behind `0`, stale `false` and merge exit
`1` (not merged) rather than unknown. See item 5.

This is a discovery report, not an approved implementation commitment. No
product code, installation or release changed during this review. The existing
26 changed/untracked files from the earlier CLI integration were preserved.
Baseline: `develop`, HEAD `2745c52e1ccb3fc07fcb0b051c6f487ae2a13ba5`, plus those
working-tree changes. Earlier fixes and tests are recorded separately in the
[CLI compatibility record](../../api/2026-11-03-cli-review-compatibility.md).

## How the team checked this

- GPT Astra, Medium: command lifecycle, recovery, persistence and operational
  truth. Claude Opus 5.5, High: usability, visibility, action wording and insight.
- Codex cross-checked Claude's action-safety findings. The parent independently
  inspected the relevant callers, CLI source and installed dependency source,
  and ran isolated fixtures for the findings listed below.
- The June QoL plans were treated as historical suggestions, not current
  defects. Existing cached lists, saved filter/sort, filter counts and shortcut
  wiring were not proposed again as new work.
- No generated Grove executable, live deletion, database operation, service
  switch, native app launch or development server was used in this pass.
  Scratch Git tests affected disposable repositories only. JavaScript checks
  executed current source with mocked external APIs in memory.

## Must fix

### 1. Make the Prune all confirmation match the action

**Confirmed defect; high priority; small–medium change.** The overview builds
the confirmation from worktrees marked `merged || stale`, then invokes a
repository-wide branch-pruning command. That command can target merged local
branches that never appeared in the confirmation, while stale unmerged
worktrees shown in the dialogue are not its targets.

Evidence: `src/components/OverviewDashboard.vue:284–308`,
`src/stores/overview.ts:155–157`,
`src/components/overview/PruneConfirmDialog.vue:32–39`, and
`grove-cli/lib/commands/git-ops.sh:530–590`. A disposable Git fixture confirmed
that the merged-branch enumeration includes a branch without a worktree, that
Git refuses deletion of a checked-out branch, and that the branch without a
worktree can be deleted.

**Minimum improvement:** produce a genuinely non-mutating CLI plan listing
exact branch/ref targets, the comparison base, and stale registrations. Show
that plan and execute/revalidate the same scope. Separate branch cleanup from
worktree removal, and report deleted, refused and skipped targets individually.
The existing non-force prune path is not a read-only preview: it already runs
`git worktree prune`, so simply using that path to populate a dialogue is not
sufficient.

**Acceptance:** a stale, unmerged worktree A and merged branch X without a
worktree must not be confused. The confirmation shows actual targets, and
execution cannot silently expand beyond the confirmed set. If this remains,
the user cannot reliably infer an operation's scope from its confirmation.

### 2. Treat an indeterminate safety check as blocked

**Reproduced defect in an external dependency; high priority; small–medium
change.** Grove correctly blocks a missing removal-check helper and relays a
blocking verdict. However, the installed `wt-removal-check` helper returns
`None` when certain Git queries fail and treats that as no finding.

Evidence: the helper's `git`, `uncommitted`, `unsaved_commits` and `main`
functions, particularly `wt-removal-check:50–63,93–105`;
`grove-cli/lib/13-removal-gate.sh:52` and
`grove-cli/lib/commands/lifecycle.sh:463–486`. With worktree detection succeeding
and fixture status/remote queries failing, the real helper returned exit zero
and claimed no uncommitted changes, unsaved commits or live session.

**Minimum improvement:** add explicit clear/blocked/unknown results to the
authoritative helper contract. Unknown must block removal and explain which
check failed. Use the same verdict for a read-only action preview and the
execution-time recheck. Do not recreate the gate from GUI badge values.

**Acceptance:** a timeout, unreadable index, failed ref query or malformed
lease must never be rendered as a completed clear check. A fixture Git failure
must return an indeterminate/blocking result. This is a helper change outside
the GUI repository and must be handled in its authorised source, rather than
patched around in the app. The observed false-clear verdict is not proof that
a real deletion would succeed: Git has additional checks.

### 3. Own commands until they have actually stopped

**Confirmed source defects; high priority; medium change.** The five-minute
timeout wraps `sidecar.output()`, but the app keeps no child handle to stop and
reap the process. The installed shell plugin spawns a child and has an explicit
kill operation; dropping the output future does not establish termination.
The output-size limit also runs after stdout/stderr have already been collected
into growing buffers.

Evidence: `src-tauri/src/wt.rs:422–446,514,698`, and installed
`tauri-plugin-shell` 2.3.5 `src/process/mod.rs:65–80,305–359,408–435`.
Cancellation/progress has a related identity gap: the backend has one active
operation pointer, cancellation accepts no ID, and progress is filtered by
operation type. See `wt.rs:239–259,1191`, `commands.rs:1065`, and
`src/composables/useOperationProgress.ts:70`. Selected-pull and global-pull UI
paths use different busy guards (`Dashboard.vue:583–601,1086`), so a single
global pointer is not a reliable identity contract.

**Minimum improvement:** retain ownership of each command, enforce byte limits
while reading, terminate/reap its owned process tree on deadline, and carry an
operation ID through invocation, progress and cancellation. For cancellation
between items, say "Stopping after current item"; do not imply an immediate
rollback. If termination or the final effect is uncertain, preserve that state
and refresh observations before offering a retry.

**Acceptance:** a disposable command and descendant exceed a shortened deadline
or output budget, then both stop without a delayed write. Two operations with
the same branch names cannot mix progress or cancel each other. Process survival
was assessed from source, not induced in the native app during this audit.

### 4. Make interrupted-operation recovery durable

**Confirmed source defect; high priority; medium change.** Parallel workers
clone operation state under a lock, then write it after releasing the lock.
An older snapshot can therefore overwrite a newer snapshot. Direct writes to
the same JSON path also lack atomic replacement, and several save failures are
ignored. An interruption can leave completed work shown as pending or an
unreadable recovery file.

Evidence: `src-tauri/src/wt.rs:1618–1623,1861` and
`src-tauri/src/operation_state.rs:86–112`. Normal completion can delete the
checkpoint, so the important case is interruption before final cleanup.

**Minimum improvement:** serialise writes per operation, reject older state
revisions, and replace checkpoint files atomically. Surface a checkpoint-write
failure as "Operation continues, recovery is unavailable" rather than claiming
the operation itself failed or silently promising resumption.

**Acceptance:** deliberately delay an older checkpoint behind a newer one,
interrupt before cleanup, then reload from disk. Every completed item remains
completed and the JSON is valid. Injecting a write failure must make the loss of
recovery visible. Runtime race reproduction remains an implementation check.

### 5. Separate unknown, stale, failed and healthy results

**Reproduced defects and source findings; medium–high priority; small–medium
change.** Null ahead/behind values are treated as zero, producing "Synced" and
"Up to date with remote". Card diagnostics are cached by path/base without a
revision or expiry, and a failed merge-base lookup becomes "No changes".

Evidence: `src/components/StatusBadge.vue:37–40,153–164`,
`WorktreeDetailsPanel.vue:144–162`,
`src/composables/useWorktreeDiagnostics.ts:48–66`,
`WorktreeCard.vue:58–59,82–100`, and
`src-tauri/src/commands.rs:1825–1855`. Rendering the current badge with null
comparison counts produced both reassuring labels. In a mocked current-source
diagnostics check, the underlying result changed from one file to five, but a
second request made no backend call and still displayed one file.

**Minimum improvement:** show "Sync status unknown" when comparison counts are
unknown; show "No upstream configured" only with explicit supporting metadata.
Invalidate/refetch diagnostics on revision/base changes and expose failed or
unavailable comparisons. Reserve zero/"No changes" for a successful comparison.

**Acceptance:** known zero counts render up-to-date; null counts do not. A new
commit or changed base updates card diagnostics. An invalid base or failed Git
diff produces an unknown/error state. No upstream is not evidence of never
having pushed, and cached remote-tracking refs are not a live remote check.

**Core stale/merge correction:** `grove-cli/lib/04-git.sh:641–644` treats a
failed ancestry query like a valid negative result, and `:694–697` can replace
a failed behind-count query with zero. `:709–713` also emits false for unknown
staleness. An isolated execution of these actual helpers, with Git queries
stubbed to fail after base resolution, reproduced all three outcomes. The
reporting contract needs explicit unknown/error states and successful-query
evidence, not just stronger tooltip wording. Normal merge means HEAD is an
ancestor of the chosen base; squash/rebase/cherry-pick integration is not
established by that test.

### 6. Give every displayed result the correct observation time

**Confirmed source defect; medium priority; small–medium change.** The main
view's refresh time is one value, updated only by automatic refresh. It can
describe the previous repository after a switch or say "Never updated" after a
successful manual/list load. Overview health/disk failures can still advance
the expensive-refresh marker while older data remains visible.

Evidence: `src/composables/useAutoRefresh.ts:99,120–137,224`,
`src/stores/worktrees.ts:171–178`, `src/stores/overview.ts:20–26`, and
`src/composables/useOverview.ts:59–79`. The earlier refresh-failure toolbar fix
is useful but does not establish per-repository timestamps.

**Minimum improvement:** record successful observation times per repository
and data type: worktree list, remote fetch, health and disk usage. Show cached
data's real age and the latest failed attempt separately. A refreshed local
status must not imply that remote refs were fetched or services checked.

**Acceptance:** switching to a two-hour-old snapshot shows its actual age until
validation completes. A failed health request retains the last-known result
with its old timestamp and a visible failed-check indicator.

### 7. Keep useful errors and update-check failures visible

**Confirmed source findings and isolated reproduction; medium priority; small
change.** Several UI callers use `instanceof Error` on Tauri's plain
`{code,message}` rejection objects and replace the real reason with generic
text. A failed update check returns to idle with no visible error, and failed
version lookup invents `0.0.0`.

Evidence: `RepoList.vue:270,289,306,322`,
`WorktreeDetailsPanel.vue:66,81`, `CloneRepositoryModal.vue:102`,
`HealthPanel.vue:56–62`, and `src/composables/useUpdater.ts:34–38,67–70`.
In a mocked source execution, updater transport failure yielded `idle`, an
empty error message, and version lookup failure yielded `0.0.0`.

**Minimum improvement:** reuse `toWtError`/`showWtError` consistently. Keep
"Check failed" distinct from "No update available" and show an unknown version
as unknown. Offer retry and a redacted copy-details action without interrupting
normal work on background network errors.

**Acceptance:** a plain rejection containing `index.lock exists` retains that
reason. Failed update/version requests never imply a successful check or a
real version number. A generic missing-worktrees explanation is not substituted
for an unrelated health failure.

### 8. Make effective configuration agree with the CLI

**Confirmed source mismatch; medium priority; medium change.** Rust starts with
the CLI's resolved configuration, then overlays raw files again. The global
file path is hard-coded to `~/.groverc`, ignoring a selected `GROVE_CONFIG`, and
raw `HERD_ROOT` entries can overwrite the CLI's environment-first result.

Evidence: `src-tauri/src/commands.rs:697–704`,
`config_files.rs:151–155,594–595,616–641`, and
`grove-cli/lib/01-core.sh:167,193–196`. This is conditional on environment/file
overrides; it is not a claim that the current normal installation uses the
wrong root.

**Minimum improvement:** use one authoritative resolution contract and expose
where each effective setting came from: default, selected file, repository or
environment. Editing a file should name the exact file and explain when an
environment setting still wins. Do not silently relabel file contents as the
effective runtime state.

**Acceptance:** isolated alternate `GROVE_CONFIG` and exported `HERD_ROOT`
fixtures produce matching CLI/GUI values and file targets. No real settings
file should be changed to establish this test.

## Should fix and useful product improvements

### 9. Show build provenance and make release checks reproducible

**Product/release reliability opportunity with confirmed source gaps; medium
priority; medium change.** The app shows version strings, but the last incident
proved that different CLI bytes can report the same version. Sidecar preparation
copies from a mutable sibling source, and a clean install depends on a locked
package URL at a local registry. CI currently targets main/master, uses Node 20
while `.nvmrc` selects 22, and does not describe a reproducible macOS sidecar
integration lane.

Evidence: `scripts/prepare-sidecar.sh:30–50`,
`src/components/RepoList.vue:961–962`, `SettingsPanel.vue:341–352`,
`package-lock.json:961–964`, `.nvmrc`, and `.github/workflows/test.yml:3–7,22–27`.
This audit did not execute CI or establish that every CI job currently fails.

**Minimum improvement:** add app revision, bundled CLI digest/build identity,
runtime configuration root and compatibility status to existing Settings/About,
with redacted diagnostic export. Pin the CLI input for release builds and add a
clean macOS contract/smoke lane using supported dependency access. Record the
native acceptance evidence for the exact packaged revision.

**Acceptance:** the build can identify the exact CLI bytes without relying on
`PATH` or a version label, a fresh authorised environment can reproduce the
host bundle, and the diagnostics distinguish local source from installed app.
Existing dependency-advisory and native-acceptance follow-ups remain separate
release gates, not new evidence from this discovery pass.

### 10. Add clear action consequences and retained operation receipts

**Product opportunity plus misleading wording; medium priority; medium change.**
Deletion defaults to also deleting the branch, while dirty-worktree wording
says work "will be lost" even though the normal GUI path now preserves the
gate and Git refusal. Closing progress wipes its displayed result; toast-only
errors fade, making a later "What happened?" investigation unnecessarily hard.

Evidence: `DeleteWorktreeDialog.vue:118,278`, `BatchDeleteDialog.vue:24,75–87`,
`src/composables/useOperationProgress.ts:149–152`,
`OverviewDashboard.vue:274–277`, and service/action toast consumers.

**Minimum improvement:** show exact path/branch, branch-retention choice,
current-site use and database identity/request implications before a risky
action, using the authoritative checks from items 1–2. Describe dirty work as
blocking removal. Keep a bounded session Activity list with time, repository,
target, action, outcome, warnings, failed step and redacted copyable details.
Successful worktree removal with a failed post-hook is a partial result, not
an invented rollback or confirmed database drop.

**Acceptance:** after dismissing a mixed batch, its failures and warnings remain
available. A cancelled operation lists completed and not-started items. No UI
badge or default checkbox bypasses execution-time checks. Retention beyond a
session is a separate product choice; raw secrets should never be retained.

### 11. Explain attention and cleanup using existing evidence

**Product opportunity; useful after the correctness fixes; small–medium change.**
The health panel already has parsed issue explanations and score impacts, but
cards/details mostly show a grade or a fixed generic sentence. Cleanup also
groups stale-only work with merged candidates, despite staleness often meaning
"sync this work", not "remove it".

Evidence: `GradeBadge.vue:55`, `WorktreeDetailsPanel.vue:122–141`,
`src/utils/healthIssues.ts`, `src/stores/overview.ts:155–157`, and
`src/components/overview/AttentionPanel.vue:221`.

**Minimum improvement:** reuse existing health findings in worktree details:
"Why this grade?", comparison base, exact reason and last-check time. Separate
far-behind-base work from cleanup candidates, favour Sync/Go to for the former,
and add a merged filter to the existing list. Useful compact insights include
known ahead commits, repositories with failed checks, and estimated disk space
associated with reviewed cleanup candidates.

**Acceptance:** stale/unmerged work is not recommended for removal solely
because it is stale; a grade explanation matches the CLI's findings; unknown
remote state is counted separately from confirmed ahead commits. Disk figures
are labelled estimates, not promises that those bytes are safely reclaimable.

**Terminology correction for the confirmed priority:** the CLI's
`get_last_accessed_iso` uses filesystem modification time
(`grove-cli/lib/04-git.sh:647–652`), not an observed last-opened event. The
time-based stale helper uses that value, while the CLI's other stale flag means
commits behind a base. Use distinct labels such as "Behind base", "Folder last
modified" and "Cached result". Neither old folder metadata nor a same-name
remote branch being absent establishes that work is abandoned or deletable.

## Recommended first implementation batches

1. **The three answers Danny needs:** address items 1–2 and the stale/merge
   parts of 5–6. Produce authoritative deletion previews, fail-closed unknown
   checks, exact comparison bases/commits and per-repository check times.
   Separate behind-base, folder age and cached results, and correct the
   dirty-removal wording. Do not infer safety from merged/clean alone.
2. **Reliable operations:** address items 3–4, the rest of 5 and operation
   receipts from 10. Enforce process ownership, bounded output, correct
   cancellation and durable recovery before promising richer history.
3. **Broader convenience and insight:** finish items 7–9, then add the grade
   explanations, merged filter and compact insights from 11. Updater polish
   and extra dashboard statistics do not outrank stale/merge/delete truth.

These are proposed batches, not delivery dates or approved work. No whole-app
redesign, replacement of the CLI, extra analytics service or separate dashboard
platform is needed. Reuse existing panels, parsers, progress infrastructure and
authoritative CLI checks. No reliable line/dependency saving estimate was made.

## Concrete verification performed in this pass

- Current `StatusBadge.vue` compiled/rendered with null comparison counts:
  `rendersSynced: true`, `claimsRemoteUpToDate: true`. UI-kit presentation was
  stubbed; this proves text/logic, not native visual acceptance.
- Current diagnostics module executed with a mocked backend: first result one
  file, later fixture five files; backend calls stayed at one and the displayed
  value stayed at one.
- Current updater module with failed external APIs: status `idle`, visible error
  empty, current version `0.0.0`.
- Disposable Git repository: merged candidates included a branch without a
  worktree; checked-out branch deletion was refused; branch without a worktree
  was deleted. No real repository/ref was changed.
- Real removal-check helper with a fixture Git executable: worktree detection
  succeeded, status/remote queries failed, helper exit was zero and its output
  claimed "Safe to remove". No real deletion or real Git query was performed.
- Actual CLI base/merge helpers with failing fixture Git queries: behind `0`,
  stale `false`, merge exit `1` instead of an unknown result.
- `./run-tests.sh report-base.bats`: three passed, no failures. This covers
  the existing two-base reporting behaviour and switch-hook cases, not all
  the new error/unknown cases above.
- Source and installed dependency inspection confirmed the timeout, output
  collection, persistence ordering and configuration behaviours described above.

No full test/build suite was rerun for this report-only work. Previous suite
results remain in the compatibility record and are not presented as proof of
these proposed improvements. Native interaction, real service/network failure
paths, updater distribution/signing, screen-reader/device acceptance and actual
CI execution remain unverified here. No background server or service was
started, and all scratch subprocesses completed.

## Review sources and corrections

Claude's frontend review:
<t3-thread://v2/34b177b8-a95e-40a1-bc2c-0ff5b39494a4/thread:delegated-task:command%3Amcp%3Ad8a30016-9711-48a4-b13f-b876769c0831%3Adelegate-task%3Ad661e405-c09f-45ed-97a3-68f0e038c98c>

Codex's cross-check:
<t3-thread://v2/34b177b8-a95e-40a1-bc2c-0ff5b39494a4/thread:delegated-task:command%3Amcp%3Ad8a30016-9711-48a4-b13f-b876769c0831%3Adelegate-task%3A0b920c2e-d3bd-4151-ae84-d2ecbc040b96>

The combined conclusions deliberately reject three overclaims: no upstream does
not prove "never pushed"; the ordinary GUI route does not bypass the mandatory
removal gate; and non-force prune is not a non-mutating dry run. Merged/clean/
ahead-zero values can help select candidates but cannot establish deletion
safety, absence of live sessions or current remote coverage.

**Verdict:** improve the app's evidence and operation guarantees before adding
more reassuring badges. The highest-value QoL change is that every reassuring
statement has a successful, identifiable, appropriately fresh check behind it.
