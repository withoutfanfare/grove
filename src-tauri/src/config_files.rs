// Configuration file operations for grove config management
//
// This module handles reading, writing, and parsing grove configuration files
// at the three configuration layers: Global (~/.groverc), Project ($HERD_ROOT/.groveconfig),
// and Repo ($HERD_ROOT/<repo>.git/.groveconfig).

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
    /// Global config: ~/.groverc
    Global,
    /// Project config: $HERD_ROOT/.groveconfig
    Project,
    /// Repo-specific config: $HERD_ROOT/<repo>.git/.groveconfig
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

/// Maximum number of backup files to retain per config file.
const MAX_BACKUP_FILES: usize = 5;

fn is_sensitive_key(key: &str) -> bool {
    let upper = key.to_uppercase();
    SENSITIVE_KEYS.iter().any(|s| upper.contains(s))
}

// ============================================================================
// Config Path Resolution
// ============================================================================

/// Get the path to the global config file (~/.groverc).
pub fn get_global_config_path() -> Result<PathBuf, WtError> {
    let home = get_home_dir()?;
    Ok(home.join(".groverc"))
}

/// Get the path to the project config file ($HERD_ROOT/.groveconfig).
pub fn get_project_config_path(herd_root: &str) -> Result<PathBuf, WtError> {
    let root = canonicalise_existing(herd_root)?;
    Ok(root.join(".groveconfig"))
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
    Ok(root.join(format!("{}.git", repo_name)).join(".groveconfig"))
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

    // Clean up old backup files (keep only MAX_BACKUP_FILES most recent)
    cleanup_old_backups(&path);

    Ok(())
}

/// Remove old backup files, keeping only the most recent MAX_BACKUP_FILES.
fn cleanup_old_backups(path: &std::path::Path) {
    let Some(parent) = path.parent() else { return };
    let Some(stem) = path.file_name().and_then(|n| n.to_str()) else { return };

    let mut backups: Vec<_> = std::fs::read_dir(parent)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|n| n.starts_with(stem) && n.contains(".bak"))
                .unwrap_or(false)
        })
        .collect();

    if backups.len() <= MAX_BACKUP_FILES {
        return;
    }

    // Sort by modified time (oldest first)
    backups.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH));

    // Remove oldest backups
    for entry in &backups[..backups.len() - MAX_BACKUP_FILES] {
        let _ = std::fs::remove_file(entry.path());
    }
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
// Config Overlay: Merge file entries onto a typed Config struct
// ============================================================================

/// Apply config file entries onto a typed Config struct.
///
/// This enables "Resolved Values" to reflect entries from all config layers
/// (global, project, repo) by overlaying non-commented key=value pairs onto
/// the base Config returned by the CLI.
///
/// Key mapping:
///   DEFAULT_BASE          → default_base_branch
///   PROTECTED_BRANCHES    → protected_branches (space-separated)
///   GROVE_HOOKS_ENABLED   → hooks_enabled (boolean)
///   GROVE_HOOKS_DIR       → hooks_dir
///   DB_CREATE             → database.enabled (boolean)
///   DB_HOST               → database.host
///   DB_USER               → database.user
///   GROVE_URL_SUBDOMAIN   → url_subdomain
///   HERD_ROOT             → herd_root
pub fn apply_config_entries(config: &mut crate::types::Config, entries: &[ConfigEntry]) {
    for entry in entries {
        // Skip commented-out entries — they don't contribute to resolved config
        if entry.commented {
            continue;
        }

        match entry.key.as_str() {
            "DEFAULT_BASE" => {
                config.default_base_branch = Some(entry.value.clone());
            }
            "PROTECTED_BRANCHES" => {
                config.protected_branches = entry
                    .value
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect();
            }
            "GROVE_HOOKS_ENABLED" => {
                config.hooks_enabled = parse_bool(&entry.value);
            }
            "GROVE_HOOKS_DIR" => {
                config.hooks_dir = Some(entry.value.clone());
            }
            "DB_CREATE" => {
                let db = config.database.get_or_insert_with(Default::default);
                db.enabled = parse_bool(&entry.value);
            }
            "DB_HOST" => {
                let db = config.database.get_or_insert_with(Default::default);
                db.host = Some(entry.value.clone());
            }
            "DB_USER" => {
                let db = config.database.get_or_insert_with(Default::default);
                db.user = Some(entry.value.clone());
            }
            "GROVE_URL_SUBDOMAIN" => {
                config.url_subdomain = Some(entry.value.clone());
            }
            "HERD_ROOT" => {
                config.herd_root = Some(entry.value.clone());
            }
            _ => {
                // Unknown keys are ignored for the typed Config struct
                // (they still appear in the raw config file view)
            }
        }
    }
}

/// Parse a string as a boolean (true/1/yes → true, everything else → false).
fn parse_bool(value: &str) -> bool {
    matches!(value.to_lowercase().as_str(), "true" | "1" | "yes")
}

/// Read all config layers and overlay entries onto a Config struct.
///
/// Reads global, project (if herd_root available), and repo (if repo_name provided)
/// config files in order, applying non-commented entries from each layer.
/// Later layers override earlier ones, matching the CLI's own precedence:
/// global → project → repo.
pub fn apply_all_config_layers(
    config: &mut crate::types::Config,
    repo_name: Option<&str>,
) -> Result<(), WtError> {
    log::debug!("Resolving config layers (repo: {:?})", repo_name);
    let herd_root = config.herd_root.clone();

    // Layer 1: Global (~/.groverc)
    if let Ok(global) = read_config_file(ConfigLayer::Global, None, None) {
        log::debug!("Applied {} global config entries", global.entries.len());
        apply_config_entries(config, &global.entries);
    }

    // Layer 2: Project ($HERD_ROOT/.groveconfig)
    if let Some(ref herd) = herd_root {
        if let Ok(project) = read_config_file(ConfigLayer::Project, Some(herd), None) {
            log::debug!("Applied {} project config entries", project.entries.len());
            apply_config_entries(config, &project.entries);
        }
    }

    // Layer 3: Repo ($HERD_ROOT/<repo>.git/.groveconfig)
    if let (Some(ref herd), Some(repo)) = (&herd_root, repo_name) {
        if let Ok(repo_cfg) = read_config_file(ConfigLayer::Repo, Some(herd), Some(repo)) {
            log::debug!("Applied {} repo config entries for '{}'", repo_cfg.entries.len(), repo);
            apply_config_entries(config, &repo_cfg.entries);
        }
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

    // ========================================================================
    // Config overlay tests
    // ========================================================================

    #[test]
    fn test_apply_config_entries_url_subdomain() {
        let mut config = crate::types::Config::default();
        let entries = parse_config_file("GROVE_URL_SUBDOMAIN=charity-meals");
        apply_config_entries(&mut config, &entries);
        assert_eq!(config.url_subdomain, Some("charity-meals".to_string()));
    }

    #[test]
    fn test_apply_config_entries_default_base() {
        let mut config = crate::types::Config::default();
        let entries = parse_config_file("DEFAULT_BASE=origin/staging");
        apply_config_entries(&mut config, &entries);
        assert_eq!(
            config.default_base_branch,
            Some("origin/staging".to_string())
        );
    }

    #[test]
    fn test_apply_config_entries_protected_branches() {
        let mut config = crate::types::Config::default();
        let entries =
            parse_config_file("PROTECTED_BRANCHES=\"main staging production\"");
        apply_config_entries(&mut config, &entries);
        assert_eq!(
            config.protected_branches,
            vec!["main", "staging", "production"]
        );
    }

    #[test]
    fn test_apply_config_entries_hooks_enabled() {
        let mut config = crate::types::Config::default();
        let entries = parse_config_file("GROVE_HOOKS_ENABLED=true");
        apply_config_entries(&mut config, &entries);
        assert!(config.hooks_enabled);
    }

    #[test]
    fn test_apply_config_entries_database() {
        let mut config = crate::types::Config::default();
        let entries = parse_config_file(
            "DB_CREATE=true\nDB_HOST=127.0.0.1\nDB_USER=root",
        );
        apply_config_entries(&mut config, &entries);
        let db = config.database.unwrap();
        assert!(db.enabled);
        assert_eq!(db.host, Some("127.0.0.1".to_string()));
        assert_eq!(db.user, Some("root".to_string()));
    }

    #[test]
    fn test_apply_config_entries_skips_commented() {
        let mut config = crate::types::Config::default();
        let entries = parse_config_file(
            "GROVE_URL_SUBDOMAIN=active\n# GROVE_URL_SUBDOMAIN=commented-out",
        );
        apply_config_entries(&mut config, &entries);
        // The active entry wins; the commented entry is ignored
        assert_eq!(config.url_subdomain, Some("active".to_string()));
    }

    #[test]
    fn test_apply_config_entries_later_wins() {
        let mut config = crate::types::Config::default();

        // Simulate global layer
        let global = parse_config_file("DEFAULT_BASE=origin/main");
        apply_config_entries(&mut config, &global);
        assert_eq!(
            config.default_base_branch,
            Some("origin/main".to_string())
        );

        // Simulate repo layer overriding
        let repo = parse_config_file("DEFAULT_BASE=origin/staging");
        apply_config_entries(&mut config, &repo);
        assert_eq!(
            config.default_base_branch,
            Some("origin/staging".to_string())
        );
    }

    #[test]
    fn test_parse_bool() {
        assert!(parse_bool("true"));
        assert!(parse_bool("1"));
        assert!(parse_bool("yes"));
        assert!(parse_bool("TRUE"));
        assert!(parse_bool("Yes"));
        assert!(!parse_bool("false"));
        assert!(!parse_bool("0"));
        assert!(!parse_bool("no"));
        assert!(!parse_bool(""));
    }
}
