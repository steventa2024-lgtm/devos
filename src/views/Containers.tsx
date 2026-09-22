import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box, Cpu, FileText, Loader2, Play, RefreshCw, RotateCw, ServerCog,
  Square, Terminal, X,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import type { ContainerEngine, ContainerRow } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

/* ------------------------------------------------------------------ helpers */

function stateTone(state: string): 'mint' | 'amber' | 'rose' | 'neutral' | 'accent' {
  switch (state) {
    case 'running':   return 'mint'
    case 'restarting':
    case 'paused':    return 'amber'
    case 'exited':
    case 'dead':      return 'rose'
    default:          return 'neutral'
  }
}

function shortImage(image: string): string {
  // "sha256:abc..." -> "sha256:abc…"; "nginx:latest" -> "nginx:latest"
  if (image.length <= 40) return image
  return image.slice(0, 40) + '…'
}

/* ------------------------------------------------------------------ view */

export default function Containers() {
  const toast = useApp((s) => s.toast)

  const [engine, setEngine] = useState<ContainerEngine | null>(null)
  const [items, setItems] = useState<ContainerRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(true)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [logTarget, setLogTarget] = useState<ContainerRow | null>(null)

  /* ----------------------------------------------------------- load */

  const loadEngine = useCallback(async () => {
    const e = await ipc.containerEngine()
    setEngine(e)
    return e
  }, [])

  const loadContainers = useCallback(async (all: boolean) => {
    setLoading(true)
    try {
      const list = await ipc.containerList(all)
      setItems(list)
    } catch (e) {
      setItems([])
      toast({ tone: 'error', title: 'Container list failed', description: String(e) })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!isDesktop) return
    loadEngine().then((e) => {
      if (e.available && e.daemonOk) loadContainers(showAll)
      else setItems([])
    })
  }, [loadEngine, loadContainers, showAll])

  useEffect(() => {
    if (!isDesktop || !engine?.daemonOk) return
    loadContainers(showAll)
  }, [showAll, engine?.daemonOk, loadContainers])

  /* ----------------------------------------------------------- actions */

  const act = async (c: ContainerRow, action: 'start' | 'stop' | 'restart') => {
    if (action !== 'start') {
      const verb = action === 'stop' ? 'Stop' : 'Restart'
      if (!confirm(`${verb} container "${c.name}"?`)) return
    }
    setBusy((b) => ({ ...b, [c.id]: true }))
    try {
      await ipc.containerAction(c.id, action)
      toast({ tone: 'success', title: `${action} ${c.name}` })
      await loadContainers(showAll)
    } catch (e) {
      toast({ tone: 'error', title: `${action} failed`, description: String(e) })
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }))
    }
  }

  /* ----------------------------------------------------------- summary */

  const summary = useMemo(() => {
    const list = items ?? []
    return {
      total: list.length,
      running: list.filter((c) => c.state === 'running').length,
      stopped: list.filter((c) => c.state === 'exited').length,
      paused: list.filter((c) => c.state === 'paused').length,
    }
  }, [items])

  /* ----------------------------------------------------------- render */

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <Header />
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Containers are only available in the desktop build.
        </Panel>
      </div>
    )
  }

  // Engine missing entirely.
  if (engine && !engine.available) {
    return (
      <div className="flex flex-col gap-5">
        <Header />
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <ServerCog className="mb-3 h-8 w-8 text-ink-500" />
          <div className="text-sm text-ink-200">No container engine found</div>
          <div className="mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            DevOS looks for <code className="font-mono text-ink-300">docker</code>,
            <code className="mx-1 font-mono text-ink-300">podman</code>, or
            <code className="mx-1 font-mono text-ink-300">nerdctl</code> on your PATH.
            Install one, then click Refresh.
          </div>
        </Panel>
      </div>
    )
  }

  // Engine CLI exists but daemon is down.
  if (engine && engine.available && !engine.daemonOk) {
    return (
      <div className="flex flex-col gap-5">
        <Header
          engine={engine}
          onRefresh={() => {
            loadEngine().then((e) => {
              if (e.daemonOk) loadContainers(showAll)
            })
          }}
        />
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <ServerCog className="mb-3 h-8 w-8 text-amber" />
          <div className="text-sm text-ink-200">
            {engine.bin} is installed but the daemon isn't responding
          </div>
          <div className="mt-2 max-w-md text-xs text-ink-500">
            Start {engine.bin} Desktop (or <code className="font-mono">dockerd</code>) and try again.
          </div>
          {engine.error && (
            <pre className="mt-4 max-w-xl overflow-x-auto rounded-md border border-white/[0.06] bg-black/30 p-3 font-mono text-2xs text-rose">
              {engine.error}
            </pre>
          )}
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <Header engine={engine} onRefresh={() => loadContainers(showAll)} loading={loading} />

      {/* Summary strip */}
      {items && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="total"   value={summary.total}   tone="neutral" />
          <StatChip label="running" value={summary.running} tone="mint" />
          <StatChip label="stopped" value={summary.stopped} tone="rose" />
          <StatChip label="paused"  value={summary.paused}  tone="amber" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={showAll ? 'primary' : 'subtle'}
          onClick={() => setShowAll(true)}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={!showAll ? 'primary' : 'subtle'}
          onClick={() => setShowAll(false)}
        >
          Running only
        </Button>
        {engine?.version && (
          <span className="ml-auto font-mono text-2xs text-ink-500">{engine.version}</span>
        )}
      </div>

      {!items && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <Box className="mb-3 h-8 w-8 text-ink-500" />
          <div className="text-sm text-ink-200">
            {showAll ? 'No containers yet' : 'No running containers'}
          </div>
          <div className="mt-2 max-w-sm text-2xs text-ink-500">
            {showAll
              ? `Create one with ${engine?.bin ?? 'docker'} run, or check the terminal.`
              : 'Toggle "All" to see stopped containers.'}
          </div>
        </Panel>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const tone = stateTone(c.state)
            const isBusy = busy[c.id]
            const running = c.state === 'running'
            const stopped = c.state === 'exited' || c.state === 'created'
            return (
              <Panel key={c.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusDot tone={tone} pulse={running} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-100">{c.name}</div>
                      <div className="truncate font-mono text-2xs text-ink-500">
                        {c.shortId} · {shortImage(c.image)}
                      </div>
                    </div>
                  </div>
                  <Badge tone={tone}>{c.state}</Badge>
                </div>

                <div className="flex flex-col gap-1.5 rounded-md border border-white/[0.06] bg-black/25 p-2.5 font-mono text-2xs">
                  <div className="truncate text-ink-300">{c.status || '—'}</div>
                  {c.ports && (
                    <div className="truncate text-ink-500">{c.ports}</div>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] pt-3 text-2xs text-ink-500">
                  <span className="truncate">
                    {c.labels.length > 0 ? `${c.labels.length} label${c.labels.length === 1 ? '' : 's'}` : '—'}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {stopped && (
                      <IconButton
                        label="Start"
                        disabled={isBusy}
                        onClick={() => act(c, 'start')}
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      </IconButton>
                    )}
                    {running && (
                      <IconButton
                        label="Stop"
                        disabled={isBusy}
                        onClick={() => act(c, 'stop')}
                        tone="danger"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                      </IconButton>
                    )}
                    <IconButton
                      label="Restart"
                      disabled={isBusy}
                      onClick={() => act(c, 'restart')}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label="View logs"
                      onClick={() => setLogTarget(c)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {logTarget && (
        <LogDrawer
          container={logTarget}
          onClose={() => setLogTarget(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ header */

function Header({
  engine,
  onRefresh,
  loading,
}: {
  engine?: ContainerEngine | null
  onRefresh?: () => void
  loading?: boolean
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Containers</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-400">
          Local engine dashboard.
          {engine?.bin && (
            <Badge tone={engine.daemonOk ? 'mint' : 'rose'}>{engine.bin}</Badge>
          )}
        </p>
      </div>
      {onRefresh && (
        <Button
          variant="subtle"
          onClick={onRefresh}
          disabled={loading}
          leading={loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ chips */

function StatChip({
  label, value, tone,
}: {
  label: string
  value: number
  tone: 'mint' | 'amber' | 'rose' | 'neutral'
}) {
  const tones = {
    mint:    'border-mint/25  bg-mint/[0.06]',
    amber:   'border-amber/25 bg-amber/[0.06]',
    rose:    'border-rose/25  bg-rose/[0.06]',
    neutral: 'border-white/[0.08] bg-white/[0.02]',
  }
  const valueColor = {
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    neutral: 'text-ink-100',
  }
  return (
    <div className={cn('rounded-lg border px-3.5 py-2.5', tones[tone])}>
      <div className={cn('text-xl font-semibold tabular', valueColor[tone])}>{value}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-widest text-ink-500">{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ drawer */

function LogDrawer({
  container,
  onClose,
}: {
  container: ContainerRow
  onClose: () => void
}) {
  const [logs, setLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [tail, setTail] = useState(200)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const text = await ipc.containerLogs(container.id, tail)
      setLogs(text || '(no output)')
    } catch (e) {
      setLogs(`// logs failed: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [container.id, tail])

  useEffect(() => { load() }, [load])

  return (
    <div
      className="cmdk-overlay fixed inset-0 z-40 flex justify-end animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-none border-l border-white/[0.08]">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 py-3">
          <Terminal className="h-4 w-4 text-accent-soft" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-100">{container.name}</div>
            <div className="truncate font-mono text-2xs text-ink-500">
              {container.shortId} · {container.image}
            </div>
          </div>
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className="h-7 appearance-none rounded border border-white/[0.08] bg-black/25 px-2 font-mono text-2xs text-ink-300 outline-none focus:border-accent/50"
          >
            <option value={100}>tail 100</option>
            <option value={200}>tail 200</option>
            <option value={500}>tail 500</option>
            <option value={2000}>tail 2000</option>
          </select>
          <Button
            size="sm"
            variant="subtle"
            onClick={load}
            disabled={loading}
            leading={loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          >
            Reload
          </Button>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin bg-black/40">
          {loading && !logs && (
            <div className="space-y-1.5 p-4">
              {[...Array(20)].map((_, i) => <Skeleton key={i} className="h-4" />)}
            </div>
          )}
          {logs && (
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink-300">
              {logs}
            </pre>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/[0.05] px-4 py-2 text-2xs text-ink-500">
          <Cpu className="h-3 w-3" />
          <span>
            Combined stdout + stderr · {container.state === 'running' ? 'live' : 'stopped container'}
          </span>
        </div>
      </div>
    </div>
  )
}
