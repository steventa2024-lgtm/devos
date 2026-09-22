import { useCallback, useEffect, useState } from 'react'
import {
  Boxes, ExternalLink, Loader2, Pencil, Plus, Radio, RotateCw, Trash2,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { ServiceDialog } from '@/components/ServiceDialog'
import { ipc, isDesktop } from '@/lib/ipc'
import type { Service } from '@/lib/ipc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const healthTone: Record<string, 'mint' | 'amber' | 'rose' | 'neutral'> = {
  healthy: 'mint',
  degraded: 'amber',
  down: 'rose',
  unknown: 'neutral',
}

export default function Services() {
  const toast = useApp((s) => s.toast)

  const [items, setItems] = useState<Service[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [probing, setProbing] = useState<Record<string, boolean>>({})
  const [probingAll, setProbingAll] = useState(false)

  const load = useCallback(async () => {
    const list = await ipc.listServices()
    setItems(list)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (s: Service) => {
    setEditing(s)
    setDialogOpen(true)
  }
  const onSaved = () => { load() }

  const remove = async (s: Service) => {
    if (!confirm(`Delete service "${s.name}"?\n\nNo running process is affected — this only removes the bookmark.`)) return
    try {
      await ipc.deleteService(s.id)
      setItems((prev) => prev?.filter((x) => x.id !== s.id) ?? null)
      toast({ tone: 'warn', title: `Deleted ${s.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  const probeOne = async (s: Service) => {
    if (!isDesktop || !s.url) return
    setProbing((p) => ({ ...p, [s.id]: true }))
    try {
      const health = await ipc.probeService(s.id)
      setItems((prev) =>
        prev?.map((x) => x.id === s.id
          ? { ...x, health, updatedAt: new Date().toISOString() }
          : x) ?? null,
      )
    } catch (e) {
      toast({ tone: 'error', title: 'Probe failed', description: String(e) })
    } finally {
      setProbing((p) => ({ ...p, [s.id]: false }))
    }
  }

  const probeAll = async () => {
    if (!items || !isDesktop || probingAll) return
    const targets = items.filter((s) => s.url)
    if (targets.length === 0) {
      toast({ tone: 'info', title: 'No HTTP services to probe' })
      return
    }
    setProbingAll(true)
    let healthy = 0
    let down = 0
    try {
      for (const s of targets) {
        try {
          const h = await ipc.probeService(s.id)
          if (h === 'healthy') healthy++
          else if (h === 'down') down++
          setItems((prev) =>
            prev?.map((x) => x.id === s.id
              ? { ...x, health: h, updatedAt: new Date().toISOString() }
              : x) ?? null,
          )
        } catch {
          down++
        }
      }
      toast({
        tone: down > 0 ? 'warn' : 'success',
        title: `Probed ${targets.length} services`,
        description: `${healthy} healthy · ${down} down`,
      })
    } finally {
      setProbingAll(false)
    }
  }

  const summary = {
    total: items?.length ?? 0,
    healthy: items?.filter((s) => s.health === 'healthy').length ?? 0,
    degraded: items?.filter((s) => s.health === 'degraded').length ?? 0,
    down: items?.filter((s) => s.health === 'down').length ?? 0,
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Services</h1>
          <p className="mt-1 text-sm text-ink-400">
            Local processes, containers, and databases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            onClick={probeAll}
            disabled={!items || probingAll || !isDesktop}
            leading={probingAll
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Radio className="h-3.5 w-3.5" />}
          >
            {probingAll ? 'Probing…' : 'Probe all'}
          </Button>
          <Button
            variant="primary"
            onClick={openCreate}
            leading={<Plus className="h-3.5 w-3.5" />}
          >
            New service
          </Button>
        </div>
      </div>

      {items && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip label="total"    value={summary.total}    tone="neutral" />
          <StatChip label="healthy"  value={summary.healthy}  tone="mint" />
          <StatChip label="degraded" value={summary.degraded} tone="amber" />
          <StatChip label="down"     value={summary.down}     tone="rose" />
        </div>
      )}

      {!items && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      )}

      {items && items.length === 0 && (
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
            <Boxes className="h-6 w-6 text-ink-500" />
          </div>
          <div className="text-sm text-ink-200">No services yet</div>
          <div className="mt-2 max-w-sm text-xs text-ink-500">
            Register your APIs, databases, and containers. Add a URL and DevOS
            will probe its health on demand.
          </div>
          <Button
            variant="primary"
            onClick={openCreate}
            className="mt-5"
            leading={<Plus className="h-3.5 w-3.5" />}
          >
            Add your first service
          </Button>
        </Panel>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => {
            const tone = healthTone[s.health] ?? 'neutral'
            const isProbing = probing[s.id]
            return (
              <Panel key={s.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <StatusDot tone={tone} pulse={s.health === 'healthy'} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-100">{s.name}</div>
                      <div className="font-mono text-2xs text-ink-500">{s.kind}</div>
                    </div>
                  </div>
                  <Badge tone={tone}>{s.health}</Badge>
                </div>

                {(s.url || s.target) && (
                  <div className="truncate rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-1.5 font-mono text-2xs text-ink-300">
                    {s.url ?? s.target}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3 text-2xs text-ink-500">
                  <span className="flex items-center gap-2">
                    <span>updated {relativeTime(s.updatedAt)}</span>
                    {s.autostart && <Badge tone="violet">auto</Badge>}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {s.url && (
                      <IconButton
                        label="Open"
                        onClick={() => window.open(s.url!, '_blank')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                    <IconButton
                      label={isProbing ? 'Probing…' : 'Probe health'}
                      disabled={isProbing || !isDesktop || !s.url}
                      onClick={() => probeOne(s)}
                    >
                      {isProbing
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RotateCw className="h-3.5 w-3.5" />}
                    </IconButton>
                    <IconButton label="Edit" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton label="Delete" tone="danger" onClick={() => remove(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      <ServiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={onSaved}
        initial={editing}
      />
    </div>
  )
}

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
