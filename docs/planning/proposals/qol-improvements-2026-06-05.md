# Quality-of-Life Improvements — Implementation Plan — 2026-06-05

This plan is the curated, delivery-ready output of Grove's quality-of-life initiative. It was produced by a structured funnel: a six-lens brainstorm (UX Friction, UI Polish, Performance, Power User, Awareness, Integration) generated **48 raw ideas**; those were de-duplicated and merged into **18 curated candidates**; a **three-judge panel** (a frequency-of-use lens, an implementation-feasibility lens, and an effort-versus-payoff lens) scored each candidate out of 30; the **top 10** by total score are detailed below for build. The full unfiltered set is archived in the sibling backlog so nothing is lost — see [`qol-ideas-backlog-2026-06-05.md`](qol-ideas-backlog-2026-06-05.md).

A recurring theme across the top ranks: Grove already contains a great deal of *built-but-unwired* capability — registered shortcuts with no handlers, an emitted global event with zero listeners, a registered tray-refresh command with no caller, a live cache that is never read. Several of the highest-value items are therefore pure wiring of dead code rather than new features.

---

## Summary

| Rank | Title | Category | Effort | Score /30 |
|---|---|---|---|---|
| 1 | Wire dead global shortcuts (⌘T/⌘B/copy/⌘Enter) and stop them swallowing native keystrokes | UX | S | 27 |
| 2 | Wire the global ⌘⇧W quick-switcher to open the command palette | Feature | S | 25 |
| 3 | Persist user-selected/focused worktree so keyboard and palette actions always have a target | UX | M | 24 |
| 4 | Stale-while-revalidate: render cached worktrees instantly on repo switch | Performance | M | 24 |
| 5 | Auto-focus and scroll to the newly created worktree on modal close | UX | S | 24 |
| 6 | Persist worktree filter and sort across repo switches and restarts | UX | S | 24 |
| 7 | Auto-refresh the system tray menu after mutating worktree operations | Feature | S | 24 |
| 8 | Broaden worktree search to match path and note, not just branch name | UX | S | 23 |
| 9 | Colour-code diff-stat insertions and deletions in the worktree card badge | UI | S | 22 |
| 10 | Add live count chips to the filter segmented control | UI | S | 21 |

---

## 1. Wire dead global shortcuts (⌘T/⌘B/copy/⌘Enter) and stop them swallowing native keystrokes

- **Category:** UX · **Effort:** S · **Score:** 27/30

### Summary

Dashboard's `useKeyboardShortcuts` call passes only a handful of handlers, so the registered ⌘T/⌘B/⌘C-variants/⌘Enter shortcuts do nothing — yet `registerShortcut` calls `preventDefault`/`stopPropagation` before the (undefined) action, so native ⌘C silently copies nothing whenever no input is focused. The fix passes the already-existing palette handlers into the Dashboard call and adds a per-shortcut `enabled()` guard checked *before* `preventDefault`, so when no worktree is focused these shortcuts are skipped entirely and native keystrokes pass through. Result: the four shortcut groups work against the focused worktree, and native copy is no longer intercepted.

### Files to touch

- `src/composables/useKeyboardShortcuts.ts` — add optional `enabled?: () => boolean` to `ShortcutDefinition`, evaluate it before `preventDefault` in `registerShortcut`; add `onHasFocusedWorktree?: () => boolean` to `KeyboardShortcutHandlers` and gate the terminal/browser/copy/open-all shortcuts on it.
- `src/components/Dashboard.vue` — pass `onOpenTerminal`/`onOpenBrowser`/`onCopyPath`/`onCopyBranch`/`onCopyUrl`/`onCopyCdCommand`/`onOpenAll` and `onHasFocusedWorktree` into the `useKeyboardShortcuts` call (reusing existing `handlePalette*` and `copyFocusedWorktreeValue` handlers).
- `src/composables/useKeyboardShortcuts.test.ts` — new Vitest file asserting the guarded shortcuts no longer `preventDefault` when no worktree is focused, and do fire + `preventDefault` when one is.

### Implementation steps

1. In `src/composables/useKeyboardShortcuts.ts`, extend `ShortcutDefinition` (lines 62-74) with an optional predicate: `/** Optional guard: when it returns false the shortcut is skipped entirely (no preventDefault) */ enabled?: () => boolean`.
2. In `registerShortcut`'s handler (lines 126-161), insert the guard check **after** the key-match check at line 148 but **before** `event.preventDefault()` at line 151: `if (definition.enabled && !definition.enabled()) return`. This is the load-bearing change — it ensures that when no worktree is focused the shortcut neither fires nor swallows the native keystroke.
3. In `KeyboardShortcutHandlers` (lines 79-104), add `onHasFocusedWorktree?: () => boolean` (a focus-state probe, not an action). Keep it optional so existing callers/tests are unaffected.
4. Gate the four shortcut groups on focus. For the ⌘T terminal shortcut (lines 212-217) and ⌘B browser shortcut (218-223), add `enabled: () => handlers.onHasFocusedWorktree?.() ?? false`. Add the same `enabled` to each entry in `copyShortcuts` (lines 251-284) and to `openAllShortcut` (lines 287-294). Do **not** gate ⌘R/⌘N/⌘O/etc. — only the worktree-targeted shortcuts. `allowInInput` is unset on these, so the existing `isInputFocused()` guard (line 130) still lets native ⌘C work inside text inputs; the `enabled()` guard only matters when no input is focused.
5. In `src/components/Dashboard.vue`, update the `useKeyboardShortcuts` call (lines 706-724). Add, reusing handlers that already exist in the file: `onOpenTerminal: () => { void handlePaletteOpenInTerminal() }` (defined at line 601), `onOpenBrowser: () => { void handlePaletteOpenInBrowser() }` (line 610), `onOpenAll: () => { void handlePaletteOpenAll() }` (line 624).
6. Add the four copy handlers to the same call, copying the exact bodies already used in the `useCommandRegistry` block (lines 664-692): `onCopyPath` → `copyFocusedWorktreeValue((wt) => wt.path, copyPath, 'Copied path to clipboard')`; `onCopyBranch` → `(wt) => wt.branch, copyBranch, 'Copied branch name to clipboard'`; `onCopyUrl` → `(wt) => wt.url ?? null, copyUrl, 'Copied URL to clipboard', 'No URL available for this worktree'`; `onCopyCdCommand` → `(wt) => wt.path, copyCdCommand, 'Copied cd command to clipboard'`. (British English already in those strings — keep verbatim.)
7. Add the focus probe to the same call: `onHasFocusedWorktree: () => getFocusedWorktree() !== null` (`getFocusedWorktree` defined at line 563). This wires the `enabled()` guard to actual focus state.
8. Create `src/composables/useKeyboardShortcuts.test.ts` using `@vue/test-utils` mount (pattern from `src/components/CommandPalette.test.ts`) since `useKeyboardShortcuts` auto-runs in `onMounted`. Mount a trivial inline component whose `setup` calls `useKeyboardShortcuts` with spy handlers. **Test A:** with `onHasFocusedWorktree` returning false, dispatch a ⌘C keydown (`new KeyboardEvent('keydown', { key: 'c', metaKey: true, cancelable: true })`) on `window` with capture; assert the handler spy was NOT called and `event.defaultPrevented === false` (native copy preserved). **Test B:** with `onHasFocusedWorktree` returning true, dispatch the same event and assert `onCopyPath` was called and `defaultPrevented === true`. Add an equivalent pair for ⌘T (key `t`, `onOpenTerminal`) and ⌘Enter (key `Enter`, `onOpenAll`). Ensure `document.activeElement` is `body` (no input focused) so `isInputFocused()` is false.
9. Run `npx vitest run src/composables/useKeyboardShortcuts.test.ts`, then `npx vitest run` for the full suite and `npm run build` for the type check.

### Risks

- The `enabled()` guard must be placed before `preventDefault` (after the key match). If placed after, native ⌘C is still swallowed — defeating the main point. The test asserting `defaultPrevented === false` guards against this regression.
- ⌘Enter (`openAllShortcut`) and Enter in `navigationShortcuts` (line 317, `requiresModifier:false`) both bind `Enter`; they do not collide because the modifier check at lines 133-137 differentiates them. Gating openAll on focus is safe and does not affect plain Enter selection.
- Gating must apply **only** to the worktree-targeted shortcuts. Accidentally gating ⌘R/⌘N on focus would break refresh/create when no worktree is selected. Restrict the `enabled` additions to lines 212-223, 251-294.
- ⇧⌘D copies the cd command (key `d`, lines 277-283); gate it too — it requires a focused worktree to mean anything, so gating is consistent and low-risk.
- `useKeyboardShortcuts` registers on `window` in capture phase; the test must add/dispatch on `window` (not a wrapper element) and clean up by unmounting so the `onUnmounted` cleanup removes listeners and tests do not leak between cases.

### Verification

Automated: new `src/composables/useKeyboardShortcuts.test.ts` with two assertions per shortcut group (terminal/copy/open-all) — (1) no-focus: handler not called AND `event.defaultPrevented === false`; (2) focus: handler called AND `defaultPrevented === true`. Run `npx vitest run src/composables/useKeyboardShortcuts.test.ts`, then full `npx vitest run` (existing 245+ tests must stay green) and `npm run build` (vue-tsc type check). Manual in `npm run tauri dev`: with a repo selected but no worktree focused, press ⌘C in the worktree list area (no input focused) and confirm the OS clipboard is untouched (not silently cleared); then focus a worktree (arrow keys) and verify ⌘C copies the path, ⇧⌘C the branch, ⌥⌘C the URL, ⌘T opens terminal, ⌘B opens browser, ⌘Enter opens all. Confirm ⌘C inside the search input still performs native copy.

---

## 2. Wire the global ⌘⇧W quick-switcher to open the command palette

- **Category:** Feature · **Effort:** S · **Score:** 25/30

### Summary

The backend registers a system-wide `CmdOrCtrl+Shift+W` shortcut that raises the window and emits a `global_shortcut_quick_switch` event (`src-tauri/src/lib.rs:213`), but there are zero frontend listeners, so the shortcut currently only raises the window and nothing opens. Add a `listen('global_shortcut_quick_switch')` that opens the command palette, reviving a feature that `HelpModal` already advertises. This gives daily drivers a true cross-app jump-in: press the shortcut from any app and land directly in the worktree command palette.

### Files to touch

- `src/components/Dashboard.vue` — add a `listen('global_shortcut_quick_switch')` in the existing `onMounted` that opens `showCommandPalette`, and clean it up in `onUnmounted`.
- `src/components/Dashboard.vue` (test) — assert the listener opens the palette only if a Dashboard-level test harness is practical, otherwise rely on manual verification.

### Implementation steps

1. Open `src/components/Dashboard.vue`. Confirm the local palette state: `const showCommandPalette = ref(false)` (line ~556) and `function toggleCommandPalette()` (line ~558), and that `import { onMounted, onUnmounted, watch, ref, computed } from 'vue'` is already present (line 8).
2. Add the Tauri event import at the top of the `<script setup>` imports: `import { listen, type UnlistenFn } from '@tauri-apps/api/event'` (mirror the import already used in `src/App.vue:3`).
3. Declare a module-scoped unlisten holder near the other top-level refs: `let unlistenQuickSwitch: UnlistenFn | null = null`.
4. Inside the existing `onMounted(async () => { ... })` block (starts line ~179), after the existing setup calls, register the listener. **Open** the palette rather than toggle it so repeated presses reliably show it; wrap in try/catch matching App.vue's tray-listener style:

   ```ts
   try {
     unlistenQuickSwitch = await listen('global_shortcut_quick_switch', () => {
       showCommandPalette.value = true
     })
   } catch (e) {
     console.error('[Dashboard] Failed to set up quick-switch listener:', e)
   }
   ```
5. In the existing `onUnmounted(() => { ... })` block (starts line ~197), add cleanup alongside the other teardown calls: `if (unlistenQuickSwitch) { unlistenQuickSwitch(); unlistenQuickSwitch = null }`.
6. Do **not** modify `src-tauri/src/lib.rs` — the emit at line 213 is already correct. Do **not** change `HelpModal.vue` line 54; it already advertises the shortcut.
7. Verify no toggle-vs-open regression: `closeAllModals()` (line ~527) and the `@close` handler on `<CommandPalette>` (line ~1069) already set `showCommandPalette` to false, so Escape still closes it normally.
8. Run `npx vitest run` and `npm run build`. Run `cd src-tauri && cargo check` to confirm the backend is untouched and still compiles.

### Risks

- **Placement correction:** the candidate said put the listener in `App.vue`, but `showCommandPalette`/`toggleCommandPalette` are private to `Dashboard.vue`. Putting it in App.vue would require extra plumbing (`defineExpose` + template ref, or a shared store flag). `Dashboard.vue` is the minimal, correct home — it owns the state, already has `onMounted`/`onUnmounted`, and only mounts after the loading screen completes.
- **Open vs toggle:** the candidate references `toggleCommandPalette`, but a global shortcut that toggles would close an already-open palette on a second press. Setting `showCommandPalette = true` is the more predictable cross-app behaviour. Flag for reviewer sign-off if they specifically want toggle semantics.
- **Pre-existing label inconsistency (out of scope):** the binding is `CmdOrCtrl+Shift+W` (resolves to ⌘⇧W on macOS) but `HelpModal.vue:54` shows the ⌃ (Ctrl) glyph as `['⌃','⇧','W']`. Mention to the user but do not fix unless asked.
- Testing `Dashboard.vue` directly is heavy (many composable/store dependencies, file watchers, auto-refresh). If a focused unit test proves disproportionate for an S change, use the existing global `mockTauriListen` mock (`src/test/setup.ts`) for a lightweight assertion or fall back to manual verification.

### Verification

Manual: run `npm run tauri dev`, switch focus to another app, press ⌘⇧W — Grove should raise to front AND the command palette should open. Press Escape — palette closes; window stays. Press the shortcut again — palette opens again (confirms open-not-toggle). Automated: `npx vitest run` (existing 245+ tests stay green). The global `listen` mock lives at `src/test/setup.ts` (exported `mockTauriListen`) if you add a targeted test asserting Dashboard registers the `global_shortcut_quick_switch` listener and that invoking its callback sets the palette open. `npm run build` for TypeScript, and `cd src-tauri && cargo check` to confirm the Rust side is unchanged.

---

## 3. Persist user-selected/focused worktree so keyboard and palette actions always have a target

- **Category:** UX · **Effort:** M · **Score:** 24/30

### Summary

Today a worktree card click only toggles its details panel; `focusedBranch` (the target for per-worktree shortcuts and the worktree half of the command palette) is set only by tray/Recent navigation and auto-cleared after 3s by Dashboard's scroll watcher. This makes clicking set `focusedBranch` persistently (and adds optional arrow-key list navigation), while preserving the existing transient "pulse-and-clear" highlight for tray/Recent entry points. The payoff is that the entire already-built shortcut/palette surface becomes usable from the primary daily interaction (clicking a card) instead of being silently dead.

> **Dependency:** This item is foundational for the whole worktree-targeted shortcut surface. Item 1 (gated shortcuts) and item 5 (auto-focus on create) both target `focusedBranch`; this item makes click set it persistently. Ship after item 1 so the gated shortcuts have a reliable persistent target.

### Files to touch

- `src/stores/worktrees.ts` — add a `focusTransient` ref and a `transient` param to `focusWorktree()` so the store records whether the current focus should auto-clear.
- `src/components/Dashboard.vue` — gate the 3s `clearFocusedWorktree()` in `scrollToFocusedWorktree()` on `focusTransient`; add a `handleSelectWorktree(branch)` that calls `store.focusWorktree(branch)` (non-transient); add optional worktree arrow-nav handlers.
- `src/components/WorktreeCard.vue` — add a `select` emit, emit it from the main content-row click/Enter/Space alongside `toggleDetails`.
- `src/App.vue` — pass `transient: true` when focusing from the tray (lines 27 and 55).
- `src/components/RepoList.vue` — pass `transient: true` when navigating to a Recent worktree (line 249).
- `src/components/VirtualWorktreeList.vue` — forward the new `select` event to keep the virtual-scroll path at parity.
- `src/stores/worktrees.test.ts` — add tests for the `transient` flag default/explicit behaviour.
- `src/components/WorktreeCard.test.ts` — new test asserting a card content-row click emits `select` with the branch and still toggles details.

### Implementation steps

1. In `src/stores/worktrees.ts`: add `const focusTransient = ref(false)` near `expandOnFocus` (line ~21). Change the signature to `function focusWorktree(branch: string, shouldExpandDetails = false, transient = false)` and inside set `focusedBranch.value = branch; expandOnFocus.value = shouldExpandDetails; focusTransient.value = transient`. In `reset()` (line ~150) also set `focusTransient.value = false`. Export `focusTransient` (state block, near line 175). No default-behaviour change for existing callers because `transient` defaults to false.
2. In `src/components/Dashboard.vue`: add `focusTransient` to the `storeToRefs(store)` destructure (lines 45-54). In `scrollToFocusedWorktree()` (lines 286-302), wrap only the auto-clear so it runs solely for transient focus: replace `setTimeout(() => store.clearFocusedWorktree(), 3000)` (line 294) with `if (focusTransient.value) { setTimeout(() => store.clearFocusedWorktree(), 3000) }`. Leave the `clearExpandOnFocus()` at 500ms unchanged.
3. In `src/components/WorktreeCard.vue`: extend the emits (lines 31-33) to `const emit = defineEmits<{ delete: [worktree: Worktree]; select: [branch: string] }>()`. Add a handler near `toggleDetails` (line 137): `function handleSelect() { emit('select', props.worktree.branch); toggleDetails() }`. Change the main content-row bindings (line 365) from `@click="toggleDetails" @keydown.enter.prevent="toggleDetails" @keydown.space.prevent="toggleDetails"` to call `handleSelect` instead. Leave the Dropdown 'Show/Hide Details' item (line 503) calling `toggleDetails` directly.
4. In `src/components/Dashboard.vue`: add `function handleSelectWorktree(branch: string) { store.focusWorktree(branch) }` (non-transient). Wire it on both card render paths: the non-virtual `<WorktreeCard>` (lines 1038-1042) and `<VirtualWorktreeList>` (lines 1031-1033) both get `@select="handleSelectWorktree"`.
5. In `src/components/VirtualWorktreeList.vue`: forward the select event — add `select: [branch: string]` to its `defineEmits`, and on the inner `<WorktreeCard>` (line ~114) add `@select="(b) => emit('select', b)"`.
6. In `src/App.vue`: change the tray focus calls to transient. Line 27: `store.focusWorktree(pendingTrayFocus.value, false, true)`. Line 55: `store.focusWorktree(branch, false, true)`. This preserves the existing 3s auto-clear pulse for tray selections.
7. In `src/components/RepoList.vue` line 249: change `store.focusWorktree(branch, true)` to `store.focusWorktree(branch, true, true)` so Recent navigation keeps its expand-and-pulse-then-clear behaviour.
8. **Arrow-key worktree navigation (the delicate part):** RepoList already registers a global capture-phase ArrowUp/ArrowDown listener via its own `useKeyboardShortcuts`, and each `useKeyboardShortcuts` call adds an independent `window` listener (`useKeyboardShortcuts.ts:163`), so a second Dashboard arrow registration would fire simultaneously. To avoid both lists moving on one keypress, **prefer J/K (non-modifier) for worktree nav** to fully avoid the RepoList collision — this keeps the slice self-contained and conflict-free. In Dashboard create `const worktreeNav = useListNavigation(() => filteredWorktrees.value)` and register handlers in the existing Dashboard `useKeyboardShortcuts` call that (a) no-op when `isInputFocused()` and (b) on each move call `store.focusWorktree(worktreeNav.getCurrentItem()!.branch)`. Document J/K in `HelpModal.vue`.
9. Sync the `worktreeNav` focus index when focus changes from other sources (click/tray) so arrow-nav resumes from the visible selection: add `watch(focusedBranch, (b) => { const i = filteredWorktrees.value.findIndex(w => w.branch === b); if (i !== -1) worktreeNav.selectIndex(i) })` in Dashboard (mirrors `RepoList.vue:138-145`).
10. Document the new shortcuts: add the J/K 'Select previous/next worktree' rows to `src/components/HelpModal.vue` in British English.
11. Frontend-only change. Run `npm run build` (vue-tsc), `npx vitest run src/stores/worktrees.test.ts src/components/WorktreeCard.test.ts`, then `npm run tauri dev` and manually confirm: clicking a card sets the focus ring persistently (no 3s clear), ⌘O/⌘T/⌘B and the command palette act on the clicked worktree, and tray/Recent navigation still pulses-and-clears after 3s.

### Risks

- **Arrow-key collision:** RepoList's global ArrowUp/ArrowDown handler and any Dashboard arrow handler both fire on the same keypress because each `useKeyboardShortcuts` call adds its own capture-phase window listener — picking J/K (recommended) sidesteps this entirely; using arrows means both repo list and worktree list move together.
- The single shared `scrollToFocusedWorktree` watcher (`Dashboard.vue:305-309`) now also runs for click-driven focus, so every card click triggers `scrollIntoView({behavior:'smooth'})`. For an already-visible clicked card this is a near-noop but could feel like a slight nudge; if undesirable, guard the scroll to only run for transient focus too.
- `handleSelect` in WorktreeCard still toggles details on click as before — selection is additive, so clicking an expanded card both keeps focus and collapses it; this matches current click behaviour and is intended.
- Tray flow in App.vue clears then re-focuses inside `requestAnimationFrame` (lines 53-55) specifically so the watcher refires; passing the new `transient` arg must keep that ordering. The `if (focusTransient.value)` guard plus the existing `focusedBranch.value !== branch` stale check at line 288 keep this safe.
- Mirroring the select event through `VirtualWorktreeList` is required or the virtual-scroll path (50+ worktrees) would silently not set focus on click — easy to miss since most dev repos have fewer than 50 worktrees.

### Verification

Frontend-only, no Rust/Tauri command changes. Unit: extend `src/stores/worktrees.test.ts` (focus block at lines 240-271) to assert `focusWorktree(branch)` leaves `focusTransient` false and `focusWorktree(branch, false, true)` sets it true, and that `reset()` clears it. Component: add `src/components/WorktreeCard.test.ts` mounting the card and asserting a click on the main content row emits `select` with the branch and still toggles the details panel (follow the mount/stub conventions in `src/components/RepoList.test.ts` and `CommandPalette.test.ts`). Type/lint: `npm run build` (vue-tsc). Run suites: `npx vitest run`. Manual (`npm run tauri dev`): (1) click a card — focus ring persists indefinitely and ⌘O/T/B plus the command palette act on it; (2) trigger a worktree from the tray and from the Recent tab — highlight pulses and clears after ~3s as before; (3) J/K moves the persistent worktree focus and is listed in the Help modal.

---

## 4. Stale-while-revalidate: render cached worktrees instantly on repo switch

- **Category:** Performance · **Effort:** M · **Score:** 24/30

### Summary

When switching to a repo whose worktrees are already cached, paint the cached list immediately with no skeleton, then silently revalidate via the `wt` CLI in the background and reconcile. Uncached repos keep the current skeleton behaviour. This removes the skeleton flash and CLI re-spawn on nearly every repo switch, the most frequent action in Grove. The cache primitives (`isRepoLoaded`, `getCachedWorktrees`) already exist but are currently dead.

### Files to touch

- `src/stores/worktrees.ts` — make `selectRepository` cache-aware: if `isRepoLoaded(name)`, paint `getCachedWorktrees(name)` and skip `loading=true`; otherwise keep the blank+loading path.
- `src/composables/useWorktrees.ts` — add a silent revalidation mode to `fetchWorktreesInternal` that does not toggle `loadingWorktrees`, preserving the `fetchId` race-guard and `selectedRepoName` checks; expose `fetchWorktrees(opts)` for the watcher.
- `src/components/Dashboard.vue` — switch watcher (lines 251-272) passes `silent:true` when `store.isRepoLoaded(newName)`.
- `src/components/RepoList.vue` — `handleSelectRepo` (line 182) and `handleNavigateToRecent` (line 243) pass the same silent flag for cached repos.
- `src/App.vue` — tray-switch focus (watcher at line 25) must still apply `pendingTrayFocus` when the switched-to repo is cached and never enters loading.
- `src/stores/worktrees.test.ts` — update `selectRepository` tests (lines 105-126) to assert cached vs uncached behaviour.
- `src/composables/useWorktrees.test.ts` — add a test that silent fetch never sets `loadingWorktrees` but still reconciles via `setWorktrees`.

### Implementation steps

1. **Store:** change `selectRepository` (lines 90-101). Inside the `if (repositories.value.some(...))` block, set `selectedRepoName`, clear `focusedBranch`, persist as today. Then branch on cache: `if (isRepoLoaded(name)) { worktrees.value = getCachedWorktrees(name); loadingWorktrees.value = false } else { worktrees.value = []; loadingWorktrees.value = true }`. This makes the dead cache primitives (`isRepoLoaded:79`, `getCachedWorktrees:86`) live. They are already declared before `selectRepository` so no reordering needed.
2. **Composable:** in `src/composables/useWorktrees.ts` add an options arg. Change `fetchWorktreesInternal(repoName: string)` to `fetchWorktreesInternal(repoName: string, opts?: { silent?: boolean })`. Keep the `fetchId` allocation (lines 95-96) and `clearError` (line 99) unchanged. Guard the loading toggle: replace line 98 `store.setLoadingWorktrees(true)` with `if (!opts?.silent) store.setLoadingWorktrees(true)`. In the `finally` (lines 154-159), only clear loading when not silent AND still the active fetch: `if (!opts?.silent && expectedFetchId.get(repoName) === fetchId) store.setLoadingWorktrees(false)`. Leave both `setWorktrees` reconciliation paths (lines 119, 139) and the two stale-fetchId/`selectedRepoName` guards (lines 108-117, 129-137) exactly as-is.
3. **Composable:** thread the option through the public API. Change `fetchWorktrees()` (line 165) to `fetchWorktrees(opts?: { silent?: boolean })` and pass opts to `fetchWorktreesInternal` at line 170. The returned object already exposes `fetchWorktrees` (line 537).
4. **Dashboard watcher:** in `src/components/Dashboard.vue` (lines 251-272), after `await stopWatching()` and `const currentFetch = ++fetchCounter.value`, replace `await fetchWorktrees()` (line 259) with `const wasCached = store.isRepoLoaded(newName); await fetchWorktrees({ silent: wasCached })`. Keep the existing H2 stale-fetch guards at lines 261 and 265 unchanged. Because `selectRepository` (step 1) already painted cached worktrees synchronously, the skeleton never shows for cached repos.
5. **RepoList:** in `handleSelectRepo` (line 182), capture cache state before selecting — `const wasCached = store.isRepoLoaded(name)` — and pass `{ silent: wasCached }` to `fetchWorktrees` in the `Promise.race` at line 197. Do the same in `handleNavigateToRecent` (lines 241-246): compute `wasCached` before `selectRepository(repoName)`, pass it to `await fetchWorktrees(...)` at line 245. Leave the timeout/error handling intact.
6. **App.vue tray focus:** the watcher at `src/App.vue:25` applies `pendingTrayFocus` on the `loadingWorktrees` true→false edge. For a cached tray switch that edge no longer fires, so fix at the source in `onMounted`'s tray handler (lines 57-62): in the different-repo branch, after `store.selectRepository(repo)`, check cache — if `store.isRepoLoaded(repo)` focus immediately on the next frame: `requestAnimationFrame(() => store.focusWorktree(branch))` and do NOT set `pendingTrayFocus`. Only set `pendingTrayFocus.value = branch` for the uncached case.
7. Update store tests in `src/stores/worktrees.test.ts`. Keep the existing 'should clear worktrees when selecting' (lines 105-116) and 'should set loadingWorktrees when selecting' (lines 118-126) as the uncached path; make the uncached precondition explicit. Add two new cases: (a) selecting a previously-loaded repo paints cached worktrees and leaves `loadingWorktrees` false; (b) selecting a never-loaded repo still blanks and sets loading true.
8. Add a composable test in `src/composables/useWorktrees.test.ts`: mock `useWt.getWorktreeStatus` to resolve a list, call `fetchWorktrees({ silent: true })` with a selected repo, and assert `setLoadingWorktrees` was never called with `true` during the call while `setWorktrees` was still called with the resolved list.
9. Run `npx vitest run src/stores/worktrees.test.ts src/composables/useWorktrees.test.ts` and `npm run build`. Manually run `npm run tauri dev`: select repo A (skeleton, fetch), select repo B (skeleton, fetch), then switch back to A — A should render instantly with no skeleton, and a background refresh should reconcile any status changes without a flash. Confirm tray quick-access to a worktree in a cached repo still scrolls/focuses it.

### Risks

- **Race-guard interaction:** silent revalidation must still honour the existing `fetchId` guard (lines 108-117/129-137) and the `selectedRepoName` check so a slow background fetch for repo A cannot overwrite worktrees after the user has switched to B. The plan reuses those guards unchanged — do not bypass them.
- **App.vue tray focus regression:** the focus watcher depends on the `loadingWorktrees` true→false transition, which no longer occurs for cached switches. Step 6 must move focus application into the tray handler for the cached case, or tray quick-access into a cached repo will silently fail to scroll/expand.
- **Stale data window:** cached worktrees may briefly show outdated dirty/ahead/behind status until the background fetch reconciles. This is the intended trade-off; the background fetch uses the same `wt` CLI path so data converges within one round-trip. No error toast should be shown for background-fetch failures on cached repos.
- Existing store tests at lines 105-126 assert the old always-blank/always-loading contract and will fail unless updated; they encode behaviour we are deliberately changing.
- **Crossfade transition:** `contentKey` (Dashboard line 113-117) returns `'loading'` only when `loadingWorktrees` is true. With cached switches it goes straight to `repo-${name}`, so the out-in crossfade transitions list→list. Confirm no visual glitch; no new animation durations are introduced (no `styles.css` change).

### Verification

Unit: `npx vitest run src/stores/worktrees.test.ts src/composables/useWorktrees.test.ts` — new cached-vs-uncached `selectRepository` cases pass, and the silent-fetch case proves `loadingWorktrees` stays false while `setWorktrees` reconciles. Types: `npm run build` (vue-tsc) clean. Manual in `npm run tauri dev`: first visit to a repo shows skeleton + CLI fetch; returning to a previously-viewed repo renders the cached list instantly with no skeleton, then reconciles silently; rapid A→B→A switching never leaks stale data (fetchId guard); tray quick-access into a cached repo still focuses/scrolls the chosen worktree.

---

## 5. Auto-focus and scroll to the newly created worktree on modal close

- **Category:** UX · **Effort:** S · **Score:** 24/30

### Summary

`CreateWorktreeModal` already emits `created` on success, but Dashboard binds only `@close` (line 1056), so the new worktree is left collapsed, unscrolled and unfocused. This wires the modal's `created` event to carry the new branch name and makes Dashboard focus, scroll to and expand that worktree when the modal closes — reusing the existing `store.focusWorktree`/`scrollToFocusedWorktree` machinery so it matches the Recent-tab behaviour. The payoff is no more hunting for the worktree you just made.

> **Dependency:** Reuses the same `focusWorktree`/scroll machinery as item 3. Independent to build, but if item 3 lands first the persistent-focus behaviour means the created worktree stays focused rather than pulsing-and-clearing (acceptable either way; note for reviewer).

### Files to touch

- `src/components/CreateWorktreeModal.vue` — change the `created` emit to carry the new branch name (`created: [branch: string]`) and emit it with `creationResult.value.result.branch`.
- `src/components/Dashboard.vue` — bind `@created` on CreateWorktreeModal, store the pending branch, and call `store.focusWorktree(branch, true)` after the modal closes.

### Implementation steps

1. In `src/components/CreateWorktreeModal.vue`, change the emit signature (line 31) from `created: []` to `created: [branch: string]`.
2. Update the success emit. The success block already assigns `creationResult.value = response` (line 314) before `emit('created')` (line 316). Change line 316 to `emit('created', response.result.branch)` (`response.result.branch` is the typed `CreateWorktreeResult.branch`, confirmed in `src/types/wt.ts:166-167`). Do not change anything else in `handleSubmit`.
3. In `src/components/Dashboard.vue`, add a ref near the other modal state (around line 321, beside `const showCreateModal = ref(false)`): `const pendingCreatedBranch = ref<string | null>(null)`.
4. Add two small handlers (place them near the other modal handlers): `function handleWorktreeCreated(branch: string) { pendingCreatedBranch.value = branch }` and `function handleCreateModalClose() { showCreateModal.value = false; const branch = pendingCreatedBranch.value; pendingCreatedBranch.value = null; if (branch) { store.focusWorktree(branch, true) } }`. Focusing on close (not on `created`) is deliberate: the modal stays open on its `results` phase after a successful create, so focusing while it is open would scroll behind the overlay.
5. Update the modal binding at line 1056 from `<CreateWorktreeModal :is-open="showCreateModal" @close="showCreateModal = false" />` to `<CreateWorktreeModal :is-open="showCreateModal" @created="handleWorktreeCreated" @close="handleCreateModalClose" />`.
6. No store changes are needed: `store.focusWorktree(branch, true)` already sets `focusedBranch` and `expandOnFocus` (`src/stores/worktrees.ts:103-106`); the existing `watch(focusedBranch, ...)` in Dashboard (line 305) calls `scrollToFocusedWorktree()`, and the cards already consume `expandOnFocus`/`focusedBranch` props (Dashboard.vue:1040-1041). The list is already refreshed because the modal's `createWorktree` calls `await fetchWorktrees()` (`src/composables/useWorktrees.ts:344`) before the `results` phase.
7. Run `npm run build` (vue-tsc). Verify no other consumer of `CreateWorktreeModal` relies on the old zero-arg `created` (the only `@created`/`created` usage outside the modal is `RepoList.vue:249`, an unrelated Recent-tab caller — no change there).

### Risks

- **Repo scope:** the modal always creates in the currently-selected repo (`selectedRepoName.value`, `CreateWorktreeModal.vue:308`), which is the repo already displayed in Dashboard, so the branch is guaranteed to be in the current list. If the user changes the selected repo between create and close this could mis-target, but `focusWorktree` simply no-ops visually if the card is not present.
- **Timing:** focus fires on modal close, relying on the `created`→stored-branch→close sequence. Current code always emits `created` before any close path (Close button and Open-in-Editor both go through `emit('close')`).
- `scrollToFocusedWorktree` already self-clears focus after 3s and expand after 500ms (Dashboard.vue:293-294), and retries up to 15×200ms for the element to appear — no new timing tokens introduced.

### Verification

Type check with `npm run build` (vue-tsc). Existing automated coverage: `store.focusWorktree` behaviour is already unit-tested in `src/stores/worktrees.test.ts`; no component test harness exists for Dashboard/modal, so no new unit test is added for the wiring. Manual in `npm run tauri dev`: select a repo with several worktrees, create a new worktree, click Close (and separately, repeat and click Open in Editor) — confirm the list scrolls the new worktree into view (smooth, centred), highlights it as focused, expands its details, then auto-clears the highlight after ~3s. Also confirm cancelling the modal before creating (Close on the form phase) does not focus/scroll anything (`pendingCreatedBranch` stays null).

---

## 6. Persist worktree filter and sort across repo switches and restarts

- **Category:** UX · **Effort:** S · **Score:** 24/30

### Summary

Back `activeFilter` and `activeSort` in `useWorktreeFilters` with `@stuntrocket/ui`'s `usePersistedRef` (localStorage-backed) instead of plain refs, and stop force-resetting the filter on every repo switch. A user's preferred view (e.g. 'Dirty' filter, 'Last accessed' sort) then survives both repo switches and app restarts, while the text search continues to clear on switch as before.

### Files to touch

- `src/composables/useWorktreeFilters.ts` — replace the two plain refs with `usePersistedRef` calls keyed `wt-worktree-filter` / `wt-worktree-sort`, importing from `@stuntrocket/ui`.
- `src/components/Dashboard.vue` — remove the `resetFilter()` call inside the `selectedRepoName` switch watcher (line 255); keep `clearWorktreeSearch()`.
- `src/composables/useWorktreeFilters.test.ts` — new test file verifying default values, persistence to localStorage, and rehydration.

### Implementation steps

1. In `src/composables/useWorktreeFilters.ts`, add `import { usePersistedRef } from '@stuntrocket/ui'`. Keep `import { computed } from 'vue'`; if `ref` becomes unused, drop it from that import to satisfy strict TypeScript.
2. Replace lines 21-22 (`const activeFilter = ref<WorktreeFilter>('all')` and `const activeSort = ref<WorktreeSort>('name')`) with `const activeFilter = usePersistedRef<WorktreeFilter>('wt-worktree-filter', 'all')` and `const activeSort = usePersistedRef<WorktreeSort>('wt-worktree-sort', 'name')`. `usePersistedRef` returns a plain `Ref<T>`, so the rest of the composable needs no other changes.
3. Leave `resetFilter()` (lines 53-55) and its export intact — it is still used by the 'Clear filter' button in `Dashboard.vue` (around line 935). Only its call site in the switch watcher is being removed.
4. In `src/components/Dashboard.vue`, locate the `selectedRepoName` watcher (starts at line 251). Remove the line `resetFilter()` at line 255. Keep `clearWorktreeSearch()` on line 254 so text search still clears on switch.
5. Verify `resetFilter` is still destructured from `useWorktreeFilters` (line 93) because the template's Clear-filter button uses it — do NOT remove it from the destructure.
6. Create `src/composables/useWorktreeFilters.test.ts` following the `settings.test.ts` pattern: `localStorage.clear()` in `beforeEach`. **Test 1:** fresh composable returns `activeFilter==='all'` and `activeSort==='name'`. **Test 2:** calling `setFilter('dirty')`/`setSort('last-accessed')` writes JSON-stringified values to keys `wt-worktree-filter` and `wt-worktree-sort` (assert via `JSON.parse(localStorage.getItem(...))`). **Test 3:** pre-seed localStorage with `JSON.stringify('dirty')` under `wt-worktree-filter`, then construct the composable and assert `activeFilter.value === 'dirty'`. `usePersistedRef` writes with `flush:'post'`, so `await nextTick` after mutating before asserting localStorage in Test 2.
7. Run `npx vitest run src/composables/useWorktreeFilters.test.ts`, then `npm run build` (watch for the unused `ref` import).

### Risks

- `usePersistedRef` writes via a watcher with `flush:'post'`, so localStorage assertions in tests must `await nextTick` after mutating the ref.
- If a stale/invalid value lands in localStorage (e.g. an old enum value no longer in `WorktreeFilter`/`WorktreeSort`), the persisted value is used verbatim with no validation; the filter/sort switch statements fall through to safe defaults, so impact is benign — but it is a behaviour change vs the current always-fresh default.
- Removing `resetFilter()` from the watcher is the intended behaviour change; reviewers should confirm the product intent that filter persists across repo switches (text search still clears). The 'Clear filter' button remains the manual escape hatch.
- The localStorage key names (`wt-worktree-filter`, `wt-worktree-sort`) are new; they follow the existing `wt-*` convention but must not collide with future keys.

### Verification

Automated: `npx vitest run src/composables/useWorktreeFilters.test.ts` (new tests for defaults, persistence, rehydration) plus the full `npx vitest run`; `npm run build` for TypeScript (catches the potentially-unused `ref` import). Manual in `npm run tauri dev`: set filter to 'Dirty' and sort to 'Last accessed', switch to another repo and confirm both stick (only the text search box clears); fully quit and relaunch Grove and confirm the filter/sort selections are still applied; click the 'Clear filter' button and confirm it resets the filter to 'All' and persists that reset.

---

## 7. Auto-refresh the system tray menu after mutating worktree operations

- **Category:** Feature · **Effort:** S · **Score:** 24/30

### Summary

The backend command `refresh_tray_menu` is registered (`src-tauri/src/commands.rs:1889`) and fully rebuilds per-repo tray submenus with dirty/behind indicators, but has zero frontend callers, so the menu-bar quick-switch list goes stale after create/delete/pull/prune/sync. Every mutating worktree operation already routes through `useWorktrees.ts` and refreshes the worktree list on success, giving one clean chokepoint. We add a thin `useWt` wrapper plus a module-level debounced trigger that invokes `refresh_tray_menu` after each successful mutation, debounced to coalesce the expensive N+1 sidecar rebuild.

### Files to touch

- `src/composables/useWt.ts` — add `refreshTrayMenu()` wrapper invoking `'refresh_tray_menu'` (no args) and export it.
- `src/composables/useWorktrees.ts` — add a module-level debounced `scheduleTrayRefresh()` and call it after each successful mutation (`createWorktree`, `removeWorktree`, `pullWorktree`, `syncWorktree`, `pruneRepo`, `pullAllWorktrees`, `pullSelectedWorktrees`).
- `src/composables/useWorktrees.test.ts` — add tests asserting `refresh_tray_menu` is invoked (debounced) after a successful create/remove and not invoked on failure.
- `src/composables/useWt.test.ts` — add a test that `refreshTrayMenu()` calls `invoke('refresh_tray_menu')`.

### Implementation steps

1. In `src/composables/useWt.ts`, add a wrapper near the other command wrappers (e.g. after `registerRepository`, before `toWtError`): `async function refreshTrayMenu(): Promise<void> { await invoke('refresh_tray_menu') }`. The backend command (`src-tauri/src/commands.rs:1889` `#[command] pub fn refresh_tray_menu(app)`) injects AppHandle, so pass NO arguments. Add `refreshTrayMenu,` to the returned object.
2. In `src/composables/useWorktrees.ts`, add module-level debounce state alongside the existing constants (after line 22 / line 33): `const TRAY_REFRESH_DEBOUNCE_MS = 500` and `let trayRefreshTimeout: ReturnType<typeof setTimeout> | undefined`. Use a larger value than `REFRESH_DEBOUNCE_MS` (200ms) because the rebuild is an N+1 sidecar spawn per repo (`build_tray_menu` in `src-tauri/src/tray.rs:303`).
3. Inside the `useWorktrees()` factory (after `const wt = useWt()` at line 86), add a helper: `function scheduleTrayRefresh(): void { if (trayRefreshTimeout) clearTimeout(trayRefreshTimeout); trayRefreshTimeout = setTimeout(() => { trayRefreshTimeout = undefined; void wt.refreshTrayMenu() }, TRAY_REFRESH_DEBOUNCE_MS) }`. Swallow errors implicitly via `void` — a tray refresh failure must never surface to the user or break the mutation flow.
4. Call `scheduleTrayRefresh()` on the SUCCESS path of each mutation, immediately after the existing `await fetchWorktrees()` / `fetchWorktreesDebounced()` line and before `return`: `createWorktree` (after line 344), `removeWorktree` (after line 365), `pullWorktree` (after line 384), `syncWorktree` (after line 403), `pruneRepo` (after line 451), `pullAllWorktrees` (after line 471), `pullSelectedWorktrees` (after line 491). Do NOT add it to error/catch branches. Do NOT add it to `fetchWorktreesInternal` — that runs on plain reads (repo selection, auto-refresh, file-watch) and would trigger the expensive rebuild far too often.
5. Do NOT modify `Dashboard.vue`: create/remove flow through `useWorktrees()` via `CreateWorktreeModal.vue:307` and `DeleteWorktreeDialog.vue:154`. Centralising in `useWorktrees.ts` covers all entry points.
6. No Rust changes and no type changes: `refresh_tray_menu` is already registered in `src-tauri/src/lib.rs:171`, takes no caller-supplied args, and returns unit.
7. Add a `useWt.test.ts` case: mock with `mockTauriInvoke.mockResolvedValue(undefined)`, call `await wt.refreshTrayMenu()`, assert `expect(mockTauriInvoke).toHaveBeenCalledWith('refresh_tray_menu')` (no second arg).
8. Add `useWorktrees.test.ts` cases using `vi.useFakeTimers()`: after a successful `createWorktree` (and separately `removeWorktree`), advance timers by `TRAY_REFRESH_DEBOUNCE_MS` and assert invoke was called with `'refresh_tray_menu'`; assert a failed mutation (`mockTauriInvoke.mockRejectedValue`) does NOT schedule it; optionally assert two rapid successful mutations result in a single `'refresh_tray_menu'` invocation (debounce coalescing). Use the existing `mockTauriInvoke`/`resetTauriMocks` from `@/test/setup`.
9. Verify: `npx vitest run src/composables/useWorktrees.test.ts src/composables/useWt.test.ts`, `npm run build`, then manual smoke test via `npm run tauri dev`: create a worktree from the window and confirm the menu-bar quick-switch list shows it without a manual Refresh; delete one and confirm it disappears; make a worktree dirty and pull/sync and confirm the dot/behind indicator updates.

### Risks

- Debounce coalescing means the very last mutation in a rapid burst is the one reflected; this is intended since the rebuild reads live state per repo, but tests that fire mutations without advancing fake timers will see zero invocations — tests must advance timers.
- Calling `refresh_tray_menu` invokes `build_tray_menu` which spawns the `wt` sidecar once per registered repo (N+1). The 500ms debounce bounds the rate, but users with very many repos may notice a brief tray menu rebuild; acceptable and matches the existing manual Refresh path's cost.
- `trayRefreshTimeout` is module-level (shared across all `useWorktrees()` consumers, like the existing `pendingRefreshes`/`globalFetchId`), so concurrent callers share one debounce timer — desired behaviour, not a bug.
- If `wt.refreshTrayMenu()` rejects (e.g. tray not yet initialised at startup), the `void`/no-catch swallows it silently; this is intentional so a tray issue never breaks a worktree mutation, but failures will not be surfaced — acceptable for a cosmetic menu refresh.

### Verification

Run `npx vitest run src/composables/useWorktrees.test.ts src/composables/useWt.test.ts` — new tests assert `refresh_tray_menu` is invoked (debounced via fake timers) after successful create/remove and not after failures, and that `refreshTrayMenu()` calls `invoke('refresh_tray_menu')` with no args. Run `npm run build`. Manual: `npm run tauri dev`, then create/delete/pull/sync/prune worktrees from the window and confirm the macOS menu-bar quick-switch list and its dirty/behind indicators update without clicking the tray's manual Refresh.

---

## 8. Broaden worktree search to match path and note, not just branch name

- **Category:** UX · **Effort:** S · **Score:** 23/30

### Summary

`filterWorktrees` in `src/composables/useSearch.ts` only tests `wt.branch`, yet `HelpModal.vue` advertises that worktree search covers "branch name, path, or status", and worktrees also carry a user purpose note (`settingsStore.getWorktreeNote`). This change extends the matcher to also test `wt.path` and the stored note, so a developer typing a directory fragment or a word from their purpose note finds the worktree instead of an empty list. The note lookup needs a `repoName`, which is not on the `Worktree` type, so the note text is supplied via an optional resolver from `Dashboard.vue` (which already has `settingsStore` and `selectedRepoName` in scope).

### Files to touch

- `src/composables/useSearch.ts` — extend `filterWorktrees` to also match `wt.path` and an optionally-resolved note; update `UseSearchReturn` type/JSDoc.
- `src/components/Dashboard.vue` — pass a note resolver to `searchFilterWorktrees` using `settingsStore.getWorktreeNote` + `selectedRepoName`.
- `src/composables/useSearch.test.ts` — add cases for path and note matching, and confirm branch matching still works.
- `src/components/HelpModal.vue` — update the worktree search description to mention note as well as branch and path (line 213).

### Implementation steps

1. In `src/composables/useSearch.ts`, change the `filterWorktrees` signature to accept an optional note resolver: `filterWorktrees: (worktrees: Worktree[], getNote?: (wt: Worktree) => string) => Worktree[]`. Update both the `UseSearchReturn` interface (line 32) and its JSDoc (line 31) to read 'Filter worktrees by branch name, path, or note'.
2. In the implementation (lines 64-67), keep the empty-query early return, then change the predicate to OR the matches over branch, path, and the resolved note: `return worktrees.filter((wt) => matches(wt.branch) || matches(wt.path) || (getNote ? matches(getNote(wt)) : false))`. Reuse the existing `matches` helper so trimming and case-insensitivity stay consistent.
3. In `src/components/Dashboard.vue`, locate the `filteredWorktrees` computed (lines 101-104) and pass a resolver to `searchFilterWorktrees`: `const searched = searchFilterWorktrees(worktrees.value, (wt) => selectedRepoName.value ? settingsStore.getWorktreeNote(selectedRepoName.value, wt.branch) : '')`. `settingsStore` (line 157) and `selectedRepoName` (line 47) are already in scope.
4. Verify no other caller of `useSearch`'s `filterWorktrees` exists that would break: only Dashboard.vue uses it (RepoList.vue uses `filterRepositories`). The separate `filterWorktrees` in `src/composables/useWorktreeFilters.ts` is unrelated and must not be touched.
5. In `src/composables/useSearch.test.ts`, extend the existing `filterWorktrees` describe block (lines 55-86): give the sample worktrees distinctive paths (e.g. `/Users/dev/project-worktrees/feature-login`), add a test that searching a path fragment (e.g. `worktrees`) returns the matching worktrees, add a test that passing a `getNote` resolver lets a note word match (e.g. resolver returns 'payment refactor' for branch `bugfix/auth`, query 'refactor' returns that worktree), and add a test that without a resolver behaviour is unchanged (branch-only).
6. In `src/components/HelpModal.vue` line 213, update the user-facing text from 'Filter worktree cards by branch name, path, or status' to 'Filter worktree cards by branch name, path, status, or purpose note' (British English).
7. Run `npx vitest run src/composables/useSearch.test.ts` and `npm run build`.

### Risks

- The note lookup requires a `repoName` not part of the `Worktree` type; the resolver approach keeps `useSearch` store-agnostic and testable, but means Dashboard must wire `selectedRepoName` through. If a future caller forgets the resolver, note search silently does nothing (acceptable degradation — branch and path still match).
- Broadening the match set could surface worktrees whose path matches a query the user expected to scope to branches only; risk is low because paths typically contain the branch/repo name and this is the advertised behaviour. No regression to the empty-query fast path.
- `filterWorktrees` feeds `applyFiltersAndSort` (structured status filters) downstream; widening the text-search result set only adds candidates before those filters run, so status filtering is unaffected.

### Verification

Add and run Vitest cases in `src/composables/useSearch.test.ts` covering: (a) path-fragment match returns the right worktrees, (b) note match via the `getNote` resolver returns the right worktree, (c) branch-only behaviour unchanged when no resolver is passed, (d) empty query still returns all. Run `npx vitest run src/composables/useSearch.test.ts` and `npm run build`. Manually: in `npm run tauri dev`, add a purpose note to a worktree, type a word from that note in the worktree search bar, and confirm the card appears; type a path fragment and confirm it matches too.

---

## 9. Colour-code diff-stat insertions and deletions in the worktree card badge

- **Category:** UI · **Effort:** S · **Score:** 22/30

### Summary

The diff-stats badge in `WorktreeCard.vue` currently prints the backend's single muted monospace string (e.g. "5 files, +120/-45"), so the densest part of the card is colourless. This change replaces that string with three inline spans — a neutral file count, a success-coloured "+N" and a danger-coloured "-N" — built directly from the already-returned `lines_added`/`lines_removed` fields, so a reader can tell at a glance whether a worktree is mostly additive or destructive. Frontend-only render change with no backend, type, or composable churn.

### Files to touch

- `src/components/WorktreeCard.vue` — replace the single `{{ diffStats.display }}` span with three coloured inline spans (file count neutral, +added success, -removed danger).
- `src/components/WorktreeCard.test.ts` — Vitest test asserting the badge renders separate success/danger spans (recommended; no existing test for this component, and item 3 also adds this file — coordinate).

### Implementation steps

1. Open `src/components/WorktreeCard.vue` and locate the diff-stats badge at lines 446-451. It currently reads:

   ```html
   <SBadge v-if="diffStats && diffStats.files_changed > 0"
     variant="default"
     class="font-mono"
     :title="diffStats.file_list.join('\n')">
     {{ diffStats.display }}
   </SBadge>
   ```
2. Replace ONLY the slot body (`{{ diffStats.display }}`) with three inline spans driven by the existing numeric fields. Keep the `SBadge` element, its `v-if`, `variant="default"`, `class="font-mono"` and `:title` binding exactly as-is. New slot body:

   ```html
   <span>{{ diffStats.files_changed }} file{{ diffStats.files_changed === 1 ? '' : 's' }}</span>,&#32;
   <span class="text-success">+{{ diffStats.lines_added }}</span><span class="text-text-muted">/</span><span class="text-danger">-{{ diffStats.lines_removed }}</span>
   ```

   Use the literal `&#32;` to preserve the existing 'N files, +.../-...' spacing; the pluralisation mirrors the Rust formatter at `commands.rs:1786-1788` so output is identical apart from colour. `SBadge` renders its default slot (confirmed by the sibling Protected/Orphaned badges that nest text + SVG), so nested spans are safe.
3. Do NOT touch the backend. The Rust `DiffStats.display` string (`src-tauri/src/commands.rs:1782-1792`) and the TS `DiffStats` interface (`src/types/wt.ts:860-871`) already expose `files_changed`, `lines_added` and `lines_removed` separately; `display` simply becomes unused by this badge but stays valid for any other consumer — leave it in place.
4. Confirm the colour utilities resolve: `src/styles.css` imports Tailwind v4 plus `@stuntrocket/ui` tokens which define `--color-success` and `--color-danger`, so `text-success`/`text-danger`/`text-text-muted` apply here too. No new CSS, no design tokens, no animation durations — no `styles.css` edit needed.
5. Add a Vitest component test at `src/components/WorktreeCard.test.ts` following the `@vue/test-utils` pattern in `src/components/RepoList.test.ts` and `CommandPalette.test.ts`. Mount `WorktreeCard` with a minimal worktree prop, stub or mock `useWt`'s `getDiffStats` to resolve `{ files_changed: 5, lines_added: 120, lines_removed: 45, display: '5 files, +120/-45', file_list: [...] }`, `await flushPromises()`, then assert the rendered badge contains a span with class `text-success` showing `+120` and a span with class `text-danger` showing `-45`, and that the file-count text `5 files` is present without those colour classes.
6. Run `npm run build` and `npx vitest run src/components/WorktreeCard.test.ts` (or the full `npx vitest run`).

### Risks

- The badge previously rendered exactly the backend `display` string; reconstructing it in the template risks a subtle spacing/pluralisation drift from the Rust formatter. Mitigation: mirror `commands.rs:1786-1788` precisely (', ' separator, 'file' vs 'files') and preserve the space after the comma.
- `SBadge` applies its own typography/padding to slot content; nested spans inherit `font-mono` from the badge class, but verify the coloured spans are not overridden by a badge text colour. Acceptable because sibling badges already nest custom-coloured child elements, but eyeball it in `npm run tauri dev`.
- Colour only conveys additive-vs-destructive at a glance; for accessibility the +/- signs remain as the non-colour cue, so no colour-blind regression.
- The badge only appears on worktrees where `files_changed > 0` (dirty/diverged worktrees), so the visual change is invisible on clean worktrees — expected, not a defect.

### Verification

Run `npm run build` and `npx vitest run`. The new `WorktreeCard.test.ts` asserts the badge emits a `text-success` '+N' span and a `text-danger` '-N' span with a neutral file count. Manually verify in `npm run tauri dev`: a dirty worktree's diff badge shows the file count in muted text, additions in green and deletions in red, with identical numbers/spacing to before. No backend rebuild or sidecar re-prep required since `wt.rs` and `commands.rs` are untouched.

---

## 10. Add live count chips to the filter segmented control

- **Category:** UI · **Effort:** S · **Score:** 21/30

### Summary

Surface a per-state count in each filter toggle label (All / Dirty / Stale / Unmerged) computed from the unfiltered worktree list, so the toolbar reads as an at-a-glance health summary without clicking each filter in turn. Because `@stuntrocket/ui`'s `SSegmentedControl` renders option labels as plain text (no slots, no per-option styling), the count is folded into the label string and omitted when zero, which is the in-API way to express "nothing matches" rather than visual dimming.

> **Dependency:** Reuses the filter predicates from `useWorktreeFilters.ts`, the same file edited by item 6. Build item 6 first (or coordinate) to avoid two simultaneous edits to that composable.

### Files to touch

- `src/composables/useWorktreeFilters.ts` — add a pure `countWorktrees(worktrees)` helper that returns per-filter match counts reusing the existing filter predicates.
- `src/components/Dashboard.vue` — build a computed labelled-options array (label + count) from the unfiltered worktrees ref and pass it to `SSegmentedControl` instead of the static `filterOptions`.
- `src/composables/useWorktreeFilters.test.ts` — Vitest spec covering `countWorktrees` for dirty/stale/unmerged/all and zero cases (same new file as item 6).

### Implementation steps

1. In `src/composables/useWorktreeFilters.ts`, add a pure exported function on the returned object: `countWorktrees(worktrees: Worktree[])` returning `{ all: number; dirty: number; stale: number; unmerged: number }`. Compute each by reusing the exact predicates already in `filterWorktrees` (lines 60-71): `all: worktrees.length`, `dirty: worktrees.filter(wt => wt.dirty).length`, `stale: worktrees.filter(wt => wt.stale === true).length`, `unmerged: worktrees.filter(wt => wt.merged === false).length`. Keep it independent of `activeFilter`.
2. In `src/components/Dashboard.vue`, after the existing `useWorktreeFilters` destructure (around lines 85-95), add `countWorktrees` to the destructured names and create a computed `filterOptionsWithCounts` that maps over the existing static `filterOptions` and appends the count to each label. Look up each count via `countWorktrees(worktrees.value)[opt.value]`. Build the label as: for the `all` option use the bare `opt.label` (no count, it is the reset/neutral state); for the others append the count only when greater than zero, e.g. `count > 0 ? `${opt.label} ${count}` : opt.label`. This makes a number appear only when attention is warranted — the in-API equivalent of dimming a zero chip.
3. At the `SSegmentedControl` render site (lines 926-929), change `:options="filterOptions"` to `:options="filterOptionsWithCounts"`. Leave `:model-value` and `@update:model-value` unchanged — option `value` keys stay `all`/`dirty`/`stale`/`unmerged` so selection state and `setFilter` still work. The existing active-filter pill (lines 932-940) is unaffected.
4. Confirm British English in any new strings (labels derived from existing 'All'/'Dirty'/'Stale'/'Unmerged' — no new copy needed; no abbreviations).
5. Add to `src/composables/useWorktreeFilters.test.ts` (the same new file as item 6) following the pattern in `src/composables/useSearch.test.ts`: build small `Worktree` fixtures with dirty/stale/merged combinations, and assert `countWorktrees` returns correct all/dirty/stale/unmerged tallies including a zero case (e.g. no stale worktrees yields `stale: 0`) and that counts are independent of the current `activeFilter` (call `setFilter('dirty')` then assert all four counts are still computed over the full list).

### Risks

- `SSegmentedControl` (`@stuntrocket/ui` v0.8.2) renders labels via plain-text interpolation with no slots or per-option styling, so true visual dimming of a zero chip is impossible; the design omits the count when zero instead. If a future requirement demands styled chips, the upstream component would need a slot API or a local replacement — out of scope.
- Embedding the count in the label slightly widens each segment as counts change; the control already uses `whitespace-nowrap` so it will not wrap, but on very narrow windows the toolbar row could grow. Low risk given the toolbar is a single horizontal row with a flex spacer.
- `countWorktrees` recomputes filters on every `worktrees` change; the list is small (per-repo worktrees) so performance is negligible, but ensure the computed depends on `worktrees.value` (the `storeToRefs` ref) so it reactively updates after refresh.
- `stale`/`merged` are optional fields on `Worktree` (`stale?: boolean`, `merged?: boolean`); the predicates must use strict comparison (`=== true`/`=== false`) exactly as `filterWorktrees` does so undefined values are not miscounted.

### Verification

Run `npx vitest run src/composables/useWorktreeFilters.test.ts` — the spec should pass and cover dirty/stale/unmerged/all plus a zero case. Run `npm run build` (verifies the new `countWorktrees` return type and the `filterOptionsWithCounts` computed). Manually via `npm run tauri dev`: select a repo with mixed worktree states and confirm the toggles read e.g. 'Dirty 3', 'Stale 1', that a state with no matches shows just its bare label (no '0'), that 'All' shows no number, and that clicking each toggle still filters correctly and the existing 'N of M' active-filter pill still appears.

---

## Suggested build order

Ten items, all S except items 3 and 4 (M). Group quick wins first; sequence the two M items by dependency.

### Wave 1 — independent quick wins (S, no dependencies)

Ship these in any order; none touch the same load-bearing code and each is independently verifiable:

1. **Item 2** — Wire ⌘⇧W quick-switcher. Self-contained: one listener in `Dashboard.vue`, no shared state.
2. **Item 5** — Auto-focus newly created worktree. Touches `CreateWorktreeModal.vue` + Dashboard modal handlers only.
3. **Item 7** — Auto-refresh tray menu after mutations. Touches `useWt.ts` + `useWorktrees.ts` mutation success paths only.
4. **Item 8** — Broaden search to path + note. Touches `useSearch.ts` + Dashboard `filteredWorktrees` + `HelpModal.vue`.
5. **Item 9** — Colour-code diff-stat badge. Pure render change in `WorktreeCard.vue`.

### Wave 2 — shortcut surface (S, ordered)

6. **Item 1** — Wire dead global shortcuts with focus gating. Ship before item 3 so the gating predicate exists; it depends only on existing palette handlers.

### Wave 3 — `useWorktreeFilters.ts` cluster (S, coordinate)

Items 6 and 10 both edit `src/composables/useWorktreeFilters.ts` and both create/extend `src/composables/useWorktreeFilters.test.ts`. Do them back-to-back (or in one branch) to avoid conflicting edits:

7. **Item 6** — Persist filter/sort (replaces the two refs).
8. **Item 10** — Filter count chips (adds `countWorktrees` to the same composable, reusing predicates).

### Wave 4 — M items (sequence by dependency)

9. **Item 3** — Persist focused worktree. **Depends on item 1** for the full payoff (the gated shortcuts need a reliable persistent target). Also shares the `focusWorktree` machinery with item 5, so land item 5 first.
10. **Item 4** — Stale-while-revalidate cached render. Largest blast radius (store + composable + Dashboard watcher + RepoList + App.vue tray focus). Independent of the others but riskiest, so ship last with the full suite green. Note: item 3 clears `focusedBranch` on `selectRepository` and item 4 edits the same method — coordinate the two edits to `selectRepository`.

### Dependency summary

| Item | Depends on | Shared file to coordinate |
|---|---|---|
| 3 | 1 (for payoff), 5 (shared focus machinery) | `selectRepository` shared with item 4 |
| 4 | — | `selectRepository` shared with item 3 |
| 6 | — | `useWorktreeFilters.ts` + test shared with item 10 |
| 10 | — | `useWorktreeFilters.ts` + test shared with item 6 |
| 1 | — | (none; blocks item 3's payoff) |

All other items (2, 5, 7, 8, 9) are fully independent.

---

## Appendix — shortlisted but cut

These eight candidates cleared the 48→18 cut and were scored by the panel but fell below the top 10. They are recorded here so the ideas are not lost; the full rationale and evidence for each lives in [`qol-ideas-backlog-2026-06-05.md`](qol-ideas-backlog-2026-06-05.md).

1. **Arrow-key / j-k navigation and Enter-to-open in the worktree list** (UX) — Add Up/Down (or j/k) to move `focusedBranch` through `filteredWorktrees`, Enter to open in editor; reuse `useListNavigation`. (Partly subsumed by item 3, which recommends J/K nav as part of persistent focus.)
2. **Make the native right-click context menu honour settings and route copy actions** (UX) — `show_worktree_context_menu`'s Copy items emit `context_menu_action` with zero listeners; its Open Editor/Terminal items hardcode VS Code/Terminal. Add a listener routing to the existing copy helpers and the settings-aware open commands.
3. **Add a 'Needs Attention' header rollup with one-click filter** (UX) — Compact header pill like '3 dirty · 2 behind · 1 orphaned' that applies the matching filter on click, reading from the existing `dirtyWorktrees`/`attentionWorktrees`/`orphanedWorktrees` computeds.
4. **Disambiguate the two identical 'Stale' badges with distinct semantics** (UI) — Commit-distance stale (>50 behind) and time-based stale render identically; give them distinct labels/icons (e.g. 'Stale' vs 'Untouched 21d') so the user knows whether to sync or delete.
5. **Wire the computed tray badge count to the macOS menu bar icon** (Feature) — `useTrayBadge` computes `badgeCount` reactively but the value is discarded and there is no backend `set_title`/`set_badge`. Add a `set_tray_badge` command and invoke it (debounced) when `badgeCount` changes.
6. **Add an aggregate attention dot to each sidebar repository row** (UI) — Per-repo coloured status dot (amber if any worktree dirty, blue if any behind, grey if clean) derived from cached worktree data via the reusable `needsAttention` predicate; unvisited repos show nothing.
7. **Multi-select worktrees with checkboxes for bulk pull/sync/delete** (Feature) — Selection model (reactive Set of branch names) plus per-card checkbox and a bulk-action bar; `pull_selected_worktrees` is already implemented end-to-end but only exposed on the internal retry path.
8. **Establish visual hierarchy and badge overflow in the worktree card status row** (UI) — Promote primary signals (dirty + sync) to full weight, demote secondary tags to a lighter tier, and cap visible badges with a subtle '+N' overflow.

---

[Back to Planning Index](../README.md) · [Full ideas backlog](qol-ideas-backlog-2026-06-05.md)
