/**
 * The words Grove uses for a worktree ledger risk level — the single place they
 * live.
 *
 * `critical`, `warning` and `informational` are the *service's* vocabulary, from
 * `way worktree removal-check`. They are fine in logic and fine on the wire, but
 * they must never reach a human: Waypoint already says "At risk", "Needs a look"
 * and "Worth knowing" for the same three levels, and two apps reading the same
 * check must not describe it in two different languages. Waypoint's words win
 * because they are plain English and already shipped.
 *
 * Anything a human reads takes its wording from here. `guards.test.ts` fails if
 * a raw level name reaches user-facing text, which is what stops the two apps
 * drifting apart again.
 *
 * Grove's job is unchanged: answer "is this safe to touch or delete?" and hand
 * off to Waypoint for the story. These words are the answer, not a story.
 */
import type { LedgerOverlay } from '../types/wt';

/** The raw levels `way worktree removal-check` reports. Never shown to a human. */
export type RiskLevel = NonNullable<LedgerOverlay['risk']>;

export interface RiskWords {
  /** What a human reads. Never a raw level name. */
  label: string;
  /** SBadge variant carrying the same severity as the label. */
  variant: 'error' | 'warning' | 'default';
  /** The long form, for a tooltip or a detail row. */
  description: string;
}

const WORDS: Record<RiskLevel, RiskWords> = {
  critical: {
    label: 'At risk',
    variant: 'error',
    description:
      'The worktree ledger says this worktree is at risk. Open the details panel for the remedy.',
  },
  warning: {
    label: 'Needs a look',
    variant: 'warning',
    description:
      'The worktree ledger says this worktree needs a look. Open the details panel for the remedy.',
  },
  informational: {
    label: 'Worth knowing',
    variant: 'default',
    description: 'The worktree ledger has something worth knowing about this worktree.',
  },
};

/**
 * What the ledger says when it checked and found nothing. Said out loud rather
 * than left blank: silence here reads as "nothing at risk", which is a claim,
 * and a claim nobody made must not be made by an absence.
 */
const CLEAR: RiskWords = {
  label: 'Clear',
  variant: 'default',
  description: 'The worktree ledger checked this worktree and found nothing at risk.',
};

/**
 * The words for a level, or for "clear" when the check answered and found
 * nothing.
 *
 * Only call this once the check has actually answered — `risk_available === true`.
 * A null risk from an unanswered check is *unknown*, not clear, and takes
 * {@link RISK_UNKNOWN_LABEL} instead.
 */
export function riskWords(level: RiskLevel | null | undefined): RiskWords {
  return level ? WORDS[level] : CLEAR;
}

/** Said when the risk check ran but could not answer. Unknown is never clear. */
export const RISK_UNKNOWN_LABEL = 'Risk unknown';

/** Said when the ledger itself could not answer for the worktree. */
export const LEDGER_UNKNOWN_LABEL = 'Ledger unknown';

/**
 * The raw level names, exported so the guard test asserts against the same list
 * the type declares rather than a copy of it that can fall out of step.
 */
export const RAW_LEVEL_NAMES: readonly RiskLevel[] = ['critical', 'warning', 'informational'];
