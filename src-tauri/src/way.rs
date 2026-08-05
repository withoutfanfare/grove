//! The single seam to Waypoint's `way` CLI. Grove desktop never re-implements
//! a ledger rule: it runs `way`, relays the answer, and obeys the exit code.

use crate::types::WtError;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Locate the `way` binary. GUI-launched apps do not inherit the shell PATH,
/// so explicit locations are probed after it, mirroring the grove CLI.
/// `GROVE_WAY_BIN` wins when set (also the hermetic test seam).
fn way_binary() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("GROVE_WAY_BIN") {
        let p = PathBuf::from(explicit);
        return p.is_file().then_some(p);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/way"),
        format!("{home}/.cargo/bin/way"),
        "/opt/homebrew/bin/way".to_string(),
        "/usr/local/bin/way".to_string(),
    ];
    if let Ok(output) = Command::new("way").arg("--version").output() {
        if output.status.success() {
            return Some(PathBuf::from("way"));
        }
    }
    candidates.iter().map(PathBuf::from).find(|p| p.is_file())
}

/// Record an objective-only checkpoint for the worktree at `path`.
pub fn checkpoint_objective_only(path: &Path) -> Result<String, WtError> {
    let bin = way_binary().ok_or_else(|| {
        WtError::new(
            "WAY_NOT_FOUND",
            "The Waypoint 'way' command was not found. Install Waypoint to record checkpoints.",
        )
    })?;
    checkpoint_with_binary(&bin, path)
}

fn checkpoint_with_binary(bin: &Path, path: &Path) -> Result<String, WtError> {
    let output = Command::new(bin)
        .args(["worktree", "checkpoint", "--objective-only"])
        .current_dir(path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                WtError::new(
                    "WAY_NOT_FOUND",
                    "The Waypoint 'way' command was not found. Install Waypoint to record checkpoints.",
                )
            } else {
                WtError::new("IO_ERROR", format!("Failed to run way: {e}"))
            }
        })?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if output.status.success() {
        Ok(combined.trim().to_string())
    } else {
        Err(WtError::new(
            "WAY_CHECKPOINT_FAILED",
            combined.trim().to_string(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn stub(dir: &std::path::Path, exit: i32, out: &str) -> std::path::PathBuf {
        let path = dir.join("way-stub");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "#!/bin/sh\necho '{}'\nexit {}", out, exit).unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).unwrap();
        path
    }

    #[test]
    fn checkpoint_succeeds_against_a_zero_exit_binary() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub(dir.path(), 0, "checkpointed wt_1");
        let result = checkpoint_with_binary(&bin, dir.path()).expect("checkpoint should succeed");
        assert!(result.contains("checkpointed wt_1"));
    }

    #[test]
    fn checkpoint_failure_is_a_typed_error_with_the_output() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub(dir.path(), 1, "no ledger root configured");
        let err = checkpoint_with_binary(&bin, dir.path()).expect_err("non-zero exit must error");
        assert_eq!(err.code, "WAY_CHECKPOINT_FAILED");
        assert!(err.message.contains("no ledger root configured"));
    }

    #[test]
    fn missing_binary_is_way_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let err = checkpoint_with_binary(std::path::Path::new("/nonexistent/way"), dir.path())
            .expect_err("missing binary must error");
        assert_eq!(err.code, "WAY_NOT_FOUND");
    }
}
