//! Owned Unix process groups, bounded non-blocking reads and finite cleanup.
use crate::types::{WtError, WtResult};
use std::{
    io::Read,
    process::{Command, Output, Stdio},
    time::{Duration, Instant},
};
#[cfg(unix)]
fn stop_owned_group(pid: i32) -> bool {
    if unsafe { libc::kill(-pid, libc::SIGKILL) } == 0 {
        return true;
    }
    let error = std::io::Error::last_os_error().raw_os_error();
    if error == Some(libc::ESRCH) {
        return true;
    }
    // Darwin excludes zombies from group signalling, then returns EPERM when
    // none remain eligible. Inspect the group before accepting that result:
    // a real permission failure against a live member must still fail closed.
    #[cfg(target_os = "macos")]
    if error == Some(libc::EPERM) {
        return group_contains_only_zombies(pid);
    }
    false
}
#[cfg(target_os = "macos")]
fn group_contains_only_zombies(pid: i32) -> bool {
    const PROC_PGRP_ONLY: u32 = 2;
    let size = unsafe { libc::proc_listpids(PROC_PGRP_ONLY, pid as u32, std::ptr::null_mut(), 0) };
    if size <= 0 {
        return false;
    }
    let mut members = vec![0i32; size as usize / std::mem::size_of::<i32>()];
    let read = unsafe {
        libc::proc_listpids(
            PROC_PGRP_ONLY,
            pid as u32,
            members.as_mut_ptr().cast(),
            size,
        )
    };
    if read <= 0 || read >= size || read as usize % std::mem::size_of::<i32>() != 0 {
        return false;
    }
    members.truncate(read as usize / std::mem::size_of::<i32>());
    members.into_iter().all(|member| {
        let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as i32;
        let read = unsafe {
            libc::proc_pidinfo(
                member,
                libc::PROC_PIDTBSDINFO,
                0,
                (&mut info as *mut libc::proc_bsdinfo).cast(),
                size,
            )
        };
        if read != size {
            // A member may disappear between the group snapshot and inspection.
            return read <= 0
                && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH);
        }
        info.pbi_pgid != pid as u32 || info.pbi_status == libc::SZOMB
    })
}
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
    let mut exited_at: Option<Instant> = None;
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
        // WNOWAIT keeps the leader unreaped, preventing process-group ID reuse.
        {
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
            // A background child can hold the pipes open for ever, so a finished
            // command only gets a short grace period to deliver its last output.
            if exited
                && (eof.iter().all(|v| *v)
                    || exited_at.get_or_insert_with(Instant::now).elapsed() >= Duration::from_millis(200))
            {
                // The unreaped leader reserves the process-group ID. Stop attached
                // background children even if they redirected their output pipes.
                if !stop_owned_group(pid) {
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
        if !stop_owned_group(pid) {
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
    #[cfg(target_os = "macos")]
    #[test]
    fn zombie_group_check_rejects_live_members() {
        use std::os::unix::process::CommandExt;
        let mut child = Command::new("/bin/sleep")
            .arg("2")
            .process_group(0)
            .spawn()
            .unwrap();
        let only_zombies = group_contains_only_zombies(child.id() as i32);
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(!only_zombies);
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn zombie_group_check_rejects_missing_group() {
        assert!(!group_contains_only_zombies(i32::MAX));
    }
    #[test]
    fn successful_command_without_descendants_preserves_output() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "printf 'fixture version 1.0\\n'"]);
        let output = run(command, Duration::from_secs(2), 4096).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"fixture version 1.0\n");
        assert!(output.stderr.is_empty());
    }
    #[test]
    fn failed_command_preserves_exit_code_and_stderr() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "printf 'fixture failure\\n' >&2; exit 7"]);
        let output = run(command, Duration::from_secs(2), 4096).unwrap();
        assert_eq!(output.status.code(), Some(7));
        assert_eq!(output.stderr, b"fixture failure\n");
        assert!(output.stdout.is_empty());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn zsh_sidecar_fixture_runs_with_gui_path() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let script = dir.path().join("fixture-sidecar");
        std::fs::write(
            &script,
            "#!/usr/bin/env zsh\nset -euo pipefail\nreadonly fixture_os=\"$(uname -s)\"\nreadonly fixture_uid=\"$(id -u)\"\nprint -r -- 'fixture version 1.0'\n",
        ).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let mut command = Command::new(&script);
        command
            .env_clear()
            .env("HOME", dir.path())
            .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin")
            .arg("--version");
        let output = run(command, Duration::from_secs(2), 4096).unwrap();
        assert!(output.status.success());
        assert_eq!(output.stdout, b"fixture version 1.0\n");
        assert!(output.stderr.is_empty());
    }
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
    fn finished_command_does_not_wait_for_a_background_child_holding_its_pipes() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "printf done; sleep 5 & exit 0"]);
        let started = Instant::now();
        let output = run(command, Duration::from_secs(4), 4096).unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(output.status.success());
        assert_eq!(output.stdout, b"done");
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
