# Grove Roadmap

Desktop GUI for git worktree management — visual interface for the `wt` CLI.

## Pending

### [UX/UI] Add drag-and-drop repository registration
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Currently repositories must be added via the native file picker dialog. Supporting drag-and-drop of folders onto the app window (or a designated drop zone) would make onboarding faster and more intuitive, especially for users setting up Grove for the first time with many repositories.
- **Acceptance criteria:**
  - User can drag a folder from Finder onto the Grove window to register it as a repository
  - Drop zone visual feedback (highlight, icon change) when dragging over the app
  - Validation on drop: folder must be a valid git repository (contains `.git`)
  - Clear error toast if dropped folder is not a git repo
  - Works alongside existing file picker flow (not a replacement)

### [Feature] Add worktree quick-switch command palette
- **Priority:** P2 (important)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Users managing many worktrees across multiple repositories need a fast way to find and switch to a specific worktree without navigating the tree sidebar. A fuzzy-search command palette (Cmd+K or Cmd+P) that searches across all repositories and worktrees would match the workflow speed that power users expect from tools like VS Code and Raycast.
- **Acceptance criteria:**
  - Global shortcut (Cmd+K) opens a fuzzy-search palette listing all worktrees across all registered repos
  - Results show worktree name, branch, and parent repository
  - Selecting a result navigates to that worktree in the main view
  - Search matches against branch name, worktree path, and repository name
  - Palette dismisses on Escape or clicking outside
  - Results appear within 50ms of typing (cached index)

### [Quality] Add accessibility improvements for keyboard-only navigation
- **Priority:** P3 (nice-to-have)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The UX roadmap identifies accessibility as a remaining opportunity. Adding proper focus management, ARIA labels, and keyboard navigation through the worktree tree and action buttons would make Grove usable for keyboard-only users and improve the experience for power users who prefer keyboard-driven workflows.
- **Acceptance criteria:**
  - Tab key navigates through all interactive elements in a logical order
  - Arrow keys navigate the repository/worktree tree sidebar
  - Enter/Space activates focused buttons and tree items
  - All interactive elements have appropriate ARIA labels
  - Focus ring visible on all focusable elements
  - Focus trapped in modal dialogs; Escape closes them

### [Performance] Add lazy loading for repository worktree lists
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** When users register many repositories, the initial load fetches worktree details for all repositories simultaneously, which can be slow with repositories that have numerous worktrees. Loading worktree details on-demand when a repository node is expanded would reduce startup time and keep the tree sidebar responsive, especially for users managing 10+ repositories.
- **Acceptance criteria:**
  - Repository list loads immediately with name and basic metadata only
  - Worktree details fetched when a repository node is expanded for the first time
  - Loading indicator shown while worktree data is being fetched
  - Expanded state and worktree data cached for the session (no re-fetch on collapse/expand)
  - Initial app load time reduced for users with 10+ registered repositories

### [Distribution] Add Tauri auto-updater with release channel support
- **Priority:** P2 (important)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** As the most production-ready app in the portfolio, Grove is the natural first candidate for auto-update distribution. Tauri's updater plugin with release channel support (stable/beta) would enable shipping updates to early testers before wider release, and ensure all users stay on the latest version without manual downloads.
- **Acceptance criteria:**
  - Tauri updater plugin configured with update endpoint and signing
  - Release channel selector in settings (stable/beta)
  - Update check on launch with non-intrusive notification
  - Release notes displayed before update installation
  - Rollback guidance documented in case an update causes issues

### [Innovation] Add worktree templates for common branching workflows
- **Priority:** P3 (nice-to-have)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Developers follow consistent branching patterns — feature/*, hotfix/*, release/* — with specific conventions for base branch, naming format, and post-create actions (e.g. install dependencies, run migrations). Worktree templates that encode these patterns would reduce repetitive setup and enforce team conventions, especially valuable for teams standardising on worktree-based workflows.
- **Acceptance criteria:**
  - Template entity with: name, branch prefix, default base branch, post-create script (optional)
  - Built-in templates for common patterns: feature, hotfix, release
  - Custom templates creatable and editable from the UI
  - Template selection available during worktree creation flow
  - Post-create script executed after worktree is created (with user confirmation)

### [Quality] Add stale worktree detection with cleanup suggestions
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Developers often create worktrees for short-lived tasks (code reviews, experiments, hotfixes) and forget to clean them up. Stale worktrees consume disk space, clutter the sidebar, and their branches may diverge from the main branch. Detecting worktrees that haven't been accessed in a configurable period (default: 14 days) and suggesting cleanup — with a preview of uncommitted changes and branch status before deletion — would help users maintain a tidy worktree set.
- **Acceptance criteria:**
  - Stale worktree detection based on last access time (configurable threshold, default 14 days)
  - Stale badge visible on worktree cards in the sidebar
  - "Review stale worktrees" action accessible from the toolbar or command palette
  - Cleanup preview shows: branch status (merged/unmerged), uncommitted changes, last commit date
  - Batch cleanup available for stale worktrees with fully-merged branches and no uncommitted changes
  - Protection: worktrees with uncommitted changes or unmerged branches require explicit confirmation

### [Feature] Add branch ahead/behind remote indicators on worktree cards
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Worktree cards show the branch name but not its relationship to the remote tracking branch. Developers need to know at a glance whether a worktree needs pulling (behind remote), pushing (ahead of remote), or both (diverged) without manually running git status in each worktree. Displaying ahead/behind counts on worktree cards would make the sidebar a reliable overview of sync status across all worktrees.
- **Acceptance criteria:**
  - Worktree cards display ahead/behind count badges relative to the remote tracking branch
  - Visual indicators: green for ahead-only, amber for behind-only, red for diverged
  - "Up to date" state shown as a subtle check mark (not cluttering the UI)
  - Worktrees without a remote tracking branch show "no remote" indicator
  - Counts refresh when repository data is refreshed (pull, sync, manual refresh)

### [UX/UI] Add per-repository disk usage display for worktree storage management
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Worktrees consume disk space proportional to the files in the working directory (git objects are shared). Users managing many worktrees across several repositories have no visibility into total disk usage, making it hard to decide which worktrees to clean up when disk space is low. Displaying per-worktree and per-repository disk usage alongside the stale worktree detection feature would give users full storage awareness.
- **Acceptance criteria:**
  - Repository detail view shows total disk usage across all worktrees
  - Each worktree card shows its working directory size
  - Sizes formatted human-readably (KB, MB, GB)
  - Size calculation runs asynchronously (does not block UI)
  - Total portfolio disk usage visible on the main dashboard
  - Sorted-by-size view available for identifying the largest worktrees

### [UX/UI] Add worktree dirty state indicators on cards
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Worktree cards show the branch name and (per the ahead/behind roadmap item) remote sync status, but don't indicate whether a worktree has uncommitted changes, staged files, or untracked files. A simple status indicator (clean/modified/staged/untracked) on each worktree card would give users a complete at-a-glance picture of their working state across all worktrees, helping them identify which worktrees need attention before switching context or cleaning up.
- **Acceptance criteria:**
  - Worktree cards display a status dot or icon indicating working directory state: clean, modified, staged, or untracked files
  - Colour coding: green (clean), amber (modified/staged), subtle grey (untracked only)
  - Tooltip on hover showing counts (e.g. "3 modified, 1 untracked")
  - Status derived from `wt` CLI output or `git status --porcelain` via sidecar
  - Status refreshes on repository data refresh and after worktree operations (pull, sync)
  - No performance penalty for repositories with many worktrees (status checked lazily per expanded repo)

### [UX/UI] Add worktree list filtering and sorting options
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** As users accumulate worktrees across repositories, the sidebar tree becomes a long undifferentiated list. There is no way to filter by state (show only dirty worktrees, only stale ones) or sort by criteria other than the default order. Adding filter toggles (clean/dirty/stale) and sort options (name, last accessed, branch age) would let users quickly focus on the worktrees that need attention, complementing the stale detection and dirty state indicator items.
- **Acceptance criteria:**
  - Filter toggles in the sidebar header: all, dirty only, stale only, with unmerged branches
  - Sort options: alphabetical, last accessed, branch creation date
  - Active filters shown as pills with clear/reset action
  - Filter and sort state persisted for the session
  - Worktree count updates to reflect filtered results (e.g. "3 of 12 worktrees")
  - Filters work across all repositories in the sidebar

### [Feature] Add recent worktree switch history for quick navigation
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Developers frequently switch between the same 3-4 worktrees during a work session — a feature branch, the main branch, and a review worktree. The command palette (Cmd+K) provides fuzzy search across all worktrees but doesn't prioritise recently accessed ones. A "Recent" section showing the last 5-10 worktrees switched to (across all repositories) would provide instant access to the active working set without typing.
- **Acceptance criteria:**
  - "Recent" section at the top of the sidebar or command palette showing last 10 worktree switches
  - Entries ordered by most recently accessed
  - Each entry shows worktree name, branch, and repository
  - Click navigates directly to that worktree
  - Duplicates collapsed (re-accessing moves to top, doesn't add a second entry)
  - Recent list persisted across sessions in app settings

### [UX/UI] Add system tray badge for worktrees needing attention
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Grove already has system tray integration with a quick-access menu, but the tray icon is static — users must open the app to discover whether any worktrees need attention. Adding a badge count to the system tray icon (number of worktrees with uncommitted changes, behind remote, or flagged as stale) would make Grove a passive awareness tool. Developers working in their editor would see the badge increment after forgetting to commit or when a teammate pushes to a tracked branch, prompting them to check without actively switching to Grove.
- **Acceptance criteria:**
  - System tray icon displays a numeric badge showing count of worktrees needing attention
  - "Needing attention" defined as: uncommitted changes (dirty state item), behind remote (ahead/behind item), or stale (stale detection item)
  - Badge updates on each repository data refresh cycle
  - Badge count of 0 shows no badge (clean tray icon)
  - Clicking the badge count in the tray menu shows a summary of which worktrees need attention
  - Badge display configurable in settings (enable/disable, which states to count)

### [Feature] Add worktree diff stats showing committed changes relative to base branch
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The dirty state indicator shows uncommitted changes, and the ahead/behind badge shows remote sync status, but neither tells users how much committed work exists in a worktree relative to its base branch. Displaying a compact diff stat (files changed count, lines added/removed) on worktree cards would help users gauge the scope of work in each worktree at a glance — informing decisions about which worktree to revisit, review, or clean up. This is especially valuable for developers returning to worktrees after days away.
- **Acceptance criteria:**
  - Worktree cards display a compact diff stat badge (e.g. "5 files, +120/-45") showing changes vs base branch
  - Diff stats fetched via `git diff --stat` against the merge base of the worktree branch and the default branch
  - Stats refresh alongside other worktree metadata on repository data refresh
  - Worktrees with zero diff (no committed changes vs base) show a subtle "no changes" indicator
  - Stat computation runs asynchronously (does not block card rendering)
  - Tooltip shows full file list on hover for quick review without opening a terminal

### [Performance] Add periodic background fetch to keep remote tracking status current
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** The ahead/behind indicators and system tray badge depend on knowing the latest remote state, but remote changes are only detected after a `git fetch`. If a colleague pushes to a tracked branch, Grove won't reflect this until the user manually refreshes. A configurable background fetch interval (default: 5 minutes) would ensure the ahead/behind counts and tray badge always reflect the latest remote state, completing the passive awareness model that the tray badge item creates.
- **Acceptance criteria:**
  - Background fetch runs `git fetch` for all registered repositories on a configurable interval (default: 5 minutes)
  - Fetch interval configurable in settings (1 minute to 30 minutes, or disabled)
  - Ahead/behind counts and dirty state indicators refresh automatically after each fetch
  - System tray badge updates after fetch completion
  - Fetch runs sequentially across repositories to avoid saturating network/SSH connections
  - Fetch errors handled silently (logged, not toasted) to avoid notification spam for offline periods
  - Last fetch timestamp visible in the UI (per repository)

### [Feature] Add worktree creation wizard with remote branch browsing
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-20
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Creating a worktree currently requires typing a branch name, with no visibility into what branches exist on the remote. When checking out a teammate's branch for code review or picking up a feature branch from another machine, users must switch to the terminal to run `git branch -r` and then return to Grove to type the branch name. Providing a browsable list of remote branches in the worktree creation dialog — with search/filter — would make worktree creation self-contained and reduce context switching, especially for review-oriented worktree workflows.
- **Acceptance criteria:**
  - Worktree creation dialog includes a searchable dropdown of remote branches
  - Remote branches fetched from `git branch -r` or equivalent wt CLI output
  - Search/filter matches against branch name (fuzzy matching)
  - Selected remote branch auto-populates the branch name field
  - Manual entry still available for creating new branches (not forced to select from remote)
  - Fetch-from-remote button to refresh the branch list without closing the dialog

## Design System Adoption

These items implement the @stuntrocket/ui design system (derived from the Dalil app styleguide) to achieve premium visual uniformity across all Tauri applications. Items are ordered by dependency — foundation must complete before migration, migration before polish.

### [Foundation] Integrate @stuntrocket/ui shared component library and design tokens
- **Priority:** P1 (critical)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-19
- **Status:** completed
- **Completed:** 2026-03-20
- **Description:** Grove uses Vue 3 + Tailwind CSS with its own dark theme and CSS custom properties in src/styles.css. Adopting the @stuntrocket/ui design system requires installing @stuntrocket/ui from the local Verdaccio registry, replacing the current theme tokens with @stuntrocket/ui shared tokens, and loading Poppins as the primary font. Grove already has strong design foundations (animation system, keyboard shortcuts, system tray) that align well with @stuntrocket/ui's philosophy — the main work is aligning specific values.
- **Acceptance criteria:**
  - .npmrc configured with @stuntrocket:registry=http://localhost:4873
  - @stuntrocket/ui installed as a dependency
  - src/styles.css design tokens replaced with @stuntrocket/ui tokens.css import
  - Animation duration custom properties aligned with @stuntrocket/ui timing scale
  - Poppins font loaded as primary sans font
  - Colour palette aligned to @stuntrocket/ui values (surface, accent, border, text tokens)
  - Both light and dark modes functional

### [UI Migration] Replace bespoke components with @stuntrocket/ui shared components
- **Priority:** P1 (critical)
- **Size:** XL (8hrs+)
- **Added:** 2026-03-19
- **Status:** pending
- **Note:** Skipped: too large for autonomous cycle, needs Danny's input.
- **Description:** Replace all locally-defined UI components in src/components/ui/ with @stuntrocket/ui equivalents. This includes Button, Modal, Input, and other primitives, plus the Dashboard, WorktreeCard, ConfigPanel, HooksPanel, and HelpModal components. Grove's repository tree sidebar and worktree cards are domain-specific but should use @stuntrocket/ui Card, Badge, and list patterns as their foundation.
- **Acceptance criteria:**
  - All src/components/ui/ primitives replaced with @stuntrocket/ui imports
  - Dashboard layout uses @stuntrocket/ui page layout pattern
  - WorktreeCard uses @stuntrocket/ui Card with correct surface/shadow properties
  - ConfigPanel and HooksPanel use @stuntrocket/ui Card and form control patterns
  - HelpModal uses @stuntrocket/ui Modal pattern
  - System tray integration preserved (unaffected by UI migration)
  - Sidebar navigation uses @stuntrocket/ui sidebar link pattern
  - ErrorBoundary styling aligned with @stuntrocket/ui error patterns
  - No locally-defined UI primitive components remain

### [Polish] Achieve full @stuntrocket/ui styleguide visual conformance
- **Priority:** P2 (important)
- **Size:** L (3-8hrs)
- **Added:** 2026-03-19
- **Status:** pending
- **Description:** After component migration, apply the remaining @stuntrocket/ui specifications: ambient background blobs, custom scrollbars, micro-animation timings (replacing Grove's current custom properties with @stuntrocket/ui values), macOS titlebar integration, z-index layering, and accessibility compliance. Grove's existing animation system (CSS custom properties for durations) should be remapped to @stuntrocket/ui's timing scale.
- **Acceptance criteria:**
  - Ambient background blobs with @stuntrocket/ui colours and drift animations
  - Custom scrollbars with accent-tinted thumb
  - Animation durations remapped: var(--duration-modal) → @stuntrocket/ui smooth 200ms, etc.
  - macOS titlebar with correct traffic light spacing
  - Z-index layering matches @stuntrocket/ui scale
  - prefers-reduced-motion respected (Grove already has partial support — extend to full compliance)
  - Focus rings on all interactive elements
  - Visual side-by-side comparison with Dalil passes review
