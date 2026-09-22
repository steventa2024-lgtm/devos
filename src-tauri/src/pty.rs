//! Pseudo-terminal sessions backed by `portable-pty`.
//!
//! Each session emits two Tauri events:
//!   `pty://data/{id}` -> String chunk of terminal output
//!   `pty://exit/{id}` -> session ended

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState(pub Arc<Mutex<HashMap<String, Session>>>);

fn default_shell() -> String {
    if cfg!(windows) {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into())
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

pub fn open(
    app: AppHandle,
    state: &PtyState,
    id: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shell: Option<String>,
) -> Result<()> {
    // Close any existing session with this id first. Re-mounts, StrictMode
    // double-invocation, and rapid project switches all race against the
    // async pty_close from the previous effect. Killing the old session
    // here makes pty_open idempotent — no more "already exists" errors.
    {
        let mut sessions = state.0.lock().unwrap();
        if let Some(mut old) = sessions.remove(&id) {
            let _ = old.child.kill();
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let mut cmd = CommandBuilder::new(shell.unwrap_or_else(default_shell));
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    let master = pair.master;
    let reader = master.try_clone_reader()?;
    let writer = master.take_writer()?;

    {
        let app = app.clone();
        let id = id.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(&format!("pty://data/{id}"), chunk);
                    }
                }
            }
            let _ = app.emit(&format!("pty://exit/{id}"), ());
        });
    }

    state.0.lock().unwrap().insert(id, Session { master, writer, child });
    Ok(())
}

pub fn write(state: &PtyState, id: &str, data: &str) -> Result<()> {
    let mut sessions = state.0.lock().unwrap();
    let session = sessions.get_mut(id).ok_or_else(|| anyhow!("unknown pty session {id}"))?;
    session.writer.write_all(data.as_bytes())?;
    session.writer.flush()?;
    Ok(())
}

pub fn resize(state: &PtyState, id: &str, cols: u16, rows: u16) -> Result<()> {
    let sessions = state.0.lock().unwrap();
    let session = sessions.get(id).ok_or_else(|| anyhow!("unknown pty session {id}"))?;
    session.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })?;
    Ok(())
}

pub fn close(state: &PtyState, id: &str) -> Result<()> {
    let mut sessions = state.0.lock().unwrap();
    if let Some(mut session) = sessions.remove(id) {
        let _ = session.child.kill();
    }
    Ok(())
}
