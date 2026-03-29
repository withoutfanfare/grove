//! Auto-updater commands with release channel support.
//!
//! Provides Tauri IPC commands for checking for updates and retrieving the
//! current app version. Release channel (stable/beta) is handled on the
//! frontend by selecting which endpoint URL to check against.

use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

/// Information about an available update, returned to the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
    pub date: Option<String>,
}

/// Check for an available update using the configured updater plugin.
///
/// Returns `Some(UpdateInfo)` if an update is available, or `None` if the
/// app is already on the latest version. The release channel is determined
/// by the endpoint URLs configured in tauri.conf.json — the frontend can
/// override via headers or by switching endpoints at runtime.
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateInfo {
            version: update.version.clone(),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => {
            let msg = e.to_string();
            // Network errors or unreachable endpoints are not fatal —
            // log and return None so the frontend treats it as "no update"
            log::warn!("[updater] Update check failed: {}", msg);
            Ok(None)
        }
    }
}

/// Return the current app version from tauri.conf.json.
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.config().version.clone().unwrap_or_else(|| "0.0.0".to_string())
}
