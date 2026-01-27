/**
 * useRelativeTime Composable
 *
 * Converts ISO timestamps to human-readable relative time strings.
 * Provides a simple, dependency-free solution for age display.
 */
import { computed, type ComputedRef } from 'vue';

/**
 * Time intervals in seconds for relative time calculation
 */
const INTERVALS = {
  year: 31536000,
  month: 2592000,
  week: 604800,
  day: 86400,
  hour: 3600,
  minute: 60,
} as const;

/**
 * Short labels for time units
 */
const SHORT_LABELS: Record<keyof typeof INTERVALS, string> = {
  year: 'y',
  month: 'mo',
  week: 'w',
  day: 'd',
  hour: 'h',
  minute: 'm',
};

/**
 * Full labels for time units (singular and plural)
 */
const FULL_LABELS: Record<keyof typeof INTERVALS, [string, string]> = {
  year: ['year', 'years'],
  month: ['month', 'months'],
  week: ['week', 'weeks'],
  day: ['day', 'days'],
  hour: ['hour', 'hours'],
  minute: ['minute', 'minutes'],
};

export interface RelativeTimeResult {
  /** Short format like "2h ago", "3d ago", "2w ago" */
  short: string;
  /** Full format like "2 hours ago", "3 days ago" */
  full: string;
  /** Whether the timestamp is very recent (< 1 minute) */
  isJustNow: boolean;
  /** Raw seconds since the timestamp */
  secondsAgo: number;
}

/**
 * Convert an ISO timestamp to relative time strings
 *
 * @param isoTimestamp - ISO 8601 timestamp string (e.g., "2026-01-09T17:06:08Z")
 * @returns RelativeTimeResult with short and full format strings
 */
export function formatRelativeTime(isoTimestamp: string | undefined | null): RelativeTimeResult {
  if (!isoTimestamp) {
    return {
      short: 'unknown',
      full: 'unknown',
      isJustNow: false,
      secondsAgo: 0,
    };
  }

  const timestamp = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const secondsAgo = Math.floor((now - timestamp) / 1000);

  // Handle future dates or very recent (< 1 minute)
  if (secondsAgo < 60) {
    return {
      short: 'now',
      full: 'just now',
      isJustNow: true,
      secondsAgo,
    };
  }

  // Find the appropriate interval
  for (const [unit, seconds] of Object.entries(INTERVALS) as [keyof typeof INTERVALS, number][]) {
    const interval = Math.floor(secondsAgo / seconds);
    if (interval >= 1) {
      const shortLabel = SHORT_LABELS[unit];
      const [singular, plural] = FULL_LABELS[unit];
      const fullLabel = interval === 1 ? singular : plural;

      return {
        short: `${interval}${shortLabel} ago`,
        full: `${interval} ${fullLabel} ago`,
        isJustNow: false,
        secondsAgo,
      };
    }
  }

  // Fallback for very small intervals
  return {
    short: 'now',
    full: 'just now',
    isJustNow: true,
    secondsAgo,
  };
}

/**
 * Composable for reactive relative time formatting
 *
 * @param timestamp - Ref or getter for ISO timestamp
 * @returns Computed RelativeTimeResult
 *
 * @example
 * ```ts
 * const { relativeTime } = useRelativeTime(() => worktree.lastAccessed);
 * // relativeTime.value.short => "2h ago"
 * // relativeTime.value.full => "2 hours ago"
 * ```
 */
export function useRelativeTime(
  timestamp: () => string | undefined | null
): { relativeTime: ComputedRef<RelativeTimeResult> } {
  const relativeTime = computed(() => formatRelativeTime(timestamp()));

  return { relativeTime };
}
