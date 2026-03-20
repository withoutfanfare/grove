# wt JSON API Specification

> Version: 1.0.0-draft
> Last Updated: 2026-01-07
> Status: Draft for Tauri GUI Integration

## Overview

This document specifies the JSON output format for the `wt` worktree manager CLI. The JSON API enables programmatic integration with GUI applications, scripts, and automation tools.

### Purpose

The primary use case is enabling a **Tauri desktop application** to provide:
- Visual dashboard for worktree management
- Team-friendly interface for developers unfamiliar with CLI workflows
- Real-time status monitoring across multiple repositories

### Design Principles

1. **CLI-first** - JSON output complements, not replaces, human-readable output
2. **Consistent schemas** - Field names and types are predictable across commands
3. **Fail-safe** - Errors return structured JSON with actionable information
4. **Backwards compatible** - New fields may be added; existing fields won't change type

---

## Global Conventions

### Enabling JSON Output

All commands support the `--json` flag:

```bash
wt ls --json              # Compact JSON output
wt ls --json --pretty     # Pretty-printed with colours (TTY only)
```

Environment variables:
```bash
JSON_OUTPUT=true wt ls    # Enable JSON via environment
PRETTY_JSON=true wt ls --json  # Enable pretty-printing
```

### Data Types

| Type | JSON | Example | Notes |
|------|------|---------|-------|
| String | `"string"` | `"feature/login"` | UTF-8, special chars escaped |
| Boolean | `true`/`false` | `true` | Never `"true"` as string |
| Integer | `number` | `42` | No decimals for counts |
| Float | `number` | `85.5` | Used for scores/percentages |
| Null | `null` | `null` | Explicit absence of value |
| Array | `[...]` | `[{...}, {...}]` | Homogeneous objects |
| Object | `{...}` | `{"key": "value"}` | Nested structures |

### Field Naming

- **snake_case** for all field names
- **Consistent naming** across commands:
  - `path` - Filesystem path to worktree
  - `branch` - Git branch name
  - `repo` - Repository name
  - `url` - HTTP URL (Herd site URL)
  - `sha` - Git commit SHA (short form, 7 chars)
  - `dirty` - Boolean for uncommitted changes
  - `ahead` / `behind` - Integer commit counts

### Timestamps

ISO 8601 format with timezone:
```json
"created_at": "2026-01-07T14:30:00Z"
"accessed_at": "2026-01-07T14:30:00+00:00"
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Git operation failed |
| 4 | Database operation failed |
| 5 | Hook execution failed |

---

## Implemented Commands

### `wt ls`

Lists all worktrees for a repository.

**Usage:**
```bash
wt ls [repo] --json
```

**Response:** Array of worktree objects

```json
[
  {
    "path": "/Users/danny/Herd/modernprintworks--staging",
    "branch": "staging",
    "sha": "abc1234",
    "url": "http://modernprintworks--staging.test",
    "dirty": false,
    "ahead": 0,
    "behind": 2,
    "mismatch": false,
    "health_grade": "A",
    "health_score": 95
  },
  {
    "path": "/Users/danny/Herd/modernprintworks--feature-auth",
    "branch": "feature/auth",
    "sha": "def5678",
    "url": "http://modernprintworks--feature-auth.test",
    "dirty": true,
    "ahead": 3,
    "behind": 0,
    "mismatch": false,
    "health_grade": "B",
    "health_score": 78
  }
]
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Absolute filesystem path |
| `branch` | string | Git branch name |
| `sha` | string | Short commit SHA (7 chars) |
| `url` | string | Herd site URL (may be empty if not configured) |
| `dirty` | boolean | Has uncommitted changes |
| `ahead` | integer | Commits ahead of tracking branch |
| `behind` | integer | Commits behind tracking branch |
| `mismatch` | boolean | HEAD doesn't match expected branch |
| `health_grade` | string | Letter grade: A, B, C, D, F |
| `health_score` | integer | Numeric score 0-100 |

---

### `wt status`

Detailed status of all worktrees in a repository.

**Usage:**
```bash
wt status [repo] --json
```

**Response:** Array of status objects

```json
[
  {
    "branch": "staging",
    "path": "/Users/danny/Herd/modernprintworks--staging",
    "sha": "abc1234",
    "dirty": false,
    "changes": 0,
    "ahead": 0,
    "behind": 2,
    "stale": false,
    "age": "2 hours ago",
    "age_days": 0,
    "merged": false
  },
  {
    "branch": "feature/old-work",
    "path": "/Users/danny/Herd/modernprintworks--feature-old-work",
    "sha": "xyz9999",
    "dirty": false,
    "changes": 0,
    "ahead": 0,
    "behind": 45,
    "stale": true,
    "age": "3 weeks ago",
    "age_days": 21,
    "merged": true
  }
]
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `branch` | string | Git branch name |
| `path` | string | Absolute filesystem path |
| `sha` | string | Short commit SHA |
| `dirty` | boolean | Has uncommitted changes |
| `changes` | integer | Number of changed files |
| `ahead` | integer | Commits ahead of tracking branch |
| `behind` | integer | Commits behind tracking branch |
| `stale` | boolean | No commits in threshold period |
| `age` | string | Human-readable last commit age |
| `age_days` | integer | Days since last commit |
| `merged` | boolean | Branch has been merged to base |

---

### `wt repos`

Lists all repositories with worktree counts.

**Usage:**
```bash
wt repos --json
```

**Response:** Array of repository objects

```json
[
  {
    "name": "modernprintworks",
    "worktrees": 4
  },
  {
    "name": "scooda",
    "worktrees": 2
  }
]
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Repository name |
| `worktrees` | integer | Number of active worktrees |

---

### `wt add`

Creates a new worktree. Returns details of the created worktree.

**Usage:**
```bash
wt add <repo> <branch> --json
```

**Response:** Single worktree object

```json
{
  "path": "/Users/danny/Herd/modernprintworks--feature-new",
  "url": "http://modernprintworks--feature-new.test",
  "branch": "feature/new",
  "database": "modernprintworks__feature_new"
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | Absolute path to created worktree |
| `url` | string | Herd site URL |
| `branch` | string | Git branch name |
| `database` | string | Database name (if created) |

---

### `wt summary`

Comprehensive status of a single worktree with commit details.

**Usage:**
```bash
wt summary [repo] [branch] --json
```

**Response:** Single summary object

```json
{
  "repo": "modernprintworks",
  "branch": "feature/auth",
  "path": "/Users/danny/Herd/modernprintworks--feature-auth",
  "base": "origin/staging",
  "ahead": 3,
  "behind": 1,
  "ahead_commits_total": 3,
  "behind_commits_total": 1,
  "uncommitted": {
    "total": 2,
    "staged": 1,
    "modified": 1,
    "untracked": 0
  },
  "diff": {
    "shortstat": "4 files changed, 120 insertions(+), 15 deletions(-)",
    "summary": "app/Http/Controllers/AuthController.php | 45 ++++\napp/Models/User.php | 12 +-"
  },
  "ahead_commits": [
    {"sha": "abc1234", "subject": "Add login endpoint"},
    {"sha": "def5678", "subject": "Add password reset"},
    {"sha": "ghi9012", "subject": "Add session management"}
  ],
  "behind_commits": [
    {"sha": "xyz7890", "subject": "Fix homepage layout"}
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `repo` | string | Repository name |
| `branch` | string | Current branch |
| `path` | string | Worktree path |
| `base` | string | Tracking/comparison branch |
| `ahead` | integer | Commits ahead of base |
| `behind` | integer | Commits behind base |
| `ahead_commits_total` | integer | Total ahead count |
| `behind_commits_total` | integer | Total behind count |
| `uncommitted` | object | Uncommitted changes breakdown |
| `uncommitted.total` | integer | Total uncommitted files |
| `uncommitted.staged` | integer | Staged file count |
| `uncommitted.modified` | integer | Modified file count |
| `uncommitted.untracked` | integer | Untracked file count |
| `diff` | object | Diff statistics |
| `diff.shortstat` | string | Git shortstat output |
| `diff.summary` | string | File-by-file change summary |
| `ahead_commits` | array | List of commits ahead |
| `behind_commits` | array | List of commits behind |
| `*.sha` | string | Commit SHA |
| `*.subject` | string | Commit message subject line |

---

## Planned Commands

The following commands require JSON output implementation for full Tauri GUI support.

### `wt info` (Priority 1)

Detailed information about a single worktree.

**Planned Usage:**
```bash
wt info [repo] [branch] --json
```

**Planned Response:**

```json
{
  "repo": "modernprintworks",
  "branch": "feature/auth",
  "path": "/Users/danny/Herd/modernprintworks--feature-auth",
  "url": "http://modernprintworks--feature-auth.test",
  "bare_repo": "/Users/danny/Herd/.bare/modernprintworks.git",
  "database": {
    "name": "modernprintworks__feature_auth",
    "exists": true,
    "size_bytes": 52428800,
    "size_human": "50M"
  },
  "git": {
    "sha": "abc1234def5678",
    "sha_short": "abc1234",
    "branch": "feature/auth",
    "tracking": "origin/feature/auth",
    "ahead": 0,
    "behind": 0,
    "dirty": true,
    "changes": 3
  },
  "disk": {
    "size_bytes": 256901120,
    "size_human": "245M"
  },
  "framework": {
    "detected": "laravel",
    "version": "11.x",
    "php_version": "8.3"
  },
  "timestamps": {
    "created_at": "2026-01-05T09:15:00Z",
    "accessed_at": "2026-01-07T14:30:00Z",
    "last_commit_at": "2026-01-07T12:00:00Z"
  },
  "health": {
    "grade": "B",
    "score": 78,
    "issues": [
      "3 uncommitted changes",
      "No recent commits (2 days)"
    ]
  }
}
```

---

### `wt branches` (Priority 1 - New Command)

Lists available branches for creating worktrees.

**Planned Usage:**
```bash
wt branches <repo> --json
```

**Planned Response:**

```json
{
  "repo": "modernprintworks",
  "branches": [
    {
      "name": "main",
      "type": "local",
      "has_worktree": true,
      "worktree_path": "/Users/danny/Herd/modernprintworks--main",
      "sha": "abc1234",
      "last_commit_at": "2026-01-06T10:00:00Z"
    },
    {
      "name": "staging",
      "type": "local",
      "has_worktree": true,
      "worktree_path": "/Users/danny/Herd/modernprintworks--staging",
      "sha": "def5678",
      "last_commit_at": "2026-01-07T09:00:00Z"
    },
    {
      "name": "feature/checkout-flow",
      "type": "remote",
      "has_worktree": false,
      "worktree_path": null,
      "sha": "ghi9012",
      "last_commit_at": "2026-01-04T15:30:00Z"
    }
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Branch name |
| `type` | string | `"local"` or `"remote"` |
| `has_worktree` | boolean | Worktree exists for this branch |
| `worktree_path` | string\|null | Path if worktree exists |
| `sha` | string | Latest commit SHA |
| `last_commit_at` | string | ISO 8601 timestamp |

---

### `wt recent` (Priority 1)

Recently accessed worktrees across all repositories.

**Planned Usage:**
```bash
wt recent [count] --json
```

**Planned Response:**

```json
[
  {
    "repo": "modernprintworks",
    "branch": "staging",
    "path": "/Users/danny/Herd/modernprintworks--staging",
    "url": "http://modernprintworks--staging.test",
    "accessed_at": "2026-01-07T14:30:00Z",
    "dirty": false
  },
  {
    "repo": "scooda",
    "branch": "develop",
    "path": "/Users/danny/Herd/scooda--develop",
    "url": "http://scooda--develop.test",
    "accessed_at": "2026-01-07T12:15:00Z",
    "dirty": true
  }
]
```

---

### `wt health` (Priority 1)

Repository health analysis.

**Planned Usage:**
```bash
wt health [repo] --json
```

**Planned Response:**

```json
{
  "repo": "modernprintworks",
  "overall_grade": "B",
  "overall_score": 82,
  "worktree_count": 4,
  "summary": {
    "healthy": 2,
    "warning": 1,
    "critical": 1
  },
  "issues": [
    {
      "severity": "warning",
      "worktree": "feature/old-work",
      "message": "Stale worktree (21 days since last commit)"
    },
    {
      "severity": "critical",
      "worktree": "bugfix/urgent",
      "message": "45 commits behind staging"
    }
  ],
  "worktrees": [
    {
      "branch": "staging",
      "grade": "A",
      "score": 95,
      "issues": []
    },
    {
      "branch": "feature/auth",
      "grade": "B",
      "score": 78,
      "issues": ["3 uncommitted changes"]
    }
  ]
}
```

---

### `wt doctor` (Priority 2)

System requirements and configuration check.

**Planned Usage:**
```bash
wt doctor --json
```

**Planned Response:**

```json
{
  "status": "ok",
  "version": "2.0.0",
  "checks": [
    {
      "name": "git",
      "status": "ok",
      "version": "2.43.0",
      "message": "Git is installed and up to date"
    },
    {
      "name": "herd",
      "status": "ok",
      "version": "1.9.0",
      "message": "Laravel Herd is running",
      "herd_root": "/Users/danny/Herd"
    },
    {
      "name": "mysql",
      "status": "ok",
      "version": "8.0.35",
      "message": "MySQL is accessible"
    },
    {
      "name": "fzf",
      "status": "optional",
      "version": null,
      "message": "fzf not installed (optional, for interactive branch selection)"
    },
    {
      "name": "hooks",
      "status": "ok",
      "count": 3,
      "message": "3 hooks configured"
    }
  ],
  "config": {
    "herd_root": "/Users/danny/Herd",
    "bare_dir": ".bare",
    "default_base": "origin/staging",
    "protected_branches": ["main", "master", "staging"]
  }
}
```

---

### `wt clean` (Priority 3)

Cleanup analysis for stale/merged worktrees.

**Planned Usage:**
```bash
wt clean [repo] --json
```

**Planned Response:**

```json
{
  "repo": "modernprintworks",
  "candidates": [
    {
      "branch": "feature/old-work",
      "path": "/Users/danny/Herd/modernprintworks--feature-old-work",
      "reason": "merged",
      "merged_to": "staging",
      "age_days": 21,
      "disk_bytes": 245000000,
      "disk_human": "245M",
      "database": "modernprintworks__feature_old_work",
      "safe_to_remove": true
    },
    {
      "branch": "experiment/testing",
      "path": "/Users/danny/Herd/modernprintworks--experiment-testing",
      "reason": "stale",
      "merged_to": null,
      "age_days": 45,
      "disk_bytes": 180000000,
      "disk_human": "180M",
      "database": null,
      "safe_to_remove": false
    }
  ],
  "total_disk_recoverable": 425000000,
  "total_disk_human": "425M"
}
```

---

## Error Handling

### Error Response Format

When `--json` is enabled and an error occurs, output a structured error object to stdout (not stderr) with exit code > 0.

**Planned Response:**

```json
{
  "error": true,
  "code": "BRANCH_NOT_FOUND",
  "message": "Branch 'feature/nonexistent' does not exist",
  "details": {
    "repo": "modernprintworks",
    "branch": "feature/nonexistent",
    "suggestion": "Did you mean 'feature/notifications'?"
  }
}
```

**Error Codes:**

| Code | Description |
|------|-------------|
| `REPO_NOT_FOUND` | Repository doesn't exist |
| `BRANCH_NOT_FOUND` | Branch doesn't exist |
| `WORKTREE_EXISTS` | Worktree already exists for branch |
| `WORKTREE_NOT_FOUND` | Worktree doesn't exist |
| `PROTECTED_BRANCH` | Operation blocked on protected branch |
| `DIRTY_WORKTREE` | Uncommitted changes prevent operation |
| `GIT_ERROR` | Git command failed |
| `DATABASE_ERROR` | Database operation failed |
| `HOOK_FAILED` | Hook script returned non-zero |
| `INVALID_INPUT` | Input validation failed |
| `PERMISSION_DENIED` | File/directory permission issue |

---

## Tauri Integration Guide

### Recommended Architecture

```text
┌─────────────────────────────────────────────────────┐
│                 Tauri Frontend                       │
│          (React/Vue/Svelte + TypeScript)            │
└─────────────────────┬───────────────────────────────┘
                      │ IPC
                      ▼
┌─────────────────────────────────────────────────────┐
│                  Tauri Backend                       │
│                    (Rust)                            │
│  ┌─────────────────────────────────────────────┐   │
│  │           wt Command Executor               │   │
│  │  - Spawns wt CLI with --json flag           │   │
│  │  - Parses JSON responses                     │   │
│  │  - Handles errors and timeouts              │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │ Shell
                      ▼
┌─────────────────────────────────────────────────────┐
│                   wt CLI                             │
│              (This project)                          │
└─────────────────────────────────────────────────────┘
```

### Rust Backend Example

```rust
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Deserialize, Serialize)]
pub struct Worktree {
    pub path: String,
    pub branch: String,
    pub sha: String,
    pub url: String,
    pub dirty: bool,
    pub ahead: i32,
    pub behind: i32,
    pub health_grade: String,
    pub health_score: i32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WtError {
    pub error: bool,
    pub code: String,
    pub message: String,
}

#[tauri::command]
pub async fn list_worktrees(repo: Option<String>) -> Result<Vec<Worktree>, String> {
    let mut cmd = Command::new("wt");
    cmd.arg("ls").arg("--json");

    if let Some(r) = repo {
        cmd.arg(&r);
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute wt: {}", e))?;

    if !output.status.success() {
        // Try to parse as error JSON
        if let Ok(err) = serde_json::from_slice::<WtError>(&output.stdout) {
            return Err(err.message);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}

#[tauri::command]
pub async fn create_worktree(repo: String, branch: String) -> Result<Worktree, String> {
    let output = Command::new("wt")
        .args(["add", &repo, &branch, "--json"])
        .output()
        .map_err(|e| format!("Failed to execute wt: {}", e))?;

    if !output.status.success() {
        if let Ok(err) = serde_json::from_slice::<WtError>(&output.stdout) {
            return Err(err.message);
        }
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse JSON: {}", e))
}
```

### TypeScript Frontend Types

```typescript
interface Worktree {
  path: string;
  branch: string;
  sha: string;
  url: string;
  dirty: boolean;
  ahead: number;
  behind: number;
  mismatch: boolean;
  health_grade: 'A' | 'B' | 'C' | 'D' | 'F';
  health_score: number;
}

interface WorktreeStatus {
  branch: string;
  path: string;
  sha: string;
  dirty: boolean;
  changes: number;
  ahead: number;
  behind: number;
  stale: boolean;
  age: string;
  age_days: number;
  merged: boolean;
}

interface Repository {
  name: string;
  worktrees: number;
}

interface Branch {
  name: string;
  type: 'local' | 'remote';
  has_worktree: boolean;
  worktree_path: string | null;
  sha: string;
  last_commit_at: string;
}

interface WtError {
  error: true;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Tauri IPC calls
async function listWorktrees(repo?: string): Promise<Worktree[]> {
  return invoke('list_worktrees', { repo });
}

async function createWorktree(repo: string, branch: string): Promise<Worktree> {
  return invoke('create_worktree', { repo, branch });
}
```

---

## Implementation Checklist

### Phase 1: MVP Dashboard

- [x] `wt ls --json` - List worktrees
- [x] `wt status --json` - Worktree status
- [x] `wt repos --json` - List repositories
- [x] `wt add --json` - Create worktree
- [x] `wt summary --json` - Branch comparison
- [ ] `wt info --json` - Detailed worktree info
- [ ] `wt recent --json` - Recent worktrees
- [ ] `wt health --json` - Health metrics
- [ ] Structured error responses

### Phase 2: Create Worktree Flow

- [ ] `wt branches --json` - List available branches (new command)
- [ ] `wt doctor --json` - System requirements check

### Phase 3: Power Features

- [ ] `wt clean --json` - Cleanup analysis
- [ ] `wt diff --json` - Diff statistics
- [ ] `wt log --json` - Commit history

---

## Versioning

This API will follow semantic versioning:

- **Major** (1.0 → 2.0): Breaking changes to existing schemas
- **Minor** (1.0 → 1.1): New commands or fields added
- **Patch** (1.0.0 → 1.0.1): Bug fixes, documentation

The API version can be queried via:
```bash
wt --version --json
```

```json
{
  "version": "2.0.0",
  "api_version": "1.0.0"
}
```

---

## Appendix: JSON Utilities

### `json_escape()` Function

Location: `lib/07-templates.sh`

Escapes special characters for safe JSON embedding:
- Backslashes (`\` → `\\`)
- Double quotes (`"` → `\"`)
- Newlines → `\n`
- Tabs → `\t`
- Carriage returns → `\r`
- Form feeds → `\f`
- Backspaces → `\b`

### `format_json()` Function

Location: `lib/07-templates.sh`

Pretty-prints JSON with optional ANSI colours:
- Uses `jq` if available
- Falls back to `python3 -m json.tool`
- Manual formatting as last resort

Colours (TTY only):
- Keys: Cyan
- Strings: Green
- Booleans: Magenta
- Numbers: Yellow
