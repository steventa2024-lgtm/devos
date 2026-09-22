//! SQLite connection wrapper + schema migrations.

use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;",
        )?;
        Ok(Db(Mutex::new(conn)))
    }

    pub fn migrate(&self) -> Result<()> {
        let conn = self.0.lock().unwrap();
        conn.execute_batch(SCHEMA)?;
        Ok(())
    }

    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let conn = self.0.lock().unwrap();
        f(&conn)
    }
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS preferences (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL DEFAULT 'unknown',
  color          TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  favorite       INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS env_profiles (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS env_vars (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES env_profiles(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  secret     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(profile_id, key)
);

CREATE TABLE IF NOT EXISTS snippets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  language    TEXT NOT NULL DEFAULT 'bash',
  body        TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  run_count   INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terminal_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
  command     TEXT NOT NULL,
  cwd         TEXT,
  exit_code   INTEGER,
  duration_ms INTEGER,
  ran_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'process',
  target     TEXT,
  url        TEXT,
  health     TEXT NOT NULL DEFAULT 'unknown',
  autostart  INTEGER NOT NULL DEFAULT 0,
  meta       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  source  TEXT NOT NULL,
  level   TEXT NOT NULL,
  message TEXT NOT NULL,
  meta    TEXT NOT NULL DEFAULT '{}',
  at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_layout (
  id       TEXT PRIMARY KEY,
  widget   TEXT NOT NULL,
  position INTEGER NOT NULL,
  size     TEXT NOT NULL DEFAULT 'md',
  visible  INTEGER NOT NULL DEFAULT 1,
  config   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_at       ON logs(at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level    ON logs(level);
CREATE INDEX IF NOT EXISTS idx_history_at    ON terminal_history(ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_env_vars_prof ON env_vars(profile_id);

-- ------------------------------------------------------------------
-- Database manager: saved connections to external SQLite files.
-- The DevOS SQLite DB itself is not listed here — that's internal.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS db_connections (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'sqlite',
  path         TEXT,
  url          TEXT,
  read_only    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_db_conn_last_used ON db_connections(last_used_at DESC);

-- ------------------------------------------------------------------
-- API Tester: saved HTTP requests.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_requests (
  id          TEXT PRIMARY KEY,
  collection  TEXT NOT NULL DEFAULT 'Default',
  name        TEXT NOT NULL,
  method      TEXT NOT NULL,
  url         TEXT NOT NULL,
  headers     TEXT NOT NULL DEFAULT '[]',
  body        TEXT NOT NULL DEFAULT '',
  body_kind   TEXT NOT NULL DEFAULT 'json',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_req_collection ON api_requests(collection COLLATE NOCASE, sort_order);
"#;
