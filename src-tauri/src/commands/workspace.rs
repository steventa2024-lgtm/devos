//! Workspace domain commands: projects, services, logs, env, snippets,
//! history, preferences, dashboard layout, git and guarded shell execution.

use crate::models::*;
use crate::AppState;
use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use std::process::Command;
use tauri::State;
use uuid::Uuid;

type CmdResult<T> = Result<T, String>;

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn map<T>(r: Result<T>) -> CmdResult<T> {
    r.map_err(|e| e.to_string())
}

fn parse_json(raw: String) -> serde_json::Value {
    serde_json::from_str(&raw).unwrap_or(json!({}))
}

fn parse_tags(raw: String) -> Vec<String> {
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Record a security-relevant action in the local audit trail.
fn audit(db: &crate::db::Db, action: &str, detail: &str) {
    let _ = db.with(|c| {
        c.execute(
            "INSERT INTO audit_log (action, detail, at) VALUES (?1, ?2, ?3)",
            params![action, detail, now()],
        )?;
        Ok(())
    });
}

// ---------------------------------------------------------------- projects

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> CmdResult<Vec<Project>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, name, path, kind, color, tags, favorite, last_opened_at, created_at
             FROM projects ORDER BY favorite DESC, COALESCE(last_opened_at, created_at) DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Project {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    path: r.get(2)?,
                    kind: r.get(3)?,
                    color: r.get(4)?,
                    tags: parse_tags(r.get::<_, String>(5)?),
                    favorite: r.get::<_, i64>(6)? != 0,
                    last_opened_at: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn upsert_project(state: State<'_, AppState>, project: Project) -> CmdResult<Project> {
    let id = if project.id.is_empty() { Uuid::new_v4().to_string() } else { project.id.clone() };
    let tags = serde_json::to_string(&project.tags).unwrap_or_else(|_| "[]".into());
    let created = if project.created_at.is_empty() { now() } else { project.created_at.clone() };

    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO projects (id, name, path, kind, color, tags, favorite, last_opened_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, path = excluded.path, kind = excluded.kind,
               color = excluded.color, tags = excluded.tags, favorite = excluded.favorite",
            params![
                id, project.name, project.path, project.kind, project.color,
                tags, project.favorite as i64, project.last_opened_at, created,
            ],
        )?;
        Ok(Project { id, created_at: created, ..project })
    }))
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    audit(&state.db, "project.delete", &id);
    map(state.db.with(|c| {
        c.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

// ---------------------------------------------------------------- services

#[tauri::command]
pub fn list_services(state: State<'_, AppState>) -> CmdResult<Vec<Service>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, name, kind, target, url, health, autostart, meta, updated_at
             FROM services ORDER BY name COLLATE NOCASE",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Service {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: r.get(2)?,
                    target: r.get(3)?,
                    url: r.get(4)?,
                    health: r.get(5)?,
                    autostart: r.get::<_, i64>(6)? != 0,
                    meta: parse_json(r.get(7)?),
                    updated_at: r.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn upsert_service(state: State<'_, AppState>, service: Service) -> CmdResult<Service> {
    let id = if service.id.is_empty() { Uuid::new_v4().to_string() } else { service.id.clone() };
    let meta = serde_json::to_string(&service.meta).unwrap_or_else(|_| "{}".into());
    let updated = now();

    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO services (id, name, kind, target, url, health, autostart, meta, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, kind = excluded.kind, target = excluded.target,
               url = excluded.url, health = excluded.health, autostart = excluded.autostart,
               meta = excluded.meta, updated_at = excluded.updated_at",
            params![
                id, service.name, service.kind, service.target, service.url,
                service.health, service.autostart as i64, meta, updated,
            ],
        )?;
        Ok(Service { id, updated_at: updated, ..service })
    }))
}

#[tauri::command]
pub fn delete_service(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    audit(&state.db, "service.delete", &id);
    map(state.db.with(|c| {
        c.execute("DELETE FROM services WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

/// Perform an HTTP GET against a service URL with a short timeout and
/// persist the outcome to the `health` column.
///
/// Rules:
///   - no URL                       -> "unknown"
///   - 2xx / 3xx                    -> "healthy"
///   - 4xx / 5xx                    -> "degraded"
///   - refused / timeout / DNS fail -> "down"
#[tauri::command]
pub async fn probe_service(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<String> {
    // Read the URL first with a short-lived lock so we don't hold the DB
    // while the probe runs.
    let url: Option<String> = map(state.db.with(|c| {
        Ok(c.query_row(
            "SELECT url FROM services WHERE id = ?1",
            params![id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
    }))?;

    let health = match url {
        None => "unknown".to_string(),
        Some(ref u) if u.trim().is_empty() => "unknown".to_string(),
        Some(u) => {
            tauri::async_runtime::spawn_blocking(move || http_probe(&u))
                .await
                .map_err(|e| e.to_string())?
        }
    };

    let h = health.clone();
    map(state.db.with(|c| {
        c.execute(
            "UPDATE services SET health = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, h, now()],
        )?;
        Ok(())
    }))?;

    // Auto-log the probe outcome.
    let level = match health.as_str() {
        "healthy" => "info",
        "degraded" => "warn",
        "down" => "error",
        _ => "debug",
    };
    let _ = state.db.with(|c| {
        c.execute(
            "INSERT INTO logs (source, level, message, meta, at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "probe",
                level,
                format!("service {id} -> {}", health),
                "{}",
                now(),
            ],
        )?;
        Ok(())
    }); // probe.run_logged

    Ok(health)
}

/// Blocking HTTP probe. Raw TCP + minimal HTTP/1.1 request. No HTTP client
/// crate — the connect timeout alone catches dead services cleanly.
fn http_probe(url: &str) -> String {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration;

    let (scheme, rest) = match url.split_once("://") {
        Some((s, r)) => (s.to_ascii_lowercase(), r),
        None => ("http".to_string(), url),
    };

    let (host_port, path) = match rest.split_once('/') {
        Some((hp, p)) => (hp.to_string(), format!("/{p}")),
        None => (rest.to_string(), "/".to_string()),
    };

    let (host, port, https) = if let Some((h, p)) = host_port.rsplit_once(':') {
        let port: u16 = p.parse().unwrap_or(if scheme == "https" { 443 } else { 80 });
        (h.to_string(), port, scheme == "https")
    } else {
        let port = if scheme == "https" { 443 } else { 80 };
        (host_port.clone(), port, scheme == "https")
    };

    let addr = match (host.as_str(), port).to_socket_addrs() {
        Ok(mut it) => match it.next() {
            Some(a) => a,
            None => return "down".to_string(),
        },
        Err(_) => return "down".to_string(),
    };

    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(1500)) {
        Ok(s) => s,
        Err(_) => return "down".to_string(),
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));

    // HTTPS: we do not complete the TLS handshake in this phase. If the
    // port is open, report healthy. Phase 3 upgrades this to full HTTP.
    if https {
        return "healthy".to_string();
    }

    let req = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: DevOS/0.1\r\nAccept: */*\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return "down".to_string();
    }

    let mut buf = [0u8; 1024];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return "down".to_string(),
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    let code = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok());

    match code {
        Some(c) if (200..400).contains(&c) => "healthy".to_string(),
        Some(_) => "degraded".to_string(),
        None => "degraded".to_string(),
    }
}



#[tauri::command]
pub fn set_service_health(
    state: State<'_, AppState>,
    id: String,
    health: String,
) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute(
            "UPDATE services SET health = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, health, now()],
        )?;
        Ok(())
    }))
}

// -------------------------------------------------------------------- logs

#[tauri::command]
pub fn list_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
    level: Option<String>,
    source: Option<String>,
) -> CmdResult<Vec<LogEntry>> {
    let limit = limit.unwrap_or(200).clamp(1, 5000);
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, source, level, message, meta, at FROM logs
             WHERE (?1 IS NULL OR level = ?1)
               AND (?2 IS NULL OR source = ?2)
             ORDER BY id DESC LIMIT ?3",
        )?;
        let rows = stmt
            .query_map(params![level, source, limit], |r| {
                Ok(LogEntry {
                    id: r.get(0)?,
                    source: r.get(1)?,
                    level: r.get(2)?,
                    message: r.get(3)?,
                    meta: parse_json(r.get(4)?),
                    at: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn append_log(
    state: State<'_, AppState>,
    source: String,
    level: String,
    message: String,
    meta: Option<serde_json::Value>,
) -> CmdResult<()> {
    let meta = serde_json::to_string(&meta.unwrap_or_else(|| json!({}))).unwrap();
    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO logs (source, level, message, meta, at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![source, level, message, meta, now()],
        )?;
        Ok(())
    }))
}

#[tauri::command]
pub fn clear_logs(state: State<'_, AppState>) -> CmdResult<()> {
    audit(&state.db, "logs.clear", "all");
    map(state.db.with(|c| {
        c.execute("DELETE FROM logs", [])?;
        Ok(())
    }))
}

/// Distinct `source` values from the logs table, for the UI filter.
#[tauri::command]
pub fn log_sources(state: State<'_, AppState>) -> CmdResult<Vec<String>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare("SELECT DISTINCT source FROM logs ORDER BY source COLLATE NOCASE")?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

// --------------------------------------------------------------- env vault

#[tauri::command]
pub fn list_env_profiles(state: State<'_, AppState>) -> CmdResult<Vec<EnvProfile>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, project_id, name, is_active, created_at FROM env_profiles
             ORDER BY is_active DESC, name COLLATE NOCASE",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(EnvProfile {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    name: r.get(2)?,
                    is_active: r.get::<_, i64>(3)? != 0,
                    created_at: r.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn upsert_env_profile(
    state: State<'_, AppState>,
    profile: EnvProfile,
) -> CmdResult<EnvProfile> {
    let id = if profile.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        profile.id.clone()
    };
    let created = if profile.created_at.is_empty() {
        now()
    } else {
        profile.created_at.clone()
    };
    map(state.db.with(|c| {
        if profile.is_active {
            c.execute("UPDATE env_profiles SET is_active = 0", [])?;
        }
        c.execute(
            "INSERT INTO env_profiles (id, project_id, name, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
               project_id = excluded.project_id,
               name = excluded.name,
               is_active = excluded.is_active",
            params![
                id,
                profile.project_id,
                profile.name,
                profile.is_active as i64,
                created,
            ],
        )?;
        Ok(EnvProfile {
            id,
            created_at: created,
            ..profile
        })
    }))
}

#[tauri::command]
pub fn delete_env_profile(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    audit(&state.db, "env.profile.delete", &id);
    map(state.db.with(|c| {
        // ON DELETE CASCADE removes the profile's env_vars.
        c.execute("DELETE FROM env_profiles WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

#[tauri::command]
pub fn list_env_vars(state: State<'_, AppState>, profile_id: String) -> CmdResult<Vec<EnvVar>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, profile_id, key, value, secret FROM env_vars WHERE profile_id = ?1 ORDER BY key",
        )?;
        let rows = stmt
            .query_map(params![profile_id], |r| {
                let secret = r.get::<_, i64>(4)? != 0;
                let stored: String = r.get(3)?;
                let key: String = r.get(2)?;
                let value = if secret {
                    format!("{key}=••••••••")
                } else {
                    stored
                };
                Ok(EnvVar {
                    id: r.get(0)?,
                    profile_id: r.get(1)?,
                    key,
                    value,
                    secret,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn upsert_env_var(
    state: State<'_, AppState>,
    var: EnvVar,
) -> CmdResult<EnvVar> {
    let id = if var.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        var.id.clone()
    };

    let stored_value = if var.secret {
        state.vault.encrypt(&var.value).map_err(|e| e.to_string())?
    } else {
        var.value.clone()
    };

    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO env_vars (id, profile_id, key, value, secret)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(profile_id, key) DO UPDATE SET
               value = excluded.value, secret = excluded.secret",
            params![id, var.profile_id, var.key, stored_value, var.secret as i64],
        )?;
        Ok(var)
    }))
}

/// Update only the key and secret flag of an existing variable. The value
/// column is left intact — used when the user edits a secret without
/// typing a new plaintext value.
#[tauri::command]
pub fn update_env_var_meta(
    state: State<'_, AppState>,
    id: String,
    key: String,
    secret: bool,
) -> CmdResult<()> {
    audit(&state.db, "env.update_meta", &id);
    map(state.db.with(|c| {
        c.execute(
            "UPDATE env_vars SET key = ?2, secret = ?3 WHERE id = ?1",
            params![id, key, secret as i64],
        )?;
        Ok(())
    }))
}

#[tauri::command]
pub fn delete_env_var(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    audit(&state.db, "env.delete", &id);
    map(state.db.with(|c| {
        c.execute("DELETE FROM env_vars WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

#[tauri::command]
pub fn reveal_env_var(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    let blob: Option<String> = map(state.db.with(|c| {
        Ok(c.query_row(
            "SELECT value FROM env_vars WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?)
    }))?;

    let blob = blob.ok_or_else(|| "env var not found".to_string())?;
    audit(&state.db, "env.reveal", &id);
    state.vault.decrypt(&blob).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- snippets

#[tauri::command]
pub fn list_snippets(state: State<'_, AppState>) -> CmdResult<Vec<Snippet>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, name, description, language, body, tags, run_count, last_run_at, created_at
             FROM snippets ORDER BY COALESCE(last_run_at, created_at) DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Snippet {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    language: r.get(3)?,
                    body: r.get(4)?,
                    tags: parse_tags(r.get(5)?),
                    run_count: r.get(6)?,
                    last_run_at: r.get(7)?,
                    created_at: r.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn upsert_snippet(state: State<'_, AppState>, snippet: Snippet) -> CmdResult<Snippet> {
    let id = if snippet.id.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        snippet.id.clone()
    };
    let tags = serde_json::to_string(&snippet.tags).unwrap_or_else(|_| "[]".into());
    let created = if snippet.created_at.is_empty() {
        now()
    } else {
        snippet.created_at.clone()
    };

    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO snippets (id, name, description, language, body, tags, run_count, last_run_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, description = excluded.description,
               language = excluded.language, body = excluded.body, tags = excluded.tags",
            params![
                id,
                snippet.name,
                snippet.description,
                snippet.language,
                snippet.body,
                tags,
                snippet.run_count,
                snippet.last_run_at,
                created,
            ],
        )?;
        Ok(Snippet { id, created_at: created, ..snippet })
    }))
}

#[tauri::command]
pub fn delete_snippet(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    audit(&state.db, "snippet.delete", &id);
    map(state.db.with(|c| {
        c.execute("DELETE FROM snippets WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

#[tauri::command]
pub fn run_snippet(
    state: State<'_, AppState>,
    id: String,
    cwd: Option<String>,
) -> CmdResult<CommandResult> {
    let body: Option<String> = map(state.db.with(|c| {
        Ok(c.query_row("SELECT body FROM snippets WHERE id = ?1", params![id], |r| r.get(0))
            .optional()?)
    }))?;
    let body = body.ok_or_else(|| "snippet not found".to_string())?;

    audit(&state.db, "snippet.run", &id);
    let result = execute_shell(body, cwd)?;

    // Auto-log: record the run so the Logs view reflects it.
    // `snippet.run_logged` marker ensures we don't double-insert on accident.
    let level = if result.exit_code == Some(0) { "info" } else { "warn" };
    let preview: String = result
        .stdout
        .lines()
        .chain(result.stderr.lines())
        .next()
        .unwrap_or("")
        .chars()
        .take(180)
        .collect();
    let _ = state.db.with(|c| {
        c.execute(
            "INSERT INTO logs (source, level, message, meta, at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                "snippet",
                level,
                format!("ran snippet `{}` (exit {}) — {}", id, result.exit_code.unwrap_or(-1), preview),
                "{}",
                now(),
            ],
        )?;
        Ok(())
    }); // snippet.run_logged

    let _ = state.db.with(|c| {
        c.execute(
            "UPDATE snippets SET run_count = run_count + 1, last_run_at = ?2 WHERE id = ?1",
            params![id, now()],
        )?;
        Ok(())
    });

    Ok(result)
}

// --------------------------------------------------------------- history

#[tauri::command]
pub fn list_terminal_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CmdResult<Vec<HistoryEntry>> {
    let limit = limit.unwrap_or(50).clamp(1, 1000);
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, project_id, command, cwd, exit_code, duration_ms, ran_at
             FROM terminal_history ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(HistoryEntry {
                    id: r.get(0)?,
                    project_id: r.get(1)?,
                    command: r.get(2)?,
                    cwd: r.get(3)?,
                    exit_code: r.get(4)?,
                    duration_ms: r.get(5)?,
                    ran_at: r.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn append_terminal_history(
    state: State<'_, AppState>,
    project_id: Option<String>,
    command: String,
    cwd: Option<String>,
    exit_code: Option<i64>,
    duration_ms: Option<i64>,
) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO terminal_history (project_id, command, cwd, exit_code, duration_ms, ran_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![project_id, command, cwd, exit_code, duration_ms, now()],
        )?;
        Ok(())
    }))
}

#[tauri::command]
pub fn clear_terminal_history(state: State<'_, AppState>) -> CmdResult<()> {
    audit(&state.db, "history.clear", "all");
    map(state.db.with(|c| {
        c.execute("DELETE FROM terminal_history", [])?;
        Ok(())
    }))
}

// ----------------------------------------------------------- preferences

#[tauri::command]
pub fn get_preference(state: State<'_, AppState>, key: String) -> CmdResult<Option<String>> {
    map(state.db.with(|c| {
        Ok(c.query_row(
            "SELECT value FROM preferences WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?)
    }))
}

#[tauri::command]
pub fn set_preference(state: State<'_, AppState>, key: String, value: String) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO preferences (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now()],
        )?;
        Ok(())
    }))
}

#[tauri::command]
pub fn all_preferences(state: State<'_, AppState>) -> CmdResult<Vec<(String, String)>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare("SELECT key, value FROM preferences")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

// -------------------------------------------------------- dashboard layout

#[tauri::command]
pub fn get_dashboard_layout(state: State<'_, AppState>) -> CmdResult<Vec<DashboardWidget>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, widget, position, size, visible, config FROM dashboard_layout ORDER BY position",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DashboardWidget {
                    id: r.get(0)?,
                    widget: r.get(1)?,
                    position: r.get(2)?,
                    size: r.get(3)?,
                    visible: r.get::<_, i64>(4)? != 0,
                    config: parse_json(r.get(5)?),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn save_dashboard_layout(
    state: State<'_, AppState>,
    widgets: Vec<DashboardWidget>,
) -> CmdResult<()> {
    map(state.db.with(|c| {
        let tx = c.unchecked_transaction()?;
        for w in &widgets {
            tx.execute(
                "INSERT INTO dashboard_layout (id, widget, position, size, visible, config)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET
                   position = excluded.position, size = excluded.size,
                   visible = excluded.visible, config = excluded.config",
                params![
                    w.id,
                    w.widget,
                    w.position,
                    w.size,
                    w.visible as i64,
                    serde_json::to_string(&w.config).unwrap_or_else(|_| "{}".into()),
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }))
}

// ------------------------------------------------------------------- git

#[tauri::command]
pub fn git_status(path: String) -> CmdResult<serde_json::Value> {
    let run = |args: &[&str]| -> Result<String, String> {
        let out = Command::new("git")
            .arg("-C")
            .arg(&path)
            .args(args)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    };

    let branch = run(&["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let status = run(&["status", "--porcelain=v1", "-b"]).unwrap_or_default();
    let log = run(&["log", "-1", "--format=%h%x1f%s%x1f%an%x1f%cI"]).unwrap_or_default();

    let mut staged = 0;
    let mut modified = 0;
    let mut untracked = 0;
    let mut ahead = 0;
    let mut behind = 0;

    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            if let Some(idx) = rest.find("ahead ") {
                ahead = rest[idx + 6..]
                    .split(|c: char| !c.is_ascii_digit())
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
            if let Some(idx) = rest.find("behind ") {
                behind = rest[idx + 7..]
                    .split(|c: char| !c.is_ascii_digit())
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
            }
            continue;
        }
        let mut chars = line.chars();
        let x = chars.next().unwrap_or(' ');
        let y = chars.next().unwrap_or(' ');
        if x == '?' && y == '?' {
            untracked += 1;
        } else {
            if x != ' ' && x != '?' {
                staged += 1;
            }
            if y != ' ' && y != '?' {
                modified += 1;
            }
        }
    }

    let parts: Vec<&str> = log.trim().split('\u{1f}').collect();
    let last_commit = json!({
        "hash": parts.first().copied().unwrap_or(""),
        "subject": parts.get(1).copied().unwrap_or(""),
        "author": parts.get(2).copied().unwrap_or(""),
        "at": parts.get(3).copied().unwrap_or(""),
    });

    Ok(json!({
        "repo": path,
        "branch": branch.trim(),
        "ahead": ahead,
        "behind": behind,
        "staged": staged,
        "modified": modified,
        "untracked": untracked,
        "lastCommit": last_commit,
    }))
}

// ---------------------------------------------------------- shell execution

#[tauri::command]
pub async fn run_shell_command(
    state: State<'_, AppState>,
    command: String,
    cwd: Option<String>,
) -> CmdResult<CommandResult> {
    audit(&state.db, "shell.exec", &command);
    tauri::async_runtime::spawn_blocking(move || execute_shell(command, cwd))
        .await
        .map_err(|e| e.to_string())?
}

fn execute_shell(command: String, cwd: Option<String>) -> CmdResult<CommandResult> {
    let started = std::time::Instant::now();

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&command);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-lc").arg(&command);
        c
    };

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    let out = cmd
        .output()
        .map_err(|e| anyhow!("failed to spawn shell: {e}").to_string())?;

    Ok(CommandResult {
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        exit_code: out.status.code(),
        duration_ms: started.elapsed().as_millis(),
    })
}

// ------------------------------------------------------------- audit trail

#[tauri::command]
pub fn audit_tail(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> CmdResult<Vec<serde_json::Value>> {
    let limit = limit.unwrap_or(100).clamp(1, 1000);
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, action, detail, at FROM audit_log ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(json!({
                    "id": r.get::<_, i64>(0)?,
                    "action": r.get::<_, String>(1)?,
                    "detail": r.get::<_, Option<String>>(2)?,
                    "at": r.get::<_, String>(3)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}
