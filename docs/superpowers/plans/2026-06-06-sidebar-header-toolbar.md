# Sidebar Header Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar's top-left section from four rows to three: header row (Overview button + clone/config icons), tab switcher with count chips on both tabs, search input — removing the floating stats row.

**Architecture:** All changes live in `src/components/RepoList.vue` (template restructure + one `onMounted` change) and its test file. No new components, stores, or types. Spec: `docs/superpowers/specs/2026-06-06-sidebar-header-toolbar-design.md`.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind CSS, Vitest + @vue/test-utils, Pinia.

**Regression guard:** Past sessions have broken the Overview dashboard (it "disappeared"). The Overview button's rendering and `handleGoToOverview` behaviour MUST keep working — Task 1 pins this with a test before the template is touched.

---

### Task 1: Failing tests for the new header

**Files:**
- Modify: `src/components/RepoList.test.ts` (append a new describe block at end of file)

- [ ] **Step 1: Append the new describe block**

The file already provides `mountRepoList()`, `mockTauriInvoke`, `resetTauriMocks`, and imports `useWorktreeStore`, `nextTick`, `createPinia`, `setActivePinia`. Append:

```typescript
describe('RepoList header toolbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTauriMocks()
    mockTauriInvoke.mockImplementation((command: string) => {
      if (command === 'get_worktree_status' || command === 'list_worktrees') {
        return Promise.resolve([])
      }
      if (command === 'get_recent_worktrees') {
        return Promise.resolve([])
      }
      return Promise.resolve(undefined)
    })
  })

  it('renders the Overview button in the header row and it deselects the repo', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])
    store.selectRepository('alpha')

    const wrapper = mountRepoList()
    await nextTick()

    const overviewBtn = wrapper.find('button[aria-label="Go to Overview"]')
    expect(overviewBtn.exists()).toBe(true)
    await overviewBtn.trigger('click')
    expect(store.selectedRepoName).toBeNull()
  })

  it('shows count chips on both tabs', async () => {
    const store = useWorktreeStore()
    store.setRepositories([
      { name: 'alpha', worktrees: 2 },
      { name: 'bravo', worktrees: 3 },
      { name: 'charlie', worktrees: 1 },
    ])
    store.setRecentWorktrees([
      { repo: 'alpha', branch: 'main', path: '/a', accessed_at: 1, accessed_ago: '1h ago' },
      { repo: 'bravo', branch: 'dev', path: '/b', accessed_at: 2, accessed_ago: '2h ago' },
    ])

    const wrapper = mountRepoList()
    await nextTick()

    const tabs = wrapper.findAll('[data-testid="tab-chip"]')
    expect(tabs.length).toBe(2)
    expect(tabs[0].text()).toBe('3') // repositories
    expect(tabs[1].text()).toBe('2') // recent
  })

  it('renders the clone and config buttons in the header row', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    const wrapper = mountRepoList()
    await nextTick()

    const headerRow = wrapper.find('[data-testid="header-row"]')
    expect(headerRow.exists()).toBe(true)
    // SIconButton is stubbed; both global action buttons must sit in the header
    expect(headerRow.findAll('s-icon-button-stub').length).toBe(2)
    expect(headerRow.find('button[aria-label="Go to Overview"]').exists()).toBe(true)
  })

  it('no longer renders the stats summary row', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    const wrapper = mountRepoList()
    await nextTick()

    expect(wrapper.text()).not.toContain('repos ·')
  })

  it('fetches recent worktrees on mount even when the repos tab is active', async () => {
    const store = useWorktreeStore()
    store.setRepositories([{ name: 'alpha', worktrees: 2 }])

    mountRepoList()
    await nextTick()

    expect(mockTauriInvoke).toHaveBeenCalledWith(
      'get_recent_worktrees',
      expect.anything()
    )
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/components/RepoList.test.ts -t "header toolbar"`

Expected: 5 tests run. "Overview button" already passes (pinning existing behaviour). "stats summary row" FAILS (`1 repos · 2 worktrees` contains "repos ·"). "count chips" FAILS (no `data-testid="tab-chip"`). "header row" FAILS (no `data-testid="header-row"`). "fetches recent on mount" FAILS (fetch is tab-gated). 4 of 5 must fail before implementation.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/components/RepoList.test.ts
git commit -m "test: pin sidebar header toolbar behaviour"
```

---

### Task 2: Restructure the template and fetch recent on mount

**Files:**
- Modify: `src/components/RepoList.vue` (template lines ~378–451, `onMounted` at ~368)

- [ ] **Step 1: Make `onMounted` fetch recent unconditionally**

Replace:

```typescript
onMounted(() => {
  if (activeTab.value === 'recent') {
    fetchRecentWorktrees()
  }
})
```

with:

```typescript
onMounted(() => {
  // Always fetch: the Recent tab chip needs an accurate count from launch
  fetchRecentWorktrees()
})
```

- [ ] **Step 2: Restructure the header template**

In the tab header block (`<div class="flex-shrink-0 border-b border-white/[0.04] p-2.5 pt-7">`):

**(a) Header row** — wrap the Overview button and move the two `SIconButton`s up beside it. The Overview button loses `w-full` and `mb-2` (the wrapper takes `mb-2`); the icon buttons keep their existing SVGs, tooltips, and handlers exactly as they are today:

```html
<!-- Header row: Overview navigation + global actions -->
<div data-testid="header-row" class="flex items-center gap-1 mb-2">
  <button
    class="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors"
    :class="selectedRepoName === null
      ? 'bg-accent/15 text-text-primary'
      : 'text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60'"
    aria-label="Go to Overview"
    :aria-current="selectedRepoName === null ? 'page' : undefined"
    @click="handleGoToOverview"
  >
    <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
    Overview
  </button>

  <!-- Clone button (moved from the old stats row, markup unchanged) -->
  <SIconButton size="sm" tooltip="Clone Repository" @click="handleClone">
    <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  </SIconButton>

  <!-- Global config button (moved from the old stats row, markup unchanged) -->
  <SIconButton size="sm" tooltip="Global Configuration" :active="showConfigPanel" @click="showConfigPanel = !showConfigPanel">
    <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  </SIconButton>
</div>
```

**(b) Tab switcher** — add count chips. Replace the tab `v-for` array and button content (the sliding pill div above it is untouched):

```html
<button v-for="tab in [
  { id: 'repos' as TabType, label: 'Repositories', count: repositories.length },
  { id: 'recent' as TabType, label: 'Recent', count: recentWorktrees.length },
]" :key="tab.id" @click="switchTab(tab.id)" :class="[
  'flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-2xs font-medium transition-colors duration-200 relative z-10 rounded',
  activeTab === tab.id
    ? 'text-text-primary'
    : 'text-text-tertiary hover:text-text-secondary'
]">
  {{ tab.label }}
  <span
    data-testid="tab-chip"
    class="rounded-full px-1.5 text-[10px] tabular-nums transition-colors duration-200"
    :class="activeTab === tab.id
      ? 'bg-accent/20 text-accent'
      : 'bg-white/[0.08] text-text-muted'"
  >{{ tab.count }}</span>
</button>
```

**(c) Delete the summary row** — remove the whole block from `<!-- Summary with action buttons -->` through its closing `</div>` (the `flex items-center justify-between px-2.5 py-2` div containing the repos/worktrees counts, the "{n} recent" label, and both icon buttons). The tab switcher needs `mb-2` added to its container div (`<div class="flex p-0.5 bg-surface-overlay/40 rounded-md relative isolate mb-2">`) to keep breathing room above the search input now that the summary row is gone.

**(d) Align the search input** — change its wrapper from:

```html
<div v-if="activeTab === 'repos' && repositories.length > 0" class="px-1.5 pb-1.5">
```

to:

```html
<div v-if="activeTab === 'repos' && repositories.length > 0" class="pb-1">
```

so its left/right edges align with the Overview button and tab control above.

- [ ] **Step 3: Run the header toolbar tests to verify they pass**

Run: `npx vitest run src/components/RepoList.test.ts -t "header toolbar"`
Expected: 5 passed.

- [ ] **Step 4: Run the full gates**

Run: `npx vitest run && npm run build`
Expected: all test files pass (306 existing + 5 new), vue-tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/RepoList.vue src/components/RepoList.test.ts
git commit -m "feat: consolidate sidebar header into a three-row toolbar"
```

---

### Task 3: Visual verification in the running app

**Files:** none (verification only)

- [ ] **Step 1: Launch dev mode**

Run: `npm run tauri dev`

- [ ] **Step 2: Verify against the approved mockup** (direction B, both-tab chips)

- Header row: Overview left, clone + gear icons right, one row
- Tabs show `Repositories [n]` and `Recent [n]`; Recent chip is non-zero immediately after launch (when recent worktrees exist) — no stale `0`
- Active chip is accent-tinted; inactive chip neutral; chips follow the sliding pill switch
- No stats row; search input edges align with the tab control
- **Overview dashboard regression check:** click a repo, then the Overview button — the Overview dashboard must render; relaunch the app — it must land on the Overview

- [ ] **Step 3: Update CHANGELOG.md** under `## [2026.06]` → `### Changed`:

```markdown
- **Tidier Sidebar Header** - The sidebar's top section is now three rows instead of four: clone and global-config buttons sit beside the Overview button as a header toolbar, both tabs show live count chips (repositories and recent), and the floating "n repos · n worktrees" line is gone (portfolio totals live on the Overview page)
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog entry for sidebar header toolbar"
```
