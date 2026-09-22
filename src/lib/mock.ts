/**
 * Browser fallback. Populates the UI when running outside the Tauri shell.
 */
import type {
  CommandResult, EnvProfile, EnvVar, HistoryEntry, LogEntry,
  ProcessRow, Project, Service, Snippet, SystemSnapshot,
} from './types'

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString()

const projects: Project[] = [
  { id: 'p1', name: 'devos', path: '/home/dev/devos', kind: 'tauri', color: '#5b8cff', tags: ['desktop', 'rust'], favorite: true, lastOpenedAt: iso(4), createdAt: iso(2000) },
  { id: 'p2', name: 'atlas-api', path: '/home/dev/atlas-api', kind: 'node', color: '#48d6a5', tags: ['backend', 'fastify'], favorite: true, lastOpenedAt: iso(48), createdAt: iso(6000) },
  { id: 'p3', name: 'nebula-ui', path: '/home/dev/nebula-ui', kind: 'node', color: '#a479ff', tags: ['frontend'], favorite: false, lastOpenedAt: iso(310), createdAt: iso(9000) },
  { id: 'p4', name: 'ledger-core', path: '/home/dev/ledger-core', kind: 'rust', color: '#f0b45f', tags: ['service'], favorite: false, lastOpenedAt: iso(1900), createdAt: iso(20000) },
]

const services: Service[] = [
  { id: 's1', name: 'atlas-api', kind: 'node', target: 'pnpm dev', url: 'http://localhost:4000', health: 'healthy', autostart: true, meta: { port: 4000 }, updatedAt: iso(1) },
  { id: 's2', name: 'postgres', kind: 'docker', target: 'atlas-db', url: 'postgres://localhost:5432', health: 'healthy', autostart: true, meta: { container: 'atlas-db' }, updatedAt: iso(3) },
  { id: 's3', name: 'redis', kind: 'docker', target: 'atlas-cache', url: 'redis://localhost:6379', health: 'degraded', autostart: false, meta: {}, updatedAt: iso(12) },
  { id: 's4', name: 'nebula-ui', kind: 'node', target: 'vite --port 5173', url: 'http://localhost:5173', health: 'healthy', autostart: false, meta: { port: 5173 }, updatedAt: iso(6) },
  { id: 's5', name: 'minio', kind: 'docker', target: 'atlas-objects', url: 'http://localhost:9000', health: 'down', autostart: false, meta: {}, updatedAt: iso(220) },
]

const logs: LogEntry[] = [
  { id: 1042, source: 'atlas-api', level: 'info', message: 'GET /v1/ledger/entries 200 12ms', meta: {}, at: iso(0) },
  { id: 1041, source: 'atlas-api', level: 'warn', message: 'connection pool at 82% capacity', meta: { pool: 'pg' }, at: iso(2) },
  { id: 1040, source: 'docker', level: 'error', message: 'container atlas-objects exited with code 137', meta: { container: 'atlas-objects' }, at: iso(4) },
  { id: 1039, source: 'devos', level: 'info', message: 'workspace layout saved', meta: {}, at: iso(6) },
  { id: 1038, source: 'nebula-ui', level: 'debug', message: 'hmr update src/routes/index.tsx', meta: {}, at: iso(8) },
  { id: 1037, source: 'git', level: 'info', message: 'fetched origin/main (3 commits)', meta: {}, at: iso(14) },
  { id: 1036, source: 'postgres', level: 'info', message: 'checkpoint complete: wrote 412 buffers', meta: {}, at: iso(22) },
]

const envProfiles: EnvProfile[] = [
  { id: 'e1', projectId: 'p2', name: 'atlas · development', isActive: true, createdAt: iso(4000) },
  { id: 'e2', projectId: 'p2', name: 'atlas · staging', isActive: false, createdAt: iso(4000) },
  { id: 'e3', projectId: 'p1', name: 'devos · local', isActive: false, createdAt: iso(1800) },
]

const envVars: EnvVar[] = [
  { id: 'v1', profileId: 'e1', key: 'DATABASE_URL', value: 'postgres://localhost:5432/atlas', secret: false },
  { id: 'v2', profileId: 'e1', key: 'JWT_SECRET', value: 'JWT_SECRET=••••••••', secret: true },
  { id: 'v3', profileId: 'e1', key: 'STRIPE_KEY', value: 'STRIPE_KEY=••••••••', secret: true },
  { id: 'v4', profileId: 'e1', key: 'LOG_LEVEL', value: 'debug', secret: false },
]

const snippets: Snippet[] = [
  { id: 'n1', name: 'Reset local DB', description: 'Drop, recreate and reseed the dev database', language: 'bash', body: 'pnpm db:reset && pnpm db:seed', tags: ['db', 'dev'], runCount: 42, lastRunAt: iso(30), createdAt: iso(5000) },
  { id: 'n2', name: 'Kill port 4000', description: 'Free a stuck dev server port', language: 'bash', body: 'lsof -ti:4000 | xargs -r kill -9', tags: ['ops'], runCount: 17, lastRunAt: iso(300), createdAt: iso(5000) },
  { id: 'n3', name: 'Prune docker', description: 'Remove dangling images and volumes', language: 'bash', body: 'docker system prune -af --volumes', tags: ['docker'], runCount: 9, lastRunAt: iso(2000), createdAt: iso(5000) },
]

const history: HistoryEntry[] = [
  { id: 1, projectId: 'p2', command: 'pnpm test --filter ledger', cwd: '/home/dev/atlas-api', exitCode: 0, durationMs: 8421, ranAt: iso(3) },
  { id: 2, projectId: 'p1', command: 'cargo tauri dev', cwd: '/home/dev/devos', exitCode: 0, durationMs: 20114, ranAt: iso(11) },
  { id: 3, projectId: 'p2', command: 'docker compose up -d', cwd: '/home/dev/atlas-api', exitCode: 0, durationMs: 5210, ranAt: iso(46) },
  { id: 4, projectId: 'p3', command: 'pnpm lint --fix', cwd: '/home/dev/nebula-ui', exitCode: 1, durationMs: 3320, ranAt: iso(120) },
  { id: 5, projectId: null, command: 'git fetch --all --prune', cwd: '/home/dev', exitCode: 0, durationMs: 1180, ranAt: iso(210) },
]

function snapshot(): SystemSnapshot {
  const jitter = () => 24 + Math.random() * 22
  return {
    cpu: { usagePercent: jitter(), cores: 16, brand: 'AMD Ryzen 9 7940HS' },
    memory: {
      totalBytes: 33_554_432_000,
      usedBytes: 19_327_000_000,
      availableBytes: 14_227_432_000,
      swapTotalBytes: 8_589_934_592,
      swapUsedBytes: 402_653_184,
    },
    disks: [
      { name: 'nvme0n1p2', mount: '/', totalBytes: 1_000_204_886_016, availableBytes: 402_653_184_000, removable: false },
      { name: 'sda1', mount: '/mnt/archive', totalBytes: 2_000_398_934_016, availableBytes: 1_402_653_184_000, removable: true },
    ],
    network: { rxBytes: 4_812_334_112, txBytes: 1_204_887_552 },
    host: {
      hostname: 'devos-workstation',
      osName: 'Linux',
      osVersion: 'Ubuntu 24.04.1 LTS',
      kernel: '6.8.0-45-generic',
      uptimeSecs: 214_320,
      processCount: 412,
    },
    sampledAt: new Date().toISOString(),
  }
}

const processes: ProcessRow[] = [
  { pid: 1,    parentPid: null, name: 'systemd',  cmd: '/sbin/init',                                          cpuPercent: 0.1, memoryBytes: 12_582_912,   user: 'root',      status: 'sleep' },
  { pid: 220,  parentPid: 1,    name: 'Xorg',     cmd: '/usr/lib/xorg/Xorg -nolisten tcp vt1',                cpuPercent: 2.9, memoryBytes: 302_776_320,  user: 'root',      status: 'sleep' },
  { pid: 842,  parentPid: 1,    name: 'dockerd',  cmd: '/usr/bin/dockerd -H fd:// --containerd=...',          cpuPercent: 6.1, memoryBytes: 254_803_968,  user: 'root',      status: 'run' },
  { pid: 1190, parentPid: 842,  name: 'postgres', cmd: 'postgres -D /var/lib/postgresql/data',                cpuPercent: 12.4, memoryBytes: 402_653_184, user: 'postgres',  status: 'run' },
  { pid: 2841, parentPid: 1,    name: 'node',     cmd: 'node /usr/local/bin/vite --port 1420',                cpuPercent: 38.2, memoryBytes: 892_334_080, user: 'dev', status: 'run' },
  { pid: 3312, parentPid: 2841, name: 'rustc',    cmd: 'rustc --crate-name devos_lib src/lib.rs',             cpuPercent: 9.8,  memoryBytes: 1_204_887_552, user: 'dev', status: 'run' },
  { pid: 4410, parentPid: 2841, name: 'vite',     cmd: 'vite',                                                cpuPercent: 4.3,  memoryBytes: 188_743_680, user: 'dev', status: 'run' },
]

const gitByRepo: Record<string, unknown> = {
  '/home/dev/devos': {
    repo: '/home/dev/devos',
    branch: 'main',
    ahead: 2, behind: 0, staged: 3, modified: 5, untracked: 1,
    lastCommit: { hash: 'a91f3c2', subject: 'feat: dashboard glass panels', author: 'you', at: iso(38) },
  },
}

const ok = (stdout: string, exitCode = 0): CommandResult => ({
  stdout,
  stderr: exitCode === 0 ? '' : 'command failed',
  exitCode,
  durationMs: 120 + Math.random() * 400,
})

export async function handle<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 90))

  switch (cmd) {
    case 'list_projects': return projects as T
    case 'upsert_project': return args!.project as T
    case 'delete_project': return undefined as T

    case 'list_services': return services as T
    case 'upsert_service': return args!.service as T
    case 'set_service_health': return undefined as T

    case 'list_logs': return logs as T
    case 'append_log': return undefined as T
    case 'clear_logs': return undefined as T

    case 'list_env_profiles': return envProfiles as T
    case 'upsert_env_profile': return args!.profile as T
    case 'list_env_vars': return envVars.filter((v) => v.profileId === args!.profileId) as T
    case 'upsert_env_var': return args!.var as T
    case 'delete_env_var': return undefined as T
    case 'reveal_env_var': return 'sk_live_51H8xQ2eZvKYlo2C' as T

    case 'list_snippets': return snippets as T
    case 'upsert_snippet': return args!.snippet as T
    case 'delete_snippet': return undefined as T
    case 'run_snippet': return ok('✔ snippet finished in 0.42s') as T

    case 'list_terminal_history': return history as T
    case 'append_terminal_history': return undefined as T
    case 'clear_terminal_history': return undefined as T

    case 'get_preference': return null as T
    case 'set_preference': return undefined as T
    case 'all_preferences': return [] as T

    case 'get_dashboard_layout': return [] as T
    case 'save_dashboard_layout': return undefined as T

    case 'git_status':
      return (gitByRepo[args!.path] ?? {
        repo: args!.path, branch: 'main',
        ahead: 0, behind: 0, staged: 0, modified: 0, untracked: 0,
        lastCommit: { hash: '', subject: 'no commits', author: '', at: '' },
      }) as T

    case 'run_shell_command': return ok(`$ ${args!.command}\n(mock output)`) as T

    case 'system_snapshot': return snapshot() as T
    case 'list_processes': return processes.slice(0, args?.limit ?? 15) as T

    case 'pty_open': case 'pty_write': case 'pty_resize': case 'pty_close':
      return undefined as T

    case 'audit_tail': return [] as T

    default:
      console.warn(`[devos] no mock for command "${cmd}"`)
      return undefined as T
  }
}
