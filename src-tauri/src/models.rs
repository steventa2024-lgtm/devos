//! Serializable DTOs shared across the IPC boundary.
//! All structs serialize as camelCase to match idiomatic TypeScript.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub color: Option<String>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub last_opened_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub target: Option<String>,
    pub url: Option<String>,
    pub health: String,
    pub autostart: bool,
    pub meta: serde_json::Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: i64,
    pub source: String,
    pub level: String,
    pub message: String,
    pub meta: serde_json::Value,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvProfile {
    pub id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub id: String,
    pub profile_id: String,
    pub key: String,
    /// Masked with bullets for secrets unless explicitly revealed.
    pub value: String,
    pub secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub language: String,
    pub body: String,
    pub tags: Vec<String>,
    pub run_count: i64,
    pub last_run_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub project_id: Option<String>,
    pub command: String,
    pub cwd: Option<String>,
    pub exit_code: Option<i64>,
    pub duration_ms: Option<i64>,
    pub ran_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardWidget {
    pub id: String,
    pub widget: String,
    pub position: i64,
    pub size: String,
    pub visible: bool,
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DbConnection {
    pub id: String,
    pub name: String,
    /// "sqlite" | "postgres" | "mysql" (only sqlite is wired up so far).
    pub kind: String,
    pub path: Option<String>,
    pub url: Option<String>,
    pub read_only: bool,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub truncated: bool,
    pub duration_ms: u128,
    /// Present when the query was a write and `allow_writes` was true.
    pub rows_affected: Option<i64>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiHeader {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    pub id: String,
    pub collection: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<ApiHeader>,
    pub body: String,
    /// "json" | "text" | "form"
    pub body_kind: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<ApiResponseHeader>,
    pub body: String,
    pub body_truncated: bool,
    pub size_bytes: usize,
    pub duration_ms: u128,
    pub error: Option<String>,
}
