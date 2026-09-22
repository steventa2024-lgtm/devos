//! Plugin host: reads plugin manifests and source from the user's config dir.
//!
//! A plugin is a folder under `~/.config/devos/plugins/<id>/` containing:
//!   - manifest.json  — id, name, version, commands[], allowShell
//!   - index.js       — code that receives a `devos` object and runs
//!
//! DevOS does NOT download plugins. It reads what's on disk. The trust
//! model is the same as VS Code extensions: you installed it, you run it.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

type CmdResult<T> = Result<T, String>;

/* ------------------------------------------------------------------ types */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCommandDef {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub allow_shell: bool,
    #[serde(default)]
    pub commands: Vec<PluginCommandDef>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub manifest: PluginManifest,
    pub dir: String,
    pub has_source: bool,
    /// Non-fatal problems, e.g. missing index.js. Rendered in the UI.
    pub error: Option<String>,
}

/* -------------------------------------------------------------- location */

/// `~/.config/devos/plugins` on Linux, `~/Library/Application Support` on
/// macOS, `%APPDATA%\devos\plugins` on Windows.
fn plugins_dir() -> Result<PathBuf> {
    let base = if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .map(|h| h.join("Library").join("Application Support"))
    } else if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    };

    let base = base.ok_or_else(|| anyhow!("could not determine user config directory"))?;
    Ok(base.join("devos").join("plugins"))
}

/* ------------------------------------------------------------------ read */

#[tauri::command]
pub fn plugin_dir() -> CmdResult<String> {
    Ok(plugins_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string())
}

/// Create the plugins directory if it doesn't exist, and drop a starter
/// plugin inside on first run. Safe to call repeatedly.
#[tauri::command]
pub fn plugin_ensure_dir() -> CmdResult<String> {
    let dir = plugins_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let sample = dir.join("com.devos.hello");
    if !sample.exists() {
        std::fs::create_dir_all(&sample).map_err(|e| e.to_string())?;

        let manifest = r#"{
  "id": "com.devos.hello",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Sample plugin — registers two commands in the palette.",
  "author": "ZeroPulse",
  "allowShell": false,
  "commands": [
    { "id": "hello.greet",  "label": "Hello · Say hi",        "description": "Shows a toast" },
    { "id": "hello.prefs",  "label": "Hello · Test preferences", "description": "Reads and writes a preference" }
  ]
}
"#;
        std::fs::write(sample.join("manifest.json"), manifest)
            .map_err(|e| e.to_string())?;

        let source = r#"// Hello World — sample DevOS plugin.
//
// `devos` is injected at load time. The manifest declares which commands
// this plugin registers; each command id must match one entry.

devos.registerCommand('hello.greet', async () => {
  devos.toast({
    tone: 'success',
    title: 'Hello from a plugin!',
    description: 'This command came from ' + devos.pluginId,
  })
})

devos.registerCommand('hello.prefs', async () => {
  const current = await devos.getPreference('hello.greeting')
  const next = current ? 'changed at ' + new Date().toLocaleTimeString() : 'hello, world'
  await devos.setPreference('hello.greeting', next)
  devos.toast({
    tone: 'info',
    title: 'Preference saved',
    description: next,
  })
})

devos.log('Hello World plugin loaded')
"#;
        std::fs::write(sample.join("index.js"), source)
            .map_err(|e| e.to_string())?;
    }

    Ok(dir.to_string_lossy().to_string())
}

/// List all plugins found on disk, one level deep under plugins_dir.
#[tauri::command]
pub fn plugin_list() -> CmdResult<Vec<PluginInfo>> {
    let dir = plugins_dir().map_err(|e| e.to_string())?;
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut out = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        let index_path = path.join("index.js");

        let manifest: PluginManifest = match std::fs::read_to_string(&manifest_path) {
            Ok(raw) => match serde_json::from_str(&raw) {
                Ok(m) => m,
                Err(e) => {
                    out.push(PluginInfo {
                        manifest: PluginManifest {
                            id: path
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "unknown".into()),
                            name: path
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| "unknown".into()),
                            version: String::new(),
                            description: None,
                            author: None,
                            allow_shell: false,
                            commands: vec![],
                        },
                        dir: path.to_string_lossy().to_string(),
                        has_source: index_path.exists(),
                        error: Some(format!("invalid manifest.json: {e}")),
                    });
                    continue;
                }
            },
            Err(_) => continue,
        };

        let has_source = index_path.exists();
        let error = if !has_source {
            Some("index.js is missing".to_string())
        } else {
            None
        };

        out.push(PluginInfo {
            manifest,
            dir: path.to_string_lossy().to_string(),
            has_source,
            error,
        });
    }

    out.sort_by(|a, b| a.manifest.name.to_lowercase().cmp(&b.manifest.name.to_lowercase()));
    Ok(out)
}

/// Read the source of a plugin's index.js.
#[tauri::command]
pub fn plugin_read_source(id: String) -> CmdResult<String> {
    let dir = plugins_dir().map_err(|e| e.to_string())?;
    let index = dir.join(&id).join("index.js");
    if !index.exists() {
        return Err(format!("index.js not found for plugin '{id}'"));
    }
    std::fs::read_to_string(&index).map_err(|e| e.to_string())
}

/// Reveal the plugins directory in the OS file manager.
#[tauri::command]
pub fn plugin_reveal_dir() -> CmdResult<()> {
    let dir = plugins_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    Ok(())
}

/// Delete a plugin folder. Used by the Plugins view's remove action.
#[tauri::command]
pub fn plugin_delete(id: String) -> CmdResult<()> {
    // Sanitize: refuse anything that isn't a plain folder name under the
    // plugins dir. Avoids any path traversal tricks from a malformed id.
    if id.contains('/') || id.contains('\\') || id.contains("..") || id.is_empty() {
        return Err("invalid plugin id".into());
    }
    let dir = plugins_dir().map_err(|e| e.to_string())?;
    let target = dir.join(&id);
    if !target.starts_with(&dir) {
        return Err("plugin path escapes the plugins directory".into());
    }
    if !target.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Unused helper kept for future use (opening a plugin's own folder).
#[allow(dead_code)]
fn open_path(_p: &Path) {}
