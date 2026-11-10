import { ref, readonly } from 'vue'

/**
 * Session Activity: a short receipt for every action Grove ran, kept after
 * toasts fade and progress panels close. Memory only (cleared on relaunch),
 * capped, and redacted before anything is copied.
 */

export const MAX_ACTIVITY_ENTRIES = 50

export type ActivityStatus = 'succeeded' | 'failed' | 'partial' | 'cancelled' | 'warning'

export interface ActivityEntry {
  id: number
  /** Unix ms */
  at: number
  /** What was attempted, e.g. "Delete worktree" */
  action: string
  repo: string
  /** Branch, path or "3 worktrees" */
  target: string
  status: ActivityStatus
  /** Things that went wrong without failing the action (hooks, recovery, skipped items) */
  warnings: string[]
  /** Per-item outcomes or the error text */
  details?: string
}

const entries = ref<ActivityEntry[]>([])
let nextId = 1

// A quoted credential value. Double quotes honour backslash escapes (across newlines too).
// In single quotes a backslash is literal in shell and dotenv but an escape elsewhere, so a
// value containing \' is ambiguous and is redacted to the end of the line.
const QUOTED = String.raw`"(?:[^"\\]|\\[\s\S])*"|"[^"]*"|'[^'\n]*\\'[^\n]*|'[^']*'`
// Text glued to the closing quote ('it'\''s', "abc"'def') is still part of the value.
const SECRET_VALUE = String.raw`(?:${QUOTED})(?:${QUOTED}|[^\s,;}\]])*|\S+`

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\/Users\/[^/\s]+/g, '~'],
  [/\/home\/[^/\s]+/g, '~'],
  // Credentials embedded in URLs: https://user:token@host
  [/(\w+:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[redacted]@'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|xox[abpr]-[A-Za-z0-9-]{10,})\b/g, '[redacted]'],
  // Also catches prefixed keys such as DB_PASSWORD=… or GITHUB_TOKEN: …
  // Quoted keys ("password":) and whole quoted values ("a b c") are covered too.
  [new RegExp(String.raw`([\w-]*(?:password|passwd|pwd|token|secret|api[_-]?key)["']?)(\s*[=:]\s*)(?:${SECRET_VALUE})`, 'gi'), '$1$2[redacted]'],
]

/** Remove home-folder names and anything that looks like a credential */
export function redact(text: string): string {
  return SECRET_PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text)
}

export function recordActivity(entry: Omit<ActivityEntry, 'id' | 'at' | 'warnings'> & { warnings?: string[] }): void {
  // Redact on the way in, so raw secrets are never retained, even in memory.
  const stored: ActivityEntry = {
    ...entry,
    target: redact(entry.target),
    details: entry.details === undefined ? undefined : redact(entry.details),
    warnings: (entry.warnings ?? []).map(redact),
    id: nextId++,
    at: Date.now(),
  }
  entries.value = [stored, ...entries.value].slice(0, MAX_ACTIVITY_ENTRIES)
}

export function formatActivityEntry(entry: Readonly<Omit<ActivityEntry, 'warnings'>> & { warnings: readonly string[] }): string {
  const lines = [
    `${new Date(entry.at).toISOString()}  ${entry.status.toUpperCase()}  ${entry.action}`,
    `Repository: ${entry.repo}`,
    `Target: ${entry.target}`,
    ...entry.warnings.map((w) => `Warning: ${w}`),
  ]
  if (entry.details) lines.push(entry.details)
  return redact(lines.join('\n'))
}

export function useActivity() {
  return {
    entries: readonly(entries),
    record: recordActivity,
    clear: () => { entries.value = [] },
    format: formatActivityEntry,
  }
}

export function resetActivityForTests(): void {
  entries.value = []
  nextId = 1
}
