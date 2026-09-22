import { Search, Settings as SettingsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, IconButton, StatusDot } from '@/components/ui'
import { useApp } from '@/store/app'

export function TopBar() {
  const setPaletteOpen = useApp((s) => s.setPaletteOpen)
  const snapshot = useApp((s) => s.snapshot)

  const cpu = snapshot?.cpu.usagePercent ?? 0
  const mem = snapshot
    ? (snapshot.memory.usedBytes / snapshot.memory.totalBytes) * 100
    : 0
  const health: 'mint' | 'amber' | 'rose' =
    cpu > 85 || mem > 90 ? 'rose' : cpu > 65 || mem > 75 ? 'amber' : 'mint'

  return (
    <header className="chrome-blur z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.05] px-4">
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <StatusDot tone={health} pulse />
        <span className="text-2xs uppercase tracking-widest text-ink-500">
          {health === 'mint' ? 'systems nominal' : health === 'amber' ? 'elevated' : 'critical'}
        </span>
      </div>

      <div className="flex flex-1 justify-center">
        <button
          onClick={() => setPaletteOpen(true)}
          className="group flex h-8 w-full max-w-[520px] items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-3 text-sm text-ink-400 transition-all duration-200 ease-swift hover:border-white/[0.14] hover:bg-black/40 hover:text-ink-200"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search or run a command…</span>
          <kbd className="hidden rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-2xs text-ink-500 sm:inline-flex">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <div className="hidden items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 lg:flex">
          <div className="flex items-center gap-1.5 text-2xs text-ink-400">
            <span className="uppercase tracking-wider">cpu</span>
            <span className="tabular font-mono text-ink-200">{cpu.toFixed(0)}%</span>
          </div>
          <div className="h-3 w-px bg-white/[0.06]" />
          <div className="flex items-center gap-1.5 text-2xs text-ink-400">
            <span className="uppercase tracking-wider">ram</span>
            <span className="tabular font-mono text-ink-200">{mem.toFixed(0)}%</span>
          </div>
        </div>

        <Link to="/settings">
          <IconButton label="Settings">
            <SettingsIcon className="h-4 w-4" />
          </IconButton>
        </Link>
      </div>
    </header>
  )
}
