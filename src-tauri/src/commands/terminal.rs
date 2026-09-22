//! Terminal (PTY) commands.

use crate::pty;
use crate::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn pty_open(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shell: Option<String>,
) -> Result<(), String> {
    pty::open(app, &state.pty, id, cols, rows, cwd, shell).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    pty::write(&state.pty, &id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty::resize(&state.pty, &id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    pty::close(&state.pty, &id).map_err(|e| e.to_string())
}
