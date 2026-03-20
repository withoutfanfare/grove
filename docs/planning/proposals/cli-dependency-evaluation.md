# Evaluation: Removing the wt CLI Dependency

This document evaluates the feasibility, scope, and trade-offs of removing the `wt` CLI dependency from wt-app and reimplementing its functionality natively in Rust.

## Executive Summary

| Aspect | Assessment |
|--------|------------|
| **Feasibility** | Technically feasible but substantial effort |
| **CLI Complexity** | ~7,900 lines of Zsh across 15+ command modules |
| **Estimated Rust LOC** | 4,000–6,000 lines |
| **Development Effort** | 2–3 months for experienced Rust developer |
| **Recommendation** | Maintain CLI dependency unless distribution simplicity is critical |

---

## Current Architecture

The wt-app Tauri application currently:
- Wraps the `wt` CLI tool via JSON output (`--json` flags)
- Parses JSON responses from CLI commands
- Provides a GUI for git worktree management
- Delegates all core logic to the CLI

```text
Vue Frontend ──► Rust IPC Layer ──► wt CLI (Zsh)
                                         │
                                         ▼
                               git, mysql, filesystem
```

The CLI prerequisite means users must install both the CLI and the app for the app to function.

---

## CLI Commands Currently Used

The app invokes **15 CLI commands**:

### Core Operations
| Command | Purpose |
|---------|---------|
| `wt repos --json` | List all repositories |
| `wt ls <repo> --json` | List worktrees for a repository |
| `wt add <repo> <branch> --json` | Create a new worktree |
| `wt rm <repo> <branch> --json` | Remove a worktree |
| `wt pull <repo> <branch> --json` | Pull changes for a worktree |
| `wt sync <repo> <branch> --json` | Rebase worktree onto base branch |

### Advanced Operations
| Command | Purpose |
|---------|---------|
| `wt branches <repo> --json` | List branches with worktree status |
| `wt health <repo> --json` | Get repository health report |
| `wt prune <repo> --json` | Prune stale refs and merged branches |
| `wt pull-all <repo> --json` | Pull all worktrees in a repository |
| `wt recent [count] --json` | Get recently accessed worktrees |
| `wt --version` | Get CLI version |

### System Integration
- `open` / `xdg-open` — Open paths in file manager
- `open -a <app>` — Open in specific editor
- `osascript` — macOS automation for terminal apps

---

## CLI Complexity Breakdown

The CLI comprises **7,887 lines** of well-organised Zsh:

| Module | Lines | Purpose |
|--------|-------|---------|
| `commands/info.sh` | 1,156 | Listing, status, branches, health, reporting |
| `commands/git-ops.sh` | 799 | Pull, sync, log, diff, prune operations |
| `commands/lifecycle.sh` | 708 | Add, remove, move, clone worktrees |
| `commands/maintenance.sh` | 681 | Doctor, cleanup, repair, restructure |
| `commands/config.sh` | 550 | Setup, templates, configuration |
| `commands/discovery.sh` | 495 | Recent, clean, info commands |
| `03-paths.sh` | 450 | Path/URL generation, slugification |
| `10-interactive.sh` | 358 | fzf integration for branch selection |
| `12-deps.sh` | 337 | Shared dependency management |
| `04-git.sh` | 272 | Git operations (fetch, branch checks) |
| `07-templates.sh` | 244 | Worktree setup templates |
| `05-database.sh` | 182 | MySQL database create/backup/drop |
| `06-hooks.sh` | 144 | Lifecycle hook execution |
| Other modules | ~500 | Core, validation, spinner, parallel, resilience |

---

## Functional Areas Requiring Reimplementation

### 1. Git Worktree Management (HIGH complexity)

**Current:** Direct `git worktree` commands via shell

**Key Operations:**
- Creating worktrees from existing/new branches
- Branch existence checks (local and remote via `git ls-remote`)
- Tracking branch setup and remote synchronisation
- Worktree removal with optional branch deletion
- Path resolution from `git worktree list --porcelain`
- Parallel pull operations for multiple worktrees
- Commit ahead/behind counting
- Dirty state detection

**Critical Functions:**
- `remote_branch_exists()` — Check branch on remote
- `get_ahead_behind()` — Count commits relative to base
- `list_worktree_branches()` — Parse porcelain output
- `pull_worktree()` / `sync_worktree()` — Handle conflicts

**Rust Implementation:** Would use `git2` crate but requires careful handling of:
- Remote operations and authentication
- Worktree creation edge cases
- Conflict detection during rebase/pull
- Progress reporting for long operations

### 2. MySQL Database Management (MEDIUM-HIGH complexity)

**Current:** Direct `mysql` and `mysqldump` commands

**Operations:**
- Database naming with hash suffixes (MySQL 64-char limit)
- Create databases with `IF NOT EXISTS`
- Backup databases with timestamps
- Drop databases with existence checks
- Herd site integration (unsecure command)

**Security Considerations:**
- Uses `MYSQL_PWD` environment variable (not `-p` flag)
- Validates database existence before operations
- Handles missing MySQL gracefully

**Rust Implementation:** Would use `mysql` crate with:
- Connection pooling consideration
- Password handling security
- Backup file management

### 3. Health Scoring & Reporting (HIGH complexity)

**Current:** Multi-factor scoring algorithm across 1,156 lines

**Factors:**
- Uncommitted changes (dirty state)
- Commit distance from base branch
- Branch age and activity level
- Stale branch detection (>50 commits behind)
- Merge status detection
- Database consistency checks

**Output Structure:**
```json
{
  "repo": "myapp",
  "overall_grade": "B",
  "overall_score": 82,
  "summary": { "healthy": 5, "warning": 2, "critical": 0 },
  "worktrees": [
    { "branch": "feature/x", "grade": "A", "score": 95, "issues": [] }
  ]
}
```

**Rust Implementation:** Requires careful port of:
- Scoring thresholds and weights
- Grade calculation logic
- Issue detection rules

### 4. Lifecycle Hooks System (MEDIUM complexity)

**Current:** Extensible hook system with security validation

**Hook Points:**
- `pre-add` — Before creating worktree
- `post-add` — After creating worktree (environment setup)
- `pre-rm` — Before removing worktree
- `post-rm` — After removing worktree
- `post-pull` — After pulling changes

**Features:**
- Global hooks: `~/.wt/hooks/post-add.d/*.sh`
- Repo-specific hooks: `~/.wt/hooks/post-add.d/<repo>/*.sh`
- Security validation (owner check, world-writable check)
- Environment variable passing (WT_REPO, WT_BRANCH, WT_PATH, etc.)
- Graceful failure handling

**Rust Implementation:** Subprocess execution with:
- File permission validation
- Environment setup
- Timeout handling

### 5. Path & URL Generation (MEDIUM complexity)

**Current:** Complex slugification and SSL-aware naming

**Challenges:**
- Branch slugification: `feature/my-branch` → `feature-my-branch`
- SSL certificate CN limit: 64 characters total
- Site naming for URL generation
- Hash-based truncation for long names
- Directory-to-branch mapping validation

**Database Naming:**
- Pattern: `<repo>__<branch_slug>`
- MySQL 64-char limit with MD5 hash suffix
- Example: `myapp__feature_long_branch_a1b2c3`

### 6. Configuration Management (LOW-MEDIUM complexity)

**Current:** Environment variables + config file parsing

**Sources:**
- Environment variables (`WT_*` prefix)
- Config files in `~/.wt/config` and `.git/config`
- Template-based skip flags

**Key Settings:**
- `HERD_ROOT` — Repository root directory
- `DEFAULT_BASE` — Default base branch
- `DB_HOST`, `DB_USER`, `DB_PASSWORD` — MySQL credentials
- `WT_HOOKS_DIR`, `WT_TEMPLATES_DIR` — Custom directories
- `PROTECTED_BRANCHES` — Branches requiring `-f` flag

---

## Implementation Estimate

| Component | CLI Lines | Rust LOC Estimate | Difficulty |
|-----------|-----------|-------------------|------------|
| Git operations | 1,071 | 800–1,200 | High |
| Info/health commands | 1,156 | 600–900 | High |
| Database operations | 182 | 200–400 | Medium |
| Path/URL generation | 450 | 300–500 | Medium |
| Hooks system | 144 | 200–300 | Medium |
| Configuration | 550 | 200–350 | Low |
| **TOTAL** | **~4,700** | **4,000–6,000** | **High** |

*Note: CLI total includes only modules directly used by app commands*

**Estimated Development Time:**
- **Full reimplementation:** 2–3 months for senior Rust developer
- **Partial MVP** (repos, add, rm, pull, health): 4–8 weeks

---

## Required Rust Dependencies

| Crate | Purpose |
|-------|---------|
| `git2` | Git operations (worktree, branch, status) |
| `mysql` | MySQL database operations |
| `tokio` | Async operations for parallel pulls |
| `regex` | Pattern matching and validation |
| `chrono` | Timestamp handling |
| `md5` | Hash calculation for database names |

---

## Risk Assessment

### High-Risk Areas

1. **Health scoring algorithm** — 1,156 lines with multiple thresholds and edge cases
2. **Parallel operations** — Coordination of multiple git/database operations
3. **Error recovery** — Cleanup on failure, rollback mechanisms
4. **Hook system** — Security validation, environment setup
5. **Git conflicts** — Rebase conflict detection and reporting

### Functionality at Risk

- Merge conflict detection in pull/sync
- Database backup/restore workflows
- Hook execution and context passing
- Parallel pull-all with progress events
- Stale branch detection and cleanup
- Health scoring edge cases

### Platform-Specific Issues

- macOS `stat` command format differences
- Terminal app integration (iTerm2, Warp, Alacritty, Windows Terminal)
- File manager integration (Finder vs Explorer vs xdg-open)

---

## Trade-off Analysis

### Advantages of Removing CLI Dependency

| Benefit | Impact |
|---------|--------|
| **Single binary distribution** | Users only install the app, not CLI separately |
| **Consistent behaviour** | No version mismatch between app and CLI |
| **Easier debugging** | Full stack traces in Rust |
| **Type-safe implementation** | Compile-time guarantees |
| **Better error handling** | Rust's Result type throughout |
| **Reduced attack surface** | No shell script injection vectors |
| **Faster performance** | No subprocess spawning overhead |
| **Easier testing** | Mocking and unit testing in Rust |

### Disadvantages of Removing CLI Dependency

| Drawback | Impact |
|----------|--------|
| **Significant development effort** | 4,000–6,000 lines of new code |
| **Loss of shell flexibility** | Harder to add ad-hoc features |
| **Platform-specific code** | Different handling per OS |
| **Maintenance burden** | Two implementations to maintain |
| **Testing complexity** | Database, git, filesystem mocking |
| **Feature divergence risk** | CLI and app could drift apart |

---

## Alternative Approaches

### 1. Maintain Current Architecture
**Effort:** Minimal
**Trade-off:** Requires CLI installation, potential version mismatch

Keep the current wrapper approach. Improve the version checking and error messages when CLI is missing or outdated.

### 2. Bundle CLI with App
**Effort:** Low
**Trade-off:** Larger app size, still running shell scripts

Include the `wt` script in the app bundle and invoke it directly. Ensures version compatibility but still has shell execution overhead.

### 3. Partial Native Implementation
**Effort:** Medium (6–8 weeks)
**Trade-off:** Hybrid complexity

Implement high-frequency operations natively (repos, ls, add, rm, pull) while keeping complex operations (health, prune, sync) via CLI fallback.

### 4. Full Native Implementation
**Effort:** High (2–3 months)
**Trade-off:** Significant upfront investment

Reimplement all functionality in Rust. Provides best user experience but highest development cost.

---

## Recommendations

### Short-Term (Current Phase)
**Maintain CLI dependency** with improved integration:
- Add CLI version checking at app startup
- Provide clear installation guidance when CLI missing
- Consider bundling CLI in app distribution

### Medium-Term (If User Demand Exists)
**Partial native implementation** for core operations:
- Implement repos, ls, add, rm, pull natively
- Keep health, prune, sync via CLI
- Reduces subprocess overhead for common operations

### Long-Term (If Distribution Simplicity is Critical)
**Full native implementation** when:
- User feedback indicates CLI installation is a significant barrier
- Development resources are available for 2–3 month effort
- Windows/Linux support becomes a priority (shell script compatibility issues)

---

## Conclusion

Removing the `wt` CLI dependency is **technically feasible** but represents a **substantial engineering effort** (~4,000–6,000 lines of Rust, 2–3 months development). The primary benefit is distribution simplicity (single binary).

The current wrapper architecture is a pragmatic choice that leverages the mature CLI codebase while providing a polished GUI experience. Unless user research indicates the CLI prerequisite is a significant adoption barrier, the recommendation is to **maintain the current architecture** with improvements to version checking and error handling.

If distribution simplicity becomes critical, consider the **bundled CLI approach** as a lower-effort alternative before committing to full reimplementation.
