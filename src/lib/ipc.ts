/**
 * Typed IPC bridge. Components never touch `invoke` directly.
 * Outside Tauri the calls route to the browser mock layer.
 */
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import * as mock from './mock'
import type {
  CommandResult, DashboardWidget, EnvProfile, EnvVar, GitStatus, HistoryEntry,
  LogEntry, ProcessRow, Project, Service, Snippet, SystemSnapshot,
} from './types'

export type * from './types'

export type MountRoot = {
  label: string
  path: string
  kind: 'home' | 'drive' | 'usb' | string
}


export type DirEntry = {
  name: string
  path: string
  kind: 'file' | 'dir' | 'symlink' | 'other' | string
  size: number
  modifiedMs: number | null
  hidden: boolean
  isText: boolean
}

export type FileContents = {
  path: string
  content: string
  truncated: boolean
  size: number
  lines: number
}

export type GitFileStatus = {
  path: string
  index: string
  worktree: string
  staged: boolean
  untracked: boolean
  renamedFrom: string | null
}

export type GitRepoStatus = {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileStatus[]
}

export type GitCommit = {
  hash: string
  short: string
  subject: string
  author: string
  at: string
}

export type ContainerEngine = {
  available: boolean
  bin: string | null
  version: string | null
  daemonOk: boolean
  error: string | null
}

export type ContainerRow = {
  id: string
  shortId: string
  name: string
  image: string
  state: string
  status: string
  ports: string
  createdAt: string
  labels: string[]
}

export type DbConnection = {
  id: string
  name: string
  kind: string
  path: string | null
  url: string | null
  readOnly: boolean
  createdAt: string
  lastUsedAt: string | null
}

export type DbProbe = {
  ok: boolean
  version: string | null
  pageCount: number | null
  pageSize: number | null
  error: string | null
}

export type DbTable = {
  name: string
  kind: 'table' | 'view' | string
  rowEstimate: number | null
}

export type DbColumn = {
  name: string
  typeName: string
  notNull: boolean
  primaryKey: boolean
  defaultValue: string | null
}

export type ApiHeader = {
  key: string
  value: string
  enabled: boolean
}

export type ApiRequest = {
  id: string
  collection: string
  name: string
  method: string
  url: string
  headers: ApiHeader[]
  body: string
  bodyKind: 'json' | 'text' | 'form' | string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ApiResponseHeader = {
  key: string
  value: string
}

export type ApiResponse = {
  status: number
  statusText: string
  headers: ApiResponseHeader[]
  body: string
  bodyTruncated: boolean
  sizeBytes: number
  durationMs: number
  error: string | null
}

export type PluginCommandDef = {
  id: string
  label: string
  description?: string | null
}

export type PluginManifest = {
  id: string
  name: string
  version: string
  description?: string | null
  author?: string | null
  allowShell: boolean
  commands: PluginCommandDef[]
}

export type PluginInfo = {
  manifest: PluginManifest
  dir: string
  hasSource: boolean
  error: string | null
}

export type QueryResult = {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  durationMs: number
  rowsAffected: number | null
}

export type WindowsDrive = {
  letter: string
  label: string
  wslPath: string
  mounted: boolean
}


export const isDesktop =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isDesktop) return tauriInvoke<T>(cmd, args)
  return mock.handle<T>(cmd, args)
}

export const ipc = {
  listProjects: () => call<Project[]>('list_projects'),
  upsertProject: (project: Project) => call<Project>('upsert_project', { project }),
  deleteProject: (id: string) => call<void>('delete_project', { id }),

  listServices: () => call<Service[]>('list_services'),
  upsertService: (service: Service) => call<Service>('upsert_service', { service }),
  setServiceHealth: (id: string, health: string) =>
    call<void>('set_service_health', { id, health }),
  deleteService: (id: string) => call<void>('delete_service', { id }),
  /** Pings the service URL and updates the health column. Returns the new health. */
  probeService: (id: string) => call<string>('probe_service', { id }),

  listLogs: (opts?: { limit?: number; level?: string; source?: string }) =>
    call<LogEntry[]>('list_logs', {
      limit: opts?.limit ?? 200,
      level: opts?.level ?? null,
      source: opts?.source ?? null,
    }),
  appendLog: (source: string, level: string, message: string, meta?: Record<string, unknown>) =>
    call<void>('append_log', { source, level, message, meta: meta ?? {} }),
  clearLogs: () => call<void>('clear_logs'),
  /** Distinct source names for the Logs view filter. */
  logSources: () => call<string[]>('log_sources'),

  listEnvProfiles: () => call<EnvProfile[]>('list_env_profiles'),
  upsertEnvProfile: (profile: EnvProfile) => call<EnvProfile>('upsert_env_profile', { profile }),
  deleteEnvProfile: (id: string) => call<void>('delete_env_profile', { id }),
  listEnvVars: (profileId: string) => call<EnvVar[]>('list_env_vars', { profileId }),
  upsertEnvVar: (v: EnvVar) => call<EnvVar>('upsert_env_var', { var: v }),
  updateEnvVarMeta: (id: string, key: string, secret: boolean) =>
    call<void>('update_env_var_meta', { id, key, secret }),
  deleteEnvVar: (id: string) => call<void>('delete_env_var', { id }),
  revealEnvVar: (id: string) => call<string>('reveal_env_var', { id }),

  listSnippets: () => call<Snippet[]>('list_snippets'),
  upsertSnippet: (snippet: Snippet) => call<Snippet>('upsert_snippet', { snippet }),
  deleteSnippet: (id: string) => call<void>('delete_snippet', { id }),
  runSnippet: (id: string, cwd?: string) => call<CommandResult>('run_snippet', { id, cwd }),

  listHistory: (limit = 50) => call<HistoryEntry[]>('list_terminal_history', { limit }),
  appendHistory: (entry: Omit<HistoryEntry, 'id' | 'ranAt'>) =>
    call<void>('append_terminal_history', entry),
  clearHistory: () => call<void>('clear_terminal_history'),

  getPreference: (key: string) => call<string | null>('get_preference', { key }),
  setPreference: (key: string, value: string) => call<void>('set_preference', { key, value }),
  allPreferences: () => call<[string, string][]>('all_preferences'),

  getLayout: () => call<DashboardWidget[]>('get_dashboard_layout'),
  saveLayout: (widgets: DashboardWidget[]) =>
    call<void>('save_dashboard_layout', { widgets }),

  gitStatus: (path: string) => call<GitStatus>('git_status', { path }),
  runCommand: (command: string, cwd?: string) =>
    call<CommandResult>('run_shell_command', { command, cwd: cwd ?? null }),

  systemSnapshot: () => call<SystemSnapshot>('system_snapshot'),
  listProcesses: (limit = 15) => call<ProcessRow[]>('list_processes', { limit }),
  processList: (filter?: string, sort: 'cpu' | 'memory' | 'pid' | 'name' = 'cpu', limit = 500) =>
    call<ProcessRow[]>('process_list', { filter: filter ?? null, sort, limit }),
  processKill: (pid: number, force = false) =>
    call<void>('process_kill', { pid, force }),

  ptyOpen: (id: string, cols: number, rows: number, cwd?: string, shell?: string) =>
    call<void>('pty_open', { id, cols, rows, cwd: cwd ?? null, shell: shell ?? null }),
  ptyWrite: (id: string, data: string) => call<void>('pty_write', { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    call<void>('pty_resize', { id, cols, rows }),
  ptyClose: (id: string) => call<void>('pty_close', { id }),

  auditTail: (limit = 100) => call<Record<string, unknown>[]>('audit_tail', { limit }),

  /** Native folder picker. Returns null in browser mode. */
  async pickFolder(title = 'Choose a folder', defaultPath?: string) {
    if (!isDesktop) return null
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      directory: true,
      multiple: false,
      title,
      defaultPath: defaultPath ?? undefined,
    })
    return typeof selected === 'string' ? selected : null
  },

  /** Interesting filesystem roots: home, WSL drives, removable media. */
  listMountRoots: () => call<MountRoot[]>('list_mount_roots'),

  /** List one directory level. Fast; UI expands children lazily. */
  listDirectory: (path: string) => call<DirEntry[]>('list_directory', { path }),

  /** Read a text file. Capped at `maxBytes` (default 2 MiB) on the Rust side. */
  readTextFile: (path: string, maxBytes?: number) =>
    call<FileContents>('read_text_file', { path, maxBytes: maxBytes ?? null }),

  /** True when running inside WSL. */
  isWsl: () => call<boolean>('is_wsl_runtime'),

  /** Every drive Windows knows about, mounted or not. */
  listWindowsDrives: () => call<WindowsDrive[]>('list_windows_drives'),

  /** Attempt a passwordless mount of an unmounted Windows drive. */
  mountWindowsDrive: (letter: string) =>
    call<boolean>('mount_windows_drive', { letter }),

  // ---- git (extended) ----------------------------------------------------
  gitStatusFiles: (repo: string) =>
    call<GitRepoStatus>('git_status_files', { repo }),
  gitDiff: (repo: string, file: string, staged: boolean) =>
    call<string>('git_diff', { repo, file, staged }),
  gitStage: (repo: string, paths: string[]) =>
    call<void>('git_stage', { repo, paths }),
  gitUnstage: (repo: string, paths: string[]) =>
    call<void>('git_unstage', { repo, paths }),
  gitCommit: (repo: string, message: string) =>
    call<string>('git_commit', { repo, message }),
  gitLog: (repo: string, limit = 20) =>
    call<GitCommit[]>('git_log', { repo, limit }),
  gitBranches: (repo: string) => call<string[]>('git_branches', { repo }),
  gitCheckout: (repo: string, branch: string) =>
    call<void>('git_checkout', { repo, branch }),

  // ---- containers --------------------------------------------------------
  containerEngine: () => call<ContainerEngine>('container_engine'),
  containerList: (all = true) => call<ContainerRow[]>('container_list', { all }),
  containerAction: (id: string, action: 'start' | 'stop' | 'restart') =>
    call<string>('container_action', { id, action }),
  containerLogs: (id: string, tail = 200) =>
    call<string>('container_logs', { id, tail }),

  // ---- database ----------------------------------------------------------
  dbListConnections: () => call<DbConnection[]>('db_list_connections'),
  dbUpsertConnection: (c: DbConnection) =>
    call<DbConnection>('db_upsert_connection', { connection: c }),
  dbDeleteConnection: (id: string) => call<void>('db_delete_connection', { id }),
  dbTouchConnection: (id: string) => call<void>('db_touch_connection', { id }),
  dbTestConnection: (path: string) => call<DbProbe>('db_test_connection', { path }),
  dbTables: (path: string) => call<DbTable[]>('db_tables', { path }),
  dbTableSchema: (path: string, table: string) =>
    call<DbColumn[]>('db_table_schema', { path, table }),
  dbQuery: (path: string, sql: string, limit = 500, allowWrites = false) =>
    call<QueryResult>('db_query', { path, sql, limit, allowWrites }),
  dbConnectionPath: (id: string) => call<string | null>('db_connection_path', { id }),

  // ---- api tester --------------------------------------------------------
  apiListRequests: () => call<ApiRequest[]>('api_list_requests'),
  apiUpsertRequest: (request: ApiRequest) =>
    call<ApiRequest>('api_upsert_request', { request }),
  apiDeleteRequest: (id: string) => call<void>('api_delete_request', { id }),
  apiSend: (method: string, url: string, headers: ApiHeader[], body: string) =>
    call<ApiResponse>('api_send', { method, url, headers, body }),

  // ---- plugins -----------------------------------------------------------
  pluginDir: () => call<string>('plugin_dir'),
  pluginEnsureDir: () => call<string>('plugin_ensure_dir'),
  pluginList: () => call<PluginInfo[]>('plugin_list'),
  pluginReadSource: (id: string) => call<string>('plugin_read_source', { id }),
  pluginRevealDir: () => call<void>('plugin_reveal_dir'),
  pluginDelete: (id: string) => call<void>('plugin_delete', { id }),
}
