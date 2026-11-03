//! Owned Unix process groups, bounded non-blocking reads and finite cleanup.
use crate::types::{WtError, WtResult};
use std::{
    io::Read,
    process::{Command, Output, Stdio},
    time::{Duration, Instant},
};
#[cfg(unix)]
pub fn run(mut command: Command, timeout: Duration, limit: usize) -> WtResult<Output> {
    use std::os::unix::process::CommandExt;
    command
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| WtError::new("IO_ERROR", e.to_string()))?;
    let pid = child.id() as i32;
    let mut pipes: Vec<Box<dyn ReadFd>> = vec![
        Box::new(child.stdout.take().unwrap()),
        Box::new(child.stderr.take().unwrap()),
    ];
    let setup_failed = pipes.iter().any(|pipe| unsafe {
        let flags = libc::fcntl(pipe.fd(), libc::F_GETFL);
        flags < 0 || libc::fcntl(pipe.fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) < 0
    });
    let mut buffers = [Vec::new(), Vec::new()];
    let mut eof = [false; 2];
    let deadline = Instant::now() + timeout;
    let result = loop {
        if setup_failed {
            break Err(WtError::new(
                "IO_ERROR",
                "Could not configure bounded process reads",
            ));
        }
        if Instant::now() >= deadline {
            break Err(WtError::new("TIMEOUT", "Command timed out. The owned process group was stopped; detached hooks may still be running. Refresh observations before retrying"));
        }
        let mut failure = None;
        for i in 0..2 {
            let mut chunk = [0u8; 8192];
            match pipes[i].read(&mut chunk) {
                Ok(0) => eof[i] = true,
                Ok(n) => {
                    if buffers[0].len() + buffers[1].len() + n > limit {
                        failure = Some(WtError::new("OUTPUT_TOO_LARGE", "Command exceeded output limit. The owned process group was stopped; detached hooks may still be running. Refresh observations before retrying"));
                        break;
                    }
                    buffers[i].extend_from_slice(&chunk[..n]);
                }
                Err(e)
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::Interrupted =>
                {
                    ()
                }
                Err(e) => {
                    failure = Some(WtError::new("IO_ERROR", e.to_string()));
                    break;
                }
            }
        }
        if let Some(e) = failure {
            break Err(e);
        }
        // Keep the leader unreaped until pipes close, preventing process-group ID reuse.
        if eof.iter().all(|v| *v) {
            let mut info: libc::siginfo_t = unsafe { std::mem::zeroed() };
            let waited = unsafe {
                libc::waitid(
                    libc::P_PID,
                    pid as libc::id_t,
                    &mut info,
                    libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                )
            };
            if waited != 0 {
                break Err(WtError::new(
                    "IO_ERROR",
                    std::io::Error::last_os_error().to_string(),
                ));
            }
            #[cfg(target_os = "linux")]
            let exited = unsafe { info.si_pid() } != 0;
            #[cfg(not(target_os = "linux"))]
            let exited = info.si_pid != 0;
            if exited {
                // The unreaped leader reserves the process-group ID. Stop attached
                // background children even if they redirected their output pipes.
                let killed = unsafe { libc::kill(-pid, libc::SIGKILL) };
                if killed != 0
                    && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
                {
                    break Err(WtError::new("TERMINATION_UNCERTAIN", "Could not stop owned background processes; refresh observations before retrying"));
                }
                match child.wait() {
                    Ok(status) => {
                        break Ok(Output {
                            status,
                            stdout: std::mem::take(&mut buffers[0]),
                            stderr: std::mem::take(&mut buffers[1]),
                        })
                    }
                    Err(error) => break Err(WtError::new("IO_ERROR", error.to_string())),
                }
            }
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    if result.is_err() {
        let killed = unsafe { libc::kill(-pid, libc::SIGKILL) };
        if killed != 0 && std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH) {
            return Err(WtError::new("TERMINATION_UNCERTAIN", "Could not stop the owned process group; detached hooks may still run. Refresh observations before retrying"));
        }
        drop(pipes);
        let cleanup = Instant::now() + Duration::from_secs(1);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                _ if Instant::now() >= cleanup => {
                    return Err(WtError::new(
                        "TERMINATION_UNCERTAIN",
                        "Process cleanup deadline exceeded; refresh observations before retrying",
                    ))
                }
                _ => std::thread::sleep(Duration::from_millis(2)),
            }
        }
    }
    result
}
#[cfg(unix)]
trait ReadFd: Read {
    fn fd(&self) -> i32;
}
#[cfg(unix)]
impl<T: Read + std::os::fd::AsRawFd> ReadFd for T {
    fn fd(&self) -> i32 {
        self.as_raw_fd()
    }
}
#[cfg(not(unix))]
pub fn run(_: Command, _: Duration, _: usize) -> WtResult<Output> {
    Err(WtError::new(
        "UNSUPPORTED",
        "Owned process execution requires Unix",
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn successful_leader_does_not_leave_redirected_background_writer() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("late-success");
        let mut command = Command::new("/bin/sh");
        command
            .args([
                "-c",
                "(sleep 0.3; echo late > \"$1\") >/dev/null 2>&1 & exit 0",
                "sh",
            ])
            .arg(&marker);
        assert!(run(command, Duration::from_secs(2), 10000)
            .unwrap()
            .status
            .success());
        std::thread::sleep(Duration::from_millis(400));
        assert!(!marker.exists());
    }
    #[test]
    fn overflow_stops_descendant_and_preserves_unrelated_process() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("late");
        let mut unrelated = Command::new("/bin/sleep").arg("2").spawn().unwrap();
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "(sleep 0.3; echo late > \"$1\") & while :; do printf abcdefghijklmnopqrstuvwxyz >&2; done", "sh"]).arg(&marker);
        assert_eq!(
            run(c, Duration::from_secs(2), 10000).unwrap_err().code,
            "OUTPUT_TOO_LARGE"
        );
        std::thread::sleep(Duration::from_millis(400));
        assert!(!marker.exists());
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.kill().unwrap();
        unrelated.wait().unwrap();
    }
    #[test]
    fn bounded_long_line() {
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "while :; do printf abcdefghijklmnopqrstuvwxyz; done"]);
        assert_eq!(
            run(c, Duration::from_secs(2), 10000).unwrap_err().code,
            "OUTPUT_TOO_LARGE"
        );
    }
    #[test]
    fn descendant_pipe_timeout_prevents_delayed_write() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("late");
        let mut c = Command::new("/bin/sh");
        c.args(["-c", "(sleep 0.3; echo late > \"$1\") & exit 0", "sh"])
            .arg(&marker);
        assert_eq!(
            run(c, Duration::from_millis(40), 10000).unwrap_err().code,
            "TIMEOUT"
        );
        std::thread::sleep(Duration::from_millis(400));
        assert!(!marker.exists());
    }
}
