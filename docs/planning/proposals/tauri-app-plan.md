# wt Tauri Desktop Application

> Status: Planning
> Last Updated: 2026-01-07

## Executive Summary

A lightweight desktop application built with Tauri to provide a visual interface for the `wt` worktree manager. The primary goal is **team adoption**—making git worktrees accessible to developers who prefer visual tools over CLI workflows.

---

## Problem Statement

### Current Challenges

1. **Mental model gap** - Developers familiar with branch switching find worktrees conceptually different. The CLI doesn't help visualise "what do I have?"

2. **CLI intimidation** - Not all team members are comfortable with terminal workflows. This creates friction in adopting worktrees team-wide.

3. **Visibility** - Understanding the state of multiple worktrees across repositories requires running several commands and mentally assembling the picture.

4. **Onboarding** - New team members need to learn both git worktrees AND the `wt` CLI, doubling the learning curve.

### Target Users

| User Type | Current Pain | GUI Solution |
|-----------|--------------|--------------|
| Visual learners | Can't "see" their worktrees | Dashboard with status indicators |
| CLI-averse devs | Avoid worktrees entirely | Point-and-click workflow |
| New team members | Steep learning curve | Guided setup and creation |
| All developers | Context switching overhead | Quick access from system tray |

---

## Solution: Companion App (Not Replacement)

The Tauri app will **complement** the CLI, not replace it. Power users keep their terminal workflow; visual users get an accessible alternative.

### Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    Frontend (Web)                       │  │
│  │              Vue 3 + TypeScript + Tailwind             │  │
│  │                                                         │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  │  │
│  │  │  Dashboard  │ │   Create    │ │     Settings    │  │  │
│  │  │    View     │ │  Worktree   │ │                 │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│                            │                                   │
│                       Tauri IPC                               │
│                            │                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   Backend (Rust)                        │  │
│  │                                                         │  │
│  │  • Command executor (spawns wt CLI)                    │  │
│  │  • JSON response parser                                 │  │
│  │  • File system watcher (worktree changes)              │  │
│  │  • System tray management                               │  │
│  │  • Auto-update mechanism                                │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                               │
                          Shell exec
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                        wt CLI                                 │
│                   (unchanged, --json output)                  │
└──────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

| Decision | Rationale |
|----------|-----------|
| **Tauri over Electron** | ~10MB binary vs ~150MB; native performance; Rust backend |
| **Vue 3 frontend** | Team familiarity; excellent TypeScript support; lightweight |
| **CLI as backend** | Zero duplication of logic; CLI remains source of truth |
| **JSON API** | Already partially implemented; clean separation of concerns |

---

## Feature Roadmap

### Phase 1: MVP Dashboard (v0.1)

The minimum viable product that provides value to the team.

**Features:**

| Feature | Description | CLI Dependency |
|---------|-------------|----------------|
| Repository list | Sidebar showing all repos with worktree counts | `wt repos --json` |
| Worktree list | Main panel showing worktrees for selected repo | `wt ls --json` |
| Status indicators | Visual badges for dirty/stale/behind states | `wt status --json` |
| Open in IDE | Button to open worktree in VSCode/PhpStorm | Shell command |
| Open in Terminal | Button to open terminal at worktree path | Shell command |
| Open in Browser | Button to open Herd URL | Shell command |

**Wireframe:**

```text
┌─────────────────────────────────────────────────────────────────┐
│  wt Worktree Manager                              [−] [□] [×]   │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                 │
│  Repositories  │  modernprintworks                              │
│  ─────────────│  ───────────────────────────────────────────── │
│                │                                                 │
│  ● modern...  │  ┌─────────────────────────────────────────┐   │
│    4 worktrees │  │ staging                                 │   │
│                │  │ ✓ Clean  ↓2 behind  Grade: A           │   │
│  ○ scooda     │  │ [Code] [Terminal] [Browser]             │   │
│    2 worktrees │  └─────────────────────────────────────────┘   │
│                │                                                 │
│  ○ api-gateway│  ┌─────────────────────────────────────────┐   │
│    1 worktree  │  │ feature/auth                            │   │
│                │  │ ● 3 changes  ↑3 ahead  Grade: B        │   │
│                │  │ [Code] [Terminal] [Browser]             │   │
│                │  └─────────────────────────────────────────┘   │
│                │                                                 │
│                │  ┌─────────────────────────────────────────┐   │
│                │  │ feature/old-work                        │   │
│  ──────────── │  │ ⚠ Stale (21d)  Merged  Grade: D        │   │
│  [+ New]       │  │ [Code] [Terminal] [Delete]              │   │
│                │  └─────────────────────────────────────────┘   │
│                │                                                 │
└────────────────┴────────────────────────────────────────────────┘
```

**CLI Requirements:**
- [x] `wt repos --json`
- [x] `wt ls --json`
- [x] `wt status --json`

---

### Phase 2: Create Worktree Flow (v0.2)

Enable creating new worktrees without touching the CLI.

**Features:**

| Feature | Description | CLI Dependency |
|---------|-------------|----------------|
| Branch picker | Dropdown/search showing available branches | `wt branches --json` (new) |
| Create wizard | Step-by-step worktree creation | `wt add --json` |
| Progress indicator | Show hook execution progress | `wt add` output parsing |
| First-run setup | Check system requirements on first launch | `wt doctor --json` |

**Create Worktree Flow:**

```text
┌─────────────────────────────────────────────────────────┐
│  Create New Worktree                              [×]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Repository                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ modernprintworks                            ▼   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Branch                                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔍 Search branches...                           │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ○ feature/checkout-flow        (remote)        │   │
│  │ ○ feature/notifications        (remote)        │   │
│  │ ○ bugfix/cart-totals          (remote)        │   │
│  │ ● feature/new-dashboard       (remote)  ← new │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ☑ Create database                                     │
│  ☑ Run post-add hooks                                  │
│  ☐ Open in IDE after creation                          │
│                                                         │
│                              [Cancel]  [Create]        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**CLI Requirements:**
- [ ] `wt branches --json` (new command)
- [x] `wt add --json`
- [ ] `wt doctor --json`

---

### Phase 3: Detail View & Actions (v0.3)

Rich information and common actions.

**Features:**

| Feature | Description | CLI Dependency |
|---------|-------------|----------------|
| Worktree detail panel | Full info when clicking a worktree | `wt info --json` |
| Sync status | Visual ahead/behind with commit list | `wt summary --json` |
| Pull button | One-click git pull | `wt pull` |
| Delete with confirmation | Safe removal with warnings | `wt rm --json` |
| Recent worktrees | Quick access to recently used | `wt recent --json` |

**CLI Requirements:**
- [ ] `wt info --json`
- [x] `wt summary --json`
- [ ] `wt recent --json`

---

### Phase 4: System Tray & Background (v0.4)

Always-available quick access.

**Features:**

| Feature | Description |
|---------|-------------|
| System tray icon | Always visible in menu bar |
| Quick menu | Recent worktrees, create new |
| Status badge | Show if any worktrees need attention |
| Background refresh | Periodic status checks |
| Notifications | Alert on stale worktrees, sync needed |

**Tray Menu:**

```text
┌────────────────────────────────┐
│  wt Worktree Manager           │
├────────────────────────────────┤
│  Recent                        │
│  ├─ modernprintworks/staging   │
│  ├─ scooda/develop             │
│  └─ api-gateway/main           │
├────────────────────────────────┤
│  ⚠ 2 worktrees need attention │
├────────────────────────────────┤
│  Create New Worktree...        │
│  Open Dashboard                │
├────────────────────────────────┤
│  Preferences...                │
│  Quit                          │
└────────────────────────────────┘
```

---

### Phase 5: Power Features (v0.5+)

Advanced functionality for power users.

| Feature | Description |
|---------|-------------|
| Cleanup wizard | Visual `wt clean` with disk space preview |
| Health dashboard | Aggregate health across all repos |
| Diff viewer | Visual diff against base branch |
| Commit history | Recent commits in worktree |
| Bulk operations | Select multiple worktrees for sync/delete |
| Keyboard shortcuts | Power-user navigation |

---

## Technical Decisions

### Frontend Stack

| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **Vue 3** | UI framework | Team familiarity, Composition API |
| **TypeScript** | Type safety | Catch errors early, better DX |
| **Tailwind CSS** | Styling | Rapid development, consistent design |
| **Pinia** | State management | Vue 3 native, simple API |
| **VueUse** | Composables | Keyboard shortcuts, local storage |

### Backend (Rust)

| Crate | Purpose |
|-------|---------|
| `tauri` | App framework |
| `serde` | JSON parsing |
| `tokio` | Async runtime |
| `notify` | File system watching |

### Build & Distribution

| Aspect | Approach |
|--------|----------|
| **Bundling** | Tauri's built-in bundler |
| **macOS** | `.dmg` with code signing |
| **Windows** | `.msi` installer |
| **Linux** | `.AppImage` and `.deb` |
| **Auto-update** | Tauri's updater plugin |

---

## CLI Preparation Checklist

Before building the Tauri app, the CLI needs these JSON additions:

### Must Have (Blocking)

- [ ] `wt info --json` - Detailed worktree information
- [ ] `wt branches --json` - Available branches for picker (new command)
- [ ] `wt recent --json` - Recently accessed worktrees
- [ ] Structured error responses with error codes

### Should Have (Important)

- [ ] `wt health --json` - Health metrics
- [ ] `wt doctor --json` - System requirements check
- [ ] `wt clean --json` - Cleanup candidates

### Nice to Have (Can Wait)

- [ ] `wt diff --json` - Diff statistics
- [ ] `wt log --json` - Commit history

---

## Project Structure

Proposed repository structure for the Tauri app:

```text
wt-app/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs           # Entry point
│   │   ├── commands.rs       # Tauri commands (IPC handlers)
│   │   ├── wt.rs             # wt CLI executor
│   │   ├── types.rs          # Rust structs matching JSON schemas
│   │   └── tray.rs           # System tray logic
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── components/
│   │   ├── Dashboard.vue
│   │   ├── RepoList.vue
│   │   ├── WorktreeCard.vue
│   │   ├── CreateWorktree.vue
│   │   └── WorktreeDetail.vue
│   ├── composables/
│   │   ├── useWorktrees.ts
│   │   ├── useRepos.ts
│   │   └── useBranches.ts
│   ├── stores/
│   │   └── worktrees.ts
│   └── types/
│       └── wt.ts             # TypeScript types matching JSON schemas
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## Development Phases

### Phase 0: Preparation (Current)

- [x] Document JSON API specification
- [x] Document Tauri app plan
- [ ] Implement missing JSON outputs in CLI
- [ ] Add `wt branches` command
- [ ] Add structured error responses

### Phase 1: Scaffold (Week 1)

- [ ] Create Tauri project with Vue 3
- [ ] Set up TypeScript types from JSON spec
- [ ] Implement Rust command executor
- [ ] Basic dashboard layout

### Phase 2: Core Features (Week 2-3)

- [ ] Repository list
- [ ] Worktree list with status
- [ ] Open in IDE/Terminal/Browser
- [ ] Create worktree flow

### Phase 3: Polish (Week 4)

- [ ] System tray
- [ ] Error handling and edge cases
- [ ] Loading states and animations
- [ ] Keyboard shortcuts

### Phase 4: Distribution (Week 5)

- [ ] Code signing
- [ ] Auto-update setup
- [ ] Build pipeline
- [ ] Team testing

---

## Success Metrics

How we'll know the Tauri app is successful:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Team adoption | 80% of team using worktrees | Survey after 1 month |
| CLI reduction | 50% fewer support questions | Slack channel activity |
| Worktree usage | 2x worktrees per developer | `wt repos --json` aggregation |
| User satisfaction | 4/5 rating | Team feedback form |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dual maintenance burden | High | CLI remains source of truth; app is thin wrapper |
| Shell integration limits | Medium | Accept limitation; provide clipboard/terminal launch |
| Cross-platform issues | Medium | Focus on macOS first; expand after validation |
| Team doesn't adopt | High | Get early feedback; iterate on UX |

---

## Open Questions

1. **Repository location**: Should the Tauri app live in this repo or a separate `wt-app` repo?

2. **Release cadence**: Should app releases be tied to CLI releases?

3. **Feature parity**: Are there CLI features that should be GUI-only (or vice versa)?

4. **Branding**: Should the app have a distinct name/icon, or stay as "wt"?

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritise CLI work** - Implement missing JSON commands
3. **Scaffold Tauri project** - Basic hello world with CLI integration
4. **Build MVP** - Dashboard view with real data
5. **Team testing** - Get feedback before expanding features

---

## References

- [JSON API Specification](../../api/json-api-spec.md)
- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Vue 3 Documentation](https://vuejs.org/)
