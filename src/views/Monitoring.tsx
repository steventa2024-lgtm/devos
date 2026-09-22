import { useEffect, useState } from 'react'
import { Activity, Cpu, HardDrive, MemoryStick, Network, Server } from 'lucide-react'
import { Bar, Panel, Skeleton } from '@/components/ui'
import { ipc } from '@/lib/ipc'
import type { ProcessRow } from '@/lib/ipc'
import { bytes, duration, percent } from '@/lib/format'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'

export default function Monitoring() {
  const snap = useApp((s) => s.snapshot)
  const [procs, setProcs] = useState<ProcessRow[] | null>(null)

  useEffect(() => {
    const load = () => ipc.listProcesses(20).then(setProcs).catch(() => null)
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Monitoring</h1>
        <p className="mt-1 text-sm text-ink-400">Live telemetry from the local machine.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="CPU"
          icon={Cpu}
          value={snap ? percent(snap.cpu.usagePercent) : '—'}
          subtitle={snap ? `${snap.cpu.cores} cores` : ''}
          bar={snap?.cpu.usagePercent ?? 0}
          tone="accent"
        />
        <MetricCard
          title="Memory"
          icon={MemoryStick}
          value={
            snap
              ? percent((snap.memory.usedBytes / snap.memory.totalBytes) * 100)
              : '—'
          }
          subtitle={
            snap
              ? `${bytes(snap.memory.usedBytes)} / ${bytes(snap.memory.totalBytes)}`
              : ''
          }
          bar={snap ? (snap.memory.usedBytes / snap.memory.totalBytes) * 100 : 0}
          tone="mint"
        />
        <MetricCard
          title="Disk /"
          icon={HardDrive}
          value={
            snap && snap.disks[0]
              ? percent(
                  ((snap.disks[0].totalBytes - snap.disks[0].availableBytes) /
                    snap.disks[0].totalBytes) *
                    100,
                )
              : '—'
          }
          subtitle={snap?.disks[0] ? `${bytes(snap.disks[0].availableBytes)} free` : ''}
          bar={
            snap && snap.disks[0]
              ? ((snap.disks[0].totalBytes - snap.disks[0].availableBytes) /
                  snap.disks[0].totalBytes) *
                100
              : 0
          }
          tone="amber"
        />
        <MetricCard
          title="Network"
          icon={Network}
          value={snap ? bytes(snap.network.rxBytes) : '—'}
          subtitle={snap ? `tx ${bytes(snap.network.txBytes)}` : ''}
          bar={0}
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <div className="mb-3.5 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-ink-500" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Top processes
            </h3>
          </div>
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02] text-2xs uppercase tracking-widest text-ink-500">
                  <th className="px-3 py-2 text-left font-medium">pid</th>
                  <th className="px-3 py-2 text-left font-medium">name</th>
                  <th className="px-3 py-2 text-right font-medium">cpu</th>
                  <th className="px-3 py-2 text-right font-medium">memory</th>
                </tr>
              </thead>
              <tbody>
                {!procs && (
                  <tr>
                    <td colSpan={4} className="p-4">
                      <div className="space-y-1.5">
                        {[...Array(5)].map((_, i) => (
                          <Skeleton key={i} className="h-6" />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {procs?.map((p) => (
                  <tr
                    key={p.pid}
                    className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono text-xs tabular text-ink-500">
                      {p.pid}
                    </td>
                    <td className="px-3 py-2 text-ink-100">{p.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular text-ink-200">
                      {percent(p.cpuPercent, 1)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular text-ink-400">
                      {bytes(p.memoryBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <div className="mb-3.5 flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-ink-500" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Host
            </h3>
          </div>
          {!snap && (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-5" />
              ))}
            </div>
          )}
          {snap && (
            <dl className="flex flex-col gap-2.5 text-sm">
              {[
                ['hostname', snap.host.hostname],
                ['os', `${snap.host.osName} ${snap.host.osVersion}`],
                ['kernel', snap.host.kernel],
                ['uptime', duration(snap.host.uptimeSecs)],
                ['processes', String(snap.host.processCount)],
                ['sampled', new Date(snap.sampledAt).toLocaleTimeString()],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-2xs uppercase tracking-widest text-ink-500">{k}</dt>
                  <dd className="truncate font-mono text-xs text-ink-200">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  icon: Icon,
  value,
  subtitle,
  bar,
  tone,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  subtitle?: string
  bar: number
  tone: 'accent' | 'mint' | 'amber' | 'violet'
}) {
  const iconTone: Record<string, string> = {
    accent: 'text-accent-soft',
    mint: 'text-mint',
    amber: 'text-amber',
    violet: 'text-violet',
  }
  const barTone: Record<string, 'accent' | 'mint' | 'amber' | 'rose'> = {
    accent: 'accent',
    mint: 'mint',
    amber: 'amber',
    violet: 'accent',
  }
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5', iconTone[tone])} />
        <span className="text-2xs uppercase tracking-widest text-ink-500">{title}</span>
      </div>
      <div className="text-2xl font-semibold tabular text-ink-100">{value}</div>
      {bar > 0 && <Bar value={bar} tone={barTone[tone]} />}
      {subtitle && (
        <div className="truncate font-mono text-2xs text-ink-500">{subtitle}</div>
      )}
    </Panel>
  )
}
