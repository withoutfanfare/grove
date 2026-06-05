# Health Issue Clarity — Design

**Date:** 2026-06-05
**Status:** Approved (brainstorm complete, pending implementation plan)

## Problem

The Health panel erodes trust. It shows raw CLI scoring tokens (`changes:37,age:105d`)
verbatim, labels findings "Critical" without saying what that means, displays wrong
issue counts, never explains how the F/55 score was computed, and offers no way to
fix anything. The user's words: *"It's telling me that something's critical. Why?
How do I fix it? Is it going to be a destructive operation?"*

## Research Findings (root causes)

1. **Raw tokens.** `grove health --json` issue messages are the CLI's compact scoring
   shorthand from `calculate_health_score()` (`grove-cli/lib/commands/info.sh:816`),
   designed for one-line `ls` output. Grove renders `issue.message` untranslated.
2. **Severity is a score bracket, not an issue property.** The CLI marks every finding
   from a worktree `critical` when that worktree's *overall* score is below 60
   (`warning` covers 60–79, healthy is 80+). Grove presents it as per-issue urgency.
3. **CLI split bug.** Both issue-splitting loops use `local IFS=','; for issue in $var`
   — zsh does not word-split unquoted parameters by default, so all of a worktree's
   findings arrive as one comma-joined "issue" (`info.sh:995-998` and `:1060-1066`).
   That's why the screenshot showed "2 issues" when there were 4 findings.
4. **Opaque scoring.** The deduction table and grade bands exist only in CLI comments.
5. **No actions.** Every finding has a remedy Grove already implements (pull, sync,
   open editor, remove worktree) — none are reachable from the panel.

### CLI scoring reference (authoritative, from `calculate_health_score`)

| Token | Meaning | Deduction |
|---|---|---|
| `behind:N` | N commits behind the base branch | >50 → −30, >20 → −20, >5 → −10 |
| `changes:N` | N uncommitted changes (porcelain lines) | >20 → −20, >5 → −10, else −5 |
| `age:Nd` | N days since the last commit | >60 → −25, >30 → −15, >14 → −5 |
| `unmerged` | Branch not merged into base | −10 |
| `untracked:N` | N untracked files (only flagged when >10) | −5 |

Grade bands: A ≥90 · B ≥80 · C ≥70 · D ≥60 · F <60.
Worktree brackets: healthy ≥80 · warning 60–79 · critical <60.

## Decisions Made During Brainstorm

| Question | Decision |
|---|---|
| Where to fix | Grove-side translation + action layer (approach A); CLI emits unchanged data |
| CLI split bug | Also patch in `grove-cli` (companion task); Grove parser tolerates both shapes so ordering doesn't matter |
| Issues presentation | Group findings by worktree (fixes count confusion, matches mental model) |
| Severity copy | Explain as a score bracket, with tooltip + legend |
| Scoring transparency | Collapsible "How scoring works" section with the deduction table and grade bands |
| Actions | Inline per finding; destructive ones badged and routed through existing confirmed flows |
| Unknown tokens | Fall back to raw text — never blank, never crash |

## Architecture

### New module: `src/utils/healthIssues.ts`

A pure, dependency-free translation layer. One source of truth for token semantics,
consumed by both `HealthPanel` and the overview's `AttentionPanel`.

```ts
export type HealthFindingKind =
  | 'behind' | 'changes' | 'age' | 'unmerged' | 'untracked' | 'unknown';

export type HealthActionId = 'pull' | 'sync' | 'open-editor' | 'view-worktree' | 'remove';

export interface HealthFindingAction {
  id: HealthActionId;
  label: string;          // e.g. "Pull", "Open in Editor", "Remove…"
  destructive?: boolean;  // true only for 'remove'
}

export interface HealthFinding {
  kind: HealthFindingKind;
  /** Numeric value parsed from the token (commits, files, or days) */
  value?: number;
  /** The raw token, always preserved (fallback display, keys, debugging) */
  raw: string;
  /** Short human title, e.g. "37 uncommitted changes" */
  title: string;
  /** One-sentence plain-English explanation of why it matters */
  explanation: string;
  /** Points this finding deducted from the worktree's score (negative; 0 for unknown) */
  scoreImpact: number;
  /** Suggested remedies, most relevant first */
  actions: HealthFindingAction[];
}

/** Splits comma-joined messages and parses each token. Tolerant of single tokens. */
export function parseHealthIssueMessage(message: string): HealthFinding[];

/** "This worktree's overall health score is below 60." etc. */
export function severityExplanation(severity: Severity): string;

/** Static data for the "How scoring works" explainer */
export const SCORING_RULES: { check: string; deduction: string }[];
export const GRADE_BANDS: { grade: HealthGrade; range: string }[];
export const SEVERITY_BRACKETS: { label: string; range: string }[];
```

Per-token translation:

| Kind | Title | Explanation | Score impact | Actions |
|---|---|---|---|---|
| `behind` | "N commits behind base" | "The base branch has moved on; the longer you wait, the higher the conflict risk." | by threshold table | Pull, Sync |
| `changes` | "N uncommitted change(s)" | "Uncommitted work can be lost and blocks clean pulls and syncs." | by threshold table | Open in Editor, Go to Worktree |
| `age` | "No commits for N days" | "This branch looks dormant. Resume it, or remove the worktree if it's done." | by threshold table | Go to Worktree, Remove… (destructive) |
| `unmerged` | "Not merged into base" | "Work here hasn't landed in the base branch yet — expected for in-progress branches." | −10 | Go to Worktree |
| `untracked` | "N untracked files" | "Files git isn't tracking — commit, ignore, or tidy them." | −5 | Open in Editor |
| `unknown` | raw token | "Reported by the grove CLI health check." | 0 | Go to Worktree |

`scoreImpact` reproduces the CLI thresholds exactly (e.g. `changes:37` → −20;
`age:105d` → −25). `value` parses the integer; `age` strips the trailing `d`.
Empty/whitespace messages return `[]`.

### HealthPanel redesign (`src/components/HealthPanel.vue`)

**Issues section — grouped by worktree** (replaces the flat list):

```bash
ISSUES

┌ enneagram-assessment                     F 55   [Critical ⓘ] ┐
│  ⚠ 37 uncommitted changes                            −20 pts │
│     Uncommitted work can be lost and blocks clean syncs.     │
│     [Open in Editor]  [Go to Worktree]                       │
│  ⚠ No commits for 105 days                           −25 pts │
│     This branch looks dormant. Resume it, or remove the      │
│     worktree if it's done.                                   │
│     [Go to Worktree]  [Remove… ⚠]                            │
└──────────────────────────────────────────────────────────────┘

Critical: score below 60 · Warning: score 60–79

▸ How scoring works
   Starts at 100; deductions: behind base (−10/−20/−30), uncommitted
   changes (−5/−10/−20), days since last commit (−5/−15/−25),
   unmerged (−10), >10 untracked files (−5).
   Grades: A ≥90 · B ≥80 · C ≥70 · D ≥60 · F <60
```

- Group key: `issue.worktree`. Group header shows the branch, its `GradeBadge`
  (looked up from `health.worktrees`), and the severity chip with a `title`
  tooltip from `severityExplanation()`.
- Each `HealthFinding` renders: severity-tinted icon, `title`, `explanation`,
  score-impact chip (`−20 pts`), and its action buttons.
- A one-line severity legend sits under the issues list; "How scoring works" is a
  native `<details>` disclosure rendering `SCORING_RULES` + `GRADE_BANDS`.
- Summary tiles (Healthy/Warning/Critical) gain `title` tooltips with the brackets.
- Per-worktree section: issue counts derived from **parsed findings** (fixes the
  wrong "1 issue" count) with finding titles as a muted sub-line.

**Action wiring** (all inside HealthPanel; no new Tauri commands):

| Action | Wired to | Notes |
|---|---|---|
| Pull | `useWorktrees().pullWorktree(repoName, branch)` | busy state per branch; refetch health on completion; toast result |
| Sync | `useWorktrees().syncWorktree(repoName, branch)` | same pattern |
| Open in Editor | `useWorktrees().openInEditor(path)` | path resolved from a branch→worktree map (below) |
| Go to Worktree | select repo + `fetchWorktrees` + `focusWorktree(branch, true, true)`, then emit `close` | same pattern as overview navigation |
| Remove… | opens the existing `DeleteWorktreeDialog` (owned by HealthPanel) | destructive badge on the button; refetch health after close |

**Branch→worktree map:** when the panel fetches health it also calls
`wt.listWorktrees(repoName)` and builds `Map<branch, Worktree>`. This keeps the
panel self-contained (it's opened from both Dashboard and OverviewDashboard, where
selection state differs). If a branch is missing from the map (race with deletion),
path-dependent actions (Open in Editor, Remove…) are hidden for that finding.

### Overview AttentionPanel (`src/components/overview/AttentionPanel.vue`)

- Health item sub-line shows parsed finding titles joined with " · "
  (e.g. "37 uncommitted changes · No commits for 105 days") instead of the raw
  message. Severity dot gains a `title` tooltip from `severityExplanation()`.
- No layout change; the View action (opens HealthPanel) remains the deep-dive path.

### Companion fix: grove-cli split bug (separate, ordered last)

In `grove-cli/lib/commands/info.sh`, replace both non-splitting loops with zsh
explicit splitting:

- `:995` `for issue in $issues` → `for issue in ${(s:,:)issues}`
- `:1062` `for issue in $wt_issues` → `for issue in ${(s:,:)wt_issues}`

Then rebuild and refresh the sidecar (`cd grove-cli && ./build.sh`, then in grove
`npm run prepare-sidecar`). After the fix, each token arrives as its own issue;
Grove's parser handles single- and multi-token messages identically, so the UI is
correct before and after. Add a grove-cli CHANGELOG entry.

## Edge States

- **Empty message / no issues** — `parseHealthIssueMessage` returns `[]`; groups
  with no findings don't render; the existing "no issues" state is unchanged.
- **Unknown token** — rendered with raw text and a generic explanation; 0 pts; never
  blocks the rest of the message.
- **Branch absent from worktree map** — explanation and navigation still render;
  editor/remove actions hidden.
- **Action failure** — toast with the error; panel stays open; health refetched only
  on success paths that change state (pull/sync/remove).

## Out of Scope

- Per-issue severity in the CLI (severity stays a worktree score bracket).
- Changing the scoring model or thresholds.
- Auto-fix/bulk-fix from the health panel (the overview's bulk actions cover that).
- Worktree-card-level health popovers (cards already show grade badges).

## Testing

- **Vitest (`src/utils/healthIssues.test.ts`)** — token table coverage incl.
  threshold boundaries for scoreImpact (e.g. changes 5/6/20/21), comma-join
  splitting, `age` day parsing, unknown-token fallback, empty message,
  severityExplanation copy.
- **Vitest (`src/components/HealthPanel.test.ts`)** — new file: rendered grouped
  issues from a mocked health fixture show translated titles (raw tokens absent),
  score-impact chips, severity legend and scoring explainer present; destructive
  Remove… opens the delete dialog; Pull invokes `pull_worktree` via mocked invoke.
- **Vitest (`src/components/overview/AttentionPanel.test.ts`)** — new file: health
  attention item shows translated titles, not raw tokens.
- **grove-cli** — existing `run-tests.sh` suite must pass after the split fix.
