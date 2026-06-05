// Translation layer for grove CLI health scoring tokens.
//
// The CLI's calculate_health_score() emits compact tokens (behind:N,
// changes:N, age:Nd, unmerged, untracked:N) designed for one-line ls
// output. This module is the single source of truth for turning those
// tokens into human findings: what's wrong, why it matters, the exact
// score impact, and which actions fix it. It tolerates both single
// tokens and comma-joined messages (a zsh splitting bug in older CLI
// builds joins all of a worktree's tokens into one issue message).
import type { Severity, HealthGrade } from '../types';

export type HealthFindingKind =
  | 'behind'
  | 'changes'
  | 'age'
  | 'unmerged'
  | 'untracked'
  | 'unknown';

export type HealthActionId = 'pull' | 'sync' | 'open-editor' | 'view-worktree' | 'remove';

export interface HealthFindingAction {
  id: HealthActionId;
  label: string;
  /** True only for actions that delete things; the UI badges these */
  destructive?: boolean;
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

const ACTIONS: Record<HealthActionId, HealthFindingAction> = {
  pull: { id: 'pull', label: 'Pull' },
  sync: { id: 'sync', label: 'Sync' },
  'open-editor': { id: 'open-editor', label: 'Open in Editor' },
  'view-worktree': { id: 'view-worktree', label: 'Go to Worktree' },
  remove: { id: 'remove', label: 'Remove…', destructive: true },
};

// Deduction thresholds mirror calculate_health_score() in
// grove-cli/lib/commands/info.sh — keep them in sync.
function behindImpact(commits: number): number {
  if (commits > 50) return -30;
  if (commits > 20) return -20;
  return -10;
}

function changesImpact(changes: number): number {
  if (changes > 20) return -20;
  if (changes > 5) return -10;
  return -5;
}

function ageImpact(days: number): number {
  if (days > 60) return -25;
  if (days > 30) return -15;
  return -5;
}

function unknownFinding(token: string): HealthFinding {
  return {
    kind: 'unknown',
    raw: token,
    title: token,
    explanation: 'Reported by the grove CLI health check.',
    scoreImpact: 0,
    actions: [ACTIONS['view-worktree']],
  };
}

function parseToken(token: string): HealthFinding {
  const separator = token.indexOf(':');
  const key = separator === -1 ? token : token.slice(0, separator);
  const rawValue = separator === -1 ? '' : token.slice(separator + 1);

  if (key === 'behind') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'behind',
      value,
      raw: token,
      title: `${value} commit${value === 1 ? '' : 's'} behind base`,
      explanation:
        'The base branch has moved on; the longer you wait, the higher the conflict risk.',
      scoreImpact: behindImpact(value),
      actions: [ACTIONS.pull, ACTIONS.sync],
    };
  }

  if (key === 'changes') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'changes',
      value,
      raw: token,
      title: `${value} uncommitted change${value === 1 ? '' : 's'}`,
      explanation: 'Uncommitted work can be lost and blocks clean pulls and syncs.',
      scoreImpact: changesImpact(value),
      actions: [ACTIONS['open-editor'], ACTIONS['view-worktree']],
    };
  }

  if (key === 'age') {
    const value = Number.parseInt(rawValue.replace(/d$/, ''), 10);
    if (!Number.isFinite(value) || !/^\d+d?$/.test(rawValue)) return unknownFinding(token);
    return {
      kind: 'age',
      value,
      raw: token,
      title: `No commits for ${value} day${value === 1 ? '' : 's'}`,
      explanation: "This branch looks dormant. Resume it, or remove the worktree if it's done.",
      scoreImpact: ageImpact(value),
      actions: [ACTIONS['view-worktree'], ACTIONS.remove],
    };
  }

  if (token === 'unmerged') {
    return {
      kind: 'unmerged',
      raw: token,
      title: 'Not merged into base',
      explanation:
        "Work here hasn't landed in the base branch yet — expected for in-progress branches.",
      scoreImpact: -10,
      actions: [ACTIONS['view-worktree']],
    };
  }

  if (key === 'untracked') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'untracked',
      value,
      raw: token,
      title: `${value} untracked file${value === 1 ? '' : 's'}`,
      explanation: "Files git isn't tracking — commit, ignore, or tidy them.",
      scoreImpact: -5,
      actions: [ACTIONS['open-editor']],
    };
  }

  return unknownFinding(token);
}

/**
 * Parse a health issue message into structured findings.
 * Splits comma-joined messages (older CLI builds) and single tokens alike.
 */
export function parseHealthIssueMessage(message: string): HealthFinding[] {
  return message
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map(parseToken);
}

/** Severity is a worktree score bracket, not a per-issue property. */
export function severityExplanation(severity: Severity): string {
  return severity === 'critical'
    ? "Critical: this worktree's overall health score is below 60."
    : "Warning: this worktree's overall health score is between 60 and 79.";
}

/** Deduction table for the "How scoring works" explainer (mirrors the CLI) */
export const SCORING_RULES: { check: string; deduction: string }[] = [
  { check: 'Commits behind base', deduction: '−10 (>5), −20 (>20), −30 (>50)' },
  { check: 'Uncommitted changes', deduction: '−5 (any), −10 (>5), −20 (>20)' },
  { check: 'Days since last commit', deduction: '−5 (>14), −15 (>30), −25 (>60)' },
  { check: 'Not merged into base', deduction: '−10' },
  { check: 'More than 10 untracked files', deduction: '−5' },
];

export const GRADE_BANDS: { grade: HealthGrade; range: string }[] = [
  { grade: 'A', range: '90–100' },
  { grade: 'B', range: '80–89' },
  { grade: 'C', range: '70–79' },
  { grade: 'D', range: '60–69' },
  { grade: 'F', range: 'below 60' },
];

export const SEVERITY_BRACKETS: { label: string; range: string }[] = [
  { label: 'Healthy', range: 'score 80 or above' },
  { label: 'Warning', range: 'score 60–79' },
  { label: 'Critical', range: 'score below 60' },
];
