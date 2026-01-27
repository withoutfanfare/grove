// Configuration file operations for wt config management
//
// This module handles reading, writing, and parsing wt configuration files
// at the three configuration layers: Global (~/.wtrc), Project ($HERD_ROOT/.wtconfig),
// and Repo ($HERD_ROOT/<repo>.git/.wtconfig).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::fs_safety::{
    canonicalise_existing, ensure_within_any_root, get_allowed_roots, get_file_meta,
    get_home_dir, read_text_file, write_text_file_atomic,
};
use crate::types::WtError;

// ============================================================================
// Types
// ============================================================================

/// Configuration layer indicating the scope of a config file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigLayer {
    /// Global config: ~/.wtrc
    Global,
    /// Project config: $HERD_ROOT/.wtconfig
    Project,
    /// Repo-specific config: $HERD_ROOT/<repo>.git/.wtconfig
    Repo,
}

impl std::fmt::Display for ConfigLayer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigLayer::Global => write!(f, "global"),
            ConfigLayer::Project => write!(f, "project"),
            ConfigLayer::Repo => write!(f, "repo"),
        }
    }
}

/// Metadata about a configuration file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileMeta {
    /// Which layer this config file belongs to
    pub layer: ConfigLayer,
    /// Full path to the config file
    pub path: String,
    /// Whether the file currently exists
    pub exists: bool,
    /// Whether the file is writable (or can be created)
    pub writable: bool,
    /// Whether the file is a symlink
    pub is_symlink: bool,
    /// Target path if the file is a symlink
    pub symlink_target: Option<String>,
    /// ISO-8601 timestamp of last modification
    pub last_modified: Option<String>,
}

impl ConfigFileMeta {
    fn from_path(layer: ConfigLayer, path: PathBuf) -> Self {
        let meta = get_file_meta(&path);
        
        // Check if parent is writable for non-existent files
        let writable = if meta.exists {
            meta.writable
        } else {
            path.parent()
                .map(|p| p.exists() && !p.metadata().map(|m| m.permissions().readonly()).unwrap_or(true))
                .unwrap_or(false)
        };

        Self {
            layer,
            path: path.to_string_lossy().to_string(),
            exists: meta.exists,
            writable,
            is_symlink: meta.is_symlink,
            symlink_target: meta.symlink_target,
            last_modified: meta.last_modified,
        }
    }
}

/// A single configuration entry from a config file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry {
    /// Configuration key (e.g., "DEFAULT_BASE", "DB_CREATE")
    pub key: String,
    /// Normalised value (quotes removed)
    pub value: String,
    /// Raw value as it appears in the file
    pub raw_value: String,
    /// Whether this line is commented out
    pub commented: bool,
    /// Line number in the file (1-based)
    pub line: u32,
    /// Whether this is a sensitive value (e.g., password)
    pub sensitive: bool,
}

/// Full contents of a configuration file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigFileContents {
    /// File metadata
    pub meta: ConfigFileMeta,
    /// Raw file contents
    pub content: String,
    /// Parsed configuration entries
    pub entries: Vec<ConfigEntry>,
}

/// Request to update configuration keys.
#[derive(Debug, Clone, Deserialize)]
pub struct ConfigKeyUpdate {
    /// Key to update
    pub key: String,
    /// New value, or None to delete/comment out
    pub value: Option<String>,
}

// ============================================================================
// Sensitive Keys
// ============================================================================

/// Keys that contain sensitive information and should be masked in UI.
const SENSITIVE_KEYS: &[&str] = &[
    "DB_PASSWORD",
    "DB_PASS",
    "PASSWORD",
    "SECRET",
    "TOKEN",
    "API_KEY",
    "PRIVATE_KEY",
];

fn is_sensitive_key(key: &str) -> bool {
    let upper = key.to_uppercase();
    SENSITIVE_KEYS.iter().any(|s| upper.contains(s))
}

// ============================================================================
// Config Path Resolution
// ============================================================================

/// Get the path to the global config file (~/.wtrc).
pub fn get_global_config_path() -> Result<PathBuf, WtError> {
    let home = get_home_dir()?;
    Ok(home.join(".wtrc"))
}

/// Get the path to the project config file ($HERD_ROOT/.wtconfig).
pub fn get_project_config_path(herd_root: &str) -> Result<PathBuf, WtError> {
    let root = canonicalise_existing(herd_root)?;
    Ok(root.join(".wtconfig"))
}

/// Get the path to a repo-specific config file.
pub fn get_repo_config_path(herd_root: &str, repo_name: &str) -> Result<PathBuf, WtError> {
    // Validate repo name to prevent path traversal
    if repo_name.contains('/') || repo_name.contains('\\') || repo_name == ".." {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Repository name contains invalid characters",
        ));
    }

    let root = canonicalise_existing(herd_root)?;
    Ok(root.join(format!("{}.git", repo_name)).join(".wtconfig"))
}

/// Get metadata for all config files.
///
/// Returns metadata for Global, Project, and optionally Repo config files.
pub fn get_config_files(
    herd_root: Option<&str>,
    repo_name: Option<&str>,
) -> Result<Vec<ConfigFileMeta>, WtError> {
    let mut files = Vec::new();

    // Global config
    let global_path = get_global_config_path()?;
    files.push(ConfigFileMeta::from_path(ConfigLayer::Global, global_path));

    // Project config (if HERD_ROOT is available)
    if let Some(herd) = herd_root {
        if let Ok(project_path) = get_project_config_path(herd) {
            files.push(ConfigFileMeta::from_path(ConfigLayer::Project, project_path));
        }
    }

    // Repo config (if both HERD_ROOT and repo_name are available)
    if let (Some(herd), Some(repo)) = (herd_root, repo_name) {
        if let Ok(repo_path) = get_repo_config_path(herd, repo) {
            files.push(ConfigFileMeta::from_path(ConfigLayer::Repo, repo_path));
        }
    }

    Ok(files)
}

// ============================================================================
// Config File Parsing
// ============================================================================

/// Parse a shell-style configuration file into entries.
///
/// Supports:
/// - KEY=value
/// - KEY="value with spaces"
/// - KEY='value with spaces'
/// - export KEY=value
/// - # comments
/// - Inline comments after values
pub fn parse_config_file(content: &str) -> Vec<ConfigEntry> {
    let mut entries = Vec::new();

    for (line_num, line) in content.lines().enumerate() {
        let line_number = (line_num + 1) as u32;
        let trimmed = line.trim();

        // Skip empty lines
        if trimmed.is_empty() {
            continue;
        }

        // Check if line is commented
        let (is_commented, working_line) = if trimmed.starts_with('#') {
            // Try to parse as a commented-out config line
            let uncommented = trimmed.trim_start_matches('#').trim();
            (true, uncommented)
        } else {
            (false, trimmed)
        };

        // Skip pure comments (no key=value after #)
        if is_commented && !working_line.contains('=') {
            continue;
        }

        // Handle 'export' prefix
        let working_line = working_line
            .strip_prefix("export ")
            .unwrap_or(working_line)
            .trim();

        // Parse KEY=VALUE
        if let Some(eq_pos) = working_line.find('=') {
            let key = working_line[..eq_pos].trim().to_string();
            let raw_value = working_line[eq_pos + 1..].to_string();
            
            // Parse the value, handling quotes
            let value = parse_config_value(&raw_value);

            if !key.is_empty() {
                entries.push(ConfigEntry {
                    key: key.clone(),
                    value,
                    raw_value,
                    commented: is_commented,
                    line: line_number,
                    sensitive: is_sensitive_key(&key),
                });
            }
        }
    }

    entries
}

/// Parse a config value, removing quotes and handling escapes.
fn parse_config_value(raw: &str) -> String {
    let trimmed = raw.trim();

    // Handle inline comments (but not inside quotes)
    let value_part = if let Some(stripped) = trimmed.strip_prefix('"') {
        // Double-quoted: find matching close quote
        if let Some(end) = stripped.find('"') {
            &stripped[..end]
        } else {
            trimmed.trim_matches('"')
        }
    } else if let Some(stripped) = trimmed.strip_prefix('\'') {
        // Single-quoted: find matching close quote
        if let Some(end) = stripped.find('\'') {
            &stripped[..end]
        } else {
            trimmed.trim_matches('\'')
        }
    } else {
        // Unquoted: strip inline comment
        trimmed.split('#').next().unwrap_or(trimmed).trim()
    };

    value_part.to_string()
}

// ============================================================================
// Config File Reading
// ============================================================================

/// Read and parse a config file.
pub fn read_config_file(
    layer: ConfigLayer,
    herd_root: Option<&str>,
    repo_name: Option<&str>,
) -> Result<ConfigFileContents, WtError> {
    let path = match layer {
        ConfigLayer::Global => get_global_config_path()?,
        ConfigLayer::Project => {
            let herd = herd_root.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "HERD_ROOT required for project config")
            })?;
            get_project_config_path(herd)?
        }
        ConfigLayer::Repo => {
            let herd = herd_root.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "HERD_ROOT required for repo config")
            })?;
            let repo = repo_name.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "Repository name required for repo config")
            })?;
            get_repo_config_path(herd, repo)?
        }
    };

    let meta = ConfigFileMeta::from_path(layer, path.clone());

    if !meta.exists {
        return Ok(ConfigFileContents {
            meta,
            content: String::new(),
            entries: Vec::new(),
        });
    }

    let content = read_text_file(&path)?;
    let entries = parse_config_file(&content);

    Ok(ConfigFileContents {
        meta,
        content,
        entries,
    })
}

// ============================================================================
// Config File Writing
// ============================================================================

/// Write a config file with security validation.
pub fn write_config_file(
    layer: ConfigLayer,
    herd_root: Option<&str>,
    repo_name: Option<&str>,
    content: &str,
) -> Result<(), WtError> {
    let path = match layer {
        ConfigLayer::Global => get_global_config_path()?,
        ConfigLayer::Project => {
            let herd = herd_root.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "HERD_ROOT required for project config")
            })?;
            get_project_config_path(herd)?
        }
        ConfigLayer::Repo => {
            let herd = herd_root.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "HERD_ROOT required for repo config")
            })?;
            let repo = repo_name.ok_or_else(|| {
                WtError::new("INVALID_INPUT", "Repository name required for repo config")
            })?;
            get_repo_config_path(herd, repo)?
        }
    };

    // Validate the path is within allowed roots
    let roots = get_allowed_roots(herd_root)?;
    
    // For existing files, validate the canonical path
    // For new files, validate the parent directory
    if path.exists() {
        let canonical = path.canonicalize().map_err(|e| {
            WtError::new("IO_ERROR", format!("Failed to canonicalize path: {}", e))
        })?;
        ensure_within_any_root(&canonical, &roots)?;
    } else if let Some(parent) = path.parent() {
        if parent.exists() {
            let canonical_parent = parent.canonicalize().map_err(|e| {
                WtError::new("IO_ERROR", format!("Failed to canonicalize parent: {}", e))
            })?;
            ensure_within_any_root(&canonical_parent, &roots)?;
        }
    }

    // Write with restrictive permissions (0600) and backup
    write_text_file_atomic(&path, content, 0o600, true)?;

    Ok(())
}

/// Update specific keys in a config file while preserving formatting.
///
/// For each update:
/// - If the key exists, update its value in place
/// - If the key doesn't exist and value is Some, append it
/// - If the key exists and value is None, comment it out
pub fn update_config_keys(
    layer: ConfigLayer,
    herd_root: Option<&str>,
    repo_name: Option<&str>,
    updates: &[ConfigKeyUpdate],
) -> Result<ConfigFileContents, WtError> {
    // Read current content
    let current = read_config_file(layer, herd_root, repo_name)?;
    
    let mut lines: Vec<String> = current.content.lines().map(|s| s.to_string()).collect();
    let mut keys_updated: std::collections::HashSet<String> = std::collections::HashSet::new();

    // First pass: update existing lines
    for (line_idx, line) in lines.iter_mut().enumerate() {
        let trimmed = line.trim();
        
        // Check if this is a config line (possibly commented)
        let (is_commented, working) = if trimmed.starts_with('#') {
            (true, trimmed.trim_start_matches('#').trim())
        } else {
            (false, trimmed)
        };

        // Handle export prefix
        let working = working.strip_prefix("export ").unwrap_or(working).trim();

        if let Some(eq_pos) = working.find('=') {
            let key = working[..eq_pos].trim();
            
            // Check if we have an update for this key
            if let Some(update) = updates.iter().find(|u| u.key == key) {
                keys_updated.insert(key.to_string());

                match &update.value {
                    Some(new_value) => {
                        // Update the value, preserving export and uncommenting if needed
                        let has_export = line.contains("export ");
                        let prefix = if has_export { "export " } else { "" };
                        
                        // Quote the value if it contains spaces or special chars
                        let formatted_value = if new_value.contains(' ') 
                            || new_value.contains('#')
                            || new_value.contains('=')
                        {
                            format!("\"{}\"", new_value)
                        } else {
                            new_value.clone()
                        };
                        
                        *line = format!("{}{}={}", prefix, key, formatted_value);
                    }
                    None => {
                        // Comment out the line if not already commented
                        if !is_commented {
                            *line = format!("# {}", line);
                        }
                    }
                }
            }
        }
        
        let _ = line_idx; // silence unused warning
    }

    // Second pass: append new keys
    for update in updates {
        if !keys_updated.contains(&update.key) {
            if let Some(value) = &update.value {
                let formatted_value = if value.contains(' ') 
                    || value.contains('#')
                    || value.contains('=')
                {
                    format!("\"{}\"", value)
                } else {
                    value.clone()
                };
                lines.push(format!("{}={}", update.key, formatted_value));
            }
        }
    }

    // Write updated content
    let new_content = lines.join("\n");
    write_config_file(layer, herd_root, repo_name, &new_content)?;

    // Return the updated file
    read_config_file(layer, herd_root, repo_name)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_config_simple() {
        let content = r#"
DEFAULT_BASE=origin/staging
DB_CREATE=true
"#;
        let entries = parse_config_file(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "DEFAULT_BASE");
        assert_eq!(entries[0].value, "origin/staging");
        assert_eq!(entries[1].key, "DB_CREATE");
        assert_eq!(entries[1].value, "true");
    }

    #[test]
    fn test_parse_config_quoted() {
        let content = r#"
BRANCH_PATTERN="feature/$USER/$BRANCH"
SINGLE_QUOTED='value with spaces'
"#;
        let entries = parse_config_file(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "BRANCH_PATTERN");
        assert_eq!(entries[0].value, "feature/$USER/$BRANCH");
        assert_eq!(entries[1].value, "value with spaces");
    }

    #[test]
    fn test_parse_config_export() {
        let content = "export MY_VAR=value";
        let entries = parse_config_file(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].key, "MY_VAR");
        assert_eq!(entries[0].value, "value");
    }

    #[test]
    fn test_parse_config_comments() {
        let content = r#"
# This is a pure comment
ACTIVE=true
# DISABLED=true
"#;
        let entries = parse_config_file(content);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].key, "ACTIVE");
        assert!(!entries[0].commented);
        assert_eq!(entries[1].key, "DISABLED");
        assert!(entries[1].commented);
    }

    #[test]
    fn test_parse_config_inline_comments() {
        let content = r#"VALUE=test # this is a comment"#;
        let entries = parse_config_file(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].value, "test");
    }

    #[test]
    fn test_sensitive_key_detection() {
        assert!(is_sensitive_key("DB_PASSWORD"));
        assert!(is_sensitive_key("API_KEY"));
        assert!(is_sensitive_key("my_secret_token"));
        assert!(!is_sensitive_key("DEFAULT_BASE"));
        assert!(!is_sensitive_key("DB_HOST"));
    }

    #[test]
    fn test_config_layer_display() {
        assert_eq!(ConfigLayer::Global.to_string(), "global");
        assert_eq!(ConfigLayer::Project.to_string(), "project");
        assert_eq!(ConfigLayer::Repo.to_string(), "repo");
    }
}
