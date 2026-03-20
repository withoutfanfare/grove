import { invoke } from '@tauri-apps/api/core';
import type {
  Repository,
  Worktree,
  WtError,
  DirtyDetails,
  CreateWorktreeResult,
  CreateWorktreeOptions,
  RemoveWorktreeResult,
  RemoveWorktreeOptions,
  PullResult,
  SyncResult,
  RecentWorktree,
  BranchesResult,
  HealthResult,
  PruneResult,
  PullAllResult,
  ResumableOperationSummary,
  CloneResult,
  RepairResult,
  UnlockResult,
  LogResult,
  ChangesResult,
  ConfigLayer,
  ConfigFileContents,
  ConfigKeyUpdate,
} from '../types';
import { isWtError } from '../types';

/**
 * Low-level wrapper for Tauri invoke calls to the wt backend.
 * Provides type-safe access to all wt CLI commands.
 */
export function useWt() {
  /**
   * Check if the wt CLI is available on the system
   */
  async function checkWtAvailable(): Promise<boolean> {
    try {
      return await invoke<boolean>('check_wt_available');
    } catch {
      return false;
    }
  }

  /**
   * Get the wt CLI version string
   */
  async function getWtVersion(): Promise<string | null> {
    try {
      return await invoke<string>('get_wt_version');
    } catch {
      return null;
    }
  }

  /**
   * List all repositories managed by wt
   */
  async function listRepositories(): Promise<Repository[]> {
    return await invoke<Repository[]>('list_repositories');
  }

  /**
   * List all worktrees for a given repository
   */
  async function listWorktrees(repoName: string): Promise<Worktree[]> {
    return await invoke<Worktree[]>('list_worktrees', { repoName });
  }

  /**
   * Get detailed status for worktrees in a repository
   */
  async function getWorktreeStatus(repoName: string): Promise<Worktree[]> {
    return await invoke<Worktree[]>('get_worktree_status', { repoName });
  }

  /**
   * Open a worktree path in the configured editor
   */
  async function openInEditor(
    path: string,
    editor?: string,
    customEditorPath?: string
  ): Promise<void> {
    await invoke('open_in_editor', {
      path,
      editor: editor ?? null,
      customEditorPath: customEditorPath ?? null,
    });
  }

  /**
   * Open a terminal at the worktree path
   */
  async function openInTerminal(path: string, terminal?: string): Promise<void> {
    await invoke('open_in_terminal', {
      path,
      terminal: terminal ?? null,
    });
  }

  /**
   * Open a path in the configured Git client application
   */
  async function openInGitClient(
    path: string,
    gitClient?: string,
    customGitClientPath?: string
  ): Promise<void> {
    await invoke('open_in_git_client', {
      path,
      gitClient: gitClient ?? null,
      customGitClientPath: customGitClientPath ?? null,
    });
  }

  /**
   * Open a URL in the default browser
   */
  async function openInBrowser(url: string): Promise<void> {
    await invoke('open_in_browser', { url });
  }

  /**
   * Open the worktree path in Finder
   */
  async function openInFinder(path: string): Promise<void> {
    await invoke('open_in_finder', { path });
  }

  /**
   * Create a new worktree
   */
  async function createWorktree(
    options: CreateWorktreeOptions
  ): Promise<CreateWorktreeResult> {
    return await invoke<CreateWorktreeResult>('create_worktree', {
      repo: options.repo,
      branch: options.branch,
      base: options.base ?? null,
      template: options.template ?? null,
      force: options.force ?? true, // Default to true for GUI usage
    });
  }

  /**
   * Remove a worktree
   */
  async function removeWorktree(
    options: RemoveWorktreeOptions
  ): Promise<RemoveWorktreeResult> {
    return await invoke<RemoveWorktreeResult>('remove_worktree', {
      repo: options.repo,
      branch: options.branch,
      deleteBranch: options.deleteBranch ?? false,
      dropDb: options.dropDb ?? false,
      skipBackup: options.skipBackup ?? false,
      force: options.force ?? false,
    });
  }

  /**
   * Pull changes for a worktree
   */
  async function pullWorktree(
    repo: string,
    branch: string
  ): Promise<PullResult> {
    return await invoke<PullResult>('pull_worktree', { repo, branch });
  }

  /**
   * Sync (rebase) a worktree onto its base branch
   */
  async function syncWorktree(
    repo: string,
    branch: string
  ): Promise<SyncResult> {
    return await invoke<SyncResult>('sync_worktree', { repo, branch });
  }

  /**
   * Get recently accessed worktrees
   */
  async function getRecentWorktrees(
    count?: number
  ): Promise<RecentWorktree[]> {
    return await invoke<RecentWorktree[]>('get_recent_worktrees', {
      count: count ?? null,
    });
  }

  // ============================================================================
  // Phase 3: Branches, Health, Prune, Pull-All
  // ============================================================================

  /**
   * List branches for a repository
   */
  async function listBranches(repoName: string): Promise<BranchesResult> {
    return await invoke<BranchesResult>('list_branches', { repoName });
  }

  /**
   * Get health report for a repository
   */
  async function getRepoHealth(repoName: string): Promise<HealthResult> {
    return await invoke<HealthResult>('get_repo_health', { repoName });
  }

  /**
   * Get recent commits for a worktree
   */
  async function getRecentCommits(
    repoName: string,
    branch: string,
    count?: number
  ): Promise<LogResult> {
    return await invoke<LogResult>('get_recent_commits', {
      repoName,
      branch,
      count: count ?? null,
    });
  }

  /**
   * Get uncommitted file changes for a worktree
   */
  async function getUncommittedFiles(
    repoName: string,
    branch: string
  ): Promise<ChangesResult> {
    return await invoke<ChangesResult>('get_uncommitted_files', {
      repoName,
      branch,
    });
  }

  /**
   * Prune stale worktree refs and merged branches
   */
  async function pruneRepo(repoName: string, force?: boolean): Promise<PruneResult> {
    return await invoke<PruneResult>('prune_repo', {
      repoName,
      force: force ?? false,
    });
  }

  /**
   * Pull all worktrees in a repository
   */
  async function pullAllWorktrees(repoName: string): Promise<PullAllResult> {
    return await invoke<PullAllResult>('pull_all_worktrees', { repoName });
  }

  /**
   * Pull selected worktrees in a repository (for retry functionality)
   */
  async function pullSelectedWorktrees(repoName: string, branches: string[]): Promise<PullAllResult> {
    return await invoke<PullAllResult>('pull_selected_worktrees', { repoName, branches });
  }

  /**
   * Cancel the current long-running operation
   */
  async function cancelOperation(): Promise<void> {
    await invoke<void>('cancel_operation');
  }

  // ============================================================================
  // Operation State Persistence
  // ============================================================================

  /**
   * Get all resumable (interrupted or paused) operations.
   * Returns a list sorted by most recently updated first.
   */
  async function getResumableOperations(): Promise<ResumableOperationSummary[]> {
    return await invoke<ResumableOperationSummary[]>('get_resumable_operations');
  }

  /**
   * Resume an interrupted operation.
   * Continues processing from where it left off.
   */
  async function resumeOperation(operationId: string): Promise<PullAllResult> {
    return await invoke<PullAllResult>('resume_operation', { operationId });
  }

  /**
   * Dismiss (delete) an operation state without resuming.
   * Use when the user doesn't want to resume an interrupted operation.
   */
  async function dismissOperation(operationId: string): Promise<void> {
    await invoke<void>('dismiss_operation', { operationId });
  }

  /**
   * Mark any running operations as interrupted.
   * Should be called on app startup to handle operations that were
   * in progress when the app crashed or was force-quit.
   * Returns the number of operations marked as interrupted.
   */
  async function markInterruptedOperations(): Promise<number> {
    return await invoke<number>('mark_interrupted_operations');
  }

  // ============================================================================
  // File System Watching
  // ============================================================================

  /**
   * Start watching a repository's worktrees for changes.
   * Emits `worktree_changed` events when changes are detected.
   */
  async function startWatchingRepo(repoName: string): Promise<void> {
    await invoke('start_watching', { repoName });
  }

  /**
   * Stop watching a repository.
   */
  async function stopWatchingRepo(repoName: string): Promise<void> {
    await invoke('stop_watching', { repoName });
  }

  /**
   * Check if a repository is currently being watched.
   */
  async function isWatchingRepo(repoName: string): Promise<boolean> {
    return await invoke<boolean>('is_watching', { repoName });
  }

  // ============================================================================
  // Phase 4: Repository Management
  // ============================================================================

  /**
   * Clone a git repository
   */
  async function cloneRepository(
    url: string,
    name?: string,
    defaultBranch?: string
  ): Promise<CloneResult> {
    return await invoke<CloneResult>('clone_repository', {
      url,
      name: name ?? null,
      defaultBranch: defaultBranch ?? null,
    });
  }

  /**
   * Repair a repository
   */
  async function repairRepository(repoName: string): Promise<RepairResult> {
    return await invoke<RepairResult>('repair_repository', { repoName });
  }

  /**
   * Unlock a repository (remove stale lock files)
   */
  async function unlockRepository(repoName: string): Promise<UnlockResult> {
    return await invoke<UnlockResult>('unlock_repository', { repoName });
  }

  /**
   * Open the wt config file in the default editor
   */
  async function openConfig(): Promise<void> {
    await invoke('open_config');
  }

  /**
   * Read a config file by layer
   */
  async function readConfigFile(layer: ConfigLayer, repoName?: string): Promise<ConfigFileContents> {
    return await invoke<ConfigFileContents>('read_config_file', { layer, repoName: repoName ?? null });
  }

  /**
   * Update specific config keys in a layer
   */
  async function updateConfigKeys(layer: ConfigLayer, updates: ConfigKeyUpdate[], repoName?: string): Promise<ConfigFileContents> {
    return await invoke<ConfigFileContents>('update_config_keys', { layer, updates, repoName: repoName ?? null });
  }

  /**
   * Generate a markdown health report for a repository
   */
  async function generateReport(repoName: string): Promise<string> {
    return await invoke<string>('generate_report', { repoName });
  }

  /**
   * Save a health report to the user's Desktop
   */
  async function saveReportToDesktop(repoName: string): Promise<string> {
    return await invoke<string>('save_report_to_desktop', { repoName });
  }

  /**
   * Derive a repository name from a Git URL
   */
  async function deriveRepoName(url: string): Promise<string | null> {
    return await invoke<string | null>('derive_repo_name', { url });
  }

  /**
   * Get detailed dirty state (staged, modified, untracked counts) for a worktree
   */
  async function getDirtyDetails(worktreePath: string): Promise<DirtyDetails> {
    return await invoke<DirtyDetails>('get_dirty_details', { worktreePath });
  }

  /**
   * Convert an unknown error to a WtError
   */
  function toWtError(error: unknown): WtError {
    if (isWtError(error)) {
      return error;
    }
    if (error instanceof Error) {
      return { code: 'UNKNOWN_ERROR', message: error.message };
    }
    if (typeof error === 'string') {
      return { code: 'UNKNOWN_ERROR', message: error };
    }
    return { code: 'UNKNOWN_ERROR', message: 'An unexpected error occurred' };
  }

  return {
    checkWtAvailable,
    getWtVersion,
    listRepositories,
    listWorktrees,
    getWorktreeStatus,
    openInEditor,
    openInGitClient,
    openInTerminal,
    openInBrowser,
    openInFinder,
    createWorktree,
    removeWorktree,
    pullWorktree,
    syncWorktree,
    getRecentWorktrees,
    // Phase 3: Branches, Health, Prune, Pull-All
    listBranches,
    getRepoHealth,
    getRecentCommits,
    getUncommittedFiles,
    pruneRepo,
    pullAllWorktrees,
    pullSelectedWorktrees,
    // Operation control
    cancelOperation,
    // Operation state persistence
    getResumableOperations,
    resumeOperation,
    dismissOperation,
    markInterruptedOperations,
    // File system watching
    startWatchingRepo,
    stopWatchingRepo,
    isWatchingRepo,
    // Phase 4: Repository management
    cloneRepository,
    repairRepository,
    unlockRepository,
    openConfig,
    readConfigFile,
    updateConfigKeys,
    generateReport,
    saveReportToDesktop,
    deriveRepoName,
    getDirtyDetails,
    toWtError,
  };
}
