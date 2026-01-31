// Filesystem safety utilities for config and hook operations
//
// This module provides path validation, allow-listing, and atomic file
// operations to ensure safe filesystem access for user-editable files.

use std::fs;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use crate::types::WtError;

// ============================================================================
// Path Validation
// ============================================================================

/// Characters that could be used for shell injection attacks.
/// These must never appear in paths passed to external commands.
/// Characters that could be used for shell injection attacks.
const DANGEROUS_CHARS: &[char] = &[
    ';', '&', '|', '$', '`', '(', ')', '{', '}', '<', '>', '\n', '\r', '\0',
];

/// Maximum file size for config/hook files (256KB).
const MAX_FILE_SIZE: u64 = 256 * 1024;

/// Unix permission mode for config files (owner read/write only).
#[allow(dead_code)]
pub const CONFIG_FILE_MODE: u32 = 0o600;

/// Unix permission mode for hook scripts (owner rwx, group/other rx).
#[allow(dead_code)]
pub const HOOK_FILE_MODE: u32 = 0o755;

/// Validate that a string contains no shell metacharacters.
///
/// Returns Ok(()) if the string is safe, or an error if it contains
/// any dangerous characters that could be used for command injection.
pub fn validate_no_shell_metachars(input: &str) -> Result<(), WtError> {
    if input.chars().any(|c| DANGEROUS_CHARS.contains(&c)) {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Input contains invalid shell metacharacters",
        ));
    }
    Ok(())
}

/// Validate and canonicalise a path that must already exist.
///
/// Returns the canonical (absolute, symlink-resolved) path if valid.
/// Fails if the path doesn't exist or contains dangerous characters.
pub fn canonicalise_existing(path: &str) -> Result<PathBuf, WtError> {
    validate_no_shell_metachars(path)?;

    let path_buf = PathBuf::from(path);
    path_buf.canonicalize().map_err(|e| {
        WtError::new(
            "NOT_FOUND",
            format!("Path does not exist or is not accessible: {}", e),
        )
    })
}

/// Validate and canonicalise the parent directory for file creation.
///
/// Returns (canonical_parent, filename) if the parent exists and is valid.
/// The file itself may or may not exist.
#[allow(dead_code)]
pub fn canonicalise_parent_for_create(path: &str) -> Result<(PathBuf, String), WtError> {
    validate_no_shell_metachars(path)?;

    let path_buf = PathBuf::from(path);

    // Get the filename
    let filename = path_buf
        .file_name()
        .ok_or_else(|| WtError::new("INVALID_PATH", "Path has no filename"))?
        .to_string_lossy()
        .to_string();

    // Validate filename doesn't try path traversal
    if filename == "." || filename == ".." || filename.contains('/') || filename.contains('\\') {
        return Err(WtError::new(
            "INVALID_PATH",
            "Filename contains path traversal characters",
        ));
    }

    // Get and canonicalise the parent directory
    let parent = path_buf
        .parent()
        .ok_or_else(|| WtError::new("INVALID_PATH", "Path has no parent directory"))?;

    // Parent must exist for us to create file in it
    let canonical_parent = parent.canonicalize().map_err(|e| {
        WtError::new(
            "NOT_FOUND",
            format!("Parent directory does not exist: {}", e),
        )
    })?;

    Ok((canonical_parent, filename))
}

/// Ensure a path is within an allowed root directory.
///
/// Prevents path traversal attacks by verifying the canonical path
/// starts with one of the allowed root directories.
#[allow(dead_code)]
pub fn ensure_within_root(path: &Path, root: &Path) -> Result<(), WtError> {
    // Both paths should already be canonicalised
    if !path.starts_with(root) {
        return Err(WtError::new(
            "PERMISSION_DENIED",
            format!(
                "Path '{}' is outside allowed root '{}'",
                path.display(),
                root.display()
            ),
        ));
    }
    Ok(())
}

/// Ensure a path is within any of the allowed root directories.
pub fn ensure_within_any_root(path: &Path, roots: &[PathBuf]) -> Result<(), WtError> {
    for root in roots {
        if path.starts_with(root) {
            return Ok(());
        }
    }
    Err(WtError::new(
        "PERMISSION_DENIED",
        format!(
            "Path '{}' is outside all allowed roots",
            path.display()
        ),
    ))
}

// ============================================================================
// Allowed Roots Resolution
// ============================================================================

/// Get the user's home directory.
pub fn get_home_dir() -> Result<PathBuf, WtError> {
    dirs::home_dir().ok_or_else(|| WtError::new("NOT_FOUND", "Could not determine home directory"))
}

/// Get the default wt config directory (~/.wt).
pub fn get_wt_config_dir() -> Result<PathBuf, WtError> {
    let home = get_home_dir()?;
    Ok(home.join(".wt"))
}

/// Get allowed roots for config/hook file operations.
///
/// Returns paths where config and hook files may be read/written:
/// - ~/.wt (default config/hooks directory)
/// - $HERD_ROOT if set (Laravel Herd project root)
/// - User's home directory (for ~/.wtrc)
pub fn get_allowed_roots(herd_root: Option<&str>) -> Result<Vec<PathBuf>, WtError> {
    let mut roots = Vec::new();

    // Home directory (for ~/.wtrc)
    let home = get_home_dir()?;
    roots.push(home.clone());

    // Default wt config directory
    let wt_dir = home.join(".wt");
    if wt_dir.exists() {
        if let Ok(canonical) = wt_dir.canonicalize() {
            roots.push(canonical);
        }
    }

    // HERD_ROOT if provided
    if let Some(herd) = herd_root {
        if let Ok(canonical) = PathBuf::from(herd).canonicalize() {
            roots.push(canonical);
        }
    }

    // Also check WT_HOOKS_DIR environment variable
    if let Ok(hooks_dir) = std::env::var("WT_HOOKS_DIR") {
        if let Ok(canonical) = PathBuf::from(hooks_dir).canonicalize() {
            roots.push(canonical);
        }
    }

    Ok(roots)
}

// ============================================================================
// Atomic File Operations
// ============================================================================

/// Read a text file with size limit.
///
/// Returns the file contents as a string, or an error if:
/// - The file doesn't exist
/// - The file is too large
/// - The file isn't valid UTF-8
pub fn read_text_file(path: &Path) -> Result<String, WtError> {
    // Check file size first
    let metadata = fs::metadata(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            WtError::new("NOT_FOUND", format!("File not found: {}", path.display()))
        } else {
            WtError::new("IO_ERROR", format!("Failed to read file metadata: {}", e))
        }
    })?;

    if metadata.len() > MAX_FILE_SIZE {
        return Err(WtError::new(
            "FILE_TOO_LARGE",
            format!(
                "File exceeds maximum size of {} bytes",
                MAX_FILE_SIZE
            ),
        ));
    }

    fs::read_to_string(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            WtError::new("NOT_FOUND", format!("File not found: {}", path.display()))
        } else {
            WtError::new("IO_ERROR", format!("Failed to read file: {}", e))
        }
    })
}

/// Write a text file atomically with optional backup.
///
/// Uses write-to-temp-then-rename pattern to ensure the file is never
/// left in a partially-written state. Optionally creates a timestamped
/// backup of the original file.
///
/// # Arguments
/// * `path` - The file path to write
/// * `content` - The content to write
/// * `mode` - Unix permission mode (e.g., 0o600 for config, 0o755 for hooks)
/// * `backup` - Whether to create a .bak backup of the existing file
pub fn write_text_file_atomic(
    path: &Path,
    content: &str,
    mode: u32,
    backup: bool,
) -> Result<(), WtError> {
    // Create parent directories if they don't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            WtError::new(
                "IO_ERROR",
                format!("Failed to create parent directories: {}", e),
            )
        })?;
    }

    // Create backup if requested and file exists
    if backup && path.exists() {
        let backup_path = path.with_extension(format!(
            "{}.bak",
            chrono::Utc::now().format("%Y%m%d_%H%M%S")
        ));
        fs::copy(path, &backup_path).map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to create backup: {}", e))
        })?;
    }

    // Write to temporary file in the same directory
    let temp_path = path.with_extension("tmp");
    
    {
        let mut file = fs::File::create(&temp_path).map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to create temp file: {}", e))
        })?;

        file.write_all(content.as_bytes()).map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to write temp file: {}", e))
        })?;

        file.sync_all().map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to sync temp file: {}", e))
        })?;
    }

    // Set permissions on temp file
    #[cfg(unix)]
    {
        let permissions = fs::Permissions::from_mode(mode);
        fs::set_permissions(&temp_path, permissions).map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to set permissions: {}", e))
        })?;
    }

    // Atomic rename
    fs::rename(&temp_path, path).map_err(|e| {
        // Clean up temp file if rename fails
        let _ = fs::remove_file(&temp_path);
        WtError::new("IO_ERROR", format!("Failed to rename temp file: {}", e))
    })?;

    Ok(())
}

/// Delete a file safely.
///
/// Returns Ok(()) if the file was deleted or didn't exist.
pub fn delete_file(path: &Path) -> Result<(), WtError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(WtError::new(
            "IO_ERROR",
            format!("Failed to delete file: {}", e),
        )),
    }
}

// ============================================================================
// File Metadata
// ============================================================================

/// Get metadata about a file for display purposes.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FileMeta {
    pub exists: bool,
    pub writable: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub last_modified: Option<String>,
    pub mode: Option<u32>,
}

/// Get file metadata without reading the file contents.
pub fn get_file_meta(path: &Path) -> FileMeta {
    let exists = path.exists();
    
    // Check if it's a symlink (before following it)
    let is_symlink = path.symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    
    let symlink_target = if is_symlink {
        fs::read_link(path)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
    } else {
        None
    };

    let metadata = fs::metadata(path).ok();
    
    let writable = metadata.as_ref()
        .map(|m| !m.permissions().readonly())
        .unwrap_or(false);
    
    let last_modified = metadata.as_ref()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t)
                .to_rfc3339()
        });

    #[cfg(unix)]
    let mode = metadata.as_ref().map(|m| m.permissions().mode());
    #[cfg(not(unix))]
    let mode = None;

    FileMeta {
        exists,
        writable,
        is_symlink,
        symlink_target,
        last_modified,
        mode,
    }
}

// ============================================================================
// Hook-specific Validation
// ============================================================================

/// Validate a hook filename.
///
/// Hook filenames in .d directories must follow the pattern:
/// - Start with two digits (for ordering)
/// - Followed by a hyphen
/// - Followed by alphanumeric, hyphens, underscores, dots
/// - Optionally ending with .sh
///
/// Single hooks can be any valid filename without path separators.
pub fn validate_hook_filename(name: &str, is_d_script: bool) -> Result<(), WtError> {
    if name.is_empty() {
        return Err(WtError::new("INVALID_FILENAME", "Filename cannot be empty"));
    }

    // No path separators or parent traversal
    if name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err(WtError::new(
            "INVALID_FILENAME",
            "Filename contains path separators",
        ));
    }

    // No shell metacharacters
    validate_no_shell_metachars(name)?;

    if is_d_script {
        // .d scripts should start with two digits and a hyphen for ordering
        let chars: Vec<char> = name.chars().collect();
        if chars.len() < 4 {
            return Err(WtError::new(
                "INVALID_FILENAME",
                "Hook script name must be at least 4 characters (e.g., '01-name.sh')",
            ));
        }
        if !chars[0].is_ascii_digit() || !chars[1].is_ascii_digit() || chars[2] != '-' {
            return Err(WtError::new(
                "INVALID_FILENAME",
                "Hook script name must start with two digits and a hyphen (e.g., '01-name.sh')",
            ));
        }
    }

    // Only allow safe characters
    if !name.chars().all(|c| {
        c.is_alphanumeric() || c == '-' || c == '_' || c == '.'
    }) {
        return Err(WtError::new(
            "INVALID_FILENAME",
            "Filename contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed.",
        ));
    }

    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_no_shell_metachars() {
        assert!(validate_no_shell_metachars("normal-path").is_ok());
        assert!(validate_no_shell_metachars("path/with/slashes").is_ok());
        assert!(validate_no_shell_metachars("path; rm -rf /").is_err());
        assert!(validate_no_shell_metachars("path$(whoami)").is_err());
        assert!(validate_no_shell_metachars("path\0null").is_err());
    }

    #[test]
    fn test_validate_hook_filename_d_script() {
        assert!(validate_hook_filename("01-setup.sh", true).is_ok());
        assert!(validate_hook_filename("99-cleanup", true).is_ok());
        assert!(validate_hook_filename("00-first.sh", true).is_ok());
        
        // Invalid: doesn't start with digits
        assert!(validate_hook_filename("setup.sh", true).is_err());
        assert!(validate_hook_filename("a1-setup.sh", true).is_err());
        
        // Invalid: no hyphen after digits
        assert!(validate_hook_filename("01setup.sh", true).is_err());
        
        // Invalid: too short
        assert!(validate_hook_filename("01-", true).is_err());
    }

    #[test]
    fn test_validate_hook_filename_single() {
        assert!(validate_hook_filename("post-add", false).is_ok());
        assert!(validate_hook_filename("post-add.sh", false).is_ok());
        assert!(validate_hook_filename("my_hook", false).is_ok());
        
        // Invalid: path separators
        assert!(validate_hook_filename("../hook", false).is_err());
        assert!(validate_hook_filename("path/hook", false).is_err());
    }

    #[test]
    fn test_ensure_within_root() {
        let root = PathBuf::from("/home/user/.wt");
        let valid = PathBuf::from("/home/user/.wt/hooks/post-add");
        let invalid = PathBuf::from("/etc/passwd");

        assert!(ensure_within_root(&valid, &root).is_ok());
        assert!(ensure_within_root(&invalid, &root).is_err());
    }
}
