// Type definitions for wt CLI JSON output
//
// These types match the JSON structure returned by the wt CLI commands.
// All types derive Serialize for sending to frontend and Deserialize for parsing CLI output.

use serde::{Deserialize, Serialize};

// ============================================================================
// H15: Type-Safe Enums for Constrained Values
// ============================================================================

/// Branch type: local or remote
///
/// Used to distinguish between local branches and remote tracking branches.
/// Serialises to lowercase strings for CLI compatibility ("local", "remote").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BranchType {
    #[default]
    Local,
    Remote,
}

/// Severity level for health issues
///
/// Used in health reports to indicate the severity of issues found.
/// Serialises to lowercase strings for CLI compatibility ("warning", "critical").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    #[default]
    Warning,
    Critical,
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Severity::Warning => write!(f, "warning"),
            Severity::Critical => write!(f, "critical"),
        }
    }
}

/// Health grade (A, B, C, D, F)
///
/// Used in health reports to indicate overall worktree health.
/// Serialises to uppercase single letters for CLI compatibility ("A", "B", "C", "D", "F").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum HealthGrade {
    #[default]
    A,
    B,
    C,
    D,
    F,
}

impl std::fmt::Display for HealthGrade {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HealthGrade::A => write!(f, "A"),
            HealthGrade::B => write!(f, "B"),
            HealthGrade::C => write!(f, "C"),
            HealthGrade::D => write!(f, "D"),
            HealthGrade::F => write!(f, "F"),
        }
    }
}

/// Repository information from `wt repos --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    /// Repository name (e.g., "my-project")
    pub name: String,
    /// Number of worktrees in this repository
    pub worktrees: u32,
}

/// Worktree information from `wt ls <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worktree {
    /// Full filesystem path to the worktree
    pub path: String,
    /// Branch name (may be empty for detached HEAD)
    pub branch: String,
    /// Short SHA of the current commit
    pub sha: String,
    /// URL if the worktree has a configured development URL
    #[serde(default)]
    pub url: Option<String>,
    /// Whether the worktree has uncommitted changes
    pub dirty: bool,
    /// Number of commits ahead of the tracking branch
    pub ahead: u32,
    /// Number of commits behind the tracking branch
    pub behind: u32,
    /// Whether there's a branch mismatch
    #[serde(default)]
    pub mismatch: bool,
    /// Health grade (A, B, C, D, F) (H15: now a proper enum)
    #[serde(default)]
    pub health_grade: Option<HealthGrade>,
    /// Health score (0-100)
    #[serde(default)]
    pub health_score: Option<u32>,
    /// ISO timestamp of last access (e.g., "2026-01-09T17:06:08Z")
    #[serde(default, rename = "lastAccessed")]
    pub last_accessed: Option<String>,
    /// Whether the branch has been merged into the base branch
    #[serde(default)]
    pub merged: Option<bool>,
    /// Whether the worktree is stale (>50 commits behind)
    #[serde(default)]
    pub stale: Option<bool>,
}

/// Detailed dirty state breakdown from `git status --porcelain`
///
/// Provides file counts by status category for richer UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirtyDetails {
    /// Number of files staged for commit
    pub staged: u32,
    /// Number of files with unstaged modifications
    pub modified: u32,
    /// Number of untracked files
    pub untracked: u32,
}

/// Result from `wt add <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeResult {
    /// Full filesystem path to the created worktree
    pub path: String,
    /// Development URL for the worktree
    pub url: String,
    /// Branch name
    pub branch: String,
    /// Database name (if created)
    pub database: String,
}

/// A hook that was executed during worktree creation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookExecution {
    /// Hook name (e.g. "post-add", "post-add.d/01-setup.sh")
    pub name: String,
    /// Execution status: "success" or "failed"
    pub status: String,
}

/// Response from creating a worktree, including hook execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorktreeResponse {
    /// The CLI's JSON output (path, url, branch, database)
    pub result: CreateWorktreeResult,
    /// Hooks that ran during creation (parsed from stderr)
    pub hooks: Vec<HookExecution>,
}

/// Result from `wt rm <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveWorktreeResult {
    /// Whether the removal succeeded
    pub success: bool,
    /// Repository name
    pub repo: String,
    /// Branch that was removed
    pub branch: String,
    /// Path that was removed
    pub path: String,
    /// Whether the git branch was deleted
    pub branch_deleted: bool,
    /// Whether the database was dropped
    pub db_dropped: bool,
}

/// Response from removing a worktree, including hook execution results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoveWorktreeResponse {
    /// The CLI's JSON output (success, repo, branch, path, etc.)
    pub result: RemoveWorktreeResult,
    /// Hooks that ran during removal (parsed from stderr)
    pub hooks: Vec<HookExecution>,
}

/// Result from `wt pull <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResult {
    /// Whether the pull succeeded
    pub success: bool,
    /// Whether the branch was already up to date
    pub already_up_to_date: bool,
    /// Whether there were merge conflicts
    pub conflicts: bool,
    /// Number of commits pulled
    pub commits_pulled: u32,
    /// Output message from git
    pub message: String,
}

/// Result from `wt sync <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    /// Whether the sync succeeded
    pub success: bool,
    /// Base branch used for rebase
    pub base: String,
    /// Whether there were merge conflicts
    pub conflicts: bool,
    /// Whether the worktree had uncommitted changes
    pub dirty: bool,
    /// Number of commits rebased
    pub commits_rebased: u32,
    /// Output message from git
    pub message: String,
}

/// Recent worktree from `wt recent --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentWorktree {
    /// Repository name
    pub repo: String,
    /// Branch name
    pub branch: String,
    /// Full filesystem path
    pub path: String,
    /// Development URL (optional)
    #[serde(default)]
    pub url: Option<String>,
    /// Unix timestamp when last accessed
    pub accessed_at: i64,
    /// Human-readable time ago string
    pub accessed_ago: String,
    /// Whether the worktree has uncommitted changes
    pub dirty: bool,
}

// ============================================================================
// Phase 3: Branches, Health, Prune, Pull-All
// ============================================================================

/// Branch information from `wt branches <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    /// Branch name (e.g., "feature/login")
    pub name: String,
    /// Branch type: local or remote (H15: now a proper enum)
    #[serde(rename = "type")]
    pub branch_type: BranchType,
    /// Whether a worktree exists for this branch
    pub has_worktree: bool,
    /// Path to worktree if it exists
    #[serde(default)]
    pub worktree_path: Option<String>,
    /// Short SHA of latest commit
    pub sha: String,
    /// Unix timestamp of last commit (optional)
    #[serde(default)]
    pub last_commit_at: Option<i64>,
}

/// Result from `wt branches <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchesResult {
    /// Repository name
    pub repo: String,
    /// List of branches
    pub branches: Vec<Branch>,
}

/// Issue found during health check
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthIssue {
    /// Severity: warning or critical (H15: now a proper enum)
    pub severity: Severity,
    /// Worktree branch name
    pub worktree: String,
    /// Issue description
    pub message: String,
}

/// Per-worktree health details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeHealth {
    /// Branch name
    pub branch: String,
    /// Health grade (A, B, C, D, F) (H15: now a proper enum)
    pub grade: HealthGrade,
    /// Health score (0-100)
    pub score: u32,
    /// List of issues
    pub issues: Vec<String>,
}

/// Health summary counts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthSummary {
    /// Worktrees with no issues
    pub healthy: u32,
    /// Worktrees with warnings
    pub warning: u32,
    /// Worktrees with critical issues
    pub critical: u32,
}

/// Result from `wt health <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResult {
    /// Repository name
    pub repo: String,
    /// Overall grade (A, B, C, D, F) (H15: now a proper enum)
    pub overall_grade: HealthGrade,
    /// Overall score (0-100)
    pub overall_score: u32,
    /// Number of worktrees
    pub worktree_count: u32,
    /// Summary counts
    pub summary: HealthSummary,
    /// List of all issues
    pub issues: Vec<HealthIssue>,
    /// Per-worktree health
    pub worktrees: Vec<WorktreeHealth>,
}

/// Branch that was pruned
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrunedBranch {
    /// Branch name
    pub name: String,
    /// Whether the branch was deleted
    pub deleted: bool,
    /// Reason for pruning
    pub reason: String,
}

/// Summary of prune operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneSummary {
    /// Number of merged branches found
    pub branches_found: u32,
    /// Number of branches deleted
    pub branches_deleted: u32,
}

/// Result from `wt prune <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PruneResult {
    /// Repository name
    pub repo: String,
    /// Number of stale worktree refs pruned
    pub stale_refs_pruned: u32,
    /// List of merged branches
    pub merged_branches: Vec<PrunedBranch>,
    /// Summary of operation
    pub summary: PruneSummary,
}

/// Individual worktree pull result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullAllWorktree {
    /// Branch name
    pub branch: String,
    /// Whether the pull succeeded
    pub success: bool,
    /// Whether the branch was already up to date
    pub already_up_to_date: bool,
    /// Number of commits pulled
    pub commits_pulled: u32,
    /// Output message from git
    pub message: String,
}

/// Summary of pull-all operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullAllSummary {
    /// Total number of worktrees
    pub total: u32,
    /// Number that succeeded
    pub succeeded: u32,
    /// Number that failed (excludes cancelled)
    pub failed: u32,
    /// Number already up to date
    pub up_to_date: u32,
    /// Number cancelled by user (M2: separate field for accurate reporting)
    #[serde(default)]
    pub cancelled: u32,
}

/// Result from `wt pull-all <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullAllResult {
    /// Repository name
    pub repo: String,
    /// Results for each worktree
    pub worktrees: Vec<PullAllWorktree>,
    /// Summary of operation
    pub summary: PullAllSummary,
}

// ============================================================================
// Phase 4: Real-Time Progress Feedback
// ============================================================================

/// Progress event for streaming operations
///
/// Emitted during long-running operations (pull-all, prune) to provide
/// real-time feedback to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationProgressEvent {
    /// Operation type: "pull_all", "prune"
    pub operation: String,
    /// Current item index (1-based)
    pub current: u32,
    /// Total items to process
    pub total: u32,
    /// Item identifier (branch name)
    pub item: String,
    /// Status: "pending", "in_progress", "success", "failed", "skipped"
    pub status: String,
    /// Optional details (commits pulled, error message, etc.)
    pub details: Option<String>,
}

// ============================================================================
// Error Codes Convention (H3)
// ============================================================================
//
// All error codes MUST use UPPER_SNAKE_CASE for consistency and easier
// programmatic handling. This convention applies across:
// - types.rs: WtError constructors
// - commands.rs: spawn_blocking error handling
// - wt.rs: CLI execution errors
//
// Standard error codes:
// - CLI_NOT_FOUND: grove CLI binary not found in PATH
// - COMMAND_FAILED: grove CLI command returned non-zero exit code
// - PARSE_ERROR: Failed to parse JSON output from grove
// - IO_ERROR: General I/O error (file, network, etc.)
// - UTF8_ERROR: Invalid UTF-8 in command output
// - INVALID_INPUT: User input validation failed
// - INVALID_PATH: Path validation failed
// - INVALID_URL: URL validation failed
// - SPAWN_ERROR: Failed to spawn background task
// - THREAD_POOL_ERROR: Failed to create thread pool
// - OPEN_FAILED: Failed to open external application

/// Error type returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WtError {
    /// Error code for programmatic handling (always UPPER_SNAKE_CASE)
    pub code: String,
    /// Human-readable error message
    pub message: String,
}

impl WtError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    /// grove CLI not found in PATH
    pub fn cli_not_found() -> Self {
        Self::new(
            "CLI_NOT_FOUND",
            "grove CLI not found. Please ensure grove is installed and in your PATH.",
        )
    }

    /// grove command execution failed
    pub fn command_failed(stderr: impl Into<String>) -> Self {
        Self::new("COMMAND_FAILED", stderr)
    }

    /// Failed to parse JSON output from wt
    pub fn parse_error(details: impl Into<String>) -> Self {
        Self::new(
            "PARSE_ERROR",
            format!("Failed to parse wt output: {}", details.into()),
        )
    }

    /// Failed to spawn background task
    pub fn spawn_error(details: impl Into<String>) -> Self {
        Self::new(
            "SPAWN_ERROR",
            format!("Failed to spawn background task: {}", details.into()),
        )
    }
}

impl std::fmt::Display for WtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for WtError {}

/// Result type alias for commands returning data or WtError
pub type WtResult<T> = Result<T, WtError>;

// ============================================================================
// Operation State Persistence Types
// ============================================================================

/// Type of batch operation that can be persisted and resumed.
///
/// These operations process multiple items and can be interrupted.
/// Serialises to snake_case strings for JSON storage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PersistentOperationType {
    /// Pull all worktrees in a repository
    PullAll,
    /// Prune merged branches
    Prune,
    /// Sync (rebase) all worktrees
    Sync,
}

impl std::fmt::Display for PersistentOperationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PersistentOperationType::PullAll => write!(f, "pull_all"),
            PersistentOperationType::Prune => write!(f, "prune"),
            PersistentOperationType::Sync => write!(f, "sync"),
        }
    }
}

/// Status of a persisted operation.
///
/// Tracks whether an operation is running, paused, interrupted, etc.
/// Serialises to snake_case strings for JSON storage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
    /// Operation is currently running
    Running,
    /// Operation was paused by the user
    Paused,
    /// Operation was interrupted (app crash, system restart, etc.)
    Interrupted,
    /// Operation completed successfully
    Completed,
    /// Operation failed with an error
    Failed,
}

impl std::fmt::Display for OperationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OperationStatus::Running => write!(f, "running"),
            OperationStatus::Paused => write!(f, "paused"),
            OperationStatus::Interrupted => write!(f, "interrupted"),
            OperationStatus::Completed => write!(f, "completed"),
            OperationStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Status of an individual item within an operation.
///
/// Tracks the progress of each worktree/branch within a batch operation.
/// Serialises to snake_case strings for JSON storage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    /// Item has not been processed yet
    Pending,
    /// Item was processed successfully
    Success,
    /// Item processing failed
    Failed,
    /// Item was skipped (e.g., due to cancellation)
    Skipped,
}

impl std::fmt::Display for ItemStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ItemStatus::Pending => write!(f, "pending"),
            ItemStatus::Success => write!(f, "success"),
            ItemStatus::Failed => write!(f, "failed"),
            ItemStatus::Skipped => write!(f, "skipped"),
        }
    }
}

/// Individual item within an operation (e.g., a worktree to pull).
///
/// Tracks the status and result of processing each item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationItem {
    /// Item identifier (branch name for pull-all, branch name for prune)
    pub name: String,
    /// Current status of this item
    pub status: ItemStatus,
    /// Result message (error message if failed, success details if succeeded)
    #[serde(default)]
    pub message: Option<String>,
    /// ISO-8601 timestamp when this item completed (if completed)
    #[serde(default)]
    pub completed_at: Option<String>,
}

impl OperationItem {
    /// Create a new pending item
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            status: ItemStatus::Pending,
            message: None,
            completed_at: None,
        }
    }

    /// Mark this item as successfully completed
    pub fn mark_success(&mut self, message: Option<String>) {
        self.status = ItemStatus::Success;
        self.message = message;
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Mark this item as failed
    pub fn mark_failed(&mut self, message: String) {
        self.status = ItemStatus::Failed;
        self.message = Some(message);
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Mark this item as skipped
    pub fn mark_skipped(&mut self, message: Option<String>) {
        self.status = ItemStatus::Skipped;
        self.message = message;
        self.completed_at = Some(chrono::Utc::now().to_rfc3339());
    }
}

/// Persisted state for a batch operation.
///
/// This struct is saved to disk after each item completes, enabling
/// resumption of interrupted operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationState {
    /// Unique identifier for this operation
    pub id: String,
    /// Type of operation
    pub operation_type: PersistentOperationType,
    /// Repository this operation is running against
    pub repo_name: String,
    /// ISO-8601 timestamp when operation started
    pub started_at: String,
    /// ISO-8601 timestamp when state was last updated
    pub updated_at: String,
    /// Current status of the operation
    pub status: OperationStatus,
    /// Total number of items to process
    pub total_items: u32,
    /// Number of items completed (success + failed + skipped)
    pub completed_items: u32,
    /// All items with their individual statuses
    pub items: Vec<OperationItem>,
}

impl OperationState {
    /// Create a new operation state
    pub fn new(
        operation_type: PersistentOperationType,
        repo_name: impl Into<String>,
        items: Vec<String>,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        let total_items = items.len() as u32;

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            operation_type,
            repo_name: repo_name.into(),
            started_at: now.clone(),
            updated_at: now,
            status: OperationStatus::Running,
            total_items,
            completed_items: 0,
            items: items.into_iter().map(OperationItem::new).collect(),
        }
    }

    /// Get pending items that have not been processed
    pub fn pending_items(&self) -> Vec<&OperationItem> {
        self.items
            .iter()
            .filter(|item| item.status == ItemStatus::Pending)
            .collect()
    }

    /// Get the names of pending items
    pub fn pending_item_names(&self) -> Vec<String> {
        self.pending_items()
            .iter()
            .map(|item| item.name.clone())
            .collect()
    }

    /// Get failed items
    pub fn failed_items(&self) -> Vec<&OperationItem> {
        self.items
            .iter()
            .filter(|item| item.status == ItemStatus::Failed)
            .collect()
    }

    /// Get successful items
    pub fn successful_items(&self) -> Vec<&OperationItem> {
        self.items
            .iter()
            .filter(|item| item.status == ItemStatus::Success)
            .collect()
    }

    /// Update the state timestamp
    pub fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    /// Mark an item by name as successful
    pub fn mark_item_success(&mut self, name: &str, message: Option<String>) {
        if let Some(item) = self.items.iter_mut().find(|i| i.name == name) {
            if item.status == ItemStatus::Pending {
                item.mark_success(message);
                self.completed_items += 1;
            }
        }
        self.touch();
    }

    /// Mark an item by name as failed
    pub fn mark_item_failed(&mut self, name: &str, message: String) {
        if let Some(item) = self.items.iter_mut().find(|i| i.name == name) {
            if item.status == ItemStatus::Pending {
                item.mark_failed(message);
                self.completed_items += 1;
            }
        }
        self.touch();
    }

    /// Mark an item by name as skipped
    pub fn mark_item_skipped(&mut self, name: &str, message: Option<String>) {
        if let Some(item) = self.items.iter_mut().find(|i| i.name == name) {
            if item.status == ItemStatus::Pending {
                item.mark_skipped(message);
                self.completed_items += 1;
            }
        }
        self.touch();
    }

    /// Mark all remaining pending items as skipped (e.g., on cancellation)
    #[allow(dead_code)]
    pub fn skip_remaining(&mut self, message: Option<String>) {
        for item in &mut self.items {
            if item.status == ItemStatus::Pending {
                item.mark_skipped(message.clone());
                self.completed_items += 1;
            }
        }
        self.touch();
    }

    /// Mark operation as completed
    pub fn mark_completed(&mut self) {
        self.status = OperationStatus::Completed;
        self.touch();
    }

    /// Mark operation as failed
    #[allow(dead_code)]
    pub fn mark_failed(&mut self) {
        self.status = OperationStatus::Failed;
        self.touch();
    }

    /// Mark operation as interrupted
    pub fn mark_interrupted(&mut self) {
        self.status = OperationStatus::Interrupted;
        self.touch();
    }

    /// Check if operation can be resumed (has pending items)
    pub fn is_resumable(&self) -> bool {
        matches!(
            self.status,
            OperationStatus::Interrupted | OperationStatus::Paused
        ) && self.completed_items < self.total_items
    }
}

/// Summary of a resumable operation for display in the UI.
///
/// This is a lighter-weight representation for listing operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResumableOperationSummary {
    /// Unique identifier
    pub id: String,
    /// Type of operation
    pub operation_type: PersistentOperationType,
    /// Repository name
    pub repo_name: String,
    /// When the operation started
    pub started_at: String,
    /// When the operation was last updated
    pub updated_at: String,
    /// Operation status
    pub status: OperationStatus,
    /// Total items
    pub total_items: u32,
    /// Completed items
    pub completed_items: u32,
    /// Number of successful items
    pub successful_items: u32,
    /// Number of failed items
    pub failed_items: u32,
    /// Number of pending items (remaining to process)
    pub pending_items: u32,
}

impl From<&OperationState> for ResumableOperationSummary {
    fn from(state: &OperationState) -> Self {
        let successful = state.successful_items().len() as u32;
        let failed = state.failed_items().len() as u32;
        let pending = state.pending_items().len() as u32;

        Self {
            id: state.id.clone(),
            operation_type: state.operation_type,
            repo_name: state.repo_name.clone(),
            started_at: state.started_at.clone(),
            updated_at: state.updated_at.clone(),
            status: state.status,
            total_items: state.total_items,
            completed_items: state.completed_items,
            successful_items: successful,
            failed_items: failed,
            pending_items: pending,
        }
    }
}

// ============================================================================
// Phase 4: Repository Management Types
// ============================================================================

/// Result from `wt clone <url> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneResult {
    /// Whether the clone succeeded
    pub success: bool,
    /// Repository name
    pub repo: String,
    /// Path where the repository was cloned
    pub path: String,
    /// Output message from git
    pub message: String,
}

/// Result from `wt repair <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepairResult {
    /// Whether the repair succeeded
    pub success: bool,
    /// Repository name
    pub repo: String,
    /// Number of issues found
    pub issues_found: u32,
    /// Number of issues fixed
    pub issues_fixed: u32,
    /// Output message
    pub message: String,
}

/// Result from `wt unlock <repo> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockResult {
    /// Whether the unlock succeeded
    pub success: bool,
    /// Repository name
    pub repo: String,
    /// Number of locks removed
    pub locks_removed: u32,
    /// Output message
    pub message: String,
}

// ============================================================================
// Phase 3: Details Panel Types (Commits and File Changes)
// ============================================================================

/// Commit information from `wt log <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commit {
    /// Short SHA of the commit (7 chars)
    pub sha: String,
    /// Commit message (first line/subject)
    pub message: String,
    /// Author name
    pub author: String,
    /// ISO-8601 date string
    pub date: String,
}

/// Result from `wt log <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogResult {
    /// List of commits
    pub commits: Vec<Commit>,
}

/// File change status from `wt changes <repo> <branch> --json`
///
/// Possible values:
/// - M: Modified
/// - A: Added
/// - D: Deleted
/// - R: Renamed
/// - C: Copied
/// - U: Unmerged
/// - ?: Untracked
pub type FileChangeStatus = String;

/// File change information from `wt changes <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    /// File path relative to worktree root
    pub path: String,
    /// Change status (M, A, D, R, C, U, ?)
    pub status: FileChangeStatus,
}

/// Result from `wt changes <repo> <branch> --json`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangesResult {
    /// List of changed files
    pub files: Vec<FileChange>,
}

// ============================================================================
// Disk Usage Types
// ============================================================================

/// Disk usage for a single worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeDiskUsage {
    /// Worktree branch name
    pub branch: String,
    /// Full path to the worktree
    pub path: String,
    /// Size in bytes
    pub size_bytes: u64,
    /// Human-readable size (e.g., "1.2 GB")
    pub size_display: String,
}

/// Disk usage summary for a repository
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoDiskUsage {
    /// Repository name
    pub repo: String,
    /// Total size in bytes
    pub total_bytes: u64,
    /// Human-readable total size
    pub total_display: String,
    /// Per-worktree sizes
    pub worktrees: Vec<WorktreeDiskUsage>,
}

// ============================================================================
// Diff Stats Types
// ============================================================================

/// Diff statistics for a worktree relative to its base branch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    /// Number of files changed
    pub files_changed: u32,
    /// Number of lines added
    pub lines_added: u32,
    /// Number of lines removed
    pub lines_removed: u32,
    /// Short display string (e.g., "5 files, +120/-45")
    pub display: String,
    /// Full file list for tooltip
    pub file_list: Vec<String>,
}

// ============================================================================
// Worktree Template Types
// ============================================================================

/// A worktree creation template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeTemplate {
    /// Template name (e.g., "feature")
    pub name: String,
    /// Branch prefix (e.g., "feature/")
    pub branch_prefix: String,
    /// Default base branch (e.g., "origin/main")
    pub default_base: String,
    /// Optional post-create script
    #[serde(default)]
    pub post_create_script: Option<String>,
    /// Whether this is a built-in template
    #[serde(default)]
    pub builtin: bool,
}

// ============================================================================
// Configuration Types (M20)
// ============================================================================

/// Helper function for serde default of true
fn default_true() -> bool {
    true
}

/// Application configuration returned from get_config command.
///
/// This struct provides typed configuration data to the frontend,
/// replacing the previous unstructured String return type.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    /// Default base branch for new worktrees (e.g., "origin/staging")
    #[serde(default)]
    pub default_base_branch: Option<String>,
    /// Protected branches that require force flag to remove
    #[serde(default)]
    pub protected_branches: Vec<String>,
    /// Path to wt configuration directory
    #[serde(default)]
    pub config_dir: Option<String>,
    /// Path to hooks directory
    #[serde(default)]
    pub hooks_dir: Option<String>,
    /// Path to repositories directory (HERD_ROOT)
    #[serde(default)]
    pub herd_root: Option<String>,
    /// Whether hooks are enabled
    #[serde(default = "default_true")]
    pub hooks_enabled: bool,
    /// Database configuration
    #[serde(default)]
    pub database: Option<ConfigDatabase>,
    /// URL subdomain prefix (e.g., "api" turns feature.test into api.feature.test)
    #[serde(default)]
    pub url_subdomain: Option<String>,
}

/// Database configuration from wt config.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConfigDatabase {
    /// Whether database creation is enabled
    #[serde(default)]
    pub enabled: bool,
    /// Database host
    #[serde(default)]
    pub host: Option<String>,
    /// Database user
    #[serde(default)]
    pub user: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_repository_deserialize() {
        let json = r#"{"name": "my-project", "worktrees": 6}"#;
        let repo: Repository = serde_json::from_str(json).unwrap();
        assert_eq!(repo.name, "my-project");
        assert_eq!(repo.worktrees, 6);
    }

    #[test]
    fn test_worktree_deserialize() {
        let json = r#"{
            "path": "/Users/test/repo-worktrees/feature",
            "branch": "feature/test",
            "sha": "abc1234",
            "url": "https://feature.test",
            "dirty": true,
            "ahead": 5,
            "behind": 10,
            "mismatch": false,
            "health_grade": "B",
            "health_score": 85
        }"#;
        let wt: Worktree = serde_json::from_str(json).unwrap();
        assert_eq!(wt.branch, "feature/test");
        assert!(wt.dirty);
        assert_eq!(wt.health_grade, Some(HealthGrade::B));
    }

    #[test]
    fn test_worktree_with_optional_fields() {
        let json = r#"{
            "path": "/test",
            "branch": "main",
            "sha": "abc",
            "dirty": false,
            "ahead": 0,
            "behind": 0
        }"#;
        let wt: Worktree = serde_json::from_str(json).unwrap();
        assert_eq!(wt.url, None);
        assert_eq!(wt.health_grade, None);
    }

    // C6: Verify last_commit_at handles both integer timestamps and null values
    #[test]
    fn test_branch_last_commit_at_with_timestamp() {
        let json = r#"{
            "name": "main",
            "type": "local",
            "has_worktree": true,
            "worktree_path": "/path/to/worktree",
            "sha": "abc1234",
            "last_commit_at": 1704067200
        }"#;
        let branch: Branch = serde_json::from_str(json).unwrap();
        assert_eq!(branch.name, "main");
        assert_eq!(branch.branch_type, BranchType::Local);
        assert_eq!(branch.last_commit_at, Some(1704067200));
    }

    #[test]
    fn test_branch_last_commit_at_with_null() {
        let json = r#"{
            "name": "feature/test",
            "type": "remote",
            "has_worktree": false,
            "worktree_path": null,
            "sha": "def5678",
            "last_commit_at": null
        }"#;
        let branch: Branch = serde_json::from_str(json).unwrap();
        assert_eq!(branch.name, "feature/test");
        assert_eq!(branch.branch_type, BranchType::Remote);
        assert_eq!(branch.last_commit_at, None);
    }

    #[test]
    fn test_branch_last_commit_at_missing() {
        let json = r#"{
            "name": "develop",
            "type": "local",
            "has_worktree": false,
            "sha": "ghi9012"
        }"#;
        let branch: Branch = serde_json::from_str(json).unwrap();
        assert_eq!(branch.name, "develop");
        assert_eq!(branch.branch_type, BranchType::Local);
        assert_eq!(branch.last_commit_at, None);
    }

    // H15: Test enum serialisation/deserialisation
    #[test]
    fn test_health_grade_serialisation() {
        assert_eq!(serde_json::to_string(&HealthGrade::A).unwrap(), "\"A\"");
        assert_eq!(serde_json::to_string(&HealthGrade::B).unwrap(), "\"B\"");
        assert_eq!(serde_json::to_string(&HealthGrade::F).unwrap(), "\"F\"");
    }

    #[test]
    fn test_health_grade_deserialisation() {
        assert_eq!(
            serde_json::from_str::<HealthGrade>("\"A\"").unwrap(),
            HealthGrade::A
        );
        assert_eq!(
            serde_json::from_str::<HealthGrade>("\"B\"").unwrap(),
            HealthGrade::B
        );
        assert_eq!(
            serde_json::from_str::<HealthGrade>("\"F\"").unwrap(),
            HealthGrade::F
        );
    }

    #[test]
    fn test_severity_serialisation() {
        assert_eq!(
            serde_json::to_string(&Severity::Warning).unwrap(),
            "\"warning\""
        );
        assert_eq!(
            serde_json::to_string(&Severity::Critical).unwrap(),
            "\"critical\""
        );
    }

    #[test]
    fn test_severity_deserialisation() {
        assert_eq!(
            serde_json::from_str::<Severity>("\"warning\"").unwrap(),
            Severity::Warning
        );
        assert_eq!(
            serde_json::from_str::<Severity>("\"critical\"").unwrap(),
            Severity::Critical
        );
    }

    #[test]
    fn test_branch_type_serialisation() {
        assert_eq!(
            serde_json::to_string(&BranchType::Local).unwrap(),
            "\"local\""
        );
        assert_eq!(
            serde_json::to_string(&BranchType::Remote).unwrap(),
            "\"remote\""
        );
    }

    #[test]
    fn test_branch_type_deserialisation() {
        assert_eq!(
            serde_json::from_str::<BranchType>("\"local\"").unwrap(),
            BranchType::Local
        );
        assert_eq!(
            serde_json::from_str::<BranchType>("\"remote\"").unwrap(),
            BranchType::Remote
        );
    }
}
