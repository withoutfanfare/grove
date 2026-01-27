// Type definitions for real-time progress streaming
//
// These types are used for the operation progress UI feature (Phase 4 & 5).
// They define the structure of progress events emitted by the Rust backend
// and consumed by the Vue frontend.

/**
 * Status of a progress item during an operation
 *
 * Phase 5 adds 'conflict' status for merge conflicts detection.
 */
export type ProgressStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'conflict' | 'skipped';

/**
 * Individual item in a progress operation
 *
 * Phase 5 adds:
 * - error: Captures stderr content for failed items
 * - hasConflict: Boolean flag for conflict detection
 * - worktreePath: Full path to the worktree for actions
 */
export interface ProgressItem {
  /** Item identifier (e.g., branch name) */
  item: string;
  /** Current status of the item */
  status: ProgressStatus;
  /** Optional details (e.g., commits pulled, error message) */
  details?: string;
  /** Stderr content for failures - used to display detailed error messages */
  error?: string;
  /** Whether this item has merge conflicts */
  hasConflict?: boolean;
  /** Full filesystem path to the worktree (for "Open in Editor" action) */
  worktreePath?: string;
}

/**
 * Complete operation progress state
 */
export interface OperationProgress {
  /** Operation type (e.g., "pull_all", "prune") */
  operation: string;
  /** Current item index (1-based for display, may not match array index for dynamic items) */
  current: number;
  /** Total items to process */
  total: number;
  /** List of items with their status */
  items: ProgressItem[];
  /** Whether the operation has completed */
  isComplete: boolean;
}

/**
 * Event payload from Tauri backend for operation progress
 * Matches the Rust struct OperationProgressEvent
 */
export interface OperationProgressEvent {
  /** Operation type: "pull_all", "prune", etc. */
  operation: string;
  /** Current item index (1-based) */
  current: number;
  /** Total items to process */
  total: number;
  /** Item identifier (branch name) */
  item: string;
  /** Status: "pending", "in_progress", "success", "failed", "skipped" */
  status: ProgressStatus;
  /** Optional details (commits pulled, error message, etc.) */
  details?: string;
}

/**
 * Terminal status values (operation complete for these statuses)
 * Phase 5: Added 'conflict' as a terminal status
 */
export const TERMINAL_STATUSES: ProgressStatus[] = ['success', 'failed', 'conflict', 'skipped'];

/**
 * Check if a status is terminal (operation complete for this item)
 */
export function isTerminalStatus(status: ProgressStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// ============================================================================
// Phase 5: Enhanced Pull Results - Detection Utilities
// ============================================================================

/**
 * Patterns that indicate merge conflicts in git output
 */
const CONFLICT_PATTERNS = [
  'CONFLICT',
  'Automatic merge failed',
  'fix conflicts',
  'Merge conflict',
  'both modified:',
  'both added:',
];

/**
 * Patterns that indicate the branch is already up to date
 */
const UP_TO_DATE_PATTERNS = [
  'Already up to date',
  'Already up-to-date',
];

/**
 * Check if git output indicates merge conflicts
 */
export function hasConflictMarkers(output: string): boolean {
  return CONFLICT_PATTERNS.some((pattern) => output.includes(pattern));
}

/**
 * Check if git output indicates the branch is already up to date
 */
export function isAlreadyUpToDate(output: string): boolean {
  return UP_TO_DATE_PATTERNS.some((pattern) => output.includes(pattern));
}

/**
 * Determine the enhanced status based on git output
 * Returns a more specific status: 'conflict' or 'skipped' (for up-to-date)
 */
export function determineEnhancedStatus(
  originalStatus: ProgressStatus,
  output: string
): { status: ProgressStatus; hasConflict: boolean } {
  // If operation failed and output contains conflict markers, it's a conflict
  if (originalStatus === 'failed' && hasConflictMarkers(output)) {
    return { status: 'conflict', hasConflict: true };
  }

  // If success but already up to date, mark as skipped
  if (originalStatus === 'success' && isAlreadyUpToDate(output)) {
    return { status: 'skipped', hasConflict: false };
  }

  return { status: originalStatus, hasConflict: false };
}

/**
 * Filter type for categorising results in the UI
 */
export type ResultFilter = 'all' | 'success' | 'failed' | 'conflict' | 'skipped';

/**
 * Status counts for summary display
 */
export interface StatusCounts {
  pending: number;
  in_progress: number;
  success: number;
  failed: number;
  conflict: number;
  skipped: number;
}

/**
 * Format a status count for display (e.g., "Failed (2)")
 */
export function formatStatusCount(label: string, count: number): string {
  return count > 0 ? `${label} (${count})` : label;
}
