//! Auto-updater commands.
//!
//! Provides Tauri IPC commands for checking for updates and retrieving the
//! current app version.

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
/// app is already on the latest version.
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
            // A failed check must remain distinct from a successful no-update result.
            log::warn!("[updater] Update check failed: {}", msg);
            Err(msg)
        }
    }
}

/// Return the current app version from tauri.conf.json.
#[tauri::command]
pub fn get_app_version(app: tauri::AppHandle) -> String {
    app.config().version.clone().unwrap_or_else(|| "Unknown".to_string())
}
