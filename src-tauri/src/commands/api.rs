//! Lightweight HTTP client for the API Tester.
//!
//! Uses `reqwest` with rustls so no system OpenSSL is required. Every
//! request is capped at 30 seconds. Response bodies above 1 MiB are
//! truncated for the UI.

use crate::models::*;
use crate::AppState;
use anyhow::Result;
use chrono::Utc;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Method,
};
use rusqlite::params;
use std::time::{Duration, Instant};
use tauri::State;
use uuid::Uuid;

type CmdResult<T> = Result<T, String>;

fn now() -> String { Utc::now().to_rfc3339() }
fn map<T>(r: Result<T>) -> CmdResult<T> { r.map_err(|e| e.to_string()) }

const MAX_BODY_PREVIEW: usize = 1024 * 1024;
const TIMEOUT_SECS: u64 = 30;

/* --------------------------------------------------------------- storage */

#[tauri::command]
pub fn api_list_requests(state: State<'_, AppState>) -> CmdResult<Vec<ApiRequest>> {
    map(state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, collection, name, method, url, headers, body, body_kind,
                    sort_order, created_at, updated_at
             FROM api_requests
             ORDER BY collection COLLATE NOCASE, sort_order, name COLLATE NOCASE",
        )?;
        let rows = stmt
            .query_map([], |r| {
                let headers_json: String = r.get(5)?;
                let headers: Vec<ApiHeader> =
                    serde_json::from_str(&headers_json).unwrap_or_default();
                Ok(ApiRequest {
                    id: r.get(0)?,
                    collection: r.get(1)?,
                    name: r.get(2)?,
                    method: r.get(3)?,
                    url: r.get(4)?,
                    headers,
                    body: r.get(6)?,
                    body_kind: r.get(7)?,
                    sort_order: r.get(8)?,
                    created_at: r.get(9)?,
                    updated_at: r.get(10)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }))
}

#[tauri::command]
pub fn api_upsert_request(
    state: State<'_, AppState>,
    request: ApiRequest,
) -> CmdResult<ApiRequest> {
    let id = if request.id.is_empty() { Uuid::new_v4().to_string() } else { request.id.clone() };
    let created = if request.created_at.is_empty() { now() } else { request.created_at.clone() };
    let updated = now();
    let headers_json = serde_json::to_string(&request.headers).unwrap_or_else(|_| "[]".into());

    map(state.db.with(|c| {
        c.execute(
            "INSERT INTO api_requests
               (id, collection, name, method, url, headers, body, body_kind,
                sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
               collection = excluded.collection,
               name = excluded.name,
               method = excluded.method,
               url = excluded.url,
               headers = excluded.headers,
               body = excluded.body,
               body_kind = excluded.body_kind,
               sort_order = excluded.sort_order,
               updated_at = excluded.updated_at",
            params![
                id, request.collection, request.name, request.method, request.url,
                headers_json, request.body, request.body_kind, request.sort_order,
                created, updated,
            ],
        )?;
        Ok(ApiRequest { id, created_at: created, updated_at: updated, ..request })
    }))
}

#[tauri::command]
pub fn api_delete_request(state: State<'_, AppState>, id: String) -> CmdResult<()> {
    map(state.db.with(|c| {
        c.execute("DELETE FROM api_requests WHERE id = ?1", params![id])?;
        Ok(())
    }))
}

/* ------------------------------------------------------------------ send */

#[tauri::command]
pub async fn api_send(
    method: String,
    url: String,
    headers: Vec<ApiHeader>,
    body: String,
) -> CmdResult<ApiResponse> {
    let m = Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| format!("invalid method: {e}"))?;

    let client = Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let mut hmap = HeaderMap::new();
    for h in headers.iter().filter(|h| h.enabled && !h.key.trim().is_empty()) {
        let name = HeaderName::from_bytes(h.key.trim().as_bytes())
            .map_err(|e| format!("invalid header name '{}': {e}", h.key))?;
        let value = HeaderValue::from_str(h.value.trim())
            .map_err(|e| format!("invalid header value for '{}': {e}", h.key))?;
        hmap.insert(name, value);
    }

    let mut req = client.request(m.clone(), &url).headers(hmap);
    if !body.is_empty() && m != Method::GET && m != Method::HEAD {
        req = req.body(body);
    }

    let started = Instant::now();
    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = if e.is_timeout() {
                format!("Request timed out after {TIMEOUT_SECS}s")
            } else if e.is_connect() {
                format!("Could not connect: {e}")
            } else {
                e.to_string()
            };
            return Ok(ApiResponse {
                status: 0,
                status_text: String::new(),
                headers: vec![],
                body: String::new(),
                body_truncated: false,
                size_bytes: 0,
                duration_ms: started.elapsed().as_millis(),
                error: Some(msg),
            });
        }
    };

    let duration_ms = started.elapsed().as_millis();
    let status = resp.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers_out: Vec<ApiResponseHeader> = resp
        .headers()
        .iter()
        .map(|(k, v)| ApiResponseHeader {
            key: k.as_str().to_string(),
            value: v.to_str().unwrap_or("<binary>").to_string(),
        })
        .collect();

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let size_bytes = bytes.len();
    let truncated = bytes.len() > MAX_BODY_PREVIEW;
    let slice = if truncated { &bytes[..MAX_BODY_PREVIEW] } else { &bytes[..] };
    let body_text = String::from_utf8_lossy(slice).to_string();

    Ok(ApiResponse {
        status: status.as_u16(),
        status_text,
        headers: headers_out,
        body: body_text,
        body_truncated: truncated,
        size_bytes,
        duration_ms,
        error: None,
    })
}
