import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Search, Skull, X, Zap } from 'lucide-react'
import { Badge, Button, Input, Panel, Skeleton } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import type { ProcessRow } from '@/lib/ipc'
import { bytes, percent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

type SortKey = 'cpu' | 'memory' | 'pid' | 'name'

export default function Processes() {
  const toast = useApp((s) => s.toast)
  const [items, setItems] = useState<ProcessRow[] | null>(null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('cpu')
  const [loading, setLoading] = useState(false)
  const [busyPid, setBusyPid] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!isDesktop) return
    setLoading(true)
    try {
      const list = await ipc.processList(filter, sort, 500)
      setItems(list)
    } catch (e) {
      toast({ tone: 'error', title: 'Load failed', description: String(e) })
    } finally {
      setLoading(false)
    }
  }, [filter, sort, toast])

  useEffect(() => {
    const id = setTimeout(load, filter ? 200 : 0)
    return () => clearTimeout(id)
  }, [load, filter])

  useEffect(() => {
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [load])

  const kill = async (p: ProcessRow, force: boolean) => {
    const label = force ? 'Force kill (SIGKILL)' : 'Terminate (SIGTERM)'
    if (!confirm(`${label} ${p.name} (pid ${p.pid})?`)) return
    setBusyPid(p.pid)
    try {
      await ipc.processKill(p.pid, force)
      toast({ tone: 'warn', title: `Signalled ${p.name}`, description: `pid ${p.pid}` })
      setTimeout(load, 350)
    } catch (e) {
      toast({ tone: 'error', title: 'Kill failed', description: String(e) })
    } finally {
      setBusyPid(null)
    }
  }

  const summary = useMemo(() => {
    if (!items) return null
    const totalCpu = items.reduce((s, p) => s + p.cpuPercent, 0)
    const totalMem = items.reduce((s, p) => s + p.memoryBytes, 0)
    return { count: items.length, totalCpu, totalMem }
  }, [items])

  const SortHeader = ({ label, value, align = 'left' }: { label: string; value: SortKey; align?: 'left' | 'right' }) => (
    <th className={cn('whitespace-nowrap px-3 py-2 text-2xs font-medium uppercase tracking-widest', align === 'right' ? 'text-right' : 'text-left')}>
      <button onClick={() => setSort(value)} className={cn('inline-flex items-center gap-1 transition-colors', sort === value ? 'text-accent-soft' : 'text-ink-500 hover:text-ink-300')}>
        {label}
      </button>
    </th>
  )

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Processes</h1>
          <p className="mt-1 text-sm text-ink-400">Inspect and manage running processes.</p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Process manager is desktop-only.
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Processes</h1>
          <p className="mt-1 text-sm text-ink-400">
            {summary ? `${summary.count} shown · cpu ${summary.totalCpu.toFixed(1)}% · mem ${bytes(summary.totalMem)}` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            wrapClassName="w-[240px]"
            placeholder="Filter by name or command…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            leading={<Search className="h-3.5 w-3.5" />}
            trailing={filter ? <button onClick={() => setFilter('')} className="text-ink-500 hover:text-ink-200"><X className="h-3.5 w-3.5" /></button> : undefined}
          />
          <Button size="sm" variant="subtle" onClick={load} disabled={loading} leading={<RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />}>
            Refresh
          </Button>
        </div>
      </div>

      <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto scroll-thin">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-base-900/95 backdrop-blur">
              <tr className="border-b border-white/[0.06]">
                <SortHeader label="pid" value="pid" align="right" />
                <SortHeader label="name" value="name" />
                <th className="px-3 py-2 text-left text-2xs font-medium uppercase tracking-widest text-ink-500">user</th>
                <SortHeader label="cpu" value="cpu" align="right" />
                <SortHeader label="memory" value="memory" align="right" />
                <th className="px-3 py-2 text-left text-2xs font-medium uppercase tracking-widest text-ink-500">status</th>
                <th className="w-20 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {!items && (
                <tr>
                  <td colSpan={7} className="p-4">
                    <div className="space-y-1.5">{[...Array(12)].map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
                  </td>
                </tr>
              )}
              {items && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-sm text-ink-500">No processes match the filter.</td>
                </tr>
              )}
              {items?.map((p) => {
                const isBusy = busyPid === p.pid
                const isZombie = p.status === 'zombie'
                return (
                  <tr key={p.pid} className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5 text-right font-mono text-ink-500 tabular">{p.pid}</td>
                    <td className="max-w-[260px] px-3 py-1.5">
                      <div className="truncate font-medium text-ink-100">{p.name}</div>
                      <div className="truncate font-mono text-2xs text-ink-600" title={p.cmd}>{p.cmd}</div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-2xs text-ink-400">{p.user ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular text-ink-200">{percent(p.cpuPercent, 1)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular text-ink-400">{bytes(p.memoryBytes)}</td>
                    <td className="px-3 py-1.5">
                      <Badge tone={isZombie ? 'rose' : p.status === 'run' ? 'mint' : p.status === 'sleep' ? 'neutral' : 'amber'}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <button disabled={isBusy} onClick={() => kill(p, false)} title="Terminate (SIGTERM)" className="rounded p-1 text-ink-500 transition-colors hover:bg-amber/10 hover:text-amber disabled:opacity-40">
                          <Zap className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={isBusy} onClick={() => kill(p, true)} title="Force kill (SIGKILL)" className="rounded p-1 text-ink-500 transition-colors hover:bg-rose/10 hover:text-rose disabled:opacity-40">
                          <Skull className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-white/[0.05] px-4 py-2 text-2xs text-ink-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-amber" /> SIGTERM · graceful</span>
            <span className="flex items-center gap-1.5"><Skull className="h-3 w-3 text-rose" /> SIGKILL · force</span>
          </div>
          <span className="flex items-center gap-1.5"><AlertTriangle className="h-3 w-3" /> Killing system processes can destabilize the machine</span>
        </div>
      </Panel>
    </div>
  )
}
