//! The single seam to Waypoint's `way` CLI. Grove desktop never re-implements
//! a ledger rule: it runs `way`, relays the answer, and obeys the exit code.

use crate::types::WtError;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// Default ceiling for a single `way worktree checkpoint` invocation. `way`
/// should answer near-instantly; this guards against a hung or misbehaving
/// binary wedging the checkpoint action indefinitely.
const DEFAULT_CHECKPOINT_TIMEOUT: Duration = Duration::from_secs(60);

/// Combined stdout+stderr cap for `way` output. Mirrors `wt.rs`'s
/// `MAX_OUTPUT_SIZE` (10 MB) — duplicated here rather than shared because
/// `way.rs` is Grove's single, independent seam to `way` and has no other
/// reason to depend on `wt.rs`'s internals.
const MAX_OUTPUT_SIZE: usize = 10 * 1024 * 1024; // 10 MB, matches wt.rs

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
    checkpoint_with_binary_and_timeout(bin, path, DEFAULT_CHECKPOINT_TIMEOUT)
}

/// As `checkpoint_with_binary`, but with an injectable timeout — the seam
/// tests use to exercise a hung `way` binary without actually waiting.
fn checkpoint_with_binary_and_timeout(
    bin: &Path,
    path: &Path,
    timeout: Duration,
) -> Result<String, WtError> {
    checkpoint_with_binary_and_limits(bin, path, timeout, MAX_OUTPUT_SIZE)
}

/// Read up to `cap` bytes from `reader` into memory, continuing to drain
/// (and discard) anything beyond the cap so the writer never blocks on a
/// full pipe. Returns the captured bytes and the total number of bytes
/// actually seen, which may exceed `cap`.
fn read_capped<R: Read>(mut reader: R, cap: usize) -> (Vec<u8>, usize) {
    let mut data = Vec::new();
    let mut total = 0usize;
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                total += n;
                if data.len() < cap {
                    let take = (cap - data.len()).min(n);
                    data.extend_from_slice(&buf[..take]);
                }
            }
            Err(_) => break,
        }
    }
    (data, total)
}

/// As `checkpoint_with_binary`, but with both the timeout and the combined
/// output cap injectable — the seam the output-cap test uses.
fn checkpoint_with_binary_and_limits(
    bin: &Path,
    path: &Path,
    timeout: Duration,
    max_output: usize,
) -> Result<String, WtError> {
    let mut child = Command::new(bin)
        .args(["worktree", "checkpoint", "--objective-only"])
        .current_dir(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
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

    // Read stdout and stderr on their own threads: a full pipe on one stream
    // must never block us from draining the other, or from noticing the
    // process has exited.
    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    let stdout_handle = thread::spawn(move || read_capped(stdout, max_output));
    let stderr_handle = thread::spawn(move || read_capped(stderr, max_output));

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                // The process has exited, so both pipes are closed (or about
                // to be) and these joins return promptly.
                let (stdout_bytes, stdout_total) =
                    stdout_handle.join().unwrap_or_else(|_| (Vec::new(), 0));
                let (stderr_bytes, stderr_total) =
                    stderr_handle.join().unwrap_or_else(|_| (Vec::new(), 0));

                if stdout_total + stderr_total > max_output {
                    return Err(WtError::new(
                        "OUTPUT_TOO_LARGE",
                        format!(
                            "way output exceeded maximum size limit of {} MB. This may indicate an issue with the way command.",
                            max_output / (1024 * 1024)
                        ),
                    ));
                }

                let combined = format!(
                    "{}{}",
                    String::from_utf8_lossy(&stdout_bytes),
                    String::from_utf8_lossy(&stderr_bytes)
                );
                return if status.success() {
                    Ok(combined.trim().to_string())
                } else {
                    Err(WtError::new(
                        "WAY_CHECKPOINT_FAILED",
                        combined.trim().to_string(),
                    ))
                };
            }
            Ok(None) => {
                if Instant::now() >= deadline {
                    // Kill and reap our direct child promptly. We deliberately
                    // do not join the reader threads here: a grandchild the
                    // stub (or a real hung `way`) spawned may still hold the
                    // pipes open, and this path must return quickly rather
                    // than wait that out.
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(WtError::new(
                        "WAY_TIMEOUT",
                        format!(
                            "way did not respond within {}s and was terminated.",
                            timeout.as_secs()
                        ),
                    ));
                }
                thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                return Err(WtError::new(
                    "IO_ERROR",
                    format!("Failed to wait for way: {e}"),
                ));
            }
        }
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

    fn stub_sleep(dir: &std::path::Path, seconds: u64) -> std::path::PathBuf {
        let path = dir.join("way-stub-sleep");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, "#!/bin/sh\nsleep {}\necho done\nexit 0", seconds).unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).unwrap();
        path
    }

    fn stub_output(dir: &std::path::Path, byte_count: usize) -> std::path::PathBuf {
        let path = dir.join("way-stub-big");
        let mut f = std::fs::File::create(&path).unwrap();
        let payload = "x".repeat(byte_count);
        writeln!(f, "#!/bin/sh\nprintf '%s' '{}'\nexit 0", payload).unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).unwrap();
        path
    }

    #[test]
    fn checkpoint_times_out_and_kills_a_hung_binary() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub_sleep(dir.path(), 2);

        let started = std::time::Instant::now();
        let err = checkpoint_with_binary_and_timeout(
            &bin,
            dir.path(),
            std::time::Duration::from_millis(200),
        )
        .expect_err("a binary that never answers must time out");
        let elapsed = started.elapsed();

        assert_eq!(err.code, "WAY_TIMEOUT");
        assert!(
            elapsed < std::time::Duration::from_secs(1),
            "timeout handling should not wait out the full sleep, took {:?}",
            elapsed
        );
    }

    #[test]
    fn checkpoint_enforces_the_combined_output_cap() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub_output(dir.path(), 5_000);

        let err = checkpoint_with_binary_and_limits(
            &bin,
            dir.path(),
            std::time::Duration::from_secs(5),
            100,
        )
        .expect_err("output past the cap must error");

        assert_eq!(err.code, "OUTPUT_TOO_LARGE");
    }
}
