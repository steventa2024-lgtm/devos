# DevOS

**Built by ZeroPulse** — a local-first, keyboard-driven developer operating system.

One window for your projects, terminal, Git, files, services, containers,
databases, environment secrets, logs, HTTP requests, and processes.

- **Local-first** — everything lives on your machine. No accounts, no cloud.
- **Cross-platform** — Windows, macOS, Linux.
- **Fast** — Tauri + Rust. No Electron bloat.
- **Extensible** — two-file plugins add commands to the command palette.
- **Private** — secrets encrypted with XChaCha20-Poly1305, key stored locally.

## Install

### Requirements
- Node 20+ and pnpm 9+
- Rust 1.77+ (rustup recommended)
- Linux only: libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev

### From source

```bash
git clone https://github.com/steventa2024-lgtm/devos.git
cd devos
pnpm install
pnpm tauri:dev
```

On first launch DevOS creates its data directory, generates an encryption key,
seeds a sample plugin, and starts.

### Build a release binary

```bash
pnpm tauri build
```

Output lands under `src-tauri/target/release/bundle/`:
- Linux: `.deb`, `.AppImage`
- macOS: `.dmg`, `.app`
- Windows: `.msi`, `.exe`

## What is inside

| Module | What it does |
|---|---|
| Dashboard | Live system health, projects, services, Git status, logs |
| Projects | Bookmark any folder on disk |
| Terminal | Real PTY, full shell access |
| Files | Two-pane tree + CodeMirror preview |
| Git | Status, stage/unstage, commit, diff, log |
| Services | Track local APIs, DBs, containers; probe health |
| Containers | List/start/stop/restart from any Docker-compatible engine |
| Database | Browse SQLite files, run ad-hoc queries |
| API Tester | Send HTTP requests, save them |
| Environment | Profiles + encrypted secrets |
| Logs | Everything DevOS and your services wrote |
| Monitoring | CPU, RAM, disk, network, host info |
| Processes | Sortable list, SIGTERM / SIGKILL with a safety guard |
| Snippets | Saved shell commands with output capture |
| Plugins | Local JS modules — commands in the palette |

## Plugins

Drop a folder into `~/.config/devos/plugins/<id>/` with two files.
See the sample plugin that ships with DevOS for the exact shape.

## Where your data lives

| Platform | Path |
|---|---|
| Linux | `~/.local/share/dev.devos.app/` |
| macOS | `~/Library/Application Support/dev.devos.app/` |
| Windows | `%APPDATA%/dev.devos.app/` |

Contents: `devos.db` (SQLite), `vault.key` (encryption key, mode 0600).
Both stay on your machine. Never committed, never synced.

## License

MIT — see [LICENSE](LICENSE).

---

Built by **ZeroPulse**.
