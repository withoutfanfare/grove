//! Read-only authoritative previews and execution of their exact confirmed scope.
use crate::{types::WtError, wt};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex};

lazy_static::lazy_static! {
    static ref PLANS: Mutex<HashMap<String, Value>> = Mutex::new(HashMap::new());
}

fn data(output: &str) -> Result<Value, WtError> {
    let envelope: Value =
        serde_json::from_str(output).map_err(|e| WtError::new("PARSE_ERROR", e.to_string()))?;
    envelope
        .get("data")
        .cloned()
        .ok_or_else(|| WtError::new("PARSE_ERROR", "CLI returned no preview data"))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_prune_plan(repo_name: String, app: tauri::AppHandle) -> Result<Value, WtError> {
    tauri::async_runtime::spawn_blocking(move || {
        wt::validate_repo_name(&repo_name)?;
        let plan = data(&wt::execute_wt(
            &app,
            &["prune-plan", &repo_name, "--json"],
        )?)?;
        let id = uuid::Uuid::new_v4().to_string();
        let mut display = plan.clone();
        display["base"] = plan["base_ref"].clone();
        display["branches"] = plan["targets"].clone();
        display["plan_id"] = json!(id);
        let mut plans = PLANS
            .lock()
            .map_err(|_| WtError::new("INTERNAL_ERROR", "Preview store unavailable"))?;
        if plans.len() >= 50 {
            let oldest = plans
                .iter()
                .min_by_key(|(_, plan)| plan["checked_at"].as_str().unwrap_or(""))
                .map(|(id, _)| id.clone());
            if let Some(oldest) = oldest {
                plans.remove(&oldest);
            }
        }
        plans.insert(id, plan);
        Ok(display)
    })
    .await
    .map_err(|e| WtError::new("SPAWN_ERROR", e.to_string()))?
}

fn select_confirmed(plan: &mut Value, repo: &str, branches: &[String]) -> Result<(), WtError> {
    if plan["repo"].as_str() != Some(repo) {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Preview belongs to a different repository",
        ));
    }
    let targets = plan["targets"]
        .as_array_mut()
        .ok_or_else(|| WtError::new("PARSE_ERROR", "Preview has no branch targets"))?;
    if branches.iter().any(|branch| {
        !targets
            .iter()
            .any(|target| target["name"].as_str() == Some(branch.as_str()))
    }) {
        return Err(WtError::new(
            "INVALID_INPUT",
            "Requested branch was not in the confirmed preview",
        ));
    }
    targets.retain(|target| {
        branches
            .iter()
            .any(|branch| target["name"].as_str() == Some(branch.as_str()))
    });
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn prune_repo_confirmed(
    repo_name: String,
    branches: Vec<String>,
    plan_id: String,
    app: tauri::AppHandle,
) -> Result<Value, WtError> {
    tauri::async_runtime::spawn_blocking(move || {
        wt::validate_repo_name(&repo_name)?;
        let mut plan = PLANS
            .lock()
            .map_err(|_| WtError::new("INTERNAL_ERROR", "Preview store unavailable"))?
            .remove(&plan_id)
            .ok_or_else(|| {
                WtError::new(
                    "PREVIEW_EXPIRED",
                    "Preview expired or was used; preview again",
                )
            })?;
        select_confirmed(&mut plan, &repo_name, &branches)?;
        let temporary =
            std::env::temp_dir().join(format!("grove-prune-{}.json", uuid::Uuid::new_v4()));
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_file(&self.0);
            }
        }
        let _cleanup = Cleanup(temporary.clone());
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| WtError::new("IO_ERROR", e.to_string()))?;
        file.write_all(
            serde_json::to_vec(&plan)
                .map_err(|e| WtError::new("PARSE_ERROR", e.to_string()))?
                .as_slice(),
        )
        .map_err(|e| WtError::new("IO_ERROR", e.to_string()))?;
        data(&wt::execute_wt(
            &app,
            &[
                "prune-execute",
                &repo_name,
                temporary
                    .to_str()
                    .ok_or_else(|| WtError::new("INVALID_PATH", "Preview path is not UTF-8"))?,
                "--json",
            ],
        )?)
    })
    .await
    .map_err(|e| WtError::new("SPAWN_ERROR", e.to_string()))?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_removal_preflight(
    repo_name: String,
    branch: String,
    delete_branch: bool,
    drop_db: bool,
    allow_protected: Option<bool>,
    app: tauri::AppHandle,
) -> Result<Value, WtError> {
    tauri::async_runtime::spawn_blocking(move || {
        wt::validate_repo_name(&repo_name)?;
        let target = wt::removal_target_arg(&branch)?;
        let mut args = vec!["removal-check", &repo_name, &target, "--json"];
        if delete_branch {
            args.push("--delete-branch");
        }
        if drop_db {
            args.push("--drop-db");
        }
        if allow_protected.unwrap_or(false) {
            args.push("--allow-protected");
        }
        data(&wt::execute_wt(&app, &args)?)
    })
    .await
    .map_err(|e| WtError::new("SPAWN_ERROR", e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selection_cannot_expand_or_change_repository() {
        let original = json!({"repo":"fixture","targets":[{"name":"one","sha":"abc"},{"name":"two","sha":"def"}]});
        let mut plan = original.clone();
        assert!(select_confirmed(&mut plan, "other", &["one".into()]).is_err());
        assert!(select_confirmed(&mut plan, "fixture", &["unseen".into()]).is_err());
        select_confirmed(&mut plan, "fixture", &["two".into()]).unwrap();
        assert_eq!(plan["targets"], json!([{"name":"two","sha":"def"}]));
    }
}
