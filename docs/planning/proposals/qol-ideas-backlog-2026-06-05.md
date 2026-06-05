# QoL Ideas Backlog — 2026-06-05

> This is the full, unfiltered output of the quality-of-life brainstorm for Grove — every idea is archived here verbatim so nothing is lost. A curated top 10, selected and sequenced for delivery, lives in the accompanying implementation plan.

Ideas are grouped by lens: **UX Friction**, **UI Polish**, **Performance**, **Power User**, **Awareness**, and **Integration**. Each entry records its source category, effort estimate (S/M/L), description, rationale, and evidence (file references as inline code).

---

## UX Friction

### Make clicking a worktree card select it as the keyboard/command target

- **Category:** ux
- **Effort:** M

**Description:** Today a card click only toggles its details panel (`WorktreeCard.vue:364` toggleDetails). The 'focused' worktree that ⌘O and every command-palette worktree action depend on (getFocusedWorktree, `Dashboard.vue:563`) is only ever set by tray selection or Recent-tab navigation, and is auto-cleared after 3 seconds (`Dashboard.vue:294` clearFocusedWorktree). So on day 30, pressing ⌘O or running 'Open in Editor' from ⌘K does nothing because nothing is focused. Make a card click (or arrow-key navigation in the list) set focusedBranch persistently, and stop the 3s auto-clear for user-driven selection so keyboard/palette actions always have a target.

**Rationale:** Every per-worktree keyboard shortcut and the entire contextual half of the command palette are silently dead unless the user came from the tray. Wiring card selection to focus turns ⌘O, ⌘T, copy commands and palette actions from no-ops into the fast path they were designed to be.

**Evidence:** `src/components/WorktreeCard.vue:364-365`, `src/components/Dashboard.vue:563-565`, `src/components/Dashboard.vue:286-302`, `src/composables/useKeyboardShortcuts.ts:206-211`

---

### Wire the registered-but-dead ⌘T / ⌘B / copy / ⌘Enter global shortcuts to the focused worktree

- **Category:** ux
- **Effort:** S

**Description:** useKeyboardShortcuts registers ⌘T, ⌘B, ⌘C/⇧⌘C/⌥⌘C, ⇧⌘D and ⌘Enter at the window in capture phase (`useKeyboardShortcuts.ts:212-294`), but Dashboard's useKeyboardShortcuts({...}) call (`Dashboard.vue:706-724`) only passes onOpenEditor. The other handlers are undefined, so each shortcut still calls preventDefault/stopPropagation (lines 151-152) then does nothing — meaning ⌘C is swallowed and copies nothing when no input is focused. Pass the existing palette handlers (handlePaletteOpenInTerminal, handlePaletteOpenInBrowser, the copy helpers, handlePaletteOpenAll) into the Dashboard keyboard call, mirroring how they are already wired into useCommandRegistry (`Dashboard.vue:660-700`).

**Rationale:** These shortcuts are advertised in tooltips and HelpModal, so users will try them and either get nothing or worse have the native ⌘C suppressed. The handlers already exist for the palette — this is pure wiring that makes the documented keymap real.

**Evidence:** `src/composables/useKeyboardShortcuts.ts:212-294`, `src/composables/useKeyboardShortcuts.ts:150-152`, `src/components/Dashboard.vue:706-724`, `src/components/Dashboard.vue:601-647`

---

### Use the cached worktree list to render instantly on repo switch

- **Category:** performance
- **Effort:** M

**Description:** The store already keeps a per-repo cache (`worktrees.ts:25` worktreeCache, isRepoLoaded, getCachedWorktrees) but selectRepository unconditionally sets worktrees=[] and loadingWorktrees=true (`worktrees.ts:93-95`), and the Dashboard switch watcher always calls fetchWorktrees() (`Dashboard.vue:259`). So every repo switch shows skeletons and re-spawns the wt CLI even for a repo viewed seconds ago. Render cached worktrees immediately when isRepoLoaded(name) is true, then revalidate in the background (stale-while-revalidate) and reconcile when the fresh list arrives.

**Rationale:** Switching between 2-3 active repos is one of the most repeated daily actions. Showing the last-known list instantly instead of a skeleton-then-flash makes the app feel native rather than web-laggy, and the freshness guarantee is preserved by the background refetch.

**Evidence:** `src/stores/worktrees.ts:22-25`, `src/stores/worktrees.ts:79-100`, `src/composables/useWorktrees.ts:98-119`, `src/components/Dashboard.vue:251-266`

---

### Auto-select and scroll to the worktree you just created

- **Category:** ux
- **Effort:** S

**Description:** CreateWorktreeModal emits 'created' after a successful add (`CreateWorktreeModal.vue:316`), but Dashboard only binds @close on the modal (`Dashboard.vue:1056`) — the 'created' event is never handled, so after creation the new worktree is left somewhere in the list with no focus, no scroll, and no expansion. Handle @created by calling store.focusWorktree(newBranch, true) so the just-created worktree is highlighted, scrolled into view (scrollToFocusedWorktree already exists, `Dashboard.vue:279`) and its details expanded, matching the behaviour you get from the Recent tab.

**Rationale:** Creating a worktree is step one of the core loop; right now the immediate next action (find it, open it) requires hunting through the list. Auto-focusing closes the loop and pairs naturally with the 'Open in Editor' button already in the results phase.

**Evidence:** `src/components/CreateWorktreeModal.vue:313-317`, `src/components/Dashboard.vue:1056`, `src/components/Dashboard.vue:279-309`, `src/components/RepoList.vue:248-249`

---

### Persist worktree filter and sort across repo switches and restarts

- **Category:** ux
- **Effort:** S

**Description:** useWorktreeFilters initialises activeFilter='all' and activeSort='name' fresh on mount (`useWorktreeFilters.ts:21-22`), and the Dashboard switch watcher calls resetFilter() on every repo change (`Dashboard.vue:255`). So a user who prefers 'Dirty' filter or 'Last accessed' sort must re-apply it every single switch and every launch. The library already ships usePersistedRef(key, default) (@stuntrocket/ui, confirmed in dist). Back activeFilter and activeSort with usePersistedRef and stop force-resetting them on repo switch (text search can still reset).

**Rationale:** A power user who lives in 'sort by last accessed' resets it dozens of times a day under the current behaviour. Persisting it is a one-time decision that sticks, and the persistence primitive is already a dependency.

**Evidence:** `src/composables/useWorktreeFilters.ts:20-22`, `src/components/Dashboard.vue:253-255`, `node_modules/@stuntrocket/ui/dist/composables/usePersistedRef.d.ts:1-3`

---

### Broaden worktree search to match path and note, not just branch name

- **Category:** ux
- **Effort:** S

**Description:** filterWorktrees only matches wt.branch (`useSearch.ts:64-67`), yet HelpModal advertises that search covers 'branch name, path, or status' (per survey, `HelpModal.vue:210`). On day 30 a user typing a directory fragment or a word from their purpose note gets no results and assumes the worktree is gone. Extend the matcher to also test wt.path and the stored note (settingsStore.getWorktreeNote(repo, branch)), so search finds worktrees by where they live and what they're for — which is how people actually remember them.

**Rationale:** Search is the fastest way to locate a worktree in a busy repo, and it currently fails for the two most memorable attributes (folder name and the note the user wrote). Aligning behaviour with the documented promise removes a recurring 'where did it go?' moment.

**Evidence:** `src/composables/useSearch.ts:55-67`, `src/stores/settings.ts:225-227`, `src/components/WorktreeCard.vue:148`

---

### Auto-refresh the system tray menu after worktree operations

- **Category:** ux
- **Effort:** M

**Description:** The refresh_tray_menu command is registered and the backend rebuilds per-repo submenus with dirty/behind indicators, but the survey confirms zero callers exist in src/ — the tray only updates on manual 'Refresh'. So after creating, deleting or pulling worktrees from the window, the menu-bar quick-switch list is stale (missing new worktrees, listing deleted ones, wrong dirty dots) until the user manually refreshes. Invoke refresh_tray_menu after successful create/remove/pull-all/prune (the same handlers that already refetch worktrees, e.g. `Dashboard.vue:388` handlePrune and the create/delete 'deleted'/'created' flows), debounced to avoid thrash.

**Rationale:** The tray is the headline 'glance and jump' surface for a developer who keeps Grove in the menu bar all day. A tray that lies about which worktrees exist erodes trust in the fastest entry point; refreshing it after mutations keeps it honest with near-zero new code.

**Evidence:** `src/components/Dashboard.vue:388-422`, `src/components/CreateWorktreeModal.vue:316`, `src/components/DeleteWorktreeDialog.vue:166`, `src-tauri/src/tray.rs:86-201`

---

### Fix the stale 'origin/staging' base-branch placeholder in Settings

- **Category:** ui
- **Effort:** S

**Description:** The Default Base Branch input in SettingsPanel still shows placeholder='origin/staging' (`SettingsPanel.vue:258`), while the actual default is 'origin/main' (`settings.ts:77`). A user who clears the field sees a misleading hint suggesting 'staging' is the default, and may type the wrong base for every new worktree. Change the placeholder to reflect the real default (origin/main) or bind it to DEFAULT_SETTINGS.defaultBaseBranch so it can never drift again.

**Rationale:** Base branch is chosen on every worktree creation; a misleading default hint quietly steers people toward the wrong branch and is a trivial, high-confidence fix.

**Evidence:** `src/components/SettingsPanel.vue:258`, `src/stores/settings.ts:77`

---

## UI Polish

### Add live count chips to the filter segmented control

- **Category:** ui
- **Effort:** S

**Description:** The filter toggles (All / Dirty / Stale / Unmerged) are bare labels with no indication of how many worktrees match each state. Surface a small count next to each label (e.g. 'Dirty 3', 'Stale 1') computed from the unfiltered list, and dim a chip to zero when no worktrees match. This turns the toolbar into an at-a-glance health summary you can read before clicking anything.

**Rationale:** Right now you must click each filter in turn to discover whether anything is dirty or stale. Showing counts inline answers 'does this repo need my attention?' in under a second and makes the whole repo scannable from the toolbar alone.

**Evidence:** `src/composables/useWorktreeFilters.ts:27-32` (filterOptions are label-only), `src/composables/useWorktreeFilters.ts:60-71` (filterWorktrees logic to reuse for counting), `src/components/Dashboard.vue:926-929` (SSegmentedControl render site), `src/components/Dashboard.vue:107` (filterCount computed already exists for the active filter only)

---

### Add an aggregate status dot to each sidebar repository row

- **Category:** ui
- **Effort:** M

**Description:** Sidebar repo rows show only a worktree count. Add a small coloured status dot (amber if any worktree is dirty, blue if any are behind, grey/clean otherwise) and an optional 'N need attention' subtitle, derived from cached worktree data. The dot sits next to the repo icon so the whole repository list reads as a portfolio health column.

**Rationale:** With many repos, you currently cannot tell which one has uncommitted work without clicking into each. A glanceable per-repo signal lets you triage the entire sidebar in one pass — the single biggest scannability win for multi-repo daily drivers.

**Evidence:** `src/components/RepoList.vue:570-583` (repo row shows only name + worktree count, no status), `src/components/RepoList.vue:906-908` (the Recent tab already uses exactly this dirty/clean dot pattern to copy), `src/stores/worktrees.ts:23-25` (per-repo worktree cache available to derive aggregate state)

---

### Establish visual hierarchy in the worktree card status row

- **Category:** ui
- **Effort:** M

**Description:** The status row stacks 6+ badges (clean/dirty, ahead/behind, merged/unmerged, stale, mismatch, protected, orphaned, diff stats, path, age) at roughly equal visual weight in one wrapping flex line. Promote the one or two primary signals (dirty state + sync) to leading position with full weight, and demote secondary tags (protected, mismatch, age) to a lighter, smaller tier or move them to a secondary line. Cap visible badges and roll the rest into a subtle '+2' overflow.

**Rationale:** A flat wall of equal-weight badges defeats fast scanning — the eye has nowhere to land first. A clear primary/secondary tier means the card communicates its single most important state instantly while keeping detail one glance away.

**Evidence:** `src/components/WorktreeCard.vue:408-462` (all badges in one flat gap-2.5 row), `src/components/WorktreeStatusBadges.vue:94-145` (stale/mismatch both compete), `src/components/WorktreeCard.vue:416-443` (protected/orphaned/stale each rendered inline at full size)

---

### Colour-code the diff-stat insertions and deletions

- **Category:** ui
- **Effort:** S

**Description:** Diff stats render as a single muted monospace string '5 files, +120/-45'. Split the additions and deletions so the '+120' is rendered in the success colour and '-45' in the danger colour, matching the universal green/red diff convention while keeping the file count neutral. The backend already separates lines_added and lines_removed, so no new data is needed.

**Rationale:** The +/- is the most information-dense part of the badge but is currently colourless, so the reader must parse the numbers to judge the change's shape. Green/red lets you gauge whether a worktree is mostly additive or destructive at a glance.

**Evidence:** `src-tauri/src/commands.rs:1786` (display formats '+{}/-{}' as one plain string), `src-tauri/src/commands.rs:1794-1799` (lines_added/lines_removed already returned separately), `src/components/WorktreeCard.vue:446-451` (renders diffStats.display in a single muted SBadge)

---

### Disambiguate the two 'Stale' badges with distinct semantics

- **Category:** ui
- **Effort:** S

**Description:** Two different things both render as an amber 'Stale' badge: the CLI's commit-distance stale (>50 commits behind) and Grove's time-based stale (not accessed within threshold). They look identical but mean different things. Give them distinct labels/icons — e.g. 'Stale' (commits) keeps the clock, time-based becomes 'Untouched 21d' with a dimmer dust/calendar icon — and never show both as the same chip.

**Rationale:** Identical badges for different conditions is a legibility trap: a user reading 'Stale' cannot tell whether to sync (behind) or delete (abandoned). Distinct semantics make the right cleanup action obvious.

**Evidence:** `src/components/WorktreeCard.vue:438-443` (time-based Stale badge, warning), `src/components/WorktreeStatusBadges.vue:93-118` (commit-distance Stale badge, also warning, same clock icon), `src/components/WorktreeCard.vue:63-67` (isStaleWorktree time-based computation)

---

### Unify the refresh indicator with skeleton/spinner loading semantics

- **Category:** ui
- **Effort:** M

**Description:** Loading uses skeleton cards on first load but the auto-refresh shows a separate inline 'Refreshing...' text with a pulse dot in the header, while individual card data (diff stats, dirty details) pops in with no placeholder. Introduce a consistent loading vocabulary: a thin top progress sheen during background refresh (using --duration-progress), inline shimmer placeholders for late-arriving per-card badges, and reserve skeletons strictly for initial empty-to-loaded transitions. Document one rule: skeleton for first paint, sheen for refresh, shimmer for lazy badge slots.

**Rationale:** Three different loading idioms for three timing cases reads as inconsistent and makes the app feel less settled. A single coherent loading language reduces visual noise and makes 'is something happening?' unambiguous without a text label.

**Evidence:** `src/components/Dashboard.vue:811-815` ('Refreshing...' inline text + pulse dot), `src/components/Dashboard.vue:978-980` (skeleton cards only on initial load), `src/components/WorktreeCard.vue:70-98` (diff stats and dirty details pop in with no placeholder), `src/styles.css:56` (--duration-progress and shimmer keyframes:306-309 already defined)

---

### Add a compact density mode for the worktree list

- **Category:** ui
- **Effort:** M

**Description:** Cards are fixed at p-4 with a two-line layout and 12-16px vertical gaps, so a repo with 20+ worktrees needs heavy scrolling. Add a 'Compact' density toggle (persisted in settings) that collapses each card to a single dense row — branch, sync indicator, key badges, hover actions — roughly halving row height. Comfortable stays the default.

**Rationale:** Power users managing many worktrees want to see more at once; a density option is a standard list-tool affordance that directly increases how much state fits on screen without scrolling, while preserving the polished default for newcomers.

**Evidence:** `src/components/WorktreeCard.vue:364` (fixed p-4 padding, two-line layout), `src/components/Dashboard.vue:1036` (space-y-3 between cards), `src/stores/settings.ts` (settings store pattern to add a density preference), `src/components/Dashboard.vue:131-132` (VIRTUALISATION_THRESHOLD=50 shows large lists are a real case)

---

### Add a sidebar header summary line of portfolio-wide attention count

- **Category:** ui
- **Effort:** M

**Description:** The sidebar 'Repositories' tab header (`RepoList.vue:386`) shows only a count. Add a one-line roll-up such as '4 repos · 2 need attention' that aggregates dirty/behind/orphaned worktrees across all loaded repos, with the attention figure in the warning colour when non-zero. Clicking it could filter the list to repos with pending work.

**Rationale:** Grove's whole value is managing breadth across many repos, yet there is no single number that answers 'is anything anywhere waiting on me?'. A portfolio attention figure gives an instant morning-triage signal before drilling into any repo.

**Evidence:** `src/components/RepoList.vue:386-388` (sidebar header currently shows only a muted count), `src/stores/worktrees.ts:23-25` (per-repo cache to aggregate from), `src/composables/useTrayBadge.ts` (attention-count computation logic already exists and could be reused for the in-app figure)

---

## Performance

### Render cached worktrees instantly on repo switch (stale-while-revalidate)

- **Category:** performance
- **Effort:** S

**Description:** The store already has worktreeCache, getCachedWorktrees() and isRepoLoaded() but they are dead — selectRepository() blanks worktrees to [] and flips loadingWorktrees on, and fetchWorktreesInternal() always shows the skeleton then calls the CLI. Wire selectRepository() to paint cached worktrees immediately (no skeleton) when isRepoLoaded(name) is true, and have fetchWorktreesInternal() skip the loading flag on a warm cache so the fresh CLI result silently replaces the stale data. First switch back to a previously-visited repo becomes instant instead of a 6-skeleton flash plus a grove ls round-trip.

**Rationale:** Switching between repos is the single most frequent navigation in daily use (sidebar quick-select 1-9 exists). Right now every switch shows skeletons and blocks on a sidecar spawn even for repos visited seconds ago. Stale-while-revalidate makes switching feel instantaneous while still refreshing in the background.

**Evidence:** `src/stores/worktrees.ts:25` (worktreeCache), `:79` (isRepoLoaded), `:86` (getCachedWorktrees), `:94-95` (selectRepository blanks + loading); `src/composables/useWorktrees.ts:93-160` (fetchWorktreesInternal always setLoadingWorktrees(true), never reads cache); `src/components/Dashboard.vue:251-266` (switch watcher always calls fetchWorktrees)

---

### Concurrency-limit the per-card diff/dirty fan-out

- **Category:** performance
- **Effort:** M

**Description:** Every WorktreeCard fires getDiffStats (merge-base + numstat = 2 git spawns) and, if dirty, getDirtyDetails (git status = 1 spawn) in onMounted. In the non-virtual path all filtered cards mount simultaneously, so a 40-worktree repo can spawn ~120 git subprocesses in one render burst, thrashing the IPC/spawn_blocking pool. Introduce a small shared concurrency queue (e.g. 4-6 in-flight) in a composable that WorktreeCard calls instead of invoking directly, smoothing the burst so the first visible cards populate their badges fast and the rest trickle in.

**Rationale:** On render the UI hangs on a thundering herd of git processes — the badges that make cards useful (diff stats, dirty breakdown) all compete at once and the top-of-list cards are no faster than the bottom ones. A concurrency cap prioritises perceived speed for what the user is actually looking at.

**Evidence:** `src/components/WorktreeCard.vue:70-80` (getDiffStats onMounted), `:90-98` (getDirtyDetails onMounted), `:410` + `:446-450` (both shown on collapsed row, so genuinely needed per card); `src/components/Dashboard.vue:1038` (v-for mounts all cards in non-virtual path); `src-tauri/src/commands.rs:1726+1756` (2 git spawns per diff), `:1577` (git status)

---

### Add a batch worktree-stats command to collapse N×3 git spawns into one

- **Category:** performance
- **Effort:** L

**Description:** Provide a single Tauri command get_worktree_stats(repoName) that loops the repo's worktrees once in Rust, runs git status --porcelain and git diff --numstat per worktree in a rayon pool (the parallel-pull pool pattern already exists), and returns a map of branch -> {dirtyDetails, diffStats}. The store hydrates cards from this one result so individual cards no longer each invoke. Eliminates the per-card IPC round-trip overhead and lets Rust parallelise the git work it controls.

**Rationale:** Today the cost scales as 3N independent IPC calls, each with serialisation and spawn_blocking overhead, and the frontend has no way to parallelise sensibly. One batched, Rust-parallelised call is dramatically faster for large repos and keeps the badges fresh after every refresh instead of only on mount.

**Evidence:** `src/components/WorktreeCard.vue:70-98` (per-card invokes); `src-tauri/src/commands.rs:1571-1624` (get_dirty_details), `:1715-1779` (get_diff_stats — two git spawns each); `src-tauri/src/wt.rs:59-63` (existing rayon min(cores,8) pool to reuse)

---

### Make the first window paint independent of the tray build

- **Category:** performance
- **Effort:** M

**Description:** tray::setup_tray runs on the setup thread and does N+1 blocking sidecar spawns (grove repos then grove ls per repo) before window.show(), so for a user with many repos the window paint waits on a serial fan-out of CLI calls. Move tray menu construction off the critical path: show the window first, then build the tray menu in a spawned task (tauri::async_runtime::spawn) so the loading screen appears immediately and the menu populates a beat later.

**Rationale:** Cold-start time-to-first-paint is gated by an operation the user cannot even see yet. Decoupling tray build from window show removes the worst serial dependency on launch for multi-repo users.

**Evidence:** `src-tauri/src/tray.rs:86-177` (build_tray_menu = 1 + N_repos blocking sidecar spawns via std::thread::spawn+join); `src-tauri/src/lib.rs` setup() ordering (setup_tray before window.show()); BACKEND SURVEY §5 launch critical path

---

### Cache resolved config in the backend to kill repeated grove config spawns

- **Category:** performance
- **Effort:** M

**Description:** Eleven config/hook commands each spawn grove config --json solely to read herd_root/hooks_dir. Opening the Config or Hooks panel, or editing a hook, triggers a fresh sidecar process per operation. Cache the resolved config in a OnceLock/Mutex (global) and invalidate it on write_config_file/update_config_keys. The panels then respond without a sidecar round-trip per click.

**Rationale:** Hook and config panels feel laggy because every list/read/write re-spawns the CLI just to find two paths. A memoised config makes the Repo Management panel snappy and removes ~10 redundant process spawns per session.

**Evidence:** `src-tauri/src/commands.rs:1347,1366,1386,1406,1430,1448,1467,1489,1513,1532,1551` (each calls wt::get_config purely for herd_root/hooks_dir); invalidation points: write_config_file/update_config_keys (same file)

---

### Pass worktree paths into start_watching instead of re-fetching

- **Category:** optimisation
- **Effort:** S

**Description:** start_watching re-runs wt::get_worktrees (a full grove ls) purely to collect paths, immediately after the frontend already fetched the same worktrees to render them. Change start_watching to accept the paths from the frontend (the store already holds them) so the watcher starts without a duplicate sidecar spawn on every repo switch.

**Rationale:** Every repo selection currently costs two grove ls calls back-to-back (one to render, one to start watching). Removing the duplicate shortens the switch latency and one fewer sidecar process per navigation adds up across a day of switching.

**Evidence:** `src-tauri/src/commands.rs:1304-1310` (start_watching calls wt::get_worktrees then maps paths); `src/components/Dashboard.vue:259-266` (fetchWorktrees then startWatching in sequence — store already has paths)

---

### Drop the unconditional 800ms loading-screen floor when data is ready

- **Category:** performance
- **Effort:** S

**Description:** App.vue awaits a hard setTimeout(800ms) before hiding the loading screen regardless of how fast checkAvailability + fetchRepositories complete. Replace the fixed floor with a much smaller minimum (e.g. 250ms to avoid a flash) measured from mount, so when the CLI and repo list resolve quickly the app appears in a few hundred ms instead of always waiting 800ms.

**Rationale:** On a warm machine the real work finishes well under 800ms, so the floor is pure dead time the user feels on every launch. A short anti-flash minimum keeps the polish without the artificial wait.

**Evidence:** `src/App.vue:69-72` (await new Promise setTimeout 800ms unconditional); `src/composables/useRepos.ts:39-49` (checkAvailability also does a second serial get_wt_version spawn — both complete before the floor)

---

### Parallelise background fetch + fold orphan detection into one branches call

- **Category:** optimisation
- **Effort:** M

**Description:** Each background-fetch cycle runs N×(grove fetch) then N×(grove branches via detectOrphaned) strictly serially. Run the per-repo fetch+orphan work with a bounded concurrency (e.g. 3-4 at a time) so cycles complete faster, and reuse the branches output already fetched rather than detectOrphaned re-spawning grove branches independently. Cap concurrency to avoid network saturation but stop serialising unrelated repos.

**Rationale:** With many repos a 5-minute cycle can run long and overlaps with the user's own refreshes, contending for the sidecar. Bounded parallelism finishes the cycle quicker and reduces the chance of background work stalling foreground responsiveness.

**Evidence:** `src/composables/useBackgroundFetch.ts:36-46` (sequential for-loop: fetchRepo then detectOrphaned per repo); `src/composables/useOrphanedDetection.ts:38` (detectOrphaned spawns grove branches per repo every cycle)

---

## Power User

### Search worktrees by branch across all repos in the command palette

- **Category:** feature
- **Effort:** M

**Description:** Extend the Cmd+K palette so that when the query matches no commands it also fuzzy-searches every loaded worktree branch across all repos (using worktreeCache), surfacing entries like 'Go to feature/login (acme-api)'. Selecting one calls onNavigateToWorktree to switch repo and focus the branch. This is the single biggest power-user lever: jump to any worktree in any repo from one keystroke without first clicking the right repo in the sidebar.

**Rationale:** A developer juggling many repos currently must locate the repo in the sidebar, then scan/search the worktree list. The palette is the natural global jump surface, the navigation hook already exists as a stub, and the worktree data is already cached in the store.

**Evidence:** `useCommandRegistry.ts:37-38` defines onNavigateToWorktree but it is never wired by `Dashboard.vue:650`; `CommandPalette.vue:47-61` only filters registered commands; worktree cache exists at `stores/worktrees.ts:25` (worktreeCache) and `86-88` (getCachedWorktrees); store.focusWorktree at `stores/worktrees.ts:103` is the focus mechanism.

---

### Multi-select worktrees with checkboxes for bulk pull/sync/delete

- **Category:** feature
- **Effort:** M

**Description:** Add a selection model (a reactive Set of branch names in the worktrees store) and a checkbox that appears on each WorktreeCard row on hover or when a 'select mode' is toggled. A bulk-action bar (Pull selected, Sync selected, Delete selected) appears when any are checked. Pull-selected already exists end-to-end in the backend; this just exposes it to the user instead of only the retry path.

**Rationale:** Pulling or deleting half a dozen specific worktrees one at a time is tedious daily friction. The plumbing (parallel pull, progress events) is already built and only used internally for retry, so the cost is mostly the selection UI.

**Evidence:** pull_selected_worktrees is fully implemented (`useWt.ts:263-264`) but only called for retry at `Dashboard.vue:504`; no selection model exists - `WorktreeCard.vue` row @click at line 365 only toggles details; store has only single focusedBranch (`stores/worktrees.ts:19`) with no multi-select set.

---

### Wire the unused global shortcuts (Cmd+T/Cmd+B/copy/Cmd+Enter) into Dashboard

- **Category:** ux
- **Effort:** S

**Description:** Pass the already-defined handlers (onOpenTerminal, onOpenBrowser, onCopyPath/Branch/Url/CdCommand, onOpenAll) into Dashboard's useKeyboardShortcuts call so the registered global keys actually act on the focused worktree. Today these keys are registered, call preventDefault/stopPropagation, then invoke undefined - so they silently swallow the native keystroke (e.g. Cmd+C) and do nothing.

**Rationale:** These shortcuts are advertised in HelpModal and the palette, so users expect them globally. Worse, they currently eat native keystrokes (Cmd+C copy) while doing nothing. The handler bodies already exist as palette callbacks - it is wiring, not new logic.

**Evidence:** `useKeyboardShortcuts.ts:251-294` registers copy/openAll/terminal/browser shortcuts that preventDefault at lines 151-152 then call optional handlers; `Dashboard.vue:706-724` only passes onRefresh/onCreateWorktree/onOpenSettings/onOpenRepoManagement/onOpenHelp/onCloseModal/onFocusSearch/onCommandPalette/onOpenEditor; the palette equivalents already exist as handlePaletteOpenInTerminal/Browser/All and copyFocusedWorktreeValue in `Dashboard.vue:600-690`.

---

### Arrow-key / j-k navigation and Enter-to-open in the worktree list

- **Category:** ux
- **Effort:** M

**Description:** Add keyboard navigation to the main worktree list (currently only the sidebar RepoList has it). Up/Down (or j/k) move focusedBranch through filteredWorktrees, Enter opens the focused worktree in the editor, and the existing copy/open shortcuts then act on it. Reuse the useListNavigation helper that already exists but is only applied to repos.

**Rationale:** A keyboard-first user can navigate repos with arrows but then has to reach for the mouse to pick a worktree. Closing that gap makes the whole flow mouse-free, which is the core promise for a power user managing many worktrees.

**Evidence:** useListNavigation helper exists at `useKeyboardShortcuts.ts:434-490` but RepoList is the only consumer (RepoList registers nav-only shortcuts per survey); `WorktreeCard.vue:365` row only toggles details, focused comes solely from focusedBranch prop (`WorktreeCard.vue:27`); Dashboard renders filteredWorktrees at `Dashboard.vue:1038-1044` with no nav handler wired.

---

### Configurable per-worktree quick-action script (post-create + on-demand)

- **Category:** feature
- **Effort:** M

**Description:** Add a 'Run script' setting (e.g. composer install && npm i, or a custom command) that can be triggered from the WorktreeCard menu via the existing open_in_terminal path - it opens a terminal in the worktree and runs the command. Also execute a template's post_create_script after creation, which is currently parsed but ignored. Keep it local-only: just shells a user-provided command in the worktree directory.

**Rationale:** After creating a worktree, developers almost always run the same setup commands (install deps, copy .env, migrate). Templates already carry a post_create_script field that the GUI silently drops, so users defined intent that never runs.

**Evidence:** post_create_script exists on templates but CreateWorktreeModal handleSubmit ignores it (`CreateWorktreeModal.vue:298` per survey); open_in_terminal already accepts a path and runs osascript in that dir (`commands.rs:407-420`); no script-runner command exists in commands.rs (only open_in_* shell-outs).

---

### Wire the global Cmd+Shift+W quick-switcher to open the command palette

- **Category:** feature
- **Effort:** S

**Description:** The backend already registers a global OS shortcut Cmd+Shift+W and emits a global_shortcut_quick_switch event, but no frontend code listens for it. Add a listener in App.vue/Dashboard that shows the window and opens the command palette (ideally pre-focused on worktree search per idea 1), giving a true system-wide 'jump to any worktree' from any app.

**Rationale:** A global quick-switcher is the killer power-user feature for someone constantly context-switching between worktrees while working in their editor. The OS shortcut is already registered and advertised in Help, but it is a dead end with no listener.

**Evidence:** `lib.rs:207-213` registers CmdOrCtrl+Shift+W and emits 'global_shortcut_quick_switch'; grep for that event name in src/ returns zero listeners; HelpModal advertises Ctrl+Shift+W 'Quick worktree switcher' per survey; toggleCommandPalette already exists in `Dashboard.vue:723`.

---

### Auto-refresh the tray menu after worktree operations

- **Category:** ux
- **Effort:** S

**Description:** Call the existing refresh_tray_menu command from the frontend after create/remove/pull-all/prune complete so the menu-bar submenus reflect reality without a manual Refresh. Debounce it to avoid rebuilding on every event, since the rebuild is N+1 sidecar spawns.

**Rationale:** For users who drive worktrees primarily from the tray, stale submenus (deleted worktrees still listed, new ones missing) erode trust in the quick-access menu. The command is registered but has zero callers, so the tray silently drifts out of date.

**Evidence:** refresh_tray_menu is registered but the backend survey confirms zero callers in src/; tray build is N+1 serial sidecar spawns (`tray.rs:91,149`) so the call must be debounced; create/remove/pull/prune all complete in Dashboard handlers (handlePullAll/handlePrune referenced at `Dashboard.vue:656-657`).

---

### Tray context-menu and quick-launch should honour the user's editor/terminal settings

- **Category:** ux
- **Effort:** S

**Description:** The right-click worktree context menu hard-codes 'Visual Studio Code' and 'Terminal' instead of reading the user's configured editor/terminal. Route these actions through the same open_in_editor/open_in_terminal commands (which already respect settings) by passing the chosen app, so a Cursor/iTerm user gets their tools from the tray.

**Rationale:** A power user who has set Cursor + WezTerm in settings still gets VS Code and Terminal.app launched from the tray - an inconsistency that breaks their muscle memory and toolchain. Unifying on the settings-aware open_in_* commands removes the divergence.

**Evidence:** Tray context menu hard-codes 'Visual Studio Code'/'Terminal' (`commands.rs:1940,1945` per backend survey) while open_in_editor/open_in_terminal already branch on the user's choice (`commands.rs:239,407`); also note the per-right-click on_menu_event re-registration at `commands.rs:1935` that the same handler touches.

---

## Awareness

### Wire the computed tray badge to the macOS menu bar icon

- **Category:** feature
- **Effort:** M

**Description:** useTrayBadge already computes badgeCount reactively but the value is discarded (`Dashboard.vue:151` calls useTrayBadge() bare). Add a tiny set_tray_badge Tauri command that calls tray.set_title(Some(count)) on the resolved tray icon, and invoke it from Dashboard whenever worktrees or badgeCount change (debounced). The menu bar icon then shows e.g. '3' next to it when 3 worktrees need attention, even when the window is hidden.

**Rationale:** This is the single highest-value status-awareness win: the whole point of a menu-bar app is to glance at the bar and know whether anything needs you. The computation, settings toggle, and roadmap acceptance criteria all already exist; only the last wire is missing, so attention currently never reaches the user when Grove is in the background.

**Evidence:** `src/composables/useTrayBadge.ts:38-41` (badgeCount computed); `src/components/Dashboard.vue:151` (return value discarded); `src-tauri/src/tray.rs:309-310` (tray_by_id already resolved, set_menu used — set_title trivially addable); grep for set_badge|set_title in src-tauri = empty

---

### Surface cross-repo attention rollup in the sidebar repo rows

- **Category:** ui
- **Effort:** M

**Description:** Repo rows in the sidebar show only 'N worktrees' (`RepoList.vue:581`) with no attention signal. Add a small coloured dot or count badge per repo summarising worktrees needing attention (dirty / behind / orphaned) for repos already loaded into worktreeCache. Reuse the needsAttention() predicate from useTrayBadge against store.getCachedWorktrees(repo.name). Repos not yet visited show nothing rather than a misleading zero.

**Rationale:** With many repos, the user has no way to know which repo has dirty or behind worktrees without clicking into each one. A per-repo dot turns the sidebar into a triage surface — you see at a glance where the work is, instead of hunting repo by repo.

**Evidence:** `src/components/RepoList.vue:581` (only worktree count shown); `src/stores/worktrees.ts:25,86-88` (worktreeCache + getCachedWorktrees exist); `src/composables/useTrayBadge.ts:27-33` (reusable needsAttention predicate)

---

### Add a 'Needs Attention' header rollup with one-click filter

- **Category:** ux
- **Effort:** M

**Description:** The Dashboard header shows refresh status and last-updated text (`Dashboard.vue:811-820`) but no attention summary for the current repo. Add a compact pill like '3 dirty · 2 behind · 1 orphaned' that, when clicked, applies the matching filter to the worktree list. It reads from existing computed sets (dirtyWorktrees, attentionWorktrees, orphanedWorktrees).

**Rationale:** Right now the user must visually scan every card's badges to understand the repo's overall state. A rollup answers 'is anything wrong here, and where' instantly, and clicking it jumps straight to the affected worktrees — turning a passive status display into an actionable entry point.

**Evidence:** `src/components/Dashboard.vue:811-820` (header status region); `src/stores/worktrees.ts:38-44` (dirtyWorktrees computed); `src/composables/useOrphanedDetection.ts:92-108` (orphanedWorktrees/orphanedCount); `src/composables/useTrayBadge.ts:46-60` (attentionWorktrees with reasons)

---

### Auto-refresh the stale tray menu after mutating operations

- **Category:** feature
- **Effort:** S

**Description:** refresh_tray_menu exists in Rust (`commands.rs:1890`) and is registered, but has zero frontend callers — the tray's per-worktree dirty/behind indicators go stale until the user manually hits Refresh. Call invoke('refresh_tray_menu') after create, delete, pull-all, prune, and sync complete (debounced, e.g. trailing 1s) so the menu-bar submenus reflect reality.

**Rationale:** The tray submenus already display ● dirty and ↓N behind per worktree (`tray.rs:189-196`), which is exactly the status surface this lens cares about — but it silently drifts out of date. Refreshing after mutations makes the tray a trustworthy at-a-glance source instead of one the user learns to distrust.

**Evidence:** `src-tauri/src/commands.rs:1888-1891` (refresh_tray_menu command, no frontend caller); `src-tauri/src/tray.rs:189-196` (per-worktree status indicators); grep refresh_tray_menu in src/ = zero callers; mutations at `Dashboard.vue:388-454`

---

### Surface unpushed work (ahead > 0) as a 'needs attention' state

- **Category:** feature
- **Effort:** S

**Description:** The Worktree.ahead field (unpushed local commits) is captured and shown as a colour on StatusBadge, but never treated as something that needs the user's attention — only dirty/behind/stale feed the badge and rollups. Add 'ahead' (unpushed) as a selectable attention state in trayBadgeStates and the needsAttention predicate, so worktrees with local commits not yet pushed surface in the badge, sidebar dot, and header rollup.

**Rationale:** Forgotten unpushed commits are a classic source of lost work and 'where did my change go' confusion across worktrees. Behind-remote is surfaced but ahead-of-remote (the riskier 'your work only exists locally' case) is not. The data is already there; this just promotes it to an attention signal.

**Evidence:** `src/types/wt.ts:67-68` (ahead field); `src/components/StatusBadge.vue:36,45,53-55` (ahead rendered but only cosmetic); `src/composables/useTrayBadge.ts:29-31` (needsAttention checks dirty/behind/stale only, not ahead)

---

### Make tray badge states user-configurable in Settings

- **Category:** ui
- **Effort:** S

**Description:** SettingsPanel exposes a single trayBadgeEnabled toggle (`SettingsPanel.vue:330-334`) but not WHICH states count, despite settings.trayBadgeStates already existing and the predicate already reading it. Add three checkboxes (dirty / behind / stale, plus ahead from the idea above) under the existing toggle so the user controls what 'needs attention' means to them.

**Rationale:** Attention signalling is only useful if it matches the user's workflow — someone who commits constantly wants 'behind' alerts but not 'dirty' noise. The state array and predicate already support per-state filtering; the only thing missing is the three controls, so this closes a documented roadmap acceptance gap cheaply.

**Evidence:** `src/stores/settings.ts:57-58,82` (trayBadgeStates exists, defaults to all three); `src/components/SettingsPanel.vue:330-334` (only the on/off toggle exposed); `src/composables/useTrayBadge.ts:28` (predicate already reads the array)

---

### Notify on worktree sync conflicts and completion when window is unfocused

- **Category:** ux
- **Effort:** S

**Description:** notifySyncComplete and notifyHookFailed are defined in useNotifications (lines 94,101) but never called. handleSync in WorktreeCard only shows an in-app toast (`WorktreeCard.vue:266-277`), which is invisible if the user has switched away. Wire native notifications for sync conflicts/failures (the cases that genuinely need the user back), gated by the existing window-unfocused check that notify() already enforces.

**Rationale:** Sync rebases can hit conflicts that block progress; if the user kicked one off and tabbed away, they silently sit stuck. Pull-all and prune already notify natively — sync, the operation most likely to need human intervention, is the conspicuous omission. The helper and unfocused-gating already exist.

**Evidence:** `src/composables/useNotifications.ts:94-106` (notifySyncComplete/notifyHookFailed defined, unused); `src/components/WorktreeCard.vue:266-277` (sync result only toasted); `src/composables/useNotifications.ts:56-57` (notify() already suppresses when focused)

---

### Daily hygiene prompt for prunable / merged / orphaned worktrees

- **Category:** feature
- **Effort:** M

**Description:** staleWorktrees, safeToDeleteCount (`useStaleDetection.ts:62-87`) and orphanedWorktrees (`useOrphanedDetection.ts:92`) are computed but the 'Review Stale Worktrees' command never appears because Dashboard doesn't pass onReviewStaleWorktrees (`useCommandRegistry.ts:204`). Add a once-per-day, dismissible header banner — 'N worktrees safe to clean up' — shown only when safeToDeleteCount > 0, gated by a lastHygienePromptDate in settings, that opens a filtered list of merged+clean worktrees.

**Rationale:** Cruft accumulation is the quiet tax of worktree workflows; users rarely remember to prune. A gentle, rate-limited prompt that only fires when there's genuinely safe-to-delete cruft brings the cleanup to the user instead of relying on them to go looking — and it finally exposes the already-computed stale/orphan data that's currently dead.

**Evidence:** `src/composables/useStaleDetection.ts:62-87` (staleWorktrees/safeToDeleteCount computed, unconsumed); `src/composables/useOrphanedDetection.ts:92-108` (orphanedWorktrees unconsumed); `src/composables/useCommandRegistry.ts:204` (review command gated on handler Dashboard never passes); existing dismissible-banner pattern in UpdateBanner

---

## Integration

### Wire up the dead global keyboard shortcuts so they stop swallowing native keystrokes

- **Category:** ux
- **Effort:** S

**Description:** useKeyboardShortcuts registers ⌘T (terminal), ⌘B (browser), ⌘C/⇧⌘C/⌥⌘C/⇧⌘D (copy path/branch/url/cd) and ⌘Enter (Open All) and calls event.preventDefault()+stopPropagation() for each, but Dashboard's useKeyboardShortcuts({...}) call passes none of those handlers. The result is worse than a no-op: pressing ⌘C with no input focused is intercepted and swallowed, doing nothing while blocking the native copy. Pass the existing handlers (handlePaletteOpenInTerminal, the openInBrowser path, and the four copy helpers already imported in Dashboard) so the advertised shortcuts actually fire, and guard against swallowing when no worktree is focused.

**Rationale:** These are advertised in HelpModal and tooltips ('Open in terminal (⌘T)') yet silently fail; ⌘C interception is an actively harmful regression for a daily driver. One small wiring change makes the whole second tier of power-user shortcuts real.

**Evidence:** `src/composables/useKeyboardShortcuts.ts:212-294` (registered handlers); `src/components/Dashboard.vue:706-724` (only onOpenEditor passed); `useKeyboardShortcuts.ts:151-152` (preventDefault before calling undefined?.())

---

### Make the ⌃⇧W global quick-switcher open the command palette

- **Category:** feature
- **Effort:** S

**Description:** The Rust backend registers a system-wide ⌃⇧W shortcut that shows the window and emits a 'global_shortcut_quick_switch' event (and ⌃⇧G to toggle the window, which works). HelpModal advertises ⌃⇧W as 'Quick worktree switcher', but no frontend code listens for the event, so pressing it just raises the window and nothing opens. Add a listen('global_shortcut_quick_switch') in App.vue (next to the existing tray listener) that opens the command palette / focuses search once Dashboard is mounted.

**Rationale:** A global hotkey that pops Grove's palette from anywhere is exactly the 'jump to a worktree without leaving my editor' workflow the app is built for. The backend half already ships; only the listener is missing.

**Evidence:** `src-tauri/src/lib.rs:207-218` (emits global_shortcut_quick_switch); `src/App.vue:44-67` (tray listener exists, no quick-switch listener); HelpModal advertises ⌃⇧W

---

### Hook up the native right-click context menu's copy actions and use configured editor/terminal

- **Category:** ux
- **Effort:** M

**Description:** show_worktree_context_menu builds a native macOS context menu whose Copy Path / Copy Branch / Copy URL items emit a 'context_menu_action' Tauri event — but no frontend code listens for it, so native copy items silently fail. Its Open Editor / Open Terminal items also bypass settings and hardcode 'open -a Visual Studio Code' and 'open -a Terminal', ignoring the user's chosen editor/terminal. Add a context_menu_action listener in Dashboard that routes to the existing copy helpers, and replace the hardcoded apps with the existing open_in_editor / open_in_terminal commands (which already honour settings).

**Rationale:** A native right-click menu that half-works (copies do nothing, opens always launch VS Code/Terminal regardless of preference) feels broken. Reusing the existing, settings-aware commands fixes both in one pass.

**Evidence:** `src-tauri/src/commands.rs:1953-1971` (emits context_menu_action, no listener in src/); `commands.rs:1938-1947` (hardcoded 'Visual Studio Code'/'Terminal'); open_in_editor/open_in_terminal at `commands.rs:239,407` honour settings

---

### Push the computed tray badge count to the macOS menu bar / dock

- **Category:** feature
- **Effort:** M

**Description:** useTrayBadge computes badgeCount and attentionWorktrees reactively (dirty/behind/stale), and it is instantiated in Dashboard — but the return value is discarded and there is no backend command to display it, so the count never reaches the OS. Add a small set_tray_badge Tauri command using set_title on the tray icon (or set_badge_label on the dock), add the menu/tray permission to capabilities/default.json, and have Dashboard watch badgeCount and invoke it after each refresh. Zero shows no badge.

**Rationale:** This completes the passive-awareness model the roadmap intended: a developer in their editor sees the menu-bar count tick up when they forget to commit or a teammate pushes, prompting a glance at Grove without switching apps. All the computation already exists.

**Evidence:** `src/composables/useTrayBadge.ts:38-60` (badgeCount/attentionWorktrees computed); `src/components/Dashboard.vue:151` (useTrayBadge() return discarded); no set_badge/set_title in src-tauri (grep empty); `src-tauri/capabilities/default.json` (no badge permission yet)

---

### Refresh the system tray menu after worktree operations

- **Category:** ux
- **Effort:** S

**Description:** The tray submenu lists each repo's worktrees with dirty (●) and behind (↓N) indicators, but build_tray_menu only runs at startup and via the manual 'Refresh' item — refresh_tray_menu is registered as a command yet has zero callers in the frontend. After create/delete/pull/sync and after the background-fetch cycle, invoke refresh_tray_menu so the menu-bar quick-access reflects reality. Debounce it to avoid rebuild storms.

**Rationale:** The tray is sold as 'quick access to worktrees', but it silently goes stale the moment you add or remove a worktree — clicking a deleted branch in the tray is confusing. A debounced refresh on mutation keeps the menu trustworthy.

**Evidence:** `src-tauri/src/tray.rs:303-314` (refresh_tray_menu exists); no invoke('refresh_tray_menu') anywhere in src/ (grep empty); `tray.rs:186-201` (dirty/behind indicators that drift)

---

### Add an optional per-repo startup command run when opening a terminal

- **Category:** feature
- **Effort:** M

**Description:** open_in_terminal only cd's into the worktree and clears the screen — it never runs anything. Developers almost always follow 'open terminal here' with the same command (npm run dev, php artisan serve, composer install, source .venv). Add an optional per-repo 'terminal startup command' stored in app settings (like worktreeNotes/repositoryGroups already are), and append it after the cd in get_terminal_applescript so opening a terminal can boot the dev server in one click. Empty by default; opt-in.

**Rationale:** For a worktree-heavy Laravel/Herd workflow, the terminal is opened to run the same thing every time. Eliminating that repeated typing turns 'open terminal' into 'open and start working', a daily time-saver, while staying local and opt-in.

**Evidence:** `src-tauri/src/commands.rs:357-398` (get_terminal_applescript only cd+clear); `src/stores/settings.ts` (worktreeNotes/repositoryGroups show the per-repo local-settings pattern already exists)

---

### Add Ghostty, Kitty and the JetBrains family to the editor/terminal app pickers

- **Category:** feature
- **Effort:** S

**Description:** Settings expose a fixed list: terminals are Terminal/iTerm2/Warp/Alacritty/WezTerm and editors are VS Code/Cursor/PhpStorm/Zed/Sublime/Vim/Neovim. Two of the most popular modern macOS terminals — Ghostty and Kitty — are absent, and JetBrains is reduced to PhpStorm only (no IntelliJ IDEA/WebStorm/PyCharm/GoLand/RustRover). Add Ghostty and Kitty to TERMINAL_OPTIONS plus their AppleScript/open-args branches in get_terminal_applescript, and extend EDITOR_OPTIONS / get_editor_app with the common JetBrains IDEs. Custom path already exists as a fallback, but first-class entries avoid manual setup.

**Rationale:** If a user's daily terminal or IDE isn't in the list, the one-click launchers — the most-used feature — force them into the fiddly 'custom path' flow or don't work. These are small, additive entries that cover a large slice of real setups.

**Evidence:** `src/stores/settings.ts:14-19,262-280` (terminal/editor option lists); `src-tauri/src/commands.rs:357-398` (get_terminal_applescript branches); `commands.rs:200-227` (get_editor_app mapping)

---

### Add a macOS dock menu mirroring the tray quick actions

- **Category:** feature
- **Effort:** M

**Description:** Grove builds a rich tray (menu-bar) menu but has no dock menu — right-clicking the dock icon shows only the default macOS items. Tauri supports app.set_dock_menu (macOS). Add a compact dock menu with the high-value actions: Show Window, Create Worktree, Refresh, and the most-recent few worktrees (reusing the same wt:repo:branch id scheme and tray_worktree_selected event the tray already handles). Build it alongside setup_tray and refresh it with the tray.

**Rationale:** Many macOS users reach for the dock, not the menu bar. Surfacing the same quick-jump-to-worktree affordance there is a natural, low-cost native nicety that reuses the entire existing tray event plumbing.

**Evidence:** `src-tauri/src/tray.rs:86-202` (tray menu + worktree item id scheme); `tray.rs:222-241` (tray_worktree_selected handler reusable by dock); `lib.rs:74-86` (setup() where a dock menu would be registered); no dock menu present (grep empty)
