//! System telemetry commands.

use crate::sys::SystemSnapshot;
use crate::sys::ProcessRow;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn system_snapshot(state: State<'_, AppState>) -> Result<SystemSnapshot, String> {
    let mut monitor = state.sys.lock().map_err(|e| e.to_string())?;
    Ok(monitor.snapshot())
}

/// Compact top-N by CPU. Used by the Monitoring card.
#[tauri::command]
pub fn list_processes(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ProcessRow>, String> {
    let mut monitor = state.sys.lock().map_err(|e| e.to_string())?;
    monitor.snapshot();
    Ok(monitor.top_processes(limit.unwrap_or(15)))
}

/// Full process list for the Processes view.
/// `filter` matches name or command line substring (case-insensitive).
/// `sort` is one of `cpu` | `memory` | `pid` | `name`.
#[tauri::command]
pub fn process_list(
    state: State<'_, AppState>,
    filter: Option<String>,
    sort: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ProcessRow>, String> {
    let mut monitor = state.sys.lock().map_err(|e| e.to_string())?;
    Ok(monitor.list_processes(filter, sort, limit))
}

/// Send a signal to a process.
///
/// On Unix: `kill -TERM <pid>` (graceful) or `kill -KILL <pid>` (force).
/// On Windows: `taskkill /PID <pid>` or with `/F` for force.
///
/// The frontend is responsible for confirming destructive actions; this
/// command executes whatever it is told.

/* ------------------------------------------------------------------ safety */

/// Refuse to kill anything that DevOS itself depends on. This is a
/// deliberately paranoid guard — a developer tool that can crash its own
/// UI by killing the wrong pid is worse than useless.
///
/// Protected:
///   - our own PID
///   - our parent PID (the terminal that launched us)
///   - the main Tauri host process
///   - the WebKit / Chromium webview that renders our window
///   - the Vite dev server serving our frontend
fn is_self_protected(pid: u32, cmdline_lower: &str) -> bool {
    let me = std::process::id();

    // Own process.
    if pid == me {
        return true;
    }

    // Parent of our process (usually the shell that ran `pnpm tauri:dev`).
    #[cfg(target_os = "linux")]
    {
        if let Some(ppid) = read_ppid(me) {
            if pid == ppid {
                return true;
            }
        }
    }

    // Anything whose cmdline references our toolchain, dev server, or
    // webview runtime. This catches the tauri host, vite, and webkit
    // children even when their PIDs shift across rebuilds.
    const NEEDLES: &[&str] = &[
        "target/debug/devos",
        "target/release/devos",
        "devos/node_modules/.bin/vite",
        "devos/node_modules/.bin/tauri",
        "webkitwebprocess",
        "webkitnetworkprocess",
        "tauri dev",
        "tauri:dev",
    ];
    for needle in NEEDLES {
        if cmdline_lower.contains(needle) {
            return true;
        }
    }

    false
}

/// Read `/proc/<pid>/stat` to find a process's parent PID. Linux-only;
/// on macOS/Windows the caller simply skips the parent check.
#[cfg(target_os = "linux")]
fn read_ppid(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // Format: "<pid> (<comm>) <state> <ppid> ..." — comm can contain spaces,
    // so we split on the last ')' first, then take the second whitespace
    // field after that.
    let after_comm = stat.rsplit_once(')')?.1.trim();
    after_comm.split_whitespace().nth(1)?.parse().ok()
}

fn read_cmdline(pid: u32) -> String {
    let path = format!("/proc/{pid}/cmdline");
    let bytes = std::fs::read(path).unwrap_or_default();
    // cmdline is NUL-separated; replace for a readable lowercased string.
    let joined: String = bytes
        .split(|b| *b == 0)
        .filter(|s| !s.is_empty())
        .map(|s| String::from_utf8_lossy(s).to_string())
        .collect::<Vec<_>>()
        .join(" ");
    joined.to_lowercase()
}

#[tauri::command]
pub fn process_kill(pid: u32, force: Option<bool>) -> Result<(), String> {
    let force = force.unwrap_or(false);

    // Refuse to kill anything DevOS itself needs. See `is_self_protected`.
    #[cfg(target_os = "linux")]
    {
        let cmdline = read_cmdline(pid);
        if is_self_protected(pid, &cmdline) {
            return Err(format!(
                "Refusing to kill pid {pid} — DevOS depends on it. \
                 (Its command line matches an internal process.)"
            ));
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        // On macOS/Windows we only check the pid itself for now.
        if pid == std::process::id() {
            return Err("Refusing to kill DevOS itself.".into());
        }
    }

    #[cfg(unix)]
    {
        use std::process::Command;
        let sig = if force { "-KILL" } else { "-TERM" };
        let out = Command::new("kill")
            .args([sig, &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(if err.is_empty() {
                format!("kill failed for pid {pid}")
            } else {
                err
            });
        }
        Ok(())
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let mut c = Command::new("taskkill");
        c.args(["/PID", &pid.to_string()]);
        if force {
            c.arg("/F");
        }
        let out = c.output().map_err(|e| e.to_string())?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
            return Err(if err.is_empty() {
                format!("taskkill failed for pid {pid}")
            } else {
                err
            });
        }
        Ok(())
    }
}

/* ---------------------------------------------------------------- mounts */

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MountRoot {
    /// Short label shown on the chip, e.g. "Home", "C:", "THE VOID".
    pub label: String,
    /// Absolute path passed to the folder picker.
    pub path: String,
    /// "home" | "drive" | "usb" — drives the icon shown in the UI.
    pub kind: String,
}

/// Interesting filesystem roots for the folder picker:
///   - the user's home directory
///   - every Windows drive mounted under `/mnt/<letter>` (WSL)
///   - every removable mount under `/media/*` or `/run/media/<user>/*`
#[tauri::command]
pub fn list_mount_roots() -> Vec<MountRoot> {
    let mut roots: Vec<MountRoot> = Vec::new();

    // Home ----------------------------------------------------------------
    if let Some(home) = dirs_home() {
        roots.push(MountRoot {
            label: "Home".into(),
            path: home,
            kind: "home".into(),
        });
    }

    // Windows drives (WSL) -------------------------------------------------
    if let Ok(entries) = std::fs::read_dir("/mnt") {
        let mut drives: Vec<MountRoot> = entries
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name.len() == 1 && name.chars().all(|c| c.is_ascii_alphabetic()) {
                    Some(MountRoot {
                        label: format!("{}:", name.to_uppercase()),
                        path: format!("/mnt/{}", name),
                        kind: "drive".into(),
                    })
                } else {
                    None
                }
            })
            .collect();
        drives.sort_by(|a, b| a.label.cmp(&b.label));
        roots.extend(drives);
    }

    // Removable media ------------------------------------------------------
    for base in ["/media", "/run/media"] {
        collect_removable(base, &mut roots, 2);
    }

    roots
}

fn collect_removable(base: &str, out: &mut Vec<MountRoot>, depth: u8) {
    if depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(base) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            let has_files = std::fs::read_dir(&path)
                .map(|it| it.flatten().any(|e| e.path().is_file()))
                .unwrap_or(false);
            let has_dirs = std::fs::read_dir(&path)
                .map(|it| it.flatten().any(|e| e.path().is_dir()))
                .unwrap_or(false);

            if has_files && !has_dirs {
                out.push(MountRoot {
                    label: name,
                    path: path.to_string_lossy().to_string(),
                    kind: "usb".into(),
                });
            } else {
                collect_removable(&path.to_string_lossy(), out, depth - 1);
            }
        }
    }
}

fn dirs_home() -> Option<String> {
    std::env::var("HOME").ok().or_else(|| {
        std::env::var("USERPROFILE").ok()
    })
}
