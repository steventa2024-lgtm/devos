//! Filesystem browsing and text-file reading.
//!
//! All paths are absolute. `list_directory` returns one level only — the UI
//! expands children lazily so we never walk a whole repo tree in one call.
//!
//! Safety guardrails:
//!   - `read_text_file` caps the payload at 2 MiB by default.
//!   - Binary files are excluded by extension, not by content sniffing,
//!     so we never accidentally try to render a 400 MB `.mp4`.

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    /// "file" | "dir" | "symlink" | "other"
    pub kind: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub hidden: bool,
    pub is_text: bool,
}

/// List one directory level. Sorted directories-first, then files,
/// case-insensitive alphabetical within each group.
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let iter = fs::read_dir(p).map_err(|e| format!("{path}: {e}"))?;
    let mut out: Vec<DirEntry> = Vec::new();

    for entry in iter.flatten() {
        // Skip entries we cannot stat (broken symlinks, permission denied).
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();
        let ft = meta.file_type();
        let kind = if ft.is_dir() {
            "dir"
        } else if ft.is_symlink() {
            "symlink"
        } else if ft.is_file() {
            "file"
        } else {
            "other"
        }
        .to_string();

        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);

        let is_text = kind == "file" && looks_like_text(&name, meta.len());

        out.push(DirEntry {
            name: name.clone(),
            path: entry.path().to_string_lossy().to_string(),
            kind,
            size: meta.len(),
            modified_ms,
            hidden: name.starts_with('.'),
            is_text,
        });
    }

    out.sort_by(|a, b| {
        let ak = if a.kind == "dir" { 0 } else { 1 };
        let bk = if b.kind == "dir" { 0 } else { 1 };
        ak.cmp(&bk)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(out)
}

/// Extension-based text heuristic. Never reads the file — cheap and safe.
fn looks_like_text(name: &str, size: u64) -> bool {
    const MAX: u64 = 20 * 1024 * 1024; // never claim a >20 MB file is text
    if size > MAX {
        return false;
    }

    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Extensionless small files are usually text (Makefile, LICENSE, Dockerfile).
    if ext.is_empty() {
        return size < 512 * 1024;
    }

    const TEXT_EXTS: &[&str] = &[
        "txt", "md", "markdown", "rst", "log", "csv", "tsv",
        "json", "json5", "yaml", "yml", "toml", "ini", "conf", "cfg", "env",
        "js", "jsx", "ts", "tsx", "mjs", "cjs",
        "rs", "go", "py", "rb", "php", "java", "kt", "kts", "swift",
        "c", "h", "cpp", "hpp", "cc", "hh", "cs",
        "sh", "bash", "zsh", "fish", "ps1",
        "html", "htm", "css", "scss", "sass", "less",
        "vue", "svelte", "astro",
        "sql", "graphql", "gql", "proto",
        "gitignore", "gitattributes", "editorconfig", "dockerignore",
        "lock",
    ];

    TEXT_EXTS.contains(&ext.as_str())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub size: u64,
    pub lines: u64,
}

/// Read a text file, capped at `max_bytes` (default 2 MiB).
/// Uses lossy UTF-8 decoding so stray bytes don't blow up the read.
#[tauri::command]
pub fn read_text_file(path: String, max_bytes: Option<u64>) -> Result<FileContents, String> {
    let max = max_bytes.unwrap_or(2 * 1024 * 1024);
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| format!("{path}: {e}"))?;
    let size = meta.len();

    let bytes = fs::read(p).map_err(|e| format!("{path}: {e}"))?;
    let truncated = bytes.len() as u64 > max;
    let slice = if truncated { &bytes[..max as usize] } else { &bytes[..] };

    let content = String::from_utf8_lossy(slice).to_string();
    let lines = content.lines().count() as u64;

    Ok(FileContents {
        path,
        content,
        truncated,
        size,
        lines,
    })
}

// ---------------------------------------------------------------- WSL / Windows
//
// When DevOS runs inside WSL, the Linux filesystem only sees drives WSL has
// mounted (usually /mnt/c). USB volumes plugged in after boot and secondary
// drives often aren't there. The fix: ask Windows directly via PowerShell.
//
// We never *require* WSL — every command here degrades to a no-op on Linux,
// macOS, and native Windows.

use serde_json::Value as Json;
use std::process::Command;

/// True when the running kernel reports a Microsoft/WSL build.
fn is_wsl() -> bool {
    std::fs::read_to_string("/proc/version")
        .map(|s| {
            let l = s.to_lowercase();
            l.contains("microsoft") || l.contains("wsl")
        })
        .unwrap_or(false)
}

#[tauri::command]
pub fn is_wsl_runtime() -> bool {
    is_wsl()
}

/// Converts "E:\foo\bar" → "/mnt/e/foo/bar". Leaves already-Linux paths alone.
#[allow(dead_code)]
fn windows_path_to_wsl(win: &str) -> String {
    let trimmed = win.trim().trim_end_matches(['\r', '\n']);
    let b = trimmed.as_bytes();
    if b.len() >= 2 && b[1] == b':' && b[0].is_ascii_alphabetic() {
        let drive = (b[0] as char).to_ascii_lowercase();
        let mut rest = trimmed[2..].replace('\\', "/");
        if rest.is_empty() {
            rest = "/".into();
        }
        if !rest.starts_with('/') {
            rest = format!("/{rest}");
        }
        return format!("/mnt/{drive}{rest}");
    }
    trimmed.replace('\\', "/")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowsDrive {
    /// Single uppercase letter, e.g. "C", "D", "E".
    pub letter: String,
    /// Friendly label. "C: Windows" or just "E: my-drive".
    pub label: String,
    /// Where WSL *would* see it, e.g. "/mnt/e".
    pub wsl_path: String,
    /// True if /mnt/<letter> is readable right now.
    pub mounted: bool,
}

/// Every drive Windows knows about, whether or not WSL has mounted it.
#[tauri::command]
pub fn list_windows_drives() -> Result<Vec<WindowsDrive>, String> {
    if !is_wsl() {
        return Ok(Vec::new());
    }

    let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Get-CimInstance Win32_LogicalDisk |
  Where-Object { $_.DriveType -in 2,3,4 } |
  Select-Object DeviceID, VolumeName |
  ConvertTo-Json -Compress
"#;

    let out = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("powershell.exe: {e}"))?;

    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    let parsed: Json = serde_json::from_str(&stdout)
        .map_err(|e| format!("parse drives json: {e}"))?;

    // PowerShell returns a bare object when there is exactly one drive.
    let items: Vec<Json> = match parsed {
        Json::Array(a) => a,
        other => vec![other],
    };

    let mut drives: Vec<WindowsDrive> = Vec::new();
    for item in items {
        let device = item.get("DeviceID").and_then(|v| v.as_str()).unwrap_or("");
        let name = item.get("VolumeName").and_then(|v| v.as_str()).unwrap_or("");
        let letter = device.trim_end_matches(':').to_ascii_uppercase();
        if letter.len() != 1 || !letter.chars().all(|c| c.is_ascii_alphabetic()) {
            continue;
        }

        let wsl_path = format!("/mnt/{}", letter.to_ascii_lowercase());
        let mounted = std::fs::read_dir(&wsl_path).is_ok();

        drives.push(WindowsDrive {
            label: if name.is_empty() {
                format!("{letter}:")
            } else {
                format!("{letter}: {name}")
            },
            letter,
            wsl_path,
            mounted,
        });
    }

    drives.sort_by(|a, b| a.letter.cmp(&b.letter));
    Ok(drives)
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFolder {
    /// Path in WSL form, e.g. "/mnt/e/my-drive/my-project".
    pub path: String,
    /// Original Windows path, e.g. "E:\my-drive\my-project".
    pub windows_path: String,
    /// False when the drive is not yet mounted in WSL.
    pub accessible: bool,
}

/// Attempts a passwordless mount of a Windows drive. Returns Ok(true) on
/// success, Ok(false) if the drive is already accessible, and Err with the
/// exact shell command if it needs to be run manually.
#[tauri::command]
pub fn mount_windows_drive(letter: String) -> Result<bool, String> {
    if !is_wsl() {
        return Ok(false);
    }

    let letter = letter.trim_end_matches(':').to_ascii_uppercase();
    if letter.len() != 1 || !letter.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(format!("invalid drive letter: {letter}"));
    }

    let mount_point = format!("/mnt/{}", letter.to_ascii_lowercase());
    if std::fs::read_dir(&mount_point).is_ok() {
        return Ok(true);
    }

    // Try passwordless sudo. If NOPASSWD isn't configured this returns
    // immediately without hanging.
    let src = format!("{letter}:");
    let sh = format!("mkdir -p {mp} && mount -t drvfs '{src}' {mp}", mp = mount_point);

    let out = Command::new("sudo")
        .args(["-n", "sh", "-c", &sh])
        .output()
        .map_err(|e| format!("sudo: {e}"))?;

    if out.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let hint = format!(
        "sudo mkdir -p {mp} && sudo mount -t drvfs '{src}' {mp}",
        mp = mount_point,
        src = src
    );
    Err(if stderr.is_empty() {
        format!("Mount requires a password. Run this once in a terminal:\n\n{hint}")
    } else {
        format!("{stderr}\n\nRun this once in a terminal:\n\n{hint}")
    })
}
