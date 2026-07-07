# Cadence Tasks

## TASK-1: Real-time file watcher never registers targets for linked worktrees
status: open
labels: agent:triaged, agent:auto, agent:revise

### Problem

The real-time file watcher never registers any watch targets for Grove-managed worktrees, so `worktree_changed` events are never emitted and the "real-time updates" feature is effectively dead — the UI only ever updates via the slow (10–60s) polling fallback.

### Where

`src-tauri/src/watcher.rs:118-144` (`start_watching`), fed by the watcher command in `commands.rs` (~1384-1387).

The watcher builds targets as `PathBuf::from(worktree_path).join(".git").join("HEAD")` (plus `index`, `FETCH_HEAD`, `refs/heads`) and only registers a watch when `target.exists()`. But in Grove's standard layout — a **bare** repo (`<name>.git`) with **linked** worktrees under `<name>-worktrees/` — every worktree's `.git` is a *pointer file* (`gitdir: …`), not a directory. The real `HEAD`/`index` live under `<mainrepo>/.git/worktrees/<name>/`, while shared refs and fetch state live under the common git dir. Therefore `<worktree>/.git/HEAD` never exists, `target.exists()` is always false, and **no watch targets are ever registered**. `is_watching` still returns true, masking the failure.

### Why it matters

Correctness bug: a shipped feature silently does nothing. Any commit / checkout / fetch inside a worktree produces no filesystem event, so `Dashboard.vue`'s `handleWorktreeChange` never fires and users see stale worktree status until the next poll.

### Acceptance Criteria

- [ ] Watcher resolves the real git directory for linked worktrees (read the `gitdir:` pointer from the `.git` file) instead of assuming `<worktree>/.git` is a directory.
- [ ] Watch targets (`HEAD`, `index`, shared `FETCH_HEAD`, shared `refs/heads`) are registered against the correct git directories and `worktree_changed` fires on a real change.
- [ ] Verified against a bare-repo + linked-worktree layout: editing/committing in a worktree emits the event and the UI refreshes without waiting for the poll.
- [ ] `is_watching` reflects reality (does not report watching when zero targets were registered).

---

## Implementation Spec

### Root cause

`watcher.rs:120` hard-codes `git_dir = <worktree>/.git` as a directory. For linked worktrees `.git` is a file containing `gitdir: /abs/path/to/mainrepo/.git/worktrees/<name>`. `HEAD`/`index` live in that resolved per-worktree dir; `refs/heads` and `FETCH_HEAD` live in the shared `<mainrepo>/.git` (the `commondir`). So the current targets never exist.

### Approach

1. Add a helper `fn resolve_git_dir(worktree_path: &Path) -> Option<PathBuf>`:
   - `let dot_git = worktree_path.join(".git")`.
   - If `dot_git.is_dir()` → return it (normal non-bare repo, keep working).
   - If `dot_git.is_file()` → read it, strip the `gitdir: ` prefix, trim, resolve relative-to-worktree if not absolute, canonicalise → return the per-worktree git dir.
   - Else `None`.
2. In `start_watching`, replace the `let git_dir = …join(".git")` line with `let Some(git_dir) = resolve_git_dir(Path::new(path_str)) else { continue; }`.
3. `HEAD` and `index` resolve under that per-worktree dir. `refs/heads` and `FETCH_HEAD` are written to the **common** dir for linked worktrees — read the `commondir` file (sibling of the resolved gitdir, contents e.g. `../..`) and target `<commondir>/refs/heads` plus `<commondir>/FETCH_HEAD`. If `commondir` is absent (normal repo) fall back to `git_dir` as today. Keep the existing `target.exists()` guard so still-absent files (e.g. no fetch yet) are skipped gracefully — but at least HEAD/index/refs will now exist and register.
4. `is_watching` accuracy: track a registered-target count. Only insert the `WatcherHandle` into `WATCHERS` (i.e. only report "watching") if at least one `watch()` call succeeded; if zero targets registered, log a warning and skip the insert so `is_watching` returns false.

### Files

- `src-tauri/src/watcher.rs` — add `resolve_git_dir` + `commondir` resolution, rework the target loop, guard the handle insert on a success count. Add `use std::path::Path;`.

### Test plan

- Unit: `resolve_git_dir` — temp dir with a `.git` **file** containing `gitdir: <tmp>/mainrepo/.git/worktrees/wt1` resolves to that path; a `.git` **directory** returns itself; a missing `.git` returns `None`; a relative `gitdir:` resolves against the worktree.
- Unit: given a fabricated linked-worktree layout on disk (create `HEAD`/`index` files under the resolved gitdir and `refs/heads`/`FETCH_HEAD` under commondir), assert the computed target set contains all four existing paths.
- Manual verify (acceptance): in a real bare+linked layout, `git commit` inside a worktree emits `worktree_changed` and the Dashboard refreshes before the poll interval.

PR: https://github.com/withoutfanfare/grove/pull/3

## TASK-2: Background fetch cannot be re-enabled without an app restart
status: completed
labels: 

### Problem

Re-enabling background fetch after disabling it silently does nothing until the app is restarted.

### Where

`src/composables/useBackgroundFetch.ts:84-92`.

```ts
watch(() => settings.value.backgroundFetchInterval, () => {
  if (intervalHandle) { start(); }   // ← guard is the bug
})
```

When the interval is set to `0`, `start()` calls `stop()` (which sets `intervalHandle = null`) and then returns early because `intervalMinutes <= 0` (`useBackgroundFetch.ts:57-59`). If the user later sets the interval back to a positive value, the watch fires — but `if (intervalHandle)` is now false (null), so `start()` is never called and the interval never restarts.

### Why it matters

Correctness bug: a user-facing setting behaves incorrectly. Settings → set background fetch to 0 (disable) → later set it back to 5 min → background `git fetch` (and the orphaned-worktree detection that runs after it) never resumes for the rest of the session; the user must relaunch the app.

### Acceptance Criteria

- [ ] The watch restarts fetching whenever the new interval is `> 0`, regardless of whether a handle currently exists (call `start()` unconditionally and let it no-op on `<= 0`).
- [ ] Setting interval to 0 then back to a positive value re-enables periodic fetch within the same session (no restart needed).
- [ ] A regression test covers the disable→re-enable transition.

---

## Implementation Spec

### Fix

`start()` is already idempotent — it calls `stop()` first and no-ops when the interval is `<= 0`. The watch callback's `if (intervalHandle)` guard is the only bug. Remove the guard:

```ts
watch(() => settings.value.backgroundFetchInterval, () => {
  start(); // start() clears any existing interval and no-ops when <= 0
})
```

One-line change at `useBackgroundFetch.ts:85-92`.

### Files

- `src/composables/useBackgroundFetch.ts` — drop the `if (intervalHandle)` guard around `start()`.

### Test plan

Regression test (Vitest) in `src/composables/__tests__/useBackgroundFetch.spec.ts` (create if absent), using `vi.useFakeTimers()` and a Pinia test store:

1. Set `backgroundFetchInterval = 5`, mount composable, call `start()`; advance timers 5 min → `fetchRepo` called.
2. Set interval to `0` → advance 5 min → no further `fetchRepo` calls (disabled).
3. Set interval back to `5` → advance 5 min → `fetchRepo` called again (proves re-enable within the session).

Mock `useWt().fetchRepo` and `useOrphanedDetection().detectOrphaned` as spies; assert call counts across the transitions. This test fails against the current `if (intervalHandle)` guard and passes after the fix.

PR: https://github.com/withoutfanfare/grove/pull/4

## TASK-3: Every WorktreeCard spawns a git subprocess on mount (repo-switch storm)
status: completed
labels: 

### Problem

Every `WorktreeCard` fires a `git` subprocess on mount, so switching to (or loading) a repository spawns up to ~one `git diff` per worktree simultaneously — plus a second `git` call for each dirty worktree.

### Where

`src/components/WorktreeCard.vue:83-93` (`getDiffStats` → `get_diff_stats`) and `:103-111` (`getDirtyDetails` → `get_dirty_details`), both in `onMounted`.

`Dashboard.vue` only switches to the virtual list at ≥50 worktrees; for the common 1–49 case it renders every card via `v-for`, so all cards mount at once. Result: up to ~49 concurrent `git diff` subprocesses (and up to ~98 including dirty-detail calls) on every repo switch / initial load.

### Why it matters

Performance (slow path / process fan-out): the single largest avoidable cost on the hot path. The subprocess storm spikes CPU and delays first meaningful paint of worktree status on every repo switch.

### Acceptance Criteria

- [ ] Per-worktree diff/dirty stats are no longer fetched with one uncoordinated subprocess per card on mount.
- [ ] Switching repositories no longer spawns O(n) concurrent `git` subprocesses for n worktrees.
- [ ] Displayed diff stats and dirty details remain correct after the change (including when a worktree's dirty state changes — cf. the existing `watch` at `WorktreeCard.vue:114`).
- [ ] Verified: measurable reduction in subprocesses/CPU on a repo with many worktrees.

---

## Implementation Spec

### Approach: bounded concurrency (smallest correct change)

Diff stats and dirty details are rendered in the collapsed status row, so lazy-on-expand would remove existing summary badges. Keep the summaries visible, but stop every card from spawning its own uncoordinated subprocess on mount.

1. Replace the per-card eager calls with a shared queue in the Dashboard/worktree store that fetches diff+dirty for the visible set with a small concurrency cap (e.g. 4).
2. Store results in a reactive `Map<path, stats>` that cards read instead of owning their own fetch lifecycle.
3. Keep the existing dirty-state correctness path, but route refreshes through the same capped queue so a dirty-state burst cannot spawn O(n) concurrent subprocesses.

### Files

- `src/components/WorktreeCard.vue` — read cached stats/details instead of launching its own mount-time subprocesses.
- `src/stores/worktrees.ts` or a small `useDiffStatsQueue` composable — shared capped fetch + cache.

### Verification

- Measure: on a repo with many worktrees, count `git` subprocesses during a repo switch before/after (e.g. `ps`/Activity Monitor, or a temporary log line in the Rust `get_diff_stats` handler). Expect O(n) concurrent calls → ≤ cap.
- Correctness: collapsed cards still show stats; make a worktree dirty → dirty details refresh via the capped queue; repeated renders do not duplicate subprocesses.

PR: https://github.com/withoutfanfare/grove/pull/5

## TASK-4: Command palette lacks dialog/listbox semantics and a focus trap
status: completed
labels: 

### Problem

The command palette (Cmd+K) — the app's primary keyboard surface — has no dialogue semantics, no focus trap, and no listbox/option roles, making it effectively unusable with a screen reader and leaking focus to the background UI.

### Where

`src/components/CommandPalette.vue:138-189`.

Unlike the other dialogues (which use the shared `SModal`), the palette is a bespoke `Teleport` overlay:
- The container (`:142`) has no `role="dialog"` / `aria-modal="true"`, and nothing traps focus, so Tab moves focus to the still-present background UI behind the overlay.
- The results (`:169-182`) are `<button>`s with no `role="listbox"` / `role="option"` and no `aria-activedescendant` / `aria-selected`, so a screen reader never announces the arrow-key-"selected" command.

(Escape and arrow keys already work for sighted keyboard users; this is specifically about assistive-tech exposure and focus containment.)

### Why it matters

Accessibility: the app's primary keyboard entry point is inaccessible to screen-reader users and leaks focus out of the modal. Grove already establishes the correct pattern elsewhere via `SModal`, so this is also a consistency gap.

### Acceptance Criteria

- [ ] Palette container exposes `role="dialog"` and `aria-modal="true"` (or is migrated onto the shared `SModal` focus-management primitive).
- [ ] Focus is trapped within the palette while open and restored to the prior element on close; Tab cannot reach background UI.
- [ ] Results use `role="listbox"` on the container and `role="option"` on items, with `aria-selected` on the active item and `aria-activedescendant` wired from the input so the highlighted command is announced.
- [ ] Existing keyboard behaviour (arrow navigation, Enter to run, Escape to close) is preserved.

---

## Implementation Spec

### Approach

Keep the bespoke `Teleport` overlay (migrating the combobox pattern into `SModal` is more disruptive than the ARIA additions warrant) and add the missing semantics + a focus trap directly. This is a template/attribute change plus a small focus-trap handler — no behaviour change to search/navigation logic.

1. **Dialogue semantics** — on `.palette-container` (`:142`): `role="dialog"`, `aria-modal="true"`, `aria-label="Command palette"`.
2. **Combobox/listbox wiring** — the input is the combobox controller, the results list is the listbox:
   - Input (`:149`): `role="combobox"`, `aria-expanded="true"`, `aria-controls="palette-listbox"`, `:aria-activedescendant` bound to the selected item's id (or omitted when none/empty).
   - Results container (`:162`): `id="palette-listbox"`, `role="listbox"`.
   - Group headers (`:168`): give each group `role="group"` with `aria-label`, OR keep as visual-only and set `role="presentation"` so they don't break listbox child semantics.
   - Each item (`:169`): `role="option"`, a stable `:id="`palette-opt-${getFlatIndex(gi, ci)}`"`, `:aria-selected="getFlatIndex(gi, ci) === selectedIndex"`. Keep them as `<button>` or switch to `<div role="option">`; either works as long as `aria-selected` and the id are present.
3. **Focus trap + restore**:
   - On open: capture `document.activeElement` as `previouslyFocused`; focus the input (already done via `inputRef` — confirm).
   - Trap: on `keydown` Tab/Shift+Tab within `.palette-container`, since the input is the only tabbable control, `preventDefault()` to keep focus on the input (arrow keys already drive option selection). This is sufficient — no roving tabindex needed because selection is `aria-activedescendant`-based.
   - On close: restore focus to `previouslyFocused` (guard for null / element removed).
4. Preserve all existing handlers (`handleKeydown` arrow/Enter/Escape, `@mousedown.self` close, `@mouseenter` selection sync).

### Files

- `src/components/CommandPalette.vue` — template ARIA attributes, `id` generation for options, and a small open/close focus-capture+restore + Tab-trap in the existing keydown handling. Add a `previouslyFocused` ref and open/close watchers if not already present.

### Verification

- Screen reader (VoiceOver on macOS): open palette, arrow through commands → each highlighted command is announced via `aria-activedescendant`/`aria-selected`.
- Tab/Shift+Tab while open never moves focus to background UI.
- Close (Escape / run / click-away) returns focus to the element that was focused before opening.
- Existing behaviour unchanged: arrow navigation, Enter runs, Escape closes, mouse hover selects.
- Add a Vitest DOM test asserting `role="dialog"`/`aria-modal` on the container, `role="listbox"` on results, `role="option"` + `aria-selected` on the active item, and `aria-activedescendant` on the input matching the selected option id.

PR: https://github.com/withoutfanfare/grove/pull/6

## TASK-5: Beta release-channel setting is a no-op (never wired to updater)
status: completed
labels: 

### Problem

The Beta release-channel setting is a no-op: it is persisted and shown in the UI, but never wired to the updater, so beta users always check/install from the default (stable) endpoint.

### Where

`src/composables/useUpdater.ts:55,85` and `src-tauri/src/updater.rs`.

`Settings.releaseChannel` ('stable' | 'beta') is persisted (`stores/settings.ts`) and exposed in Settings (`SettingsPanel.vue:344`), but `checkForUpdate` / `downloadAndInstall` call the plugin's `check()` with **no arguments** and never read `settings.releaseChannel`. The Rust side (`updater.rs`) uses the single static endpoint configured in `tauri.conf.json`. The `@tauri-apps/plugin-updater` `check()` resolves against compile-time endpoints, so there is no runtime channel switch today.

### Why it matters

Correctness / user-facing defect: a persisted, UI-exposed setting silently does nothing. A user who selects "Beta" to get early releases still only ever receives stable builds, with no feedback that the choice had no effect.

### Acceptance Criteria

- [ ] Either: the selected release channel is actually applied to update checks/installs, **or** — if the updater infrastructure cannot support a runtime channel switch — the setting is removed from the UI/store so it no longer misleads users.
- [ ] Whichever path is chosen, the UI accurately reflects behaviour (no dead toggle).
- [ ] If wired: verified that selecting Beta causes update checks to target the beta channel; selecting Stable targets stable.

---

## Implementation Spec

### Current state (confirmed)

- `tauri.conf.json` configures a **single** endpoint: `https://grove-updates.stuntrocket.dev/{{target}}/{{arch}}/{{current_version}}`. No beta endpoint exists.
- There is an **unused** Rust command `check_for_update` in `updater.rs` whose doc-comment already anticipates channel switching — but the frontend bypasses it and calls the JS plugin `check()` directly (`useUpdater.ts:55,85`), so it plays no part today.
- Tauri v2's JS `check()` accepts `{ headers }` but **not** runtime endpoints. Runtime endpoint override requires the Rust side (`app.updater_builder().endpoints(vec![...]).build()`).

### Decision required (implementer confirms before coding)

The honest gate is **does a beta update channel actually exist server-side?** (i.e. does `grove-updates.stuntrocket.dev` serve a distinct beta feed, or would a `channel` path/header route to one?).

**Path A — infra does NOT support beta (default assumption):** Remove the dead toggle.
- Delete the release-channel control from `SettingsPanel.vue` (~:344).
- Remove `releaseChannel` from `stores/settings.ts` (field, default, persistence, migration/`assign`).
- Update the `Settings` type. Remove the "release channel support" wording from `useUpdater.ts` and `updater.rs` doc-comments.
- This satisfies "no dead toggle" with the smallest, most honest change. **Recommended unless a beta feed is confirmed.**

**Path B — infra DOES support beta:** Wire it through the Rust command with runtime endpoints.
- Change `check_for_update` (and add a download/install counterpart) in `updater.rs` to accept a `channel: String` arg and build the updater with a channel-specific endpoint via `app.updater_builder().endpoints(...)` — stable → existing URL, beta → the beta feed URL (add a `{{channel}}`-style segment, e.g. `.../beta/{{target}}/...`).
- Repoint `useUpdater.ts` `checkForUpdate` / `downloadAndInstall` to `invoke('check_for_update', { channel: settings.releaseChannel })` instead of the JS plugin `check()`, and drive `downloadAndInstall` through a Rust command too (the JS plugin's `update.downloadAndInstall` can't be fed the runtime endpoint). Confirm the plugin's install path is reachable from the Rust `Update` handle.
- Keep the setting; ensure signature verification (`pubkey`) still applies to the beta feed.

### Files

- Path A: `src/components/SettingsPanel.vue`, `src/stores/settings.ts`, `src/types/*` (Settings type), doc-comment cleanup in `useUpdater.ts` + `updater.rs`.
- Path B: `src-tauri/src/updater.rs`, `src/composables/useUpdater.ts`, `tauri.conf.json` (beta endpoint), `src-tauri/src/lib.rs` (register any new command).

### Verification

- Path A: grep confirms `releaseChannel` has zero references after removal; Settings no longer shows the toggle; `npm run build` + `cargo check` pass.
- Path B: with a beta feed available, selecting Beta makes the check hit the beta URL (observe via server logs or a temporary log line in `check_for_update`); selecting Stable hits stable; an available beta update installs and the signature verifies.

### Recommendation

Default to **Path A** (remove the toggle) unless the maintainer confirms a beta update feed exists — it is the lazier, more honest fix and removes the misleading UI immediately. Escalate the "does a beta feed exist?" question at review if unknown.

PR: https://github.com/withoutfanfare/grove/pull/7
