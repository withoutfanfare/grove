// Type definitions matching the Rust backend types in src-tauri/src/types.rs
//
// These types are used for communication between the Vue frontend and Rust backend
// via Tauri's invoke system.

// ============================================================================
// Error Codes from CLI
// ============================================================================

/**
 * Error codes from CLI - matches UPPER_SNAKE_CASE codes from grove CLI.
 *
 * These codes enable context-specific error handling in the frontend.
 * The backend (wt.rs) extracts these from structured CLI JSON errors.
 */
export type WtErrorCode =
  // Input validation
  | 'INVALID_INPUT'
  | 'INVALID_BRANCH'
  | 'INVALID_REPO'
  | 'INVALID_PATH'
  // Not found
  | 'REPO_NOT_FOUND'
  | 'BRANCH_NOT_FOUND'
  | 'WORKTREE_NOT_FOUND'
  | 'CONFIG_NOT_FOUND'
  // Git operations
  | 'GIT_ERROR'
  | 'WORKTREE_EXISTS'
  | 'PROTECTED_BRANCH'
  // System
  | 'CLI_NOT_FOUND'
  | 'COMMAND_FAILED'
  | 'PARSE_ERROR'
  | 'IO_ERROR'
  | 'DB_ERROR'
  | 'HOOK_FAILED'
  // Internal
  | 'OUTPUT_TOO_LARGE'
  | 'SPAWN_ERROR'
  | 'THREAD_POOL_ERROR';

/**
 * Repository information from `wt repos --json`
 */
export interface Repository {
  /** Repository name (e.g., "scooda") */
  name: string;
  /** Number of worktrees in this repository */
  worktrees: number;
}

/**
 * Worktree information from `wt ls <repo> --json`
 */
export interface Worktree {
  /** Full filesystem path to the worktree */
  path: string;
  /** Branch name (may be empty for detached HEAD) */
  branch: string;
  /** Short SHA of the current commit */
  sha: string;
  /** URL if the worktree has a configured development URL */
  url?: string;
  /** Whether the worktree has uncommitted changes */
  dirty: boolean;
  /** Number of commits ahead of the tracking branch */
  ahead: number;
  /** Number of commits behind the tracking branch */
  behind: number;
  /** Whether there's a branch mismatch */
  mismatch?: boolean;
  /** Health grade (A, B, C, D, F) */
  health_grade?: string;
  /** Health score (0-100) */
  health_score?: number;
  /** ISO timestamp of last access (e.g., "2026-01-09T17:06:08Z") */
  lastAccessed?: string;
  /** Whether the branch has been merged into the base branch */
  merged?: boolean;
  /** Whether the worktree is stale (>50 commits behind) */
  stale?: boolean;
}

/**
 * Detailed dirty state breakdown from `git status --porcelain`
 */
export interface DirtyDetails {
  /** Number of files staged for commit */
  staged: number;
  /** Number of files with unstaged modifications */
  modified: number;
  /** Number of untracked files */
  untracked: number;
}

/**
 * Error type returned from the backend.
 *
 * The code field contains a WtErrorCode (or a string for unknown codes).
 * Use isWtError() to check if an unknown error is a WtError.
 */
export interface WtError {
  /** Error code for programmatic handling (typically a WtErrorCode) */
  code: WtErrorCode | string;
  /** Human-readable error message */
  message: string;
}

/**
 * Valid health grades (H15: mirrors Rust HealthGrade enum in types.rs)
 *
 * These values are serialised as uppercase single letters in JSON.
 */
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Status for worktree display
 */
export type WorktreeStatus = 'clean' | 'dirty' | 'stale';

/**
 * Branch type: local or remote (H15: mirrors Rust BranchType enum in types.rs)
 *
 * These values are serialised as lowercase strings in JSON.
 */
export type BranchType = 'local' | 'remote';

/**
 * Issue severity level (H15: mirrors Rust Severity enum in types.rs)
 *
 * These values are serialised as lowercase strings in JSON.
 */
export type Severity = 'warning' | 'critical';

/**
 * Status for operation progress items
 */
export type OperationProgressStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

/**
 * Operation types that emit progress events
 */
export type OperationType = 'pull_all' | 'prune';

/**
 * Check if an error is a WtError
 */
export function isWtError(error: unknown): error is WtError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

/**
 * Result from creating a worktree
 */
export interface CreateWorktreeResult {
  /** Full filesystem path to the created worktree */
  path: string;
  /** Development URL for the worktree */
  url: string;
  /** Branch name */
  branch: string;
  /** Database name (if created) */
  database: string;
}

/**
 * A hook that was executed during worktree creation
 */
export interface HookExecution {
  /** Hook name (e.g. "post-add", "post-add.d/01-setup.sh") */
  name: string;
  /** Execution status */
  status: 'success' | 'failed';
}

/**
 * Response from creating a worktree, including hook execution results.
 * Wraps the CLI JSON output with parsed hook information from stderr.
 */
export interface CreateWorktreeResponse {
  /** The CLI's JSON output (path, url, branch, database) */
  result: CreateWorktreeResult;
  /** Hooks that ran during creation (parsed from stderr) */
  hooks: HookExecution[];
}

/**
 * Result from removing a worktree
 */
export interface RemoveWorktreeResult {
  /** Whether the removal succeeded */
  success: boolean;
  /** Repository name */
  repo: string;
  /** Branch that was removed */
  branch: string;
  /** Path that was removed */
  path: string;
  /** Whether the git branch was deleted */
  branch_deleted: boolean;
  /** Whether the database was dropped */
  db_dropped: boolean;
}

/**
 * Response from removing a worktree, including hook execution results.
 * Wraps the CLI JSON output with parsed hook information from stderr.
 */
export interface RemoveWorktreeResponse {
  /** The CLI's JSON output (success, repo, branch, path, etc.) */
  result: RemoveWorktreeResult;
  /** Hooks that ran during removal (parsed from stderr) */
  hooks: HookExecution[];
}

/**
 * Result from pulling a worktree
 */
export interface PullResult {
  /** Whether the pull succeeded */
  success: boolean;
  /** Whether the branch was already up to date */
  already_up_to_date: boolean;
  /** Whether there were merge conflicts */
  conflicts: boolean;
  /** Number of commits pulled */
  commits_pulled: number;
  /** Output message from git */
  message: string;
}

/**
 * Result from syncing (rebasing) a worktree
 */
export interface SyncResult {
  /** Whether the sync succeeded */
  success: boolean;
  /** Base branch used for rebase */
  base: string;
  /** Whether there were merge conflicts */
  conflicts: boolean;
  /** Whether the worktree had uncommitted changes */
  dirty: boolean;
  /** Number of commits rebased */
  commits_rebased: number;
  /** Output message from git */
  message: string;
}

/**
 * Recently accessed worktree
 */
export interface RecentWorktree {
  /** Repository name */
  repo: string;
  /** Branch name */
  branch: string;
  /** Full filesystem path */
  path: string;
  /** Development URL (optional) */
  url?: string;
  /** Unix timestamp when last accessed */
  accessed_at: number;
  /** Human-readable time ago string */
  accessed_ago: string;
  /** Whether the worktree has uncommitted changes */
  dirty: boolean;
}

/**
 * Options for creating a worktree
 */
export interface CreateWorktreeOptions {
  /** Repository name */
  repo: string;
  /** Branch name to create */
  branch: string;
  /** Base branch to create from (optional) */
  base?: string;
  /** Template to use (optional) */
  template?: string;
  /** Force creation of new branch (optional, defaults to true in GUI) */
  force?: boolean;
}

/**
 * Options for removing a worktree
 */
export interface RemoveWorktreeOptions {
  /** Repository name */
  repo: string;
  /** Branch name to remove */
  branch: string;
  /** Whether to delete the git branch */
  deleteBranch?: boolean;
  /** Whether to drop the database */
  dropDb?: boolean;
  /** Whether to skip database backup */
  skipBackup?: boolean;
  /** Whether to force removal */
  force?: boolean;
}

// ============================================================================
// Phase 3: Branches, Health, Prune, Pull-All
// ============================================================================

/**
 * Branch information from `wt branches <repo> --json`
 */
export interface Branch {
  /** Branch name (e.g., "feature/login") */
  name: string;
  /** Branch type: "local" or "remote" */
  type: BranchType;
  /** Whether a worktree exists for this branch */
  has_worktree: boolean;
  /** Path to worktree if it exists */
  worktree_path?: string;
  /** Short SHA of latest commit */
  sha: string;
  /** Unix timestamp of last commit (optional) */
  last_commit_at?: number;
}

/**
 * Result from `wt branches <repo> --json`
 */
export interface BranchesResult {
  /** Repository name */
  repo: string;
  /** List of branches */
  branches: Branch[];
}

/**
 * Issue found during health check
 */
export interface HealthIssue {
  /** Severity: "warning" or "critical" */
  severity: Severity;
  /** Worktree branch name */
  worktree: string;
  /** Issue description */
  message: string;
}

/**
 * Per-worktree health details
 */
export interface WorktreeHealth {
  /** Branch name */
  branch: string;
  /** Health grade (A, B, C, D, F) */
  grade: HealthGrade;
  /** Health score (0-100) */
  score: number;
  /** List of issues */
  issues: string[];
}

/**
 * Health summary counts
 */
export interface HealthSummary {
  /** Worktrees with no issues */
  healthy: number;
  /** Worktrees with warnings */
  warning: number;
  /** Worktrees with critical issues */
  critical: number;
}

/**
 * Result from `wt health <repo> --json`
 */
export interface HealthResult {
  /** Repository name */
  repo: string;
  /** Overall grade (A, B, C, D, F) */
  overall_grade: HealthGrade;
  /** Overall score (0-100) */
  overall_score: number;
  /** Number of worktrees */
  worktree_count: number;
  /** Summary counts */
  summary: HealthSummary;
  /** List of all issues */
  issues: HealthIssue[];
  /** Per-worktree health */
  worktrees: WorktreeHealth[];
}

/**
 * Branch that was pruned
 */
export interface PrunedBranch {
  /** Branch name */
  name: string;
  /** Whether the branch was deleted */
  deleted: boolean;
  /** Reason for pruning */
  reason: string;
}

/**
 * Summary of prune operation
 */
export interface PruneSummary {
  /** Number of merged branches found */
  branches_found: number;
  /** Number of branches deleted */
  branches_deleted: number;
}

/**
 * Result from `wt prune <repo> --json`
 */
export interface PruneResult {
  /** Repository name */
  repo: string;
  /** Number of stale worktree refs pruned */
  stale_refs_pruned: number;
  /** List of merged branches */
  merged_branches: PrunedBranch[];
  /** Summary of operation */
  summary: PruneSummary;
}

/**
 * Individual worktree pull result
 */
export interface PullAllWorktree {
  /** Branch name */
  branch: string;
  /** Whether the pull succeeded */
  success: boolean;
  /** Whether the branch was already up to date */
  already_up_to_date: boolean;
  /** Number of commits pulled */
  commits_pulled: number;
  /** Output message from git */
  message: string;
}

/**
 * Summary of pull-all operation
 */
export interface PullAllSummary {
  /** Total number of worktrees */
  total: number;
  /** Number that succeeded */
  succeeded: number;
  /** Number that failed */
  failed: number;
  /** Number already up to date */
  up_to_date: number;
}

/**
 * Result from `wt pull-all <repo> --json`
 */
export interface PullAllResult {
  /** Repository name */
  repo: string;
  /** Results for each worktree */
  worktrees: PullAllWorktree[];
  /** Summary of operation */
  summary: PullAllSummary;
}

// ============================================================================
// Phase 4: Repository Management Results
// ============================================================================

/**
 * Result from cloning a repository
 */
export interface CloneResult {
  /** Whether the clone succeeded */
  success: boolean;
  /** Repository name */
  repo: string;
  /** Path where the repository was cloned */
  path: string;
  /** Output message from git */
  message: string;
}

/**
 * Result from repairing a repository
 */
export interface RepairResult {
  /** Whether the repair succeeded */
  success: boolean;
  /** Repository name */
  repo: string;
  /** Number of issues found */
  issues_found: number;
  /** Number of issues fixed */
  issues_fixed: number;
  /** Output message */
  message: string;
}

/**
 * Result from unlocking a repository
 */
export interface UnlockResult {
  /** Whether the unlock succeeded */
  success: boolean;
  /** Repository name */
  repo: string;
  /** Number of locks removed */
  locks_removed: number;
  /** Output message */
  message: string;
}

// ============================================================================
// Phase 4: Summary Results
// ============================================================================

/**
 * Commit information in summary output
 */
export interface SummaryCommit {
  /** Short SHA of the commit */
  sha: string;
  /** Commit subject line */
  subject: string;
}

/**
 * Uncommitted changes breakdown in summary output
 */
export interface SummaryUncommitted {
  /** Total number of uncommitted changes */
  total: number;
  /** Number of staged changes */
  staged: number;
  /** Number of modified (unstaged) changes */
  modified: number;
  /** Number of untracked files */
  untracked: number;
}

/**
 * Diff statistics in summary output
 */
export interface SummaryDiff {
  /** Short stat line (e.g., "3 files changed, 10 insertions(+), 5 deletions(-)") */
  shortstat: string;
  /** Summary line from diff --stat */
  summary: string;
}

/**
 * Result from `wt summary <repo> <branch> --json`
 * Provides a comprehensive view of a worktree's state compared to its base branch.
 */
export interface SummaryResult {
  /** Repository name */
  repo: string;
  /** Branch name */
  branch: string;
  /** Full filesystem path to the worktree */
  path: string;
  /** Base branch used for comparison */
  base: string;
  /** Number of commits ahead of base */
  ahead: number;
  /** Number of commits behind base */
  behind: number;
  /** Total commits ahead of base (may differ from ahead if limited) */
  ahead_commits_total: number;
  /** Total commits behind base (may differ from behind if limited) */
  behind_commits_total: number;
  /** Uncommitted changes breakdown */
  uncommitted: SummaryUncommitted;
  /** Diff statistics */
  diff: SummaryDiff;
  /** Recent commits ahead of base (limited to 10) */
  ahead_commits: SummaryCommit[];
  /** Recent commits behind base (limited to 10) */
  behind_commits: SummaryCommit[];
}

// ============================================================================
// File System Watching
// ============================================================================

/**
 * Type of change detected in a worktree
 */
export type WorktreeChangeType = 'head' | 'index' | 'fetch' | 'refs' | 'unknown';

/**
 * Event emitted when a watched worktree changes
 */
export interface WorktreeChangedEvent {
  /** Repository name */
  repo: string;
  /** Type of change detected */
  change_type: WorktreeChangeType;
  /** Affected paths */
  paths: string[];
}

/**
 * Event emitted when a worktree is selected from the system tray menu
 */
export interface TrayWorktreeSelectedEvent {
  /** Repository name */
  repo: string;
  /** Branch name */
  branch: string;
}

// ============================================================================
// Operation State Persistence Types
// ============================================================================

/**
 * Type of batch operation that can be persisted and resumed.
 * Matches Rust PersistentOperationType enum.
 */
export type PersistentOperationType = 'pull_all' | 'prune' | 'sync';

/**
 * Status of a persisted operation.
 * Matches Rust OperationStatus enum.
 */
export type OperationStatusType = 'running' | 'paused' | 'interrupted' | 'completed' | 'failed';

/**
 * Status of an individual item within an operation.
 * Matches Rust ItemStatus enum.
 */
export type ItemStatusType = 'pending' | 'success' | 'failed' | 'skipped';

/**
 * Individual item within an operation (e.g., a worktree to pull).
 * Matches Rust OperationItem struct.
 */
export interface OperationItem {
  /** Item identifier (branch name for pull-all, branch name for prune) */
  name: string;
  /** Current status of this item */
  status: ItemStatusType;
  /** Result message (error message if failed, success details if succeeded) */
  message?: string;
  /** ISO-8601 timestamp when this item completed (if completed) */
  completed_at?: string;
}

/**
 * Persisted state for a batch operation.
 * Matches Rust OperationState struct.
 */
export interface OperationState {
  /** Unique identifier for this operation */
  id: string;
  /** Type of operation */
  operation_type: PersistentOperationType;
  /** Repository this operation is running against */
  repo_name: string;
  /** ISO-8601 timestamp when operation started */
  started_at: string;
  /** ISO-8601 timestamp when state was last updated */
  updated_at: string;
  /** Current status of the operation */
  status: OperationStatusType;
  /** Total number of items to process */
  total_items: number;
  /** Number of items completed (success + failed + skipped) */
  completed_items: number;
  /** All items with their individual statuses */
  items: OperationItem[];
}

/**
 * Summary of a resumable operation for display in the UI.
 * Matches Rust ResumableOperationSummary struct.
 */
export interface ResumableOperationSummary {
  /** Unique identifier */
  id: string;
  /** Type of operation */
  operation_type: PersistentOperationType;
  /** Repository name */
  repo_name: string;
  /** When the operation started */
  started_at: string;
  /** When the operation was last updated */
  updated_at: string;
  /** Operation status */
  status: OperationStatusType;
  /** Total items */
  total_items: number;
  /** Completed items */
  completed_items: number;
  /** Number of successful items */
  successful_items: number;
  /** Number of failed items */
  failed_items: number;
  /** Number of pending items (remaining to process) */
  pending_items: number;
}

/**
 * Check if an operation can be resumed
 */
export function isOperationResumable(summary: ResumableOperationSummary): boolean {
  return (
    (summary.status === 'interrupted' || summary.status === 'paused') &&
    summary.pending_items > 0
  );
}

/**
 * Get a human-readable label for an operation type
 */
export function getOperationTypeLabel(type: PersistentOperationType): string {
  switch (type) {
    case 'pull_all':
      return 'Pull All';
    case 'prune':
      return 'Prune';
    case 'sync':
      return 'Sync';
    default:
      return type;
  }
}

/**
 * Get a human-readable label for an operation status
 */
export function getOperationStatusLabel(status: OperationStatusType): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'interrupted':
      return 'Interrupted';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

// ============================================================================
// Phase 3: Details Panel Types (Commits and File Changes)
// ============================================================================

/**
 * Commit information from `wt log <repo> <branch> --json`
 */
export interface Commit {
  /** Short SHA of the commit (7 chars) */
  sha: string;
  /** Commit message (first line/subject) */
  message: string;
  /** Author name */
  author: string;
  /** ISO-8601 date string */
  date: string;
}

/**
 * Result from `wt log <repo> <branch> --json`
 */
export interface LogResult {
  /** List of commits */
  commits: Commit[];
}

/**
 * File change status from `wt changes <repo> <branch> --json`
 *
 * Possible values:
 * - M: Modified
 * - A: Added
 * - D: Deleted
 * - R: Renamed
 * - C: Copied
 * - U: Unmerged
 * - ?: Untracked
 */
export type FileChangeStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

/**
 * File change information from `wt changes <repo> <branch> --json`
 */
export interface FileChange {
  /** File path relative to worktree root */
  path: string;
  /** Change status (M, A, D, R, C, U, ?) */
  status: FileChangeStatus;
}

/**
 * Result from `wt changes <repo> <branch> --json`
 */
export interface ChangesResult {
  /** List of changed files */
  files: FileChange[];
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Database configuration from wt config
 */
export interface ConfigDatabase {
  /** Whether database creation is enabled */
  enabled: boolean;
  /** Database host */
  host?: string;
  /** Database user */
  user?: string;
}

/**
 * Application configuration returned from get_config command
 */
export interface Config {
  /** Default base branch for new worktrees (e.g., "origin/staging") */
  default_base_branch?: string;
  /** Protected branches that require force flag to remove */
  protected_branches: string[];
  /** Path to wt configuration directory */
  config_dir?: string;
  /** Path to hooks directory */
  hooks_dir?: string;
  /** Path to repositories directory (HERD_ROOT) */
  herd_root?: string;
  /** Whether hooks are enabled */
  hooks_enabled: boolean;
  /** Database configuration */
  database?: ConfigDatabase;
  /** URL subdomain prefix (e.g., "api" turns feature.test into api.feature.test) */
  url_subdomain?: string;
}

/**
 * Configuration layer indicating the scope of a config file
 */
export type ConfigLayer = 'global' | 'project' | 'repo';

/**
 * Metadata about a configuration file
 */
export interface ConfigFileMeta {
  /** Which layer this config file belongs to */
  layer: ConfigLayer;
  /** Full path to the config file */
  path: string;
  /** Whether the file currently exists */
  exists: boolean;
  /** Whether the file is writable (or can be created) */
  writable: boolean;
  /** Whether the file is a symlink */
  is_symlink: boolean;
  /** Target path if the file is a symlink */
  symlink_target?: string;
  /** ISO-8601 timestamp of last modification */
  last_modified?: string;
}

/**
 * A single configuration entry from a config file
 */
export interface ConfigEntry {
  /** Configuration key (e.g., "DEFAULT_BASE", "DB_CREATE") */
  key: string;
  /** Normalised value (quotes removed) */
  value: string;
  /** Raw value as it appears in the file */
  raw_value: string;
  /** Whether this line is commented out */
  commented: boolean;
  /** Line number in the file (1-based) */
  line: number;
  /** Whether this is a sensitive value (e.g., password) */
  sensitive: boolean;
}

/**
 * Full contents of a configuration file
 */
export interface ConfigFileContents {
  /** File metadata */
  meta: ConfigFileMeta;
  /** Raw file contents */
  content: string;
  /** Parsed configuration entries */
  entries: ConfigEntry[];
}

/**
 * Request to update configuration keys
 */
export interface ConfigKeyUpdate {
  /** Key to update */
  key: string;
  /** New value, or null/undefined to delete/comment out */
  value?: string | null;
}

// ============================================================================
// Hook Management Types
// ============================================================================

/**
 * Lifecycle hook event types
 */
export type HookEvent =
  | 'pre_add'
  | 'post_add'
  | 'post_pull'
  | 'post_switch'
  | 'post_sync'
  | 'pre_rm'
  | 'post_rm';

/**
 * Scope of a hook script
 */
export type HookScope = 'single' | 'global_d' | 'repo_d';

/**
 * Security status of a hook script
 */
export interface HookSecurity {
  /** Whether the hook is owned by the current user (Unix only) */
  owned_by_current_user?: boolean;
  /** Whether the hook is world-writable (security risk) */
  world_writable?: boolean;
  /** Whether the hook has the executable bit set */
  executable: boolean;
  /** Whether wt would allow this hook to run */
  allowed_to_run: boolean;
  /** Reason if the hook is blocked from running */
  blocked_reason?: string;
}

/**
 * Metadata about a hook script
 */
export interface HookScriptMeta {
  /** Which event this hook runs on */
  event: HookEvent;
  /** Scope of the hook (single, global.d, repo.d) */
  scope: HookScope;
  /** Repository name (only for repo_d scope) */
  repo?: string;
  /** Filename of the hook script */
  name: string;
  /** Full path to the hook script */
  path: string;
  /** Whether the hook is a symlink */
  is_symlink: boolean;
  /** Target path if the hook is a symlink */
  symlink_target?: string;
  /** Key for stable sorting (filename-based) */
  order_key: string;
  /** Security status */
  security: HookSecurity;
}

/**
 * Full contents of a hook script
 */
export interface HookScriptContents {
  /** Hook metadata */
  meta: HookScriptMeta;
  /** Script contents */
  content: string;
}

/**
 * Human-readable labels for hook events
 */
export function getHookEventLabel(event: HookEvent): string {
  switch (event) {
    case 'pre_add':
      return 'Pre-Add';
    case 'post_add':
      return 'Post-Add';
    case 'post_pull':
      return 'Post-Pull';
    case 'post_switch':
      return 'Post-Switch';
    case 'post_sync':
      return 'Post-Sync';
    case 'pre_rm':
      return 'Pre-Remove';
    case 'post_rm':
      return 'Post-Remove';
    default:
      return event;
  }
}

/**
 * Human-readable labels for hook scopes
 */
export function getHookScopeLabel(scope: HookScope): string {
  switch (scope) {
    case 'single':
      return 'Single Hook';
    case 'global_d':
      return 'Global Scripts';
    case 'repo_d':
      return 'Repository Scripts';
    default:
      return scope;
  }
}

/**
 * Human-readable labels for config layers
 */
export function getConfigLayerLabel(layer: ConfigLayer): string {
  switch (layer) {
    case 'global':
      return 'Global (~/.groverc)';
    case 'project':
      return 'Project (.groveconfig)';
    case 'repo':
      return 'Repository';
    default:
      return layer;
  }
}
