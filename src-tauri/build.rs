fn main() {
    use std::process::Command;
    let output = |program: &str, args: &[&str]| -> String {
        Command::new(program)
            .args(args)
            .output()
            .ok()
            .filter(|result| result.status.success())
            .map(|result| String::from_utf8_lossy(&result.stdout).trim().to_string())
            .unwrap_or_else(|| "unknown".into())
    };
    let revision = output("git", &["rev-parse", "HEAD"]);
    let dirty = Command::new("git")
        .args(["diff", "--quiet", "HEAD"])
        .status()
        .map(|status| !status.success())
        .unwrap_or(true);
    let revision = format!("{}{}", revision, if dirty { "-dirty" } else { "" });
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown".into());
    let sidecar = format!("binaries/grove-{}", target);
    let digest = output("shasum", &["-a", "256", &sidecar])
        .split_whitespace()
        .next()
        .unwrap_or("unknown")
        .to_string();
    let pin = std::fs::read_to_string("sidecar.lock.json")
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let cli_revision = pin
        .as_ref()
        .and_then(|pin| pin["revision"].as_str())
        .unwrap_or("unknown");
    let built_at = output("date", &["-u", "+%Y-%m-%dT%H:%M:%SZ"]);
    for (key, value) in [
        ("GROVE_APP_REVISION", revision.as_str()),
        ("GROVE_CLI_REVISION", cli_revision),
        ("GROVE_CLI_SHA256", digest.as_str()),
        ("GROVE_BUILD_TARGET", target.as_str()),
        ("GROVE_BUILT_AT", built_at.as_str()),
    ] {
        println!("cargo:rustc-env={key}={value}");
    }
    println!("cargo:rerun-if-changed=sidecar.lock.json");
    println!("cargo:rerun-if-changed={sidecar}");
    // Ask Git where its files live, so linked worktrees and any checked-out branch are watched.
    // Only existing paths: Cargo reruns on every build for a missing one.
    let head_ref = output("git", &["symbolic-ref", "-q", "HEAD"]);
    for name in ["HEAD", "logs/HEAD", "packed-refs", head_ref.as_str()] {
        let path = output("git", &["rev-parse", "--path-format=absolute", "--git-path", name]);
        if name != "unknown" && std::path::Path::new(&path).exists() {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    tauri_build::build()
}
