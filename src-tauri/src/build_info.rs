//! Identity of the executable and exact bundled CLI bytes.
use crate::types::WtError;
use serde::Serialize;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    app_version: &'static str,
    app_revision: &'static str,
    cli_revision: &'static str,
    cli_sha256: String,
    compatibility: &'static str,
    built_at: &'static str,
    target: &'static str,
    protocol: &'static str,
}

#[tauri::command]
pub async fn get_build_info(app: tauri::AppHandle) -> Result<BuildInfo, WtError> {
    tauri::async_runtime::spawn_blocking(move || {
        let sidecar: std::process::Command = app
            .shell()
            .sidecar("grove")
            .map_err(|e| WtError::new("SIDECAR_ERROR", e.to_string()))?
            .into();
        let mut hash = std::process::Command::new("/usr/bin/shasum");
        hash.args(["-a", "256"]).arg(sidecar.get_program());
        let output = crate::process_runner::run(hash, std::time::Duration::from_secs(5), 4096)?;
        let digest = String::from_utf8_lossy(&output.stdout)
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_owned();
        if !output.status.success()
            || digest.len() != 64
            || !digest.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(WtError::new(
                "PROVENANCE_UNAVAILABLE",
                "Could not verify the installed CLI bytes",
            ));
        }
        let matches = digest == env!("GROVE_CLI_SHA256");
        Ok(BuildInfo {
            app_version: env!("CARGO_PKG_VERSION"),
            app_revision: env!("GROVE_APP_REVISION"),
            cli_revision: if matches {
                env!("GROVE_CLI_REVISION")
            } else {
                "unknown"
            },
            cli_sha256: digest,
            compatibility: if matches {
                "Matches the tested bundled input"
            } else {
                "CLI bytes differ from the tested input"
            },
            built_at: env!("GROVE_BUILT_AT"),
            target: env!("GROVE_BUILD_TARGET"),
            protocol: "grove-json-v1+trust-v1",
        })
    })
    .await
    .map_err(|e| WtError::new("SPAWN_ERROR", e.to_string()))?
}
