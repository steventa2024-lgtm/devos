//! SQLite database manager.
//!
//! Opens arbitrary `.db` / `.sqlite` / `.sqlite3` files on disk with a
//! short-lived `rusqlite::Connection` per call. No persistent pool, no
//! surprise file locks — the file is opened, queried, closed.
//!
//! Read-only enforcement: unless `allow_writes` is true, any SQL containing
//! a write keyword is rejected before it reaches SQLite.

use crate::models::*;
use crate::AppState;
use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, types::Value as SqlValue, Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Value as Json};
use std::path::Path;
use tauri::State;
use uuid::Uuid;

type CmdResult<T> = Result<T, String>;

fn now() -> String { Utc::now().to_rfc3339() }
fn map<T>(r: Result<T>) -> CmdResult<T> { r.map_err(|e| e.to_string()) }

/* ------------------------------------------------------------- connections */

#[tauri::command]
pub fn db_list_connections(state: State<'_, AppState>) -> CmdResult<Vec<DbConnection>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, name, kind, path, url, read_only, created_at, last_used_at
             FROM db_connections
             ORDER BY COALESCE(last_used_at, created_at) DESC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DbConnection {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: r.get(2)?,
                    path: r.get(3)?,
                    url: r.get(4)?,
                    read_only: r.get::<_, i64>(5)? != 0,
                    created_at: r.get(6)?,
                    last_used_at: r.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn db_upsert_connection(
    state: State<'_, AppState>,
    connection: DbConnection,
) -> CmdResult<DbConnection> {
    let id = if connection.id.is_empty() { Uuid::new_v4().to_string() } else { connection.id.clone() };
    let created = if connection.created_at.is_empty() { now() } else { connection.created_at.clone() };
    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO db_connections (id, name, kind, path, url, read_only, created_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, kind = excluded.kind, path = excluded.path,
               url = excluded.url, read_only = excluded.read_only,
               last_used_at = excluded.last_used_at",
            params![
                id, connection.name, connection.kind, connection.path, connection.url,
                connection.read_only as i64, created, connection.last_used_at,
            ],
        )?;
        Ok(DbConnection { id, created_at: created, ..connection })
    }))
}

#[tauri::command]
pub fn db_delete_connection(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute("DELETE FROM db_connections WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

#[tauri::command]
pub fn db_touch_connection(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute(
            "UPDATE db_connections SET last_used_at = ?2 WHERE id = ?1",
            params![id, now()],
        )?;
        Ok(())
    }))
}

/* --------------------------------------------------------------- probing */

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbProbe {
    pub ok: bool,
    pub version: Option<String>,
    pub page_count: Option<i64>,
    pub page_size: Option<i64>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn db_test_connection(path: String) -> CmdResult<DbProbe> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(DbProbe {
            ok: false,
            version: None,
            page_count: None,
            page_size: None,
            error: Some(format!("file not found: {path}")),
        });
    }
    match Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(conn) => {
            let version = conn
                .query_row("SELECT sqlite_version()", [], |r| r.get::<_, String>(0))
                .ok();
            let page_count = conn.query_row("PRAGMA page_count", [], |r| r.get::<_, i64>(0)).ok();
            let page_size = conn.query_row("PRAGMA page_size", [], |r| r.get::<_, i64>(0)).ok();
            Ok(DbProbe { ok: true, version, page_count, page_size, error: None })
        }
        Err(e) => Ok(DbProbe {
            ok: false,
            version: None,
            page_count: None,
            page_size: None,
            error: Some(e.to_string()),
        }),
    }
}

/* -------------------------------------------------------------- schema */

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTable {
    pub name: String,
    /// "table" | "view"
    pub kind: String,
    pub row_estimate: Option<i64>,
}

#[tauri::command]
pub fn db_tables(path: String) -> CmdResult<Vec<DbTable>> {
    // Wrap the whole body in an inner closure so `?` on rusqlite calls
    // auto-converts to anyhow::Error, then `map` flips it to CmdResult.
    map((|| -> Result<Vec<DbTable>> {
        let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| anyhow!("{path}: {e}"))?;

        let mut stmt = conn.prepare(
            "SELECT name, type FROM sqlite_master
             WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
             ORDER BY name COLLATE NOCASE",
        )?;

        let mut out: Vec<DbTable> = Vec::new();
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (name, kind) = row?;
            // Row count only for tables — views can be expensive or recursive.
            let row_estimate = if kind == "table" {
                let escaped = name.replace('"', "\"\"");
                conn.query_row(
                    &format!("SELECT COUNT(*) FROM \"{escaped}\""),
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .ok()
            } else {
                None
            };
            out.push(DbTable { name, kind, row_estimate });
        }
        Ok(out)
    })())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbColumn {
    pub name: String,
    pub type_name: String,
    pub not_null: bool,
    pub primary_key: bool,
    pub default_value: Option<String>,
}

#[tauri::command]
pub fn db_table_schema(path: String, table: String) -> CmdResult<Vec<DbColumn>> {
    map((|| -> Result<Vec<DbColumn>> {
        let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| anyhow!("{path}: {e}"))?;

        let escaped = table.replace('"', "\"\"");
        let mut stmt = conn.prepare(&format!("PRAGMA table_info(\"{escaped}\")"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DbColumn {
                    name: r.get(1)?,
                    type_name: r.get(2)?,
                    not_null: r.get::<_, i64>(3)? != 0,
                    default_value: r.get(4)?,
                    primary_key: r.get::<_, i64>(5)? != 0,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    })())
}

/* -------------------------------------------------------------- query */

const WRITE_KEYWORDS: &[&str] = &[
    "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "REPLACE",
    "TRUNCATE", "ATTACH", "DETACH", "VACUUM", "REINDEX", "ANALYZE",
];

/// True when the SQL appears to modify data or schema.
fn looks_like_write(sql: &str) -> bool {
    // Strip leading whitespace and SQL comments for a cheap sniff.
    let mut s = sql.trim_start();
    loop {
        if s.starts_with("--") {
            s = s.split_once('\n').map(|(_, r)| r).unwrap_or("").trim_start();
        } else if s.starts_with("/*") {
            s = s.split_once("*/").map(|(_, r)| r).unwrap_or("").trim_start();
        } else {
            break;
        }
    }
    let upper = s.to_ascii_uppercase();
    WRITE_KEYWORDS.iter().any(|k| {
        upper.starts_with(k)
            || upper.starts_with(&format!("{k} "))
            || upper.contains(&format!(" {k} "))
    })
}

fn sql_to_json(v: SqlValue) -> Json {
    match v {
        SqlValue::Null => Json::Null,
        SqlValue::Integer(i) => json!(i),
        SqlValue::Real(f) => json!(f),
        SqlValue::Text(s) => json!(s),
        SqlValue::Blob(b) => json!(format!("<blob {} bytes>", b.len())),
    }
}

#[tauri::command]
pub fn db_query(
    state: State<'_, AppState>,
    path: String,
    sql: String,
    limit: Option<i64>,
    allow_writes: Option<bool>,
) -> CmdResult<QueryResult> {
    let started = std::time::Instant::now();
    let max_rows = limit.unwrap_or(500).clamp(1, 10_000);
    let writes_allowed = allow_writes.unwrap_or(false);

    if !writes_allowed && looks_like_write(&sql) {
        return Err("Read-only mode is on. Enable \"Allow writes\" to run this query.".into());
    }

    let flags = if writes_allowed {
        OpenFlags::SQLITE_OPEN_READ_WRITE
    } else {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    };

    let conn = Connection::open_with_flags(&path, flags)
        .map_err(|e| format!("{path}: {e}"))?;

    // For writes, run `execute` and report rows affected.
    if writes_allowed && looks_like_write(&sql) {
        let affected = conn.execute(&sql, []).map_err(|e| e.to_string())?;
        // Audit the write.
        let _ = state.db.with(|c| {
            c.execute(
                "INSERT INTO audit_log (action, detail, at) VALUES (?1, ?2, ?3)",
                params!["db.write", sql.chars().take(500).collect::<String>(), now()],
            )?;
            Ok(())
        });
        return Ok(QueryResult {
            columns: vec!["rows_affected".into()],
            rows: vec![vec![json!(affected as i64)]],
            row_count: 1,
            truncated: false,
            duration_ms: started.elapsed().as_millis(),
            rows_affected: Some(affected as i64),
        });
    }

    // Read path: stream rows through Statement.
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let column_count = stmt.column_count();
    let columns: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("?").to_string())
        .collect();

    let mut rows_out: Vec<Vec<Json>> = Vec::new();
    let mut truncated = false;

    {
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if rows_out.len() as i64 >= max_rows {
                truncated = true;
                break;
            }
            let mut values = Vec::with_capacity(column_count);
            for i in 0..column_count {
                let v = row.get::<_, SqlValue>(i).map_err(|e| e.to_string())?;
                values.push(sql_to_json(v));
            }
            rows_out.push(values);
        }
    }

    Ok(QueryResult {
        columns,
        row_count: rows_out.len(),
        rows: rows_out,
        truncated,
        duration_ms: started.elapsed().as_millis(),
        rows_affected: None,
    })
}

/// Pick up the connection's `last_used_at` timestamp from the frontend.
/// Kept tiny — the heavy lifting is in `db_upsert_connection`.
#[tauri::command]
pub fn db_connection_path(state: State<'_, AppState>, id: String) -> CmdResult<Option<String>> {
    map(state.db.with(|c| {
        Ok(c.query_row(
            "SELECT path FROM db_connections WHERE id = ?1",
            params![id],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()?
        .flatten())
    }))
}
