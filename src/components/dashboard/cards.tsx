import { useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, Boxes, CircleDot, Clock, Code2,
  FolderGit2, GitBranch, KeyRound, Play, ScrollText, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Bar, Button, Panel, Skeleton, StatusDot } from '@/components/ui'
import { cn } from '@/lib/utils'
import { bytes, clockTime, duration, percent, relativeTime, truncate } from '@/lib/format'
import { ipc } from '@/lib/ipc'
import type { EnvProfile, GitStatus, HistoryEntry, LogEntry, Project, Service, Snippet } from '@/lib/ipc'
import { useApp } from '@/store/app'

/* ------------------------------------------------------------ shared bits */
export function CardHeader({
  title, icon: Icon, hint, action,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  hint?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-ink-500" />
        <h3 className="truncate text-2xs font-semibold uppercase tracking-widest text-ink-400">
          {title}
        </h3>
        {hint}
      </div>
      {action}
    </div>
  )
}

const healthTone: Record<string, 'mint' | 'amber' | 'rose' | 'neutral'> = {
  healthy: 'mint', degraded: 'amber', down: 'rose', unknown: 'neutral',
}

/* ----------------------------------------------------------- ActiveProjects */
export function ActiveProjectsCard() {
  const [data, setData] = useState<Project[] | null>(null)
  useEffect(() => { ipc.listProjects().then(setData) }, [])

  return (
    <Panel className="flex flex-col" padded={false}>
      <div className="p-5">
        <CardHeader
          title="Active Projects"
          icon={FolderGit2}
          action={
            <Link to="/projects" className="text-2xs uppercase tracking-widest text-ink-500 transition-colors hover:text-accent-soft">
              all →
            </Link>
          }
        />
        {!data && (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        )}
        {data && (
          <ul className="flex flex-col gap-1.5">
            {data.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link
                  to="/terminal"
                  className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-all hover:border-white/[0.07] hover:bg-white/[0.03]"
                >
                  <span
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ background: p.color ?? '#5b8cff', boxShadow: `0 0 12px -2px ${p.color ?? '#5b8cff'}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-100">{p.name}</span>
                      {p.favorite && <CircleDot className="h-2.5 w-2.5 text-amber" />}
                    </div>
                    <div className="truncate font-mono text-2xs text-ink-500">{p.path}</div>
                  </div>
                  <span className="shrink-0 text-2xs text-ink-500">{relativeTime(p.lastOpenedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- SystemCard */
export function SystemCard() {
  const snap = useApp((s) => s.snapshot)

  if (!snap) {
    return (
      <Panel>
        <CardHeader title="System Health" icon={Activity} />
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      </Panel>
    )
  }

  const cpu = snap.cpu.usagePercent
  const memPct = (snap.memory.usedBytes / snap.memory.totalBytes) * 100
  const swapPct = snap.memory.swapTotalBytes
    ? (snap.memory.swapUsedBytes / snap.memory.swapTotalBytes) * 100 : 0
  const rootDisk = snap.disks[0]
  const diskPct = rootDisk
    ? ((rootDisk.totalBytes - rootDisk.availableBytes) / rootDisk.totalBytes) * 100
    : 0

  const cpuTone = cpu > 85 ? 'rose' : cpu > 65 ? 'amber' : 'mint'
  const memTone = memPct > 90 ? 'rose' : memPct > 75 ? 'amber' : 'mint'

  return (
    <Panel>
      <CardHeader
        title="System Health"
        icon={Activity}
        hint={
          <Badge tone={cpuTone === 'mint' ? 'mint' : cpuTone === 'amber' ? 'amber' : 'rose'}>
            {cpuTone === 'mint' ? 'nominal' : cpuTone === 'amber' ? 'elevated' : 'critical'}
          </Badge>
        }
      />
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-2xs text-ink-500">
            <span className="uppercase tracking-wider">cpu</span>
            <span className="tabular font-mono text-ink-200">{percent(cpu)}</span>
          </div>
          <Bar value={cpu} tone={cpuTone === 'mint' ? 'mint' : cpuTone === 'amber' ? 'amber' : 'rose'} />
          <div className="mt-1.5 truncate font-mono text-2xs text-ink-500">
            {snap.cpu.cores} cores · {truncate(snap.cpu.brand, 28)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-2xs text-ink-500">
            <span className="uppercase tracking-wider">memory</span>
            <span className="tabular font-mono text-ink-200">{percent(memPct)}</span>
          </div>
          <Bar value={memPct} tone={memTone === 'mint' ? 'mint' : memTone === 'amber' ? 'amber' : 'rose'} />
          <div className="mt-1.5 truncate font-mono text-2xs text-ink-500">
            {bytes(snap.memory.usedBytes)} / {bytes(snap.memory.totalBytes)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-2xs text-ink-500">
            <span className="uppercase tracking-wider">disk /</span>
            <span className="tabular font-mono text-ink-200">{percent(diskPct)}</span>
          </div>
          <Bar value={diskPct} tone={diskPct > 90 ? 'rose' : diskPct > 75 ? 'amber' : 'accent'} />
          <div className="mt-1.5 truncate font-mono text-2xs text-ink-500">
            {rootDisk ? `${bytes(rootDisk.availableBytes)} free` : '—'}
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-2xs text-ink-500">
            <span className="uppercase tracking-wider">swap</span>
            <span className="tabular font-mono text-ink-200">{percent(swapPct)}</span>
          </div>
          <Bar value={swapPct} tone="accent" />
          <div className="mt-1.5 truncate font-mono text-2xs text-ink-500">
            {bytes(snap.memory.swapUsedBytes)} / {bytes(snap.memory.swapTotalBytes)}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3 text-2xs text-ink-500">
        <span className="font-mono">{snap.host.hostname}</span>
        <span className="font-mono">up {duration(snap.host.uptimeSecs)}</span>
      </div>
    </Panel>
  )
}

/* ----------------------------------------------------------- ServicesCard */
export function ServicesCard() {
  const [data, setData] = useState<Service[] | null>(null)
  useEffect(() => { ipc.listServices().then(setData) }, [])

  return (
    <Panel>
      <CardHeader
        title="Services"
        icon={Boxes}
        action={<Link to="/services" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">all →</Link>}
      />
      {!data && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      {data && (
        <ul className="flex flex-col gap-1.5">
          {data.slice(0, 5).map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
              <StatusDot tone={healthTone[s.health] ?? 'neutral'} pulse={s.health === 'healthy'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink-100">{s.name}</div>
                <div className="truncate font-mono text-2xs text-ink-500">{s.url ?? s.target ?? '—'}</div>
              </div>
              <span className="shrink-0 rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                {s.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ---------------------------------------------------------------- GitCard */
export function GitCard() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [status, setStatus] = useState<GitStatus | null>(null)

  useEffect(() => {
    ipc.listProjects().then((ps) => {
      setProjects(ps)
      const first = ps.find((p) => p.kind !== 'unknown') ?? ps[0]
      if (first) ipc.gitStatus(first.path).then(setStatus).catch(() => null)
    })
  }, [])

  return (
    <Panel>
      <CardHeader title="Git" icon={GitBranch} action={<Link to="/git" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">open →</Link>} />
      {!status && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
      {status && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-accent-soft" />
            <span className="font-mono text-sm text-ink-100">{status.branch || 'main'}</span>
            {(status.ahead > 0 || status.behind > 0) && (
              <span className="font-mono text-2xs text-ink-500">
                {status.ahead > 0 && `↑${status.ahead}`}
                {status.behind > 0 && ` ↓${status.behind}`}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-center">
              <div className="text-base font-semibold tabular text-mint">{status.staged}</div>
              <div className="text-2xs uppercase tracking-widest text-ink-500">staged</div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-center">
              <div className="text-base font-semibold tabular text-amber">{status.modified}</div>
              <div className="text-2xs uppercase tracking-widest text-ink-500">modified</div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-center">
              <div className="text-base font-semibold tabular text-ink-200">{status.untracked}</div>
              <div className="text-2xs uppercase tracking-widest text-ink-500">untracked</div>
            </div>
          </div>

          {status.lastCommit.hash && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
              <div className="flex items-center gap-2 text-2xs text-ink-500">
                <span className="font-mono text-accent-soft">{status.lastCommit.hash}</span>
                <span>·</span>
                <span>{status.lastCommit.author}</span>
                <span className="ml-auto">{relativeTime(status.lastCommit.at)}</span>
              </div>
              <div className="mt-1 truncate text-xs text-ink-200">{status.lastCommit.subject}</div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------- HistoryCard */
export function HistoryCard() {
  const [data, setData] = useState<HistoryEntry[] | null>(null)
  useEffect(() => { ipc.listHistory(6).then(setData) }, [])

  return (
    <Panel>
      <CardHeader title="Recent Commands" icon={Clock} action={<Link to="/terminal" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">terminal →</Link>} />
      {!data && <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
      {data && (
        <ul className="flex flex-col gap-1">
          {data.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]">
              <span className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                h.exitCode === 0 ? 'bg-mint' : h.exitCode ? 'bg-rose' : 'bg-ink-500',
              )} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-200">{h.command}</span>
              <span className="shrink-0 font-mono text-2xs text-ink-500">
                {h.durationMs ? `${(h.durationMs / 1000).toFixed(1)}s` : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ----------------------------------------------------------------- EnvCard */
export function EnvCard() {
  const [profiles, setProfiles] = useState<EnvProfile[] | null>(null)
  useEffect(() => { ipc.listEnvProfiles().then(setProfiles) }, [])

  const active = profiles?.find((p) => p.isActive) ?? profiles?.[0]

  return (
    <Panel>
      <CardHeader title="Environment" icon={KeyRound} action={<Link to="/environment" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">manage →</Link>} />
      {!profiles && <Skeleton className="h-16" />}
      {profiles && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={active?.isActive ? 'mint' : 'neutral'} pulse={active?.isActive} />
            <span className="truncate text-sm text-ink-100">{active?.name ?? 'no active profile'}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profiles.map((p) => (
              <span key={p.id} className={cn(
                'rounded-full border px-2 py-0.5 font-mono text-2xs',
                p.isActive
                  ? 'border-mint/30 bg-mint/10 text-mint'
                  : 'border-white/[0.08] bg-white/[0.03] text-ink-400',
              )}>
                {p.name.split('·')[1]?.trim() ?? p.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

/* ---------------------------------------------------------------- LogsCard */
export function LogsCard() {
  const [data, setData] = useState<LogEntry[] | null>(null)
  useEffect(() => { ipc.listLogs({ limit: 6 }).then(setData) }, [])

  const levelColor: Record<string, string> = {
    debug: 'text-ink-500',
    info: 'text-accent-soft',
    warn: 'text-amber',
    error: 'text-rose',
  }

  return (
    <Panel>
      <CardHeader title="Recent Logs" icon={ScrollText} action={<Link to="/logs" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">all →</Link>} />
      {!data && <div className="space-y-1.5">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-6" />)}</div>}
      {data && (
        <ul className="flex flex-col gap-1 font-mono text-2xs">
          {data.map((l) => (
            <li key={l.id} className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-white/[0.03]">
              <span className="shrink-0 text-ink-500">{clockTime(l.at)}</span>
              <span className={cn('w-10 shrink-0 uppercase', levelColor[l.level] ?? 'text-ink-400')}>
                {l.level}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-300">
                <span className="text-ink-500">[{l.source}]</span> {l.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* --------------------------------------------------------- QuickActionsCard */
export function QuickActionsCard() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null)
  const toast = useApp((s) => s.toast)

  useEffect(() => { ipc.listSnippets().then(setSnippets) }, [])

  const runSnippet = async (s: Snippet) => {
    try {
      const res = await ipc.runSnippet(s.id)
      toast({
        tone: res.exitCode === 0 ? 'success' : 'error',
        title: `Ran "${s.name}"`,
        description: res.exitCode === 0 ? 'completed successfully' : `exit ${res.exitCode}`,
      })
    } catch (e) {
      toast({ tone: 'error', title: 'Snippet failed', description: String(e) })
    }
  }

  return (
    <Panel>
      <CardHeader title="Quick Actions" icon={Zap} action={<Link to="/snippets" className="text-2xs uppercase tracking-widest text-ink-500 hover:text-accent-soft">all →</Link>} />
      {!snippets && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      {snippets && (
        <ul className="flex flex-col gap-1.5">
          {snippets.slice(0, 4).map((s) => (
            <li key={s.id}>
              <button
                onClick={() => runSnippet(s)}
                className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-all hover:border-white/[0.07] hover:bg-white/[0.03]"
              >
                <Code2 className="h-3.5 w-3.5 shrink-0 text-ink-500 group-hover:text-accent-soft" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink-100">{s.name}</div>
                  {s.description && <div className="truncate text-2xs text-ink-500">{s.description}</div>}
                </div>
                <Play className="h-3 w-3 shrink-0 text-ink-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
