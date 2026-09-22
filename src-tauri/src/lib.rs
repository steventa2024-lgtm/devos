//! DevOS application entry point: wires plugins, state and IPC commands.

mod commands;
mod db;
mod models;
mod pty;
mod secrets;
mod sys;

use std::sync::Mutex;
use tauri::Manager;

/// Shared, managed application state available to every command.
pub struct AppState {
    pub db: db::Db,
    pub sys: Mutex<sys::SysMonitor>,
    pub pty: pty::PtyState,
    pub vault: secrets::Vault,
}

fn setup_err(msg: impl std::fmt::Display) -> Box<dyn std::error::Error> {
    Box::new(std::io::Error::other(msg.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(setup_err)?;
            std::fs::create_dir_all(&data_dir).map_err(setup_err)?;

            let database = db::Db::open(data_dir.join("devos.db")).map_err(setup_err)?;
            database.migrate().map_err(setup_err)?;

            let vault = secrets::Vault::load_or_create(data_dir.join("vault.key"))
                .map_err(setup_err)?;

            // Seed the plugins directory + sample plugin on first run.
            // Non-fatal: if the user's config dir isn't writable we still
            // boot, the Plugins view just shows an empty list.
            let _ = crate::commands::plugins::plugin_ensure_dir();

            app.manage(AppState {
                db: database,
                sys: Mutex::new(sys::SysMonitor::new()),
                pty: pty::PtyState::default(),
                vault,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::upsert_project,
            commands::delete_project,
            commands::list_services,
            commands::upsert_service,
            commands::set_service_health,
            commands::delete_service,
            commands::probe_service,
            commands::list_logs,
            commands::append_log,
            commands::clear_logs,
            commands::log_sources,
            commands::list_env_profiles,
            commands::upsert_env_profile,
            commands::delete_env_profile,
            commands::list_env_vars,
            commands::upsert_env_var,
            commands::update_env_var_meta,
            commands::delete_env_var,
            commands::reveal_env_var,
            commands::list_snippets,
            commands::upsert_snippet,
            commands::delete_snippet,
            commands::run_snippet,
            commands::list_terminal_history,
            commands::append_terminal_history,
            commands::clear_terminal_history,
            commands::get_preference,
            commands::set_preference,
            commands::all_preferences,
            commands::get_dashboard_layout,
            commands::save_dashboard_layout,
            commands::git_status,
            commands::git_status_files,
            commands::git_diff,
            commands::git_stage,
            commands::git_unstage,
            commands::git_commit,
            commands::git_log,
            commands::git_branches,
            commands::git_checkout,
            commands::run_shell_command,
            commands::audit_tail,
            commands::plugin_dir,
            commands::plugin_ensure_dir,
            commands::plugin_list,
            commands::plugin_read_source,
            commands::plugin_reveal_dir,
            commands::plugin_delete,
            commands::api_list_requests,
            commands::api_upsert_request,
            commands::api_delete_request,
            commands::api_send,
            commands::db_list_connections,
            commands::db_upsert_connection,
            commands::db_delete_connection,
            commands::db_touch_connection,
            commands::db_test_connection,
            commands::db_tables,
            commands::db_table_schema,
            commands::db_query,
            commands::db_connection_path,
            commands::container_engine,
            commands::container_list,
            commands::container_action,
            commands::container_logs,
            commands::system_snapshot,
            commands::list_processes,
            commands::process_list,
            commands::process_kill,
            commands::list_mount_roots,
            commands::list_directory,
            commands::read_text_file,
            commands::is_wsl_runtime,
            commands::list_windows_drives,
            commands::mount_windows_drive,
            commands::pty_open,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DevOS");
}
