//! Container dashboard: a thin, opinionated wrapper around `docker ps`.
//!
//! We shell out to the CLI rather than speak the Docker socket directly so
//! the same code works with Docker Desktop, Colima, Podman, and nerdctl.
//!
//! Detection order: docker > podman > nerdctl. Whichever answers
//! `<bin> --version` first wins.

use anyhow::{anyhow, Result};
use serde::Serialize;
use serde_json::Value as Json;
use std::process::Command;

type CmdResult<T> = Result<T, String>;

/// Returns the path of the first container engine found on PATH, or None.
fn engine_bin() -> Option<&'static str> {
    for bin in ["docker", "podman", "nerdctl"] {
        if Command::new(bin).arg("--version").output().is_ok() {
            return Some(bin);
        }
    }
    None
}

fn engine_version(bin: &str) -> String {
    Command::new(bin)
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
        .unwrap_or_else(|| bin.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub available: bool,
    pub bin: Option<String>,
    pub version: Option<String>,
    /// True when the CLI exists but `docker ps` fails — usually means the
    /// daemon isn't running.
    pub daemon_ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn container_engine() -> CmdResult<EngineInfo> {
    let Some(bin) = engine_bin() else {
        return Ok(EngineInfo {
            available: false,
            bin: None,
            version: None,
            daemon_ok: false,
            error: None,
        });
    };

    let version = engine_version(bin);

    // Cheap daemon check: `docker info` will fail if the daemon is down.
    let info = Command::new(bin).arg("info").output();
    match info {
        Ok(o) if o.status.success() => Ok(EngineInfo {
            available: true,
            bin: Some(bin.to_string()),
            version: Some(version),
            daemon_ok: true,
            error: None,
        }),
        Ok(o) => Ok(EngineInfo {
            available: true,
            bin: Some(bin.to_string()),
            version: Some(version),
            daemon_ok: false,
            error: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        }),
        Err(e) => Ok(EngineInfo {
            available: true,
            bin: Some(bin.to_string()),
            version: Some(version),
            daemon_ok: false,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerRow {
    pub id: String,
    pub short_id: String,
    pub name: String,
    pub image: String,
    /// `running`, `exited`, `paused`, `created`, `restarting`, ...
    pub state: String,
    /// Human-readable status line, e.g. "Up 3 hours" or "Exited (0) 2 days ago".
    pub status: String,
    pub ports: String,
    /// RFC3339 from the engine, e.g. "2026-09-21 18:12:04 +0000 UTC".
    pub created_at: String,
    pub labels: Vec<String>,
}

fn parse_container(line: &str) -> Option<ContainerRow> {
    let v: Json = serde_json::from_str(line).ok()?;
    let id = v.get("ID").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let short_id = id.chars().take(12).collect::<String>();
    let name = v
        .get("Names")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim_start_matches('/')
        .to_string();
    let image = v.get("Image").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let state = v.get("State").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let status = v.get("Status").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let ports = v.get("Ports").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let created_at = v.get("CreatedAt").and_then(|x| x.as_str()).unwrap_or("").to_string();

    // Labels come back as a comma-separated string from `docker ps`.
    let labels: Vec<String> = v
        .get("Labels")
        .and_then(|x| x.as_str())
        .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
        .unwrap_or_default();

    Some(ContainerRow { id, short_id, name, image, state, status, ports, created_at, labels })
}

/// List containers. `all = true` includes stopped ones.
#[tauri::command]
pub fn container_list(all: Option<bool>) -> CmdResult<Vec<ContainerRow>> {
    let Some(bin) = engine_bin() else {
        return Err("No container engine found (docker/podman/nerdctl).".into());
    };
    let show_all = all.unwrap_or(true);
    let mut args: Vec<&str> = vec!["ps", "--no-trunc", "--format", "{{json .}}"];
    if show_all {
        args.push("--all");
    }

    let out = Command::new(bin)
        .args(&args)
        .output()
        .map_err(|e| format!("failed to spawn {bin}: {e}"))?;

    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    let raw = String::from_utf8_lossy(&out.stdout);
    let mut rows = Vec::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if let Some(c) = parse_container(line) {
            rows.push(c);
        }
    }
    Ok(rows)
}

/// start | stop | restart. Returns the engine's stdout summary.
#[tauri::command]
pub fn container_action(id: String, action: String) -> CmdResult<String> {
    let Some(bin) = engine_bin() else {
        return Err("No container engine found.".into());
    };
    let verb = match action.as_str() {
        "start" | "stop" | "restart" => action.as_str(),
        other => return Err(format!("unsupported action: {other}")),
    };
    let out = Command::new(bin)
        .arg(verb)
        .arg(&id)
        .output()
        .map_err(|e| format!("failed to spawn {bin}: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if !out.status.success() {
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }
    Ok(stdout)
}

/// Recent log lines from a container. Combined stdout + stderr, cap default 200.
#[tauri::command]
pub fn container_logs(id: String, tail: Option<u32>) -> CmdResult<String> {
    let Some(bin) = engine_bin() else {
        return Err("No container engine found.".into());
    };
    let n = tail.unwrap_or(200).clamp(1, 5000).to_string();
    let out = Command::new(bin)
        .args(["logs", "--tail", &n, "--timestamps", &id])
        .output()
        .map_err(|e| format!("failed to spawn {bin}: {e}"))?;

    // `docker logs` writes both streams; combine for display.
    let mut combined = String::from_utf8_lossy(&out.stdout).to_string();
    let err = String::from_utf8_lossy(&out.stderr);
    if !err.is_empty() {
        if !combined.is_empty() && !combined.ends_with('\n') {
            combined.push('\n');
        }
        combined.push_str(&err);
    }

    if !out.status.success() && combined.trim().is_empty() {
        return Err(anyhow!("docker logs failed").to_string());
    }
    Ok(combined)
}
