//! The single seam to Waypoint's `way` CLI. Grove desktop never re-implements
//! a ledger rule: it runs `way`, relays the answer, and obeys the exit code.

use crate::types::WtError;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
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
    way_on_path().or_else(|| candidates.iter().map(PathBuf::from).find(|p| p.is_file()))
}

/// Find `way` on `PATH` by inspecting the directories, never by running it.
/// Probing with `way --version` would execute an unbounded command before the
/// timeout-protected checkpoint call begins, so a hung binary on `PATH` could
/// wedge the whole action despite that protection.
fn way_on_path() -> Option<PathBuf> {
    way_in_search_path(&std::env::var_os("PATH")?)
}

/// As `way_on_path`, but over an explicit search path — the seam the lookup
/// test uses. Tests run concurrently in one process, so a test that set the
/// real `PATH` would change it for every other test at the same time (and
/// leave it changed if it panicked before restoring it), breaking any that
/// resolve a command by name.
fn way_in_search_path(search_path: &std::ffi::OsStr) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &["way.exe", "way"] } else { &["way"] };
    std::env::split_paths(search_path)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|p| is_executable_file(p))
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
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

/// Read from `reader` into memory, claiming space from the shared `budget`
/// so stdout and stderr together never retain more than the documented cap.
/// Anything beyond the budget is still drained (and discarded) so the writer
/// never blocks on a full pipe. Returns the captured bytes and the total
/// number of bytes actually seen, which may exceed what was captured.
fn read_capped<R: Read>(mut reader: R, budget: &AtomicUsize) -> (Vec<u8>, usize) {
    let mut data = Vec::new();
    let mut total = 0usize;
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                total += n;
                let take = n.min(claim(budget, n));
                if take > 0 {
                    data.extend_from_slice(&buf[..take]);
                }
            }
            Err(_) => break,
        }
    }
    (data, total)
}

/// Take up to `want` bytes from the shared budget, returning how much was
/// actually available. Safe to call concurrently from both reader threads.
fn claim(budget: &AtomicUsize, want: usize) -> usize {
    budget
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |remaining| {
            Some(remaining.saturating_sub(want))
        })
        .unwrap_or(0)
}

/// As `checkpoint_with_binary`, but with both the timeout and the combined
/// output cap injectable — the seam the output-cap test uses.
fn checkpoint_with_binary_and_limits(
    bin: &Path,
    path: &Path,
    timeout: Duration,
    max_output: usize,
) -> Result<String, WtError> {
    // A missing working directory makes `spawn` fail with `NotFound` too, which
    // would otherwise be reported as "install Waypoint". Say what is actually
    // wrong before the binary is ever blamed.
    if !path.is_dir() {
        return Err(WtError::new(
            "WORKTREE_PATH_MISSING",
            format!(
                "The worktree directory no longer exists: {}. Refresh and try again.",
                path.display()
            ),
        ));
    }

    let mut command = Command::new(bin);
    command
        .args(["worktree", "checkpoint", "--objective-only"])
        .current_dir(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Lead a process group so a timeout can take down everything `way` started
    // (it shells out to git), not just `way` itself.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command
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
    // process has exited. Both draw from one shared budget so the documented
    // cap is the combined ceiling, not a per-stream one.
    let budget = Arc::new(AtomicUsize::new(max_output));
    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");
    let stdout_budget = Arc::clone(&budget);
    let stderr_budget = Arc::clone(&budget);
    let stdout_handle = thread::spawn(move || read_capped(stdout, &stdout_budget));
    let stderr_handle = thread::spawn(move || read_capped(stderr, &stderr_budget));

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
                    // Take down the whole group, so nothing `way` spawned is
                    // left holding the pipes.
                    //
                    // The reader threads are then DETACHED, not joined. Joining
                    // here would make the timeout depend on every writer having
                    // died: on Unix the process-group kill guarantees that, but
                    // where `kill_process_tree` can only reach the direct child
                    // a surviving grandchild keeps its inherited pipe end open,
                    // the readers block on it forever, and the join hangs — the
                    // one thing this timeout exists to prevent. The output is
                    // discarded on this path anyway, so there is nothing to wait
                    // for. A detached reader exits on its own once the pipe
                    // finally closes.
                    kill_process_tree(&mut child);
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
                // Detached rather than joined, for the same reason as the
                // timeout path above: this branch discards the output, so it
                // must not be able to block on a pipe a survivor still holds.
                kill_process_tree(&mut child);
                return Err(WtError::new(
                    "IO_ERROR",
                    format!("Failed to wait for way: {e}"),
                ));
            }
        }
    }
}

/// Kill everything the `way` invocation started, then reap our direct child.
/// `way` shells out to git, and killing only the direct child leaves those
/// grandchildren running with the pipes still open.
#[cfg(unix)]
fn kill_process_tree(child: &mut std::process::Child) {
    // SAFETY: the child leads its own process group (see `process_group(0)`
    // above), so this signals only processes this invocation started.
    unsafe { libc::killpg(child.id() as libc::pid_t, libc::SIGKILL) };
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(not(unix))]
fn kill_process_tree(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
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

    #[test]
    fn a_missing_worktree_directory_is_not_blamed_on_the_binary() {
        let dir = tempfile::tempdir().unwrap();
        let bin = stub(dir.path(), 0, "checkpointed wt_1");
        let gone = dir.path().join("no-such-worktree");

        let err = checkpoint_with_binary(&bin, &gone)
            .expect_err("a missing worktree directory must error");

        assert_eq!(err.code, "WORKTREE_PATH_MISSING");
        assert!(
            !err.message.contains("Install Waypoint"),
            "a missing directory must not tell the user to install Waypoint: {}",
            err.message
        );
    }

    #[test]
    fn the_capture_budget_is_shared_across_both_streams() {
        let budget = AtomicUsize::new(100);
        let (first, first_total) = read_capped(&b"a".repeat(80)[..], &budget);
        let (second, second_total) = read_capped(&b"b".repeat(80)[..], &budget);

        assert_eq!(first_total, 80);
        assert_eq!(second_total, 80);
        assert_eq!(
            first.len() + second.len(),
            100,
            "the two streams together must not retain more than the cap"
        );
    }

    #[cfg(unix)]
    #[test]
    fn locating_way_on_path_never_runs_it() {
        // A `way` that would take 30s to answer `--version`, and leaves proof
        // behind if it is ever executed.
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("it-ran");
        let bin = dir.path().join("way");
        let mut f = std::fs::File::create(&bin).unwrap();
        writeln!(f, "#!/bin/sh\ntouch '{}'\nsleep 30", marker.display()).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();

        // Search an explicit path rather than setting the real `PATH`: these
        // tests share one process and run concurrently, so mutating it here
        // would break any test resolving a command by name at the same moment.
        let started = Instant::now();
        let found = way_in_search_path(dir.path().as_os_str());
        let elapsed = started.elapsed();

        assert_eq!(found.as_deref(), Some(bin.as_path()));
        assert!(
            !marker.exists(),
            "locating way must not execute it — a hung binary would block the checkpoint"
        );
        assert!(
            elapsed < Duration::from_secs(1),
            "the lookup should be a filesystem check, took {elapsed:?}"
        );
    }

    /// A stub that backgrounds a long sleep — the grandchild a real `way` would
    /// leave behind as a git subprocess — and records its pid before hanging.
    #[cfg(unix)]
    fn stub_with_grandchild(dir: &std::path::Path, pid_file: &std::path::Path) -> std::path::PathBuf {
        let path = dir.join("way-stub-grandchild");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(
            f,
            "#!/bin/sh\nsleep 30 &\necho $! > '{}'\nsleep 30",
            pid_file.display()
        )
        .unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).unwrap();
        path
    }

    #[cfg(unix)]
    #[test]
    fn a_timeout_takes_down_the_processes_way_spawned() {
        let dir = tempfile::tempdir().unwrap();
        let pid_file = dir.path().join("grandchild.pid");
        let bin = stub_with_grandchild(dir.path(), &pid_file);

        // Generous enough that the stub always reaches its `echo` before the
        // deadline, even on a loaded machine — the point under test is what
        // survives the kill, not how tight the timeout is.
        let err = checkpoint_with_binary_and_timeout(
            &bin,
            dir.path(),
            std::time::Duration::from_secs(2),
        )
        .expect_err("a binary that never answers must time out");
        assert_eq!(err.code, "WAY_TIMEOUT");

        let pid: i32 = std::fs::read_to_string(&pid_file)
            .expect("the stub should have recorded its grandchild's pid")
            .trim()
            .parse()
            .expect("the recorded pid should be a number");

        // Reparenting to init takes a moment, so poll rather than sample once.
        let deadline = Instant::now() + Duration::from_secs(2);
        // SAFETY: signal 0 performs the permission/existence check only.
        while unsafe { libc::kill(pid, 0) } == 0 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            -1,
            "the grandchild process {pid} outlived the timeout"
        );
    }
}
