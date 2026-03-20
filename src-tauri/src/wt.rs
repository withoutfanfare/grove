// grove CLI execution layer
//
// This module provides functions to execute grove CLI commands and parse their JSON output.
// It handles command spawning, output capture, and error handling.
//
// The grove CLI is bundled as a sidecar binary with the Tauri app. All execution goes through
// Tauri's shell plugin sidecar API, which provides the binary from the app bundle.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rayon::prelude::*;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use uuid::Uuid;

use crate::operation_state;
use crate::types::{
    BranchesResult, CloneResult, CreateWorktreeResult, HealthResult, OperationProgressEvent,
    OperationState, OperationStatus, PersistentOperationType, PruneResult, PruneSummary,
    PrunedBranch, PullAllResult, PullAllSummary, PullAllWorktree, PullResult, RecentWorktree,
    RemoveWorktreeResult, RepairResult, Repository, SyncResult, UnlockResult, Worktree, WtError,
    WtResult,
};

// ============================================================================
// CLI Error Response Parsing
// ============================================================================

/// Represents a structured CLI error response.
///
/// The grove CLI outputs JSON errors in this format when commands fail:
/// `{"success": false, "error": {"code": "ERROR_CODE", "message": "..."}}`
#[derive(Debug, Deserialize)]
struct CliErrorResponse {
    #[allow(dead_code)]
    success: bool,
    error: CliError,
}

/// Inner error object from CLI error responses.
#[derive(Debug, Deserialize)]
struct CliError {
    code: String,
    message: String,
}

// ============================================================================
// Constants (M4)
// ============================================================================

/// Default number of threads for parallel operations like pull-all.
///
/// Uses the system's available parallelism (CPU cores) capped at 8 to balance
/// performance against resource usage and git lock contention.
fn default_thread_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get().min(8))
        .unwrap_or(4)
}

/// Maximum allowed count for recent worktrees query.
///
/// Prevents excessive memory usage and ensures reasonable response times.
const MAX_RECENT_COUNT: u32 = 100;

/// Maximum output size in bytes for CLI commands (H5).
///
/// This limit prevents excessive memory consumption from unexpectedly large
/// CLI output. The limit is set at 10MB which should be more than sufficient
/// for any reasonable wt operation. Typical JSON outputs are a few KB at most.
///
/// If this limit is exceeded, the operation will fail with a clear error message
/// rather than potentially exhausting system memory.
const MAX_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10 MB

// ============================================================================
// H1: Robust JSON Parsing Helper
// ============================================================================

/// Robust JSON extraction from CLI output.
///
/// The wt CLI may output debug messages, progress indicators, or other text
/// before the actual JSON response. This helper finds and parses valid JSON
/// by:
/// 1. Finding the first `{` or `[` character (depending on expected type)
/// 2. Attempting to parse with serde_json
/// 3. If parse fails (due to trailing content), trying to find the matching
///    closing bracket
/// 4. Returning a clear error if no valid JSON is found
///
/// # Arguments
/// * `output` - The raw CLI output string
/// * `expect_array` - If true, look for `[` (array), otherwise `{` (object)
///
/// # Returns
/// The parsed JSON value of type T, or a WtError if parsing fails
fn extract_json<T: DeserializeOwned>(output: &str, expect_array: bool) -> WtResult<T> {
    let start_char = if expect_array { '[' } else { '{' };
    let end_char = if expect_array { ']' } else { '}' };

    // Find the first JSON boundary character
    let json_start = output.find(start_char).ok_or_else(|| {
        WtError::parse_error(format!(
            "No JSON {} found in output",
            if expect_array { "array" } else { "object" }
        ))
    })?;

    let json_portion = &output[json_start..];

    // First attempt: try parsing the entire remaining string
    if let Ok(parsed) = serde_json::from_str::<T>(json_portion) {
        return Ok(parsed);
    }

    // Second attempt: find the matching closing bracket by counting nesting
    // This handles cases where there's trailing non-JSON content
    let mut depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let mut end_pos = None;

    for (i, c) in json_portion.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        if c == '\\' && in_string {
            escape_next = true;
            continue;
        }

        if c == '"' {
            in_string = !in_string;
            continue;
        }

        if in_string {
            continue;
        }

        if c == start_char {
            depth += 1;
        } else if c == end_char {
            depth -= 1;
            if depth == 0 {
                end_pos = Some(i + 1);
                break;
            }
        }
    }

    if let Some(end) = end_pos {
        let json_str = &json_portion[..end];
        serde_json::from_str::<T>(json_str)
            .map_err(|e| WtError::parse_error(format!("Invalid JSON structure: {}", e)))
    } else {
        Err(WtError::parse_error(
            "Malformed JSON: no matching closing bracket found",
        ))
    }
}

/// Extract a JSON object from CLI output.
///
/// Convenience wrapper for `extract_json` when expecting an object `{...}`.
fn extract_json_object<T: DeserializeOwned>(output: &str) -> WtResult<T> {
    extract_json(output, false)
}

/// Extract a JSON array from CLI output.
///
/// Convenience wrapper for `extract_json` when expecting an array `[...]`.
fn extract_json_array<T: DeserializeOwned>(output: &str) -> WtResult<T> {
    extract_json(output, true)
}

// ============================================================================
// H6: Error Message Sanitisation
// ============================================================================

lazy_static::lazy_static! {
    // Regex patterns for error message sanitisation (compiled once)
    static ref RE_UNIX_PATH: regex::Regex =
        regex::Regex::new(r"/(Users|home)/[^/\s]+").unwrap();
    static ref RE_WIN_PATH: regex::Regex =
        regex::Regex::new(r"[A-Za-z]:\\Users\\[^\\\s]+").unwrap();
    static ref RE_ENV_VAR: regex::Regex =
        regex::Regex::new(r"\b[A-Z_][A-Z0-9_]*=[^\s]+").unwrap();
}

fn sanitise_error_message(message: &str) -> String {
    let mut sanitised = message.to_string();

    // Replace home directory paths with ~
    if let Ok(home) = std::env::var("HOME") {
        sanitised = sanitised.replace(&home, "~");
    }

    // Redact common absolute path patterns (Unix-style)
    sanitised = RE_UNIX_PATH.replace_all(&sanitised, "/<user>").to_string();

    // Redact Windows-style paths
    sanitised = RE_WIN_PATH.replace_all(&sanitised, "<drive>:\\<user>").to_string();

    // Remove potential environment variable leaks
    sanitised = RE_ENV_VAR.replace_all(&sanitised, "<env-redacted>").to_string();

    sanitised
}

// ============================================================================
// Per-Operation Cancellation System
// ============================================================================

// Per-operation cancellation tokens keyed by operation ID.
// This replaces the global cancellation flag to prevent race conditions
// when multiple operations run concurrently.
lazy_static::lazy_static! {
    static ref OPERATION_TOKENS: Mutex<HashMap<String, Arc<AtomicBool>>> = Mutex::new(HashMap::new());
    static ref ACTIVE_OPERATION_ID: Mutex<Option<String>> = Mutex::new(None);
    /// Tracks the last time a progress event was emitted (for rate limiting)
    static ref LAST_PROGRESS_EMIT: Mutex<std::time::Instant> = Mutex::new(std::time::Instant::now());
}

/// Cancellation token for a specific operation
#[derive(Clone)]
pub struct CancellationToken {
    id: String,
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    /// Create a new cancellation token and register it
    pub fn new() -> Self {
        let id = Uuid::new_v4().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));

        // Register the token
        if let Ok(mut tokens) = OPERATION_TOKENS.lock() {
            tokens.insert(id.clone(), Arc::clone(&cancelled));
        } else if let Err(e) = OPERATION_TOKENS.lock() {
            // Recover from poisoned mutex
            let mut tokens = e.into_inner();
            tokens.insert(id.clone(), Arc::clone(&cancelled));
        }

        // Set as active operation
        if let Ok(mut active) = ACTIVE_OPERATION_ID.lock() {
            *active = Some(id.clone());
        }

        Self { id, cancelled }
    }

    /// Check if this operation has been cancelled
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    /// Request cancellation of this specific operation
    #[allow(dead_code)]
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    /// Get the operation ID
    #[allow(dead_code)]
    pub fn id(&self) -> &str {
        &self.id
    }
}

impl Drop for CancellationToken {
    fn drop(&mut self) {
        // Clean up the token from the registry (recover from poisoned mutex)
        match OPERATION_TOKENS.lock() {
            Ok(mut tokens) => { tokens.remove(&self.id); }
            Err(e) => { e.into_inner().remove(&self.id); }
        }

        // Clear active operation if this was it
        match ACTIVE_OPERATION_ID.lock() {
            Ok(mut active) => {
                if active.as_ref() == Some(&self.id) {
                    *active = None;
                }
            }
            Err(e) => {
                let mut active = e.into_inner();
                if active.as_ref() == Some(&self.id) {
                    *active = None;
                }
            }
        }
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

/// Request cancellation of the currently active operation.
/// This is called from the frontend when user clicks cancel.
pub fn request_cancel() {
    let active_id = match ACTIVE_OPERATION_ID.lock() {
        Ok(active) => active.clone(),
        Err(e) => e.into_inner().clone(),
    };

    if let Some(id) = active_id {
        let tokens = match OPERATION_TOKENS.lock() {
            Ok(t) => t,
            Err(e) => e.into_inner(),
        };
        if let Some(token) = tokens.get(&id) {
            token.store(true, Ordering::SeqCst);
        }
    }
}

/// Request cancellation of a specific operation by ID.
#[allow(dead_code)]
pub fn request_cancel_by_id(operation_id: &str) {
    let tokens = match OPERATION_TOKENS.lock() {
        Ok(t) => t,
        Err(e) => e.into_inner(),
    };
    if let Some(token) = tokens.get(operation_id) {
        token.store(true, Ordering::SeqCst);
    }
}

/// Validate a repository name to prevent command injection.
///
/// Only allows alphanumeric characters, hyphens, underscores, and dots.
/// Prevents names starting with - or . to avoid flag injection.
fn validate_repo_name(name: &str) -> WtResult<()> {
    if name.is_empty() {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Repository name cannot be empty",
        ));
    }

    // Check for dangerous characters
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Repository name contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed.",
        ));
    }

    // Prevent flag injection
    if name.starts_with('-') {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Repository name cannot start with a hyphen",
        ));
    }

    // Prevent hidden directory traversal
    if name.starts_with('.') || name.contains("..") {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Repository name cannot start with a dot or contain '..'",
        ));
    }

    Ok(())
}

/// Execute a grove CLI command and return stdout.
///
/// Uses Tauri's sidecar API to execute the bundled grove binary.
///
/// # Memory Buffering Behaviour (H5)
///
/// This function buffers the entire command output in memory before returning.
/// For typical wt operations, output is small (a few KB of JSON). However, for
/// operations listing many worktrees or branches, output could grow larger.
///
/// Known limitations:
/// - Very large outputs (>10MB) may cause increased memory usage
/// - No streaming support - entire output must complete before processing
/// - Progress events use a separate mechanism (emit_progress) for real-time feedback
///
/// # Timeout Behaviour (M5)
///
/// Commands are wrapped in a 5-minute timeout via `tokio::time::timeout`.
/// This prevents indefinite hangs for long-running CLI operations.
/// Users can still cancel multi-item operations from the frontend, which
/// signals the operation token checked between parallel items.
///
/// For operations requiring real-time progress, use the `*_with_progress` variants
/// which emit events as work completes rather than buffering results.
/// Sidecar command timeout (5 minutes).
const SIDECAR_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

fn execute_wt(app: &tauri::AppHandle, args: &[&str]) -> WtResult<String> {
    log::debug!("Executing sidecar: grove {}", args.join(" "));

    // Get the sidecar command for the bundled grove binary
    let sidecar = app.shell().sidecar("grove").map_err(|e| {
        log::error!("Failed to initialise grove sidecar: {}", e);
        WtError::new(
            "SIDECAR_ERROR",
            format!("Failed to initialise grove sidecar: {}", e),
        )
    })?;

    // Execute with timeout to prevent indefinite hangs
    // Use a scoped thread to avoid "Cannot start a runtime from within a runtime"
    // panics when called from spawn_blocking (which retains tokio runtime context)
    let rt_handle = tauri::async_runtime::handle();
    let output = std::thread::scope(|s| {
        s.spawn(|| {
            rt_handle.block_on(async {
                tokio::time::timeout(SIDECAR_TIMEOUT, sidecar.args(args).output()).await
            })
        }).join().expect("sidecar thread panicked")
    })
    .map_err(|_| WtError::new("TIMEOUT", "Command timed out after 5 minutes"))?
    .map_err(|e| {
            let error_str = e.to_string();
            if error_str.contains("not found") || error_str.contains("No such file") {
                WtError::cli_not_found()
            } else {
                // H6: Sanitise error messages before returning to frontend
                let sanitised = sanitise_error_message(&format!("Failed to execute grove: {}", e));
                WtError::new("IO_ERROR", sanitised)
            }
        })?;

    // H5: Check output size before processing to prevent memory exhaustion
    let total_output_size = output.stdout.len() + output.stderr.len();
    if total_output_size > MAX_OUTPUT_SIZE {
        return Err(WtError::new(
            "OUTPUT_TOO_LARGE",
            format!(
                "CLI output exceeded maximum size limit of {} MB. This may indicate an issue with the grove command.",
                MAX_OUTPUT_SIZE / (1024 * 1024)
            ),
        ));
    }

    // Check exit status - sidecar uses code() method
    let success = output.status.code().map(|c| c == 0).unwrap_or(false);

    if !success {
        log::warn!("Sidecar command failed (exit code {:?})", output.status.code());

        // First, try to parse structured JSON error from stdout
        // The CLI outputs: {"success": false, "error": {"code": "...", "message": "..."}}
        let stdout_str = String::from_utf8_lossy(&output.stdout);
        if let Ok(cli_error) = extract_json_object::<CliErrorResponse>(&stdout_str) {
            // H6: Sanitise error messages before returning to frontend
            let sanitised = sanitise_error_message(&cli_error.error.message);
            log::warn!("CLI error [{}]: {}", cli_error.error.code, sanitised);
            return Err(WtError::new(&cli_error.error.code, sanitised));
        }

        // Fall back to stderr parsing if no structured JSON error in stdout
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Filter out progress messages (lines starting with arrow or containing "...")
        let error_lines: Vec<&str> = stderr
            .lines()
            .filter(|line| {
                !line.starts_with('→') && !line.starts_with("  →") && !line.contains("...")
            })
            .collect();

        let error_msg = if error_lines.is_empty() {
            stderr.to_string()
        } else {
            error_lines.join("\n")
        };

        // H6: Sanitise error messages before returning to frontend
        let sanitised = sanitise_error_message(error_msg.trim());
        return Err(WtError::command_failed(sanitised));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    if stdout_str.contains('\u{FFFD}') {
        log::warn!("CLI output contained invalid UTF-8 bytes (replaced with U+FFFD). \
            This may indicate corrupted git data or a non-UTF-8 locale.");
    }
    Ok(stdout_str.into_owned())
}

/// Execute a grove CLI command and return both stdout and stderr on success.
///
/// Unlike `execute_wt` which discards stderr on success, this variant returns
/// the (stdout, stderr) tuple so callers can parse additional information from
/// stderr (e.g. hook execution messages).
fn execute_wt_with_stderr(app: &tauri::AppHandle, args: &[&str]) -> WtResult<(String, String)> {
    let sidecar = app.shell().sidecar("grove").map_err(|e| {
        WtError::new(
            "SIDECAR_ERROR",
            format!("Failed to initialise grove sidecar: {}", e),
        )
    })?;

    let rt_handle = tauri::async_runtime::handle();
    let output = std::thread::scope(|s| {
        s.spawn(|| {
            rt_handle.block_on(async {
                tokio::time::timeout(SIDECAR_TIMEOUT, sidecar.args(args).output()).await
            })
        })
        .join()
        .expect("sidecar thread panicked")
    })
    .map_err(|_| WtError::new("TIMEOUT", "Command timed out after 5 minutes"))?
    .map_err(|e| {
        let error_str = e.to_string();
        if error_str.contains("not found") || error_str.contains("No such file") {
            WtError::cli_not_found()
        } else {
            let sanitised = sanitise_error_message(&format!("Failed to execute grove: {}", e));
            WtError::new("IO_ERROR", sanitised)
        }
    })?;

    let total_output_size = output.stdout.len() + output.stderr.len();
    if total_output_size > MAX_OUTPUT_SIZE {
        return Err(WtError::new(
            "OUTPUT_TOO_LARGE",
            format!(
                "CLI output exceeded maximum size limit of {} MB.",
                MAX_OUTPUT_SIZE / (1024 * 1024)
            ),
        ));
    }

    let success = output.status.code().map(|c| c == 0).unwrap_or(false);

    if !success {
        let stdout_str = String::from_utf8_lossy(&output.stdout);
        if let Ok(cli_error) = extract_json_object::<CliErrorResponse>(&stdout_str) {
            let sanitised = sanitise_error_message(&cli_error.error.message);
            return Err(WtError::new(&cli_error.error.code, sanitised));
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_lines: Vec<&str> = stderr
            .lines()
            .filter(|line| {
                !line.starts_with('\u{2192}')
                    && !line.starts_with("  \u{2192}")
                    && !line.contains("...")
            })
            .collect();

        let error_msg = if error_lines.is_empty() {
            stderr.to_string()
        } else {
            error_lines.join("\n")
        };

        let sanitised = sanitise_error_message(error_msg.trim());
        return Err(WtError::command_failed(sanitised));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr_str = String::from_utf8_lossy(&output.stderr).into_owned();
    Ok((stdout_str, stderr_str))
}

/// Strip ANSI escape codes from a string.
///
/// The grove CLI outputs coloured text via `info`, `ok`, `warn` functions.
/// This strips those codes so we can cleanly parse hook execution messages.
fn strip_ansi(input: &str) -> String {
    // Matches ANSI escape sequences: ESC[ ... m (SGR) and ESC[ ... other codes
    lazy_static::lazy_static! {
        static ref ANSI_RE: regex::Regex = regex::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    }
    ANSI_RE.replace_all(input, "").to_string()
}

/// Parse hook execution results from CLI output.
///
/// The grove CLI outputs recognisable patterns for hook execution via
/// `info()`, `ok()`, `warn()` shell functions (which write to stdout):
/// - `→ Running <hook-name> hook...` - single hook started
/// - `→ Running <hook-name>.d/<script>...` - .d hook script started
/// - `✔ Hook <name> completed` / `✔ <script> completed` - success (U+2714)
/// - `⚠ Hook <name> exited with non-zero status` - failure
///
/// Accepts combined output (stdout + stderr) since hook messages may appear on either stream.
fn parse_hook_executions(output: &str) -> Vec<crate::types::HookExecution> {
    let clean = strip_ansi(output);
    let mut hooks: Vec<crate::types::HookExecution> = Vec::new();
    // Track hooks that have been started so we can match completions
    let mut pending: Vec<String> = Vec::new();

    for line in clean.lines() {
        let trimmed = line.trim();

        // Match "→ Running <name> hook..." or "→ Running <name>..."
        if let Some(rest) = trimmed.strip_prefix('\u{2192}') {
            let rest = rest.trim();
            if let Some(rest) = rest.strip_prefix("Running ") {
                let name = rest
                    .trim_end_matches("...")
                    .trim_end_matches(" hook")
                    .trim()
                    .to_string();
                if !name.is_empty() {
                    pending.push(name);
                }
            }
        }
        // Match "✔ Hook <name> completed" or "✔ <name> completed" (U+2714 HEAVY CHECK MARK)
        // Also match "✓" (U+2713 CHECK MARK) for compatibility.
        // IMPORTANT: Only match lines ending with " completed" to avoid capturing
        // informational output from within hook scripts (e.g. "✔ 3177 modules transformed.")
        else if (trimmed.starts_with('\u{2714}') || trimmed.starts_with('\u{2713}'))
            && trimmed.ends_with(" completed")
        {
            let rest = trimmed
                .trim_start_matches('\u{2714}')
                .trim_start_matches('\u{2713}')
                .trim();
            let name = rest
                .strip_prefix("Hook ")
                .unwrap_or(rest)
                .trim_end_matches(" completed")
                .trim()
                .to_string();
            // Remove from pending and add as success
            if let Some(pos) = pending.iter().position(|p| p == &name || name.contains(p.as_str()) || p.contains(name.as_str())) {
                let matched_name = pending.remove(pos);
                hooks.push(crate::types::HookExecution {
                    name: matched_name,
                    status: "success".to_string(),
                });
            } else if !name.is_empty() {
                hooks.push(crate::types::HookExecution {
                    name,
                    status: "success".to_string(),
                });
            }
        }
        // Match "⚠ Hook <name> exited with non-zero status" or "⚠ <name> exited with non-zero status"
        // IMPORTANT: Only match lines containing "exited with non-zero status" to avoid
        // capturing warnings from within hook scripts (e.g. "⚠ SSL mismatch: ...")
        else if trimmed.starts_with('\u{26A0}')
            && trimmed.contains("exited with non-zero status")
        {
            let rest = trimmed.trim_start_matches('\u{26A0}').trim();
            let name = rest
                .strip_prefix("Hook ")
                .unwrap_or(rest)
                .split(" exited with")
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if let Some(pos) = pending.iter().position(|p| p == &name || name.contains(p.as_str()) || p.contains(name.as_str())) {
                let matched_name = pending.remove(pos);
                hooks.push(crate::types::HookExecution {
                    name: matched_name,
                    status: "failed".to_string(),
                });
            } else if !name.is_empty() {
                hooks.push(crate::types::HookExecution {
                    name,
                    status: "failed".to_string(),
                });
            }
        }
    }

    // Any remaining pending hooks that never got a completion line
    for name in pending {
        hooks.push(crate::types::HookExecution {
            name,
            status: "success".to_string(),
        });
    }

    hooks
}

/// Execute a grove CLI command that returns JSON, handling non-zero exit codes gracefully.
///
/// Some grove commands (like `pull` and `sync`) output valid JSON even when the operation
/// fails (e.g., dirty worktree, conflicts). This function tries to parse JSON from
/// stdout first, regardless of exit code, before falling back to error handling.
///
/// Uses Tauri's sidecar API to execute the bundled grove binary.
///
/// Use this for commands where the CLI provides structured error info in the JSON response.
fn execute_wt_json_result<T: serde::de::DeserializeOwned>(
    app: &tauri::AppHandle,
    args: &[&str],
) -> WtResult<T> {
    // Get the sidecar command for the bundled grove binary
    let sidecar = app.shell().sidecar("grove").map_err(|e| {
        WtError::new(
            "SIDECAR_ERROR",
            format!("Failed to initialise grove sidecar: {}", e),
        )
    })?;

    // Execute with timeout to prevent indefinite hangs
    // Use a scoped thread to avoid "Cannot start a runtime from within a runtime"
    // panics when called from spawn_blocking (which retains tokio runtime context)
    let rt_handle = tauri::async_runtime::handle();
    let output = std::thread::scope(|s| {
        s.spawn(|| {
            rt_handle.block_on(async {
                tokio::time::timeout(SIDECAR_TIMEOUT, sidecar.args(args).output()).await
            })
        }).join().expect("sidecar thread panicked")
    })
    .map_err(|_| WtError::new("TIMEOUT", "Command timed out after 5 minutes"))?
    .map_err(|e| {
            let error_str = e.to_string();
            if error_str.contains("not found") || error_str.contains("No such file") {
                WtError::cli_not_found()
            } else {
                let sanitised = sanitise_error_message(&format!("Failed to execute grove: {}", e));
                WtError::new("IO_ERROR", sanitised)
            }
        })?;

    let total_output_size = output.stdout.len() + output.stderr.len();
    if total_output_size > MAX_OUTPUT_SIZE {
        return Err(WtError::new(
            "OUTPUT_TOO_LARGE",
            format!(
                "CLI output exceeded maximum size limit of {} MB. This may indicate an issue with the grove command.",
                MAX_OUTPUT_SIZE / (1024 * 1024)
            ),
        ));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    if stdout_str.contains('\u{FFFD}') {
        eprintln!("[grove] Warning: CLI output contained invalid UTF-8 bytes (replaced with U+FFFD). \
            This may indicate corrupted git data or a non-UTF-8 locale.");
    }

    // Try to parse JSON from stdout first, even if exit code was non-zero.
    // Commands like `pull` and `sync` return JSON with success=false on failure.
    if let Ok(result) = extract_json::<T>(&stdout_str, false) {
        return Ok(result);
    }

    // Check exit status - sidecar uses code() method
    let success = output.status.code().map(|c| c == 0).unwrap_or(false);

    // No valid JSON of type T in stdout - check for structured error response
    if !success {
        // Try to parse as a structured CLI error response first
        if let Ok(cli_error) = extract_json_object::<CliErrorResponse>(&stdout_str) {
            let sanitised = sanitise_error_message(&cli_error.error.message);
            return Err(WtError::new(&cli_error.error.code, sanitised));
        }

        // Fall back to stderr parsing
        let stderr_str = String::from_utf8_lossy(&output.stderr);
        let error_lines: Vec<&str> = stderr_str
            .lines()
            .filter(|line| {
                !line.starts_with('→') && !line.starts_with("  →") && !line.contains("...")
            })
            .collect();

        let error_msg = if error_lines.is_empty() {
            stderr_str.to_string()
        } else {
            error_lines.join("\n")
        };

        let sanitised = sanitise_error_message(error_msg.trim());
        return Err(WtError::command_failed(sanitised));
    }

    // Exit was success but no JSON - parsing error
    Err(WtError::parse_error(
        "No valid JSON found in command output",
    ))
}

/// Get all repositories managed by wt
///
/// Executes `wt repos --json` and parses the output.
pub fn get_repositories(app: &tauri::AppHandle) -> WtResult<Vec<Repository>> {
    let output = execute_wt(app, &["repos", "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_array(&output)
}

/// Get worktrees for a specific repository
///
/// Executes `wt ls <repo> --json` and parses the output.
/// Validates repo_name to prevent command injection.
pub fn get_worktrees(app: &tauri::AppHandle, repo_name: &str) -> WtResult<Vec<Worktree>> {
    validate_repo_name(repo_name)?;
    let output = execute_wt(app, &["ls", repo_name, "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_array(&output)
}

/// Get status of worktrees in a repository
///
/// Note: This runs `grove ls <repo> --json` as status is provided in the ls output.
/// The grove status command doesn't currently support --json output.
pub fn get_worktree_status(app: &tauri::AppHandle, repo_name: &str) -> WtResult<Vec<Worktree>> {
    // Status information is included in ls --json output
    get_worktrees(app, repo_name)
}

/// Check if the grove CLI is available
///
/// Uses Tauri's sidecar API to check if the bundled grove binary is accessible.
pub fn is_wt_available(app: &tauri::AppHandle) -> bool {
    let sidecar = match app.shell().sidecar("grove") {
        Ok(s) => s,
        Err(_) => return false,
    };

    let rt_handle = tauri::async_runtime::handle();
    std::thread::scope(|s| {
        s.spawn(|| {
            rt_handle.block_on(async { sidecar.args(["--version"]).output().await })
        }).join().expect("sidecar thread panicked")
    })
        .map(|output| output.status.code().map(|c| c == 0).unwrap_or(false))
        .unwrap_or(false)
}

/// Get the wt CLI version
pub fn get_version(app: &tauri::AppHandle) -> WtResult<String> {
    let output = execute_wt(app, &["--version"])?;
    Ok(output.trim().to_string())
}

/// Validate a branch name to prevent command injection.
///
/// Similar to repo name validation but also allows forward slashes for
/// feature branches like `feature/my-feature`.
fn validate_branch_name(name: &str) -> WtResult<()> {
    if name.is_empty() {
        return Err(WtError::new("INVALID_INPUT", "Branch name cannot be empty"));
    }

    // Allow alphanumeric, hyphens, underscores, dots, and forward slashes
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '/')
    {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Branch name contains invalid characters",
        ));
    }

    // Prevent flag injection
    if name.starts_with('-') {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Branch name cannot start with a hyphen",
        ));
    }

    // Prevent hidden directory traversal
    if name.starts_with('.') || name.contains("..") {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Branch name cannot start with a dot or contain '..'",
        ));
    }

    Ok(())
}

/// Create a new worktree
///
/// Executes `wt add <repo> <branch> [base] --json` and parses the output.
pub fn create_worktree(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
    base: Option<&str>,
    template: Option<&str>,
    force: bool,
) -> WtResult<crate::types::CreateWorktreeResponse> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    if let Some(b) = base {
        validate_branch_name(b)?;
    }
    if let Some(t) = template {
        validate_repo_name(t)?; // Template names use same validation as repos
    }

    let mut args = vec!["add"];

    if force {
        args.push("-f");
    }

    args.push(repo_name);
    args.push(branch);

    if let Some(b) = base {
        args.push(b);
    }

    args.push("--json");

    if let Some(t) = template {
        args.push("--template");
        args.push(t);
    }

    let (stdout, stderr) = execute_wt_with_stderr(app, &args)?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    let result: CreateWorktreeResult = extract_json_object(&stdout)?;

    // Hook messages are written to stdout (via info/ok/warn shell functions),
    // but also check stderr for completeness
    let combined_output = format!("{}\n{}", stdout, stderr);
    let hooks = parse_hook_executions(&combined_output);

    Ok(crate::types::CreateWorktreeResponse { result, hooks })
}

/// Remove a worktree
///
/// Executes `wt rm <repo> <branch> --json` with various options.
/// Returns a RemoveWorktreeResponse including hook execution results.
pub fn remove_worktree(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
    delete_branch: bool,
    drop_db: bool,
    skip_backup: bool,
    force: bool,
) -> WtResult<crate::types::RemoveWorktreeResponse> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    let mut args = vec!["rm"];

    if force {
        args.push("-f");
    }
    if delete_branch {
        args.push("--delete-branch");
    }
    if drop_db {
        args.push("--drop-db");
    }
    if skip_backup {
        args.push("--no-backup");
    }

    args.push(repo_name);
    args.push(branch);
    args.push("--json");

    let (stdout, stderr) = execute_wt_with_stderr(app, &args)?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    let result: RemoveWorktreeResult = extract_json_object(&stdout)?;

    // Hook messages are written to stdout (via info/ok/warn shell functions),
    // but also check stderr for completeness
    let combined_output = format!("{}\n{}", stdout, stderr);
    let hooks = parse_hook_executions(&combined_output);

    Ok(crate::types::RemoveWorktreeResponse { result, hooks })
}

/// Pull changes for a worktree
///
/// Executes `wt pull <repo> <branch> --json` and parses the result.
/// Uses execute_wt_json_result to handle non-zero exit codes gracefully,
/// since `wt pull` returns valid JSON with success=false on failures like
/// dirty worktrees or merge conflicts.
pub fn pull_worktree(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
) -> WtResult<PullResult> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    execute_wt_json_result(app, &["pull", repo_name, branch, "--json"])
}

/// Sync (rebase) a worktree onto its base branch
///
/// Executes `wt sync <repo> <branch> --json` and parses the result.
/// Uses execute_wt_json_result to handle non-zero exit codes gracefully,
/// since `wt sync` returns valid JSON with success=false on failures like
/// dirty worktrees or rebase conflicts.
pub fn sync_worktree(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
) -> WtResult<SyncResult> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    execute_wt_json_result(app, &["sync", repo_name, branch, "--json"])
}

/// Get recently accessed worktrees
///
/// Executes `wt recent [count] --json` and parses the output.
///
/// # Arguments
/// * `count` - Optional limit on number of recent worktrees to return.
///   If provided, must be between 1 and MAX_RECENT_COUNT (100).
///   Values exceeding MAX_RECENT_COUNT will be rejected to prevent
///   excessive memory usage.
pub fn get_recent_worktrees(
    app: &tauri::AppHandle,
    count: Option<u32>,
) -> WtResult<Vec<RecentWorktree>> {
    // M3: Validate count parameter to prevent excessive memory usage
    if let Some(c) = count {
        if c == 0 {
            return Err(WtError::new("INVALID_INPUT", "Count must be at least 1"));
        }
        if c > MAX_RECENT_COUNT {
            return Err(WtError::new(
                "INVALID_INPUT",
                format!(
                    "Count exceeds maximum allowed value of {}. Please use a smaller value.",
                    MAX_RECENT_COUNT
                ),
            ));
        }
    }

    let count_str: String;
    let mut args = vec!["recent"];

    if let Some(c) = count {
        count_str = c.to_string();
        args.push(&count_str);
    }

    args.push("--json");

    let output = execute_wt(app, &args)?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_array(&output)
}

// ============================================================================
// Phase 3: Branches, Health, Prune, Pull-All
// ============================================================================

/// Get branches for a repository
///
/// Executes `wt branches <repo> --json` and parses the output.
pub fn get_branches(app: &tauri::AppHandle, repo_name: &str) -> WtResult<BranchesResult> {
    validate_repo_name(repo_name)?;
    let output = execute_wt(app, &["branches", repo_name, "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

/// Get health report for a repository
///
/// Executes `wt health <repo> --json` and parses the output.
pub fn get_health(app: &tauri::AppHandle, repo_name: &str) -> WtResult<HealthResult> {
    validate_repo_name(repo_name)?;
    let output = execute_wt(app, &["health", repo_name, "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

/// Prune stale worktrees and merged branches
///
/// Executes `wt prune <repo> --json` and parses the output.
/// Use force=true to delete merged branches.
///
/// Note: Prefer `prune_with_progress()` for UI operations that need progress feedback.
#[allow(dead_code)]
pub fn prune_repo(app: &tauri::AppHandle, repo_name: &str, force: bool) -> WtResult<PruneResult> {
    validate_repo_name(repo_name)?;

    let mut args = vec!["prune"];
    if force {
        args.push("-f");
    }
    args.push(repo_name);
    args.push("--json");

    let output = execute_wt(app, &args)?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

/// Pull all worktrees in a repository
///
/// Executes `wt pull-all <repo> --json` and parses the output.
///
/// Note: Prefer `pull_all_with_progress()` for UI operations that need progress feedback.
#[allow(dead_code)]
pub fn pull_all(app: &tauri::AppHandle, repo_name: &str) -> WtResult<PullAllResult> {
    validate_repo_name(repo_name)?;
    let output = execute_wt(app, &["pull-all", repo_name, "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

// ============================================================================
// Phase 4: Real-Time Progress Feedback
// ============================================================================

/// Emit a progress event to the frontend
///
/// Sends an `operation_progress` event via Tauri's event system.
/// Logs errors but does not fail the operation if emit fails.
/// Minimum interval between progress event emissions (rate limiting).
const PROGRESS_RATE_LIMIT: std::time::Duration = std::time::Duration::from_millis(100);

fn emit_progress(
    app: &tauri::AppHandle,
    operation: &str,
    current: u32,
    total: u32,
    item: &str,
    status: &str,
    details: Option<String>,
) {
    // Rate limit non-terminal status updates to max once per 100ms
    if status == "in_progress" || status == "pending" {
        if let Ok(mut last) = LAST_PROGRESS_EMIT.lock() {
            if last.elapsed() < PROGRESS_RATE_LIMIT {
                return;
            }
            *last = std::time::Instant::now();
        }
    }

    let event = OperationProgressEvent {
        operation: operation.to_string(),
        current,
        total,
        item: item.to_string(),
        status: status.to_string(),
        details,
    };
    if let Err(e) = app.emit("operation_progress", &event) {
        eprintln!("Failed to emit progress event: {}", e);
    }
}

/// Pull selected worktrees with progress events (parallel execution)
///
/// Pulls only the specified worktrees in parallel (up to 4 concurrent) and emits
/// progress events for each one. Supports cancellation via per-operation cancellation
/// tokens. Used for retry functionality where only failed items need to be re-pulled.
/// Returns aggregated results matching `PullAllResult` structure.
pub fn pull_selected_with_progress(
    repo_name: &str,
    branches: Vec<String>,
    app: &tauri::AppHandle,
) -> WtResult<PullAllResult> {
    validate_repo_name(repo_name)?;

    // Validate all branch names
    for branch in &branches {
        validate_branch_name(branch)?;
    }

    // Create a cancellation token for this specific operation
    let cancel_token = CancellationToken::new();

    let total = branches.len() as u32;

    if total == 0 {
        return Ok(PullAllResult {
            repo: repo_name.to_string(),
            worktrees: vec![],
            summary: PullAllSummary {
                total: 0,
                succeeded: 0,
                failed: 0,
                up_to_date: 0,
                cancelled: 0,
            },
        });
    }

    // Emit initial "pending" status for all selected branches
    for (i, branch) in branches.iter().enumerate() {
        emit_progress(
            app,
            "pull_all",
            (i + 1) as u32,
            total,
            branch,
            "pending",
            None,
        );
    }

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(default_thread_count())
        .build()
        .map_err(|e| {
            eprintln!("[wt] Failed to create thread pool: {}", e);
            WtError::new(
                "THREAD_POOL_ERROR",
                format!("Failed to create thread pool: {}", e),
            )
        })?;

    // Clone values for parallel closure
    let cancel_token_ref = cancel_token.clone();
    let repo_name_owned = repo_name.to_string();

    // Execute pulls in parallel
    let results: Vec<PullAllWorktree> = pool.install(|| {
        branches
            .par_iter()
            .enumerate()
            .map(|(i, branch)| {
                let current = (i + 1) as u32;

                // Check for cancellation before starting
                if cancel_token_ref.is_cancelled() {
                    emit_progress(
                        app,
                        "pull_all",
                        current,
                        total,
                        branch,
                        "skipped",
                        Some("cancelled".to_string()),
                    );
                    return PullAllWorktree {
                        branch: branch.clone(),
                        success: false,
                        already_up_to_date: false,
                        commits_pulled: 0,
                        message: "Operation cancelled".to_string(),
                    };
                }

                // Emit "in_progress" event
                emit_progress(app, "pull_all", current, total, branch, "in_progress", None);

                // Execute individual pull
                let result = pull_worktree(app, &repo_name_owned, branch);

                match result {
                    Ok(pull_result) => {
                        let details = if pull_result.already_up_to_date {
                            Some("up to date".to_string())
                        } else {
                            Some(format!("+{} commits", pull_result.commits_pulled))
                        };

                        emit_progress(app, "pull_all", current, total, branch, "success", details);

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: true,
                            already_up_to_date: pull_result.already_up_to_date,
                            commits_pulled: pull_result.commits_pulled,
                            message: pull_result.message,
                        }
                    }
                    Err(e) => {
                        emit_progress(
                            app,
                            "pull_all",
                            current,
                            total,
                            branch,
                            "failed",
                            Some(e.message.clone()),
                        );

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: false,
                            already_up_to_date: false,
                            commits_pulled: 0,
                            message: e.message,
                        }
                    }
                }
            })
            .collect()
    });

    // Calculate summary stats
    let succeeded = results.iter().filter(|r| r.success).count() as u32;
    let failed = results
        .iter()
        .filter(|r| !r.success && r.message != "Operation cancelled")
        .count() as u32;
    let up_to_date = results.iter().filter(|r| r.already_up_to_date).count() as u32;
    let cancelled = results
        .iter()
        .filter(|r| r.message == "Operation cancelled")
        .count() as u32;

    Ok(PullAllResult {
        repo: repo_name.to_string(),
        worktrees: results,
        summary: PullAllSummary {
            total,
            succeeded,
            failed,
            up_to_date,
            cancelled,
        },
    })
}

/// Pull all worktrees with progress events (parallel execution)
///
/// Pulls all worktrees in parallel (up to 4 concurrent) and emits progress events
/// for each one. Supports cancellation via per-operation cancellation tokens.
/// Persists operation state to disk for resume capability.
/// Returns aggregated results matching `PullAllResult` structure.
pub fn pull_all_with_progress(repo_name: &str, app: &tauri::AppHandle) -> WtResult<PullAllResult> {
    validate_repo_name(repo_name)?;

    // Create a cancellation token for this specific operation
    let cancel_token = CancellationToken::new();

    // Get list of worktrees to know total count
    let worktrees = get_worktrees(app, repo_name)?;
    let total = worktrees.len() as u32;

    if total == 0 {
        return Ok(PullAllResult {
            repo: repo_name.to_string(),
            worktrees: vec![],
            summary: PullAllSummary {
                total: 0,
                succeeded: 0,
                failed: 0,
                up_to_date: 0,
                cancelled: 0,
            },
        });
    }

    // Create operation state for persistence
    let branch_names: Vec<String> = worktrees.iter().map(|wt| wt.branch.clone()).collect();
    let op_state = OperationState::new(
        PersistentOperationType::PullAll,
        repo_name,
        branch_names,
    );

    // Save initial state
    if let Err(e) = operation_state::save_state(&op_state) {
        eprintln!("[wt] Warning: Failed to save initial operation state: {}", e);
    }

    // Emit initial "pending" status for all worktrees
    for (i, wt) in worktrees.iter().enumerate() {
        emit_progress(
            app,
            "pull_all",
            (i + 1) as u32,
            total,
            &wt.branch,
            "pending",
            None,
        );
    }

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(default_thread_count())
        .build()
        .map_err(|e| {
            // M19: Log error before returning for diagnosis
            eprintln!("[wt] Failed to create thread pool: {}", e);
            WtError::new(
                "THREAD_POOL_ERROR",
                format!("Failed to create thread pool: {}", e),
            )
        })?;

    // Clone the cancellation token for use in the parallel closure
    let cancel_token_ref = cancel_token.clone();

    // Use a mutex to safely update operation state from parallel threads
    let op_state_mutex = Arc::new(Mutex::new(op_state));
    let op_state_ref = Arc::clone(&op_state_mutex);

    // Execute pulls in parallel
    let results: Vec<PullAllWorktree> = pool.install(|| {
        worktrees
            .par_iter()
            .enumerate()
            .map(|(i, wt)| {
                let branch = &wt.branch;
                let current = (i + 1) as u32;

                // Check for cancellation before starting (using per-operation token)
                if cancel_token_ref.is_cancelled() {
                    emit_progress(
                        app,
                        "pull_all",
                        current,
                        total,
                        branch,
                        "skipped",
                        Some("cancelled".to_string()),
                    );

                    // H10: Minimise lock hold time — save outside lock
                    let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                        state.mark_item_skipped(branch, Some("Operation cancelled".to_string()));
                        Some(state.clone())
                    } else { None };
                    if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                    return PullAllWorktree {
                        branch: branch.clone(),
                        success: false,
                        already_up_to_date: false,
                        commits_pulled: 0,
                        message: "Operation cancelled".to_string(),
                    };
                }

                // Emit "in_progress" event before starting this pull
                emit_progress(app, "pull_all", current, total, branch, "in_progress", None);

                // Execute individual pull
                let result = pull_worktree(app, repo_name, branch);

                // L1: Removed unused _order tracking - completion order is not needed
                // as progress events provide real-time status updates

                match result {
                    Ok(pull_result) => {
                        let details = if pull_result.already_up_to_date {
                            Some("up to date".to_string())
                        } else {
                            Some(format!("+{} commits", pull_result.commits_pulled))
                        };

                        emit_progress(app, "pull_all", current, total, branch, "success", details.clone());

                        // H10: Minimise lock hold time — save outside lock
                        let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                            state.mark_item_success(branch, details);
                            Some(state.clone())
                        } else { None };
                        if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: true,
                            already_up_to_date: pull_result.already_up_to_date,
                            commits_pulled: pull_result.commits_pulled,
                            message: pull_result.message,
                        }
                    }
                    Err(e) => {
                        emit_progress(
                            app,
                            "pull_all",
                            current,
                            total,
                            branch,
                            "failed",
                            Some(e.message.clone()),
                        );

                        // H10: Minimise lock hold time — save outside lock
                        let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                            state.mark_item_failed(branch, e.message.clone());
                            Some(state.clone())
                        } else { None };
                        if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: false,
                            already_up_to_date: false,
                            commits_pulled: 0,
                            message: e.message,
                        }
                    }
                }
            })
            .collect()
    });

    // M2: Calculate summary stats with separate cancelled field for accurate reporting
    let succeeded = results.iter().filter(|r| r.success).count() as u32;
    let failed = results
        .iter()
        .filter(|r| !r.success && r.message != "Operation cancelled")
        .count() as u32;
    let up_to_date = results.iter().filter(|r| r.already_up_to_date).count() as u32;
    let cancelled = results
        .iter()
        .filter(|r| r.message == "Operation cancelled")
        .count() as u32;

    // Mark operation as completed and clean up state file
    if let Ok(mut state) = op_state_mutex.lock() {
        state.mark_completed();
        // Delete state file on successful completion
        let _ = operation_state::delete_state(&state.id);
    }

    // The cancel_token is automatically cleaned up when it goes out of scope (Drop impl)

    Ok(PullAllResult {
        repo: repo_name.to_string(),
        worktrees: results,
        summary: PullAllSummary {
            total,
            succeeded,
            failed, // M2: No longer includes cancelled count
            up_to_date,
            cancelled, // M2: Separate field for cancelled operations
        },
    })
}

// ============================================================================
// Operation Resume
// ============================================================================

/// Resume an interrupted pull-all operation.
///
/// Loads the operation state from disk and continues processing any
/// pending items. Emits progress events and updates the state file
/// after each item completes.
pub fn resume_pull_all_operation(
    operation_id: &str,
    app: &tauri::AppHandle,
) -> WtResult<PullAllResult> {
    // Load the operation state
    let mut op_state = operation_state::load_state(operation_id)?;

    // Verify this is a pull-all operation
    if op_state.operation_type != PersistentOperationType::PullAll {
        return Err(WtError::new(
            "INVALID_OPERATION",
            format!(
                "Cannot resume operation of type '{}' as pull-all",
                op_state.operation_type
            ),
        ));
    }

    // Verify it's resumable
    if !op_state.is_resumable() {
        return Err(WtError::new(
            "INVALID_OPERATION",
            format!(
                "Operation is not resumable (status: {})",
                op_state.status
            ),
        ));
    }

    let repo_name = op_state.repo_name.clone();
    validate_repo_name(&repo_name)?;

    // Create a cancellation token for this resumed operation
    let cancel_token = CancellationToken::new();

    // Get pending items to process
    let pending_branches = op_state.pending_item_names();
    let total = op_state.total_items;
    let pending_count = pending_branches.len() as u32;

    if pending_count == 0 {
        // Nothing to resume - mark as completed
        op_state.mark_completed();
        let _ = operation_state::delete_state(operation_id);

        return Ok(build_pull_all_result_from_state(&op_state));
    }

    // Mark operation as running again
    op_state.status = OperationStatus::Running;
    if let Err(e) = operation_state::save_state(&op_state) {
        eprintln!("[wt] Warning: Failed to save resumed operation state: {}", e);
    }

    // Emit progress events for all items (showing current state)
    for (i, item) in op_state.items.iter().enumerate() {
        let current = (i + 1) as u32;
        let status = match item.status {
            crate::types::ItemStatus::Pending => "pending",
            crate::types::ItemStatus::Success => "success",
            crate::types::ItemStatus::Failed => "failed",
            crate::types::ItemStatus::Skipped => "skipped",
        };
        emit_progress(
            app,
            "pull_all",
            current,
            total,
            &item.name,
            status,
            item.message.clone(),
        );
    }

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(default_thread_count())
        .build()
        .map_err(|e| {
            eprintln!("[wt] Failed to create thread pool: {}", e);
            WtError::new(
                "THREAD_POOL_ERROR",
                format!("Failed to create thread pool: {}", e),
            )
        })?;

    // Clone for parallel closure
    let cancel_token_ref = cancel_token.clone();
    let op_state_mutex = Arc::new(Mutex::new(op_state));
    let op_state_ref = Arc::clone(&op_state_mutex);

    // Execute pulls for pending items only
    let _new_results: Vec<PullAllWorktree> = pool.install(|| {
        pending_branches
            .par_iter()
            .map(|branch| {
                // Find the index of this branch for progress reporting
                let current = {
                    if let Ok(state) = op_state_ref.lock() {
                        state
                            .items
                            .iter()
                            .position(|i| &i.name == branch)
                            .map(|i| (i + 1) as u32)
                            .unwrap_or(1)
                    } else {
                        1
                    }
                };

                // Check for cancellation before starting
                if cancel_token_ref.is_cancelled() {
                    emit_progress(
                        app,
                        "pull_all",
                        current,
                        total,
                        branch,
                        "skipped",
                        Some("cancelled".to_string()),
                    );

                    let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                        state.mark_item_skipped(branch, Some("Operation cancelled".to_string()));
                        Some(state.clone())
                    } else { None };
                    if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                    return PullAllWorktree {
                        branch: branch.clone(),
                        success: false,
                        already_up_to_date: false,
                        commits_pulled: 0,
                        message: "Operation cancelled".to_string(),
                    };
                }

                emit_progress(app, "pull_all", current, total, branch, "in_progress", None);

                let result = pull_worktree(app, &repo_name, branch);

                match result {
                    Ok(pull_result) => {
                        let details = if pull_result.already_up_to_date {
                            Some("up to date".to_string())
                        } else {
                            Some(format!("+{} commits", pull_result.commits_pulled))
                        };

                        emit_progress(app, "pull_all", current, total, branch, "success", details.clone());

                        let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                            state.mark_item_success(branch, details);
                            Some(state.clone())
                        } else { None };
                        if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: true,
                            already_up_to_date: pull_result.already_up_to_date,
                            commits_pulled: pull_result.commits_pulled,
                            message: pull_result.message,
                        }
                    }
                    Err(e) => {
                        emit_progress(
                            app,
                            "pull_all",
                            current,
                            total,
                            branch,
                            "failed",
                            Some(e.message.clone()),
                        );

                        let state_snapshot = if let Ok(mut state) = op_state_ref.lock() {
                            state.mark_item_failed(branch, e.message.clone());
                            Some(state.clone())
                        } else { None };
                        if let Some(s) = state_snapshot { let _ = operation_state::save_state(&s); }

                        PullAllWorktree {
                            branch: branch.clone(),
                            success: false,
                            already_up_to_date: false,
                            commits_pulled: 0,
                            message: e.message,
                        }
                    }
                }
            })
            .collect()
    });

    // Build final result from operation state
    let final_state = op_state_mutex.lock().map_err(|_| {
        WtError::new("INTERNAL_ERROR", "Failed to acquire operation state lock")
    })?;

    // Mark as completed and clean up
    let mut state = final_state.clone();
    state.mark_completed();
    let _ = operation_state::delete_state(&state.id);

    Ok(build_pull_all_result_from_state(&state))
}

/// Build a PullAllResult from an OperationState.
///
/// Used when resuming operations to construct the result from the
/// accumulated state.
fn build_pull_all_result_from_state(state: &OperationState) -> PullAllResult {
    let worktrees: Vec<PullAllWorktree> = state
        .items
        .iter()
        .map(|item| {
            let success = item.status == crate::types::ItemStatus::Success;
            let already_up_to_date = item
                .message
                .as_ref()
                .map(|m| m.contains("up to date"))
                .unwrap_or(false);
            let commits_pulled = item
                .message
                .as_ref()
                .and_then(|m| {
                    // Parse "+N commits" from message
                    if m.starts_with('+') {
                        m.split_whitespace()
                            .next()
                            .and_then(|s| s.trim_start_matches('+').parse::<u32>().ok())
                    } else {
                        None
                    }
                })
                .unwrap_or(0);

            PullAllWorktree {
                branch: item.name.clone(),
                success,
                already_up_to_date,
                commits_pulled,
                message: item.message.clone().unwrap_or_default(),
            }
        })
        .collect();

    let succeeded = worktrees.iter().filter(|r| r.success).count() as u32;
    let failed = worktrees
        .iter()
        .filter(|r| !r.success && r.message != "Operation cancelled")
        .count() as u32;
    let up_to_date = worktrees.iter().filter(|r| r.already_up_to_date).count() as u32;
    let cancelled = worktrees
        .iter()
        .filter(|r| r.message == "Operation cancelled")
        .count() as u32;

    PullAllResult {
        repo: state.repo_name.clone(),
        worktrees,
        summary: PullAllSummary {
            total: state.total_items,
            succeeded,
            failed,
            up_to_date,
            cancelled,
        },
    }
}

/// Prune repository with progress events
///
/// First prunes stale refs, then iterates through merged branches
/// and emits progress events for each one. Supports cancellation via
/// per-operation cancellation tokens.
pub fn prune_with_progress(
    repo_name: &str,
    force: bool,
    app: &tauri::AppHandle,
) -> WtResult<PruneResult> {
    validate_repo_name(repo_name)?;

    // H2: Create a cancellation token for this operation
    let cancel_token = CancellationToken::new();

    // First, do a dry-run to get the list of branches that will be affected
    // We parse the --json output to get the expected branches
    let dry_run_args = vec!["prune", repo_name, "--json"];
    let dry_run_output = execute_wt(app, &dry_run_args);

    // H1: Parse the dry run using robust JSON extraction
    let preview: Option<PruneResult> = match dry_run_output {
        Ok(output) => extract_json_object::<PruneResult>(&output).ok(),
        Err(_) => None,
    };

    let merged_branches = preview
        .as_ref()
        .map(|p| p.merged_branches.clone())
        .unwrap_or_default();
    let stale_refs_pruned = preview.as_ref().map(|p| p.stale_refs_pruned).unwrap_or(0);

    let total = merged_branches.len() as u32;
    let mut processed_branches: Vec<PrunedBranch> = Vec::new();

    if total == 0 {
        // No merged branches to process, just return the result
        return Ok(PruneResult {
            repo: repo_name.to_string(),
            stale_refs_pruned,
            merged_branches: vec![],
            summary: PruneSummary {
                branches_found: 0,
                branches_deleted: 0,
            },
        });
    }

    // If force is true, we need to actually delete the branches
    if force {
        // H2: Check for cancellation before starting the force operation
        if cancel_token.is_cancelled() {
            // Emit cancelled status for all branches
            for (i, branch) in merged_branches.iter().enumerate() {
                let current = (i + 1) as u32;
                emit_progress(
                    app,
                    "prune",
                    current,
                    total,
                    &branch.name,
                    "cancelled",
                    Some("operation cancelled".to_string()),
                );
            }
            return Ok(PruneResult {
                repo: repo_name.to_string(),
                stale_refs_pruned,
                merged_branches: merged_branches
                    .into_iter()
                    .map(|b| PrunedBranch {
                        name: b.name,
                        deleted: false,
                        reason: "cancelled".to_string(),
                    })
                    .collect(),
                summary: PruneSummary {
                    branches_found: total,
                    branches_deleted: 0,
                },
            });
        }

        // Execute the actual prune with force flag
        let mut args = vec!["prune", "-f"];
        args.push(repo_name);
        args.push("--json");

        // Emit progress for each expected branch
        for (i, branch) in merged_branches.iter().enumerate() {
            // H2: Check for cancellation at each iteration
            if cancel_token.is_cancelled() {
                // Emit cancelled status for remaining branches
                for (j, remaining_branch) in merged_branches.iter().enumerate().skip(i) {
                    let current = (j + 1) as u32;
                    emit_progress(
                        app,
                        "prune",
                        current,
                        total,
                        &remaining_branch.name,
                        "cancelled",
                        Some("operation cancelled".to_string()),
                    );
                }
                // Count deleted branches before moving
                let branches_deleted =
                    processed_branches.iter().filter(|b| b.deleted).count() as u32;
                // Return partial results
                return Ok(PruneResult {
                    repo: repo_name.to_string(),
                    stale_refs_pruned,
                    merged_branches: processed_branches,
                    summary: PruneSummary {
                        branches_found: total,
                        branches_deleted,
                    },
                });
            }

            let current = (i + 1) as u32;
            emit_progress(
                app,
                "prune",
                current,
                total,
                &branch.name,
                "in_progress",
                Some("deleting merged branch".to_string()),
            );
        }

        let output = execute_wt(app, &args)?;

        // H1: Parse the actual result using robust JSON extraction
        let result: PruneResult = extract_json_object(&output)?;

        // Emit completion events for each branch
        for (i, branch) in result.merged_branches.iter().enumerate() {
            let current = (i + 1) as u32;
            let status = if branch.deleted { "success" } else { "skipped" };
            let details = if branch.deleted {
                Some("deleted".to_string())
            } else {
                Some(branch.reason.clone())
            };
            emit_progress(app, "prune", current, total, &branch.name, status, details);
            processed_branches.push(branch.clone());
        }

        Ok(result)
    } else {
        // Dry run mode - just report what would be deleted
        for (i, branch) in merged_branches.iter().enumerate() {
            // H2: Check for cancellation at each iteration in dry-run mode
            if cancel_token.is_cancelled() {
                // Emit cancelled status for remaining branches
                for (j, remaining_branch) in merged_branches.iter().enumerate().skip(i) {
                    let current = (j + 1) as u32;
                    emit_progress(
                        app,
                        "prune",
                        current,
                        total,
                        &remaining_branch.name,
                        "cancelled",
                        Some("operation cancelled".to_string()),
                    );
                }
                // Return partial results
                return Ok(PruneResult {
                    repo: repo_name.to_string(),
                    stale_refs_pruned,
                    merged_branches: processed_branches,
                    summary: PruneSummary {
                        branches_found: total,
                        branches_deleted: 0,
                    },
                });
            }

            let current = (i + 1) as u32;
            emit_progress(
                app,
                "prune",
                current,
                total,
                &branch.name,
                "pending",
                Some(format!("would delete: {}", branch.reason)),
            );
            processed_branches.push(branch.clone());
        }

        Ok(PruneResult {
            repo: repo_name.to_string(),
            stale_refs_pruned,
            merged_branches: processed_branches,
            summary: PruneSummary {
                branches_found: total,
                branches_deleted: 0,
            },
        })
    }
}

// ============================================================================
// Phase 3: Details Panel - Commits and File Changes
// ============================================================================

/// Get recent commits for a worktree
///
/// Executes `wt log <repo> <branch> --json -n <count>` and parses the output.
/// Returns the most recent commits for the specified worktree.
pub fn get_recent_commits(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
    count: Option<u32>,
) -> WtResult<crate::types::LogResult> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    let count_str = count.unwrap_or(5).to_string();
    let output = execute_wt(app, &["log", repo_name, branch, "--json", "-n", &count_str])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

/// Get uncommitted file changes for a worktree
///
/// Executes `wt changes <repo> <branch> --json` and parses the output.
/// Returns a list of files with their change status (M, A, D, ?, etc.).
pub fn get_uncommitted_files(
    app: &tauri::AppHandle,
    repo_name: &str,
    branch: &str,
) -> WtResult<crate::types::ChangesResult> {
    validate_repo_name(repo_name)?;
    validate_branch_name(branch)?;

    let output = execute_wt(app, &["changes", repo_name, branch, "--json"])?;

    // H1: Use robust JSON extraction to handle debug output mixed with JSON
    extract_json_object(&output)
}

// ============================================================================
// Configuration
// ============================================================================

/// Get CLI configuration
///
/// Executes `wt config --json` and parses the output.
pub fn get_config(app: &tauri::AppHandle) -> WtResult<crate::types::Config> {
    let output = execute_wt(app, &["config", "--json"])?;

    #[derive(Deserialize)]
    struct ConfigResponse {
        #[allow(dead_code)]
        success: bool,
        data: ConfigData,
    }

    #[derive(Deserialize)]
    struct ConfigData {
        default_base_branch: Option<String>,
        protected_branches: Vec<String>,
        config_dir: Option<String>,
        hooks_dir: Option<String>,
        #[serde(alias = "repos_dir")]
        herd_root: Option<String>,
        hooks_enabled: bool,
        database: Option<ConfigDatabase>,
        #[serde(default)]
        url_subdomain: Option<String>,
    }

    #[derive(Deserialize)]
    struct ConfigDatabase {
        enabled: bool,
        host: Option<String>,
        user: Option<String>,
    }

    let response: ConfigResponse = extract_json_object(&output)?;

    Ok(crate::types::Config {
        default_base_branch: response.data.default_base_branch,
        protected_branches: response.data.protected_branches,
        config_dir: response.data.config_dir,
        hooks_dir: response.data.hooks_dir,
        herd_root: response.data.herd_root,
        hooks_enabled: response.data.hooks_enabled,
        database: response.data.database.map(|db| crate::types::ConfigDatabase {
            enabled: db.enabled,
            host: db.host,
            user: db.user,
        }),
        url_subdomain: response.data.url_subdomain,
    })
}

// ============================================================================
// Phase 4: Repository Management
// ============================================================================

/// Validate a Git URL for cloning.
///
/// Accepts both HTTPS and SSH Git URLs:
/// - HTTPS: https://github.com/user/repo.git
/// - SSH: git@github.com:user/repo.git
fn validate_git_url(url: &str) -> WtResult<()> {
    if url.is_empty() {
        return Err(WtError::new("INVALID_INPUT", "Git URL cannot be empty"));
    }

    // Check for null bytes and dangerous characters
    if url.contains('\0') || url.contains('\n') || url.contains('\r') {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Git URL contains invalid characters",
        ));
    }

    // Check for shell metacharacters that could be used for injection
    let dangerous_chars = [';', '&', '|', '$', '`', '(', ')', '{', '}', '<', '>'];
    if url.chars().any(|c| dangerous_chars.contains(&c)) {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Git URL contains invalid characters",
        ));
    }

    // Validate URL format (HTTPS or SSH)
    let is_https = url.starts_with("https://") || url.starts_with("http://");
    let is_ssh = url.starts_with("git@") && url.contains(':');

    if !is_https && !is_ssh {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Git URL must be HTTPS (https://...) or SSH (git@host:...) format",
        ));
    }

    Ok(())
}

/// Derive repository name from a Git URL.
///
/// Extracts the repo name from the URL path:
/// - https://github.com/user/repo.git -> repo
/// - git@github.com:user/repo.git -> repo
pub fn derive_repo_name_from_url(url: &str) -> Option<String> {
    // Try to extract repo name from the end of the URL
    let name = url
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .rsplit(['/', ':'])
        .next()?;

    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Clone a git repository
///
/// Executes `wt clone <url> [name] --json` and returns the result.
/// This operation can take a while for large repositories.
pub fn clone_repository(
    app: &tauri::AppHandle,
    url: &str,
    name: Option<&str>,
    default_branch: Option<&str>,
) -> WtResult<CloneResult> {
    validate_git_url(url)?;

    if let Some(n) = name {
        validate_repo_name(n)?;
    }

    if let Some(b) = default_branch {
        validate_branch_name(b)?;
    }

    let mut args = vec!["clone", url];

    if let Some(n) = name {
        args.push(n);
    }

    if let Some(b) = default_branch {
        args.push("--branch");
        args.push(b);
    }

    args.push("--json");

    // Clone can take a long time - use execute_wt_json_result for graceful error handling
    execute_wt_json_result(app, &args)
}

/// Repair a repository
///
/// Executes `wt repair <repo> --json` and returns the result.
/// Fixes common repository issues like stale worktree references.
pub fn repair_repository(app: &tauri::AppHandle, repo_name: &str) -> WtResult<RepairResult> {
    validate_repo_name(repo_name)?;

    let output = execute_wt(app, &["repair", repo_name, "--json"])?;

    extract_json_object(&output)
}

/// Unlock a repository (remove stale lock files)
///
/// Executes `wt unlock <repo> --json` and returns the result.
/// Removes git lock files that may have been left behind after crashes.
pub fn unlock_repository(app: &tauri::AppHandle, repo_name: &str) -> WtResult<UnlockResult> {
    validate_repo_name(repo_name)?;

    let output = execute_wt(app, &["unlock", repo_name, "--json"])?;

    extract_json_object(&output)
}

/// Get the path to the grove config file
///
/// Returns the path to ~/.groverc (the CLI's config file location)
/// Also checks HERD_ROOT/.groveconfig as a fallback
pub fn get_config_path() -> WtResult<String> {
    // Get home directory
    let home = std::env::var("HOME").map_err(|_| {
        WtError::new(
            "CONFIG_NOT_FOUND",
            "Could not determine home directory",
        )
    })?;

    // Primary config location: ~/.groverc
    let config_path = format!("{}/.groverc", home);
    if std::path::Path::new(&config_path).exists() {
        return Ok(config_path);
    }

    // Fallback: check HERD_ROOT/.groveconfig
    if let Ok(herd_root) = std::env::var("HERD_ROOT") {
        let herd_config = format!("{}/.groveconfig", herd_root);
        if std::path::Path::new(&herd_config).exists() {
            return Ok(herd_config);
        }
    }

    // If neither exists, return the primary path (will be created)
    // This allows the "open config" action to create a new file
    Ok(config_path)
}

/// Generate a markdown health report for a repository
///
/// Fetches health data and formats it as markdown.
pub fn generate_health_report(app: &tauri::AppHandle, repo_name: &str) -> WtResult<String> {
    validate_repo_name(repo_name)?;

    // Get health data
    let health = get_health(app, repo_name)?;

    // Get current timestamp
    let now = chrono::Local::now();
    let timestamp = now.format("%Y-%m-%d %H:%M").to_string();

    // Build markdown report
    let mut report = String::new();

    // Header
    report.push_str(&format!("# Repository Health Report: {}\n", repo_name));
    report.push_str(&format!("Generated: {}\n\n", timestamp));

    // Summary
    report.push_str("## Summary\n");
    report.push_str(&format!(
        "- **Overall Grade**: {} ({}%)\n",
        health.overall_grade, health.overall_score
    ));
    report.push_str(&format!("- **Total Worktrees**: {}\n", health.worktree_count));
    report.push_str(&format!(
        "- **Healthy**: {} ({:.0}%)\n",
        health.summary.healthy,
        if health.worktree_count > 0 {
            (health.summary.healthy as f64 / health.worktree_count as f64) * 100.0
        } else {
            0.0
        }
    ));
    report.push_str(&format!(
        "- **Warning**: {} ({:.0}%)\n",
        health.summary.warning,
        if health.worktree_count > 0 {
            (health.summary.warning as f64 / health.worktree_count as f64) * 100.0
        } else {
            0.0
        }
    ));
    report.push_str(&format!(
        "- **Critical**: {} ({:.0}%)\n\n",
        health.summary.critical,
        if health.worktree_count > 0 {
            (health.summary.critical as f64 / health.worktree_count as f64) * 100.0
        } else {
            0.0
        }
    ));

    // Worktrees table
    report.push_str("## Worktrees\n\n");
    report.push_str("| Branch | Grade | Score | Issues |\n");
    report.push_str("|--------|-------|-------|--------|\n");

    for wt in &health.worktrees {
        let issues_str = if wt.issues.is_empty() {
            "-".to_string()
        } else {
            wt.issues.join("; ")
        };
        report.push_str(&format!(
            "| {} | {} | {} | {} |\n",
            wt.branch, wt.grade, wt.score, issues_str
        ));
    }

    // Issues section (if any)
    if !health.issues.is_empty() {
        report.push_str("\n## Issues\n\n");
        for issue in &health.issues {
            let severity_icon = if issue.severity == crate::types::Severity::Critical {
                "🔴"
            } else {
                "🟡"
            };
            report.push_str(&format!(
                "- {} **{}**: {} ({})\n",
                severity_icon, issue.severity, issue.message, issue.worktree
            ));
        }
    }

    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_wt_available() {
        // This will pass if wt is installed, fail if not
        // Just ensure it doesn't panic
        // Requires AppHandle - tested via integration tests
    }

    #[test]
    fn test_parse_repos_json() {
        let json = r#"[{"name": "test", "worktrees": 3}]"#;
        let repos: Vec<Repository> = serde_json::from_str(json).unwrap();
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].name, "test");
    }

    #[test]
    fn test_validate_repo_name_valid() {
        assert!(validate_repo_name("my-repo").is_ok());
        assert!(validate_repo_name("my_repo").is_ok());
        assert!(validate_repo_name("MyRepo123").is_ok());
        assert!(validate_repo_name("repo.name").is_ok());
    }

    #[test]
    fn test_validate_repo_name_empty() {
        assert!(validate_repo_name("").is_err());
    }

    #[test]
    fn test_validate_repo_name_injection_attempts() {
        // Command injection attempts
        assert!(validate_repo_name("; rm -rf /").is_err());
        assert!(validate_repo_name("repo; echo pwned").is_err());
        assert!(validate_repo_name("repo && cat /etc/passwd").is_err());
        assert!(validate_repo_name("$(whoami)").is_err());
        assert!(validate_repo_name("`id`").is_err());
    }

    #[test]
    fn test_validate_repo_name_flag_injection() {
        // Flag injection attempts
        assert!(validate_repo_name("-rf").is_err());
        assert!(validate_repo_name("--help").is_err());
        assert!(validate_repo_name("-").is_err());
    }

    #[test]
    fn test_validate_repo_name_path_traversal() {
        // Path traversal attempts
        assert!(validate_repo_name("..").is_err());
        assert!(validate_repo_name("../etc").is_err());
        assert!(validate_repo_name(".hidden").is_err());
        assert!(validate_repo_name("foo/../bar").is_err());
    }

    #[test]
    fn test_validate_branch_name_valid() {
        assert!(validate_branch_name("main").is_ok());
        assert!(validate_branch_name("feature/my-feature").is_ok());
        assert!(validate_branch_name("bugfix/issue-123").is_ok());
        assert!(validate_branch_name("release/v1.0.0").is_ok());
        assert!(validate_branch_name("feature/nested/branch").is_ok());
    }

    #[test]
    fn test_validate_branch_name_empty() {
        assert!(validate_branch_name("").is_err());
    }

    #[test]
    fn test_validate_branch_name_flag_injection() {
        assert!(validate_branch_name("-rf").is_err());
        assert!(validate_branch_name("--delete").is_err());
    }

    #[test]
    fn test_validate_branch_name_path_traversal() {
        assert!(validate_branch_name("..").is_err());
        assert!(validate_branch_name(".hidden").is_err());
        assert!(validate_branch_name("feature/../main").is_err());
    }

    // H1: Tests for robust JSON extraction
    #[test]
    fn test_extract_json_object_clean() {
        let output = r#"{"name": "test", "value": 123}"#;
        let result: serde_json::Value = extract_json_object(output).unwrap();
        assert_eq!(result["name"], "test");
        assert_eq!(result["value"], 123);
    }

    #[test]
    fn test_extract_json_object_with_debug_prefix() {
        let output =
            "Debug: loading config...\n→ Processing...\n{\"name\": \"test\", \"value\": 123}";
        let result: serde_json::Value = extract_json_object(output).unwrap();
        assert_eq!(result["name"], "test");
    }

    #[test]
    fn test_extract_json_object_with_trailing_content() {
        let output = r#"{"name": "test", "value": 123}
Some trailing text that isn't JSON"#;
        let result: serde_json::Value = extract_json_object(output).unwrap();
        assert_eq!(result["name"], "test");
    }

    #[test]
    fn test_extract_json_array_clean() {
        let output = r#"[{"name": "a"}, {"name": "b"}]"#;
        let result: Vec<serde_json::Value> = extract_json_array(output).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_extract_json_array_with_prefix() {
        let output = "Loading repositories...\n[{\"name\": \"test\", \"worktrees\": 3}]";
        let result: Vec<Repository> = extract_json_array(output).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "test");
    }

    #[test]
    fn test_extract_json_no_json_found() {
        let output = "No JSON here, just plain text";
        let result: Result<serde_json::Value, _> = extract_json_object(output);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("No JSON"));
    }

    #[test]
    fn test_extract_json_handles_nested_braces() {
        let output = r#"{"outer": {"inner": {"deep": "value"}}}"#;
        let result: serde_json::Value = extract_json_object(output).unwrap();
        assert_eq!(result["outer"]["inner"]["deep"], "value");
    }

    #[test]
    fn test_extract_json_handles_escaped_quotes() {
        let output = r#"{"message": "He said \"hello\" there"}"#;
        let result: serde_json::Value = extract_json_object(output).unwrap();
        assert_eq!(result["message"], "He said \"hello\" there");
    }

    // H6: Tests for error message sanitisation
    #[test]
    fn test_sanitise_error_message_home_path() {
        std::env::set_var("HOME", "/Users/testuser");
        let msg = "Error at /Users/testuser/projects/file.rs";
        let sanitised = sanitise_error_message(msg);
        assert!(sanitised.contains("~"));
        assert!(!sanitised.contains("/Users/testuser"));
    }

    #[test]
    fn test_sanitise_error_message_user_path() {
        let msg = "File not found: /Users/someuser/secret/path";
        let sanitised = sanitise_error_message(msg);
        assert!(sanitised.contains("/<user>") || sanitised.contains("~"));
        assert!(!sanitised.contains("someuser"));
    }

    #[test]
    fn test_sanitise_error_message_env_vars() {
        let msg = "Connection failed: DB_PASSWORD=secretvalue123 was invalid";
        let sanitised = sanitise_error_message(msg);
        assert!(sanitised.contains("<env-redacted>"));
        assert!(!sanitised.contains("secretvalue123"));
    }

    #[test]
    fn test_sanitise_error_message_preserves_useful_info() {
        let msg = "Error: branch 'feature/login' not found";
        let sanitised = sanitise_error_message(msg);
        assert_eq!(msg, sanitised); // Should be unchanged
    }

    // Phase 4: Git URL validation tests
    #[test]
    fn test_validate_git_url_https() {
        assert!(validate_git_url("https://github.com/user/repo.git").is_ok());
        assert!(validate_git_url("https://github.com/user/repo").is_ok());
        assert!(validate_git_url("https://gitlab.com/group/subgroup/repo.git").is_ok());
        assert!(validate_git_url("http://example.com/repo.git").is_ok());
    }

    #[test]
    fn test_validate_git_url_ssh() {
        assert!(validate_git_url("git@github.com:user/repo.git").is_ok());
        assert!(validate_git_url("git@gitlab.com:group/subgroup/repo.git").is_ok());
        assert!(validate_git_url("git@bitbucket.org:team/repo").is_ok());
    }

    #[test]
    fn test_validate_git_url_invalid() {
        assert!(validate_git_url("").is_err());
        assert!(validate_git_url("not-a-url").is_err());
        assert!(validate_git_url("ftp://example.com/repo").is_err());
        assert!(validate_git_url("/local/path/repo").is_err());
    }

    #[test]
    fn test_validate_git_url_injection() {
        assert!(validate_git_url("https://example.com/repo; rm -rf /").is_err());
        assert!(validate_git_url("git@github.com:user/repo$(whoami)").is_err());
        assert!(validate_git_url("https://example.com/repo`id`").is_err());
    }

    #[test]
    fn test_derive_repo_name_https() {
        assert_eq!(
            derive_repo_name_from_url("https://github.com/user/my-repo.git"),
            Some("my-repo".to_string())
        );
        assert_eq!(
            derive_repo_name_from_url("https://github.com/user/repo"),
            Some("repo".to_string())
        );
        assert_eq!(
            derive_repo_name_from_url("https://gitlab.com/group/subgroup/project.git"),
            Some("project".to_string())
        );
    }

    #[test]
    fn test_derive_repo_name_ssh() {
        assert_eq!(
            derive_repo_name_from_url("git@github.com:user/my-repo.git"),
            Some("my-repo".to_string())
        );
        assert_eq!(
            derive_repo_name_from_url("git@gitlab.com:group/project"),
            Some("project".to_string())
        );
    }

    #[test]
    fn test_derive_repo_name_trailing_slash() {
        assert_eq!(
            derive_repo_name_from_url("https://github.com/user/repo/"),
            Some("repo".to_string())
        );
        assert_eq!(
            derive_repo_name_from_url("https://github.com/user/repo.git/"),
            Some("repo".to_string())
        );
    }
}
