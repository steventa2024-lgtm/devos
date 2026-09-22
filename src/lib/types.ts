export type Project = {
  id: string
  name: string
  path: string
  kind: string
  color?: string | null
  tags: string[]
  favorite: boolean
  lastOpenedAt?: string | null
  createdAt: string
}

export type Service = {
  id: string
  name: string
  kind: string
  target?: string | null
  url?: string | null
  health: string
  autostart: boolean
  meta: Record<string, unknown>
  updatedAt: string
}

export type LogEntry = {
  id: number
  source: string
  level: string
  message: string
  meta: Record<string, unknown>
  at: string
}

export type EnvProfile = {
  id: string
  projectId?: string | null
  name: string
  isActive: boolean
  createdAt: string
}

export type EnvVar = {
  id: string
  profileId: string
  key: string
  value: string
  secret: boolean
}

export type Snippet = {
  id: string
  name: string
  description?: string | null
  language: string
  body: string
  tags: string[]
  runCount: number
  lastRunAt?: string | null
  createdAt: string
}

export type HistoryEntry = {
  id: number
  projectId?: string | null
  command: string
  cwd?: string | null
  exitCode?: number | null
  durationMs?: number | null
  ranAt: string
}

export type DashboardWidget = {
  id: string
  widget: string
  position: number
  size: string
  visible: boolean
  config: Record<string, unknown>
}

export type SystemSnapshot = {
  cpu: { usagePercent: number; cores: number; brand: string }
  memory: {
    totalBytes: number
    usedBytes: number
    availableBytes: number
    swapTotalBytes: number
    swapUsedBytes: number
  }
  disks: { name: string; mount: string; totalBytes: number; availableBytes: number; removable: boolean }[]
  network: { rxBytes: number; txBytes: number }
  host: {
    hostname: string
    osName: string
    osVersion: string
    kernel: string
    uptimeSecs: number
    processCount: number
  }
  sampledAt: string
}

export type ProcessRow = {
  pid: number
  parentPid: number | null
  name: string
  cmd: string
  cpuPercent: number
  memoryBytes: number
  user: string | null
  status: string
}

export type CommandResult = {
  stdout: string
  stderr: string
  exitCode?: number | null
  durationMs: number
}

export type GitStatus = {
  repo: string
  branch: string
  ahead: number
  behind: number
  staged: number
  modified: number
  untracked: number
  lastCommit: { hash: string; subject: string; author: string; at: string }
}
