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

### [Feature] Add one-click IDE launcher for opening worktrees in configured editor
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-22
- **Status:** completed
- **Completed:** 2026-03-22
- **Description:** The most common action after locating a worktree in Grove is opening it in an editor — VS Code, Cursor, Zed, or another IDE. Currently this requires opening a terminal, navigating to the worktree path, and running the editor command manually. A single-click "Open in Editor" action on each worktree card, using the editor configured in Grove's existing settings (editor preference is already stored), would eliminate the most frequent context switch in the worktree workflow. This is especially valuable when jumping between worktrees for code review, where the developer needs to quickly inspect code in their IDE.
- **Acceptance criteria:**
  - "Open in Editor" button on each worktree card (icon button, not text, to save space)
  - Editor command derived from Grove's existing settings.editor preference (VS Code: `code`, Cursor: `cursor`, Zed: `zed`, etc.)
  - Opens the worktree directory as a workspace/folder in the configured editor
  - Keyboard shortcut: Enter or Cmd+O on a selected worktree opens in editor
  - Error toast if the editor command is not found on PATH (with link to settings to configure)
  - Works via the existing tauri-plugin-shell integration (no new plugins required)

### [Feature] Add worktree comparison view showing diff between two worktrees
- **Priority:** P3 (nice-to-have)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-22
- **Status:** pending
- **Description:** Developers often need to compare the state of two worktrees in the same repository — for example, comparing a feature branch worktree against a release branch worktree to understand divergence before merging, or checking what changed between two long-lived worktrees. Currently this requires opening a terminal and manually running `git diff` between worktree paths. A built-in comparison view showing file-level differences between any two selected worktrees would streamline code review and merge preparation workflows, leveraging the diff stats data already computed per worktree (completed) to provide a deeper level of comparison detail.
- **Acceptance criteria:**
  - "Compare" action available when two worktrees in the same repository are selected
  - Comparison view shows: files changed, lines added/removed, per-file diff summary
  - File list sortable by: name, change size, change type (added/modified/deleted)
  - Click on a file shows the unified diff (using the existing diff rendering if available, or plain text)
  - Diff computed via `git diff` between the two worktree branch heads (not working directory state)
  - Comparison result exportable as a text summary for inclusion in PR descriptions

### [Feature] Add worktree creation from GitHub PR number for review workflows
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-22
- **Status:** pending
- **Description:** Developers frequently create worktrees specifically to review pull requests — checking out the PR branch in an isolated worktree to inspect, test, and review the code. Currently this requires knowing the PR's branch name, finding it in the remote branch list (via the worktree creation wizard, completed), and creating the worktree. Entering a PR number and having Grove fetch the branch name from GitHub (via `gh pr view`), create a worktree, and optionally open it in the configured editor (via the IDE launcher, completed) would streamline the most common review-oriented worktree workflow to a single input.
- **Acceptance criteria:**
  - "Create from PR" option available in the worktree creation dialog alongside the existing branch picker
  - User enters a PR number; Grove fetches the branch name via `gh pr view <number> --json headRefName`
  - Worktree created from the fetched branch with a descriptive name (e.g. `review-pr-123`)
  - PR title displayed in the creation dialog for confirmation before creating
  - Optional "Open in editor" checkbox (using the IDE launcher) to immediately start reviewing
  - Error handling for: invalid PR number, PR from a fork (cross-repo), gh CLI not authenticated
  - Works via the existing tauri-plugin-shell integration for gh CLI execution

### [UX/UI] Add repository grouping with collapsible categories in the sidebar
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-22
- **Status:** pending
- **Description:** Users with 10+ registered repositories see a flat list in the sidebar, with no organisational structure beyond alphabetical sorting and the filtering options (completed). As repository counts grow — especially for developers working across multiple teams or maintaining personal and work projects — the sidebar becomes a long undifferentiated list. User-defined groups (e.g. "Work", "Personal", "Client Projects") with collapsible sections would help developers organise and navigate their repository collections, matching the folder/group patterns found in sidebar-heavy tools like VS Code workspaces and Finder favourites.
- **Acceptance criteria:**
  - "Create group" action available in the sidebar header
  - Repositories assignable to groups via drag-and-drop or context menu
  - Groups displayed as collapsible sections in the sidebar with repository count badges
  - Ungrouped repositories shown in a default "Ungrouped" section at the bottom
  - Group order customisable via drag-and-drop reordering
  - Collapsed/expanded state persisted across sessions
  - Groups stored in app settings (not modifying repository configuration)
  - Filtering and sorting (completed) work within and across groups

### [UX/UI] Add worktree purpose notes for context retention across sessions
- **Priority:** P3 (nice-to-have)
- **Size:** S (< 1hr)
- **Added:** 2026-03-22
- **Status:** pending
- **Description:** Developers managing multiple worktrees often forget why a specific worktree was created — was it for reviewing PR #247, experimenting with a new auth approach, or testing a performance fix? Branch names provide some context but are frequently cryptic (feature/abc-123, hotfix/urgent). A brief user-editable note on each worktree card ("Reviewing Sarah's auth refactor", "Performance testing with 10K records", "Release candidate for v2.3") would help developers maintain mental context when switching between worktrees, especially after returning to Grove after a break. This complements the stale worktree detection (completed) by adding purpose context to the cleanup decision — a worktree with the note "keeping for reference until Q2 release" should not be cleaned up just because it's old.
- **Acceptance criteria:**
  - "Add note" action on each worktree card (click to edit inline text field)
  - Note displayed as a subtitle on the worktree card below the branch name
  - Notes persisted in app settings alongside existing worktree metadata (not in git — notes are local to the Grove user)
  - Notes editable and deletable from the worktree card (click to edit, Escape to cancel)
  - Maximum note length: 120 characters (enough for context, short enough for card layout)
  - Notes searchable via the command palette (Cmd+K) alongside branch names and repo names
  - Notes visible in the stale worktree review dialog for informed cleanup decisions

### [Quality] Add worktree branch protection preventing accidental deletion of worktrees on protected branches
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-23
- **Status:** pending
- **Description:** The stale worktree detection (completed) suggests cleanup for worktrees that haven't been accessed recently, and batch cleanup is available for fully-merged branches. However, there is no protection against accidentally deleting worktrees on important long-lived branches — main, develop, release/*, or team-designated protected branches. A configurable branch protection list that blocks deletion (with override) for worktrees on protected branches would prevent the most damaging worktree management mistake, especially during batch cleanup operations where users may not individually verify every worktree being removed.
- **Acceptance criteria:**
  - Protected branch patterns configurable per repository in settings (default: main, master, develop)
  - Glob patterns supported (e.g. release/*, hotfix/*)
  - Deletion blocked with a clear warning when a worktree is on a protected branch
  - Override available via explicit confirmation ("Type branch name to confirm deletion")
  - Protected branch indicator visible on worktree cards alongside existing status badges
  - Batch cleanup automatically excludes protected-branch worktrees from the cleanup set

### [Innovation] Add worktree activity timeline showing recent branch operations across all worktrees
- **Priority:** P3 (nice-to-have)
- **Size:** M (1-3hrs)
- **Added:** 2026-03-23
- **Status:** pending
- **Description:** The existing worktree cards show per-worktree status (dirty state, ahead/behind, diff stats — all completed), but there is no unified view of development activity across all worktrees over time. Developers managing many worktrees cannot easily answer "what happened across my repositories in the last few days?" without checking each worktree individually. A timeline view aggregating recent git operations (commits, merges, rebases, branch creations) from all worktrees into a single chronological feed would provide a bird's-eye view of development activity, helping developers recall context when returning to work after a break and identify which worktrees have been most active. This complements the background fetch (completed) and system tray badge (completed) by adding a historical dimension to the awareness model.
- **Acceptance criteria:**
  - Timeline view accessible from the main navigation alongside the existing repository tree
  - Events sourced from `git log` across all worktrees in registered repositories (last 7 days by default)
  - Each event shows: commit message (truncated), author, timestamp, branch name, repository name
  - Events grouped by day with clear date separators
  - Click on an event navigates to the corresponding worktree in the main view
  - Filterable by repository and by event type (commits, merges, branch operations)
  - Timeline scope configurable: last 1/3/7/14 days

### [Feature] Add worktree terminal launcher opening a new terminal session in the worktree directory
- **Priority:** P2 (important)
- **Size:** S (< 1hr)
- **Added:** 2026-03-23
- **Status:** pending
- **Description:** The IDE launcher (completed) covers the most common post-navigation action — opening a worktree in an editor — but the second most common action is opening a terminal in the worktree directory to run commands (builds, tests, git operations, dependency installs). Developers currently must open a terminal separately and manually `cd` to the worktree path. A "Open terminal" button on worktree cards — using the terminal preference already stored in Grove's settings alongside the editor preference — would complete the pair of primary worktree interaction patterns (edit code + run commands) without leaving the app, matching the dual-launcher pattern found in VS Code's remote explorer and JetBrains' project manager.
- **Acceptance criteria:**
  - "Open terminal" icon button on each worktree card alongside the existing "Open in editor" button
  - Terminal application derived from settings (Terminal.app, iTerm2, Warp, Kitty, Alacritty)
  - Terminal opens with the working directory set to the worktree path
  - Keyboard shortcut: Cmd+T on a selected worktree opens terminal (complementing Cmd+O for editor)
  - Error toast if the terminal application is not found on PATH (with link to settings to configure)
  - Works via the existing tauri-plugin-shell integration (no new plugins required)

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
