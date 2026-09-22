import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, ArrowRight, Boxes, Code2, Container, Cpu, Database, Files,
  FolderGit2, GitBranch, KeyRound, LayoutDashboard, PanelLeft, Puzzle,
  RefreshCw, ScrollText, Search, Send, Settings as SettingsIcon,
  SquareTerminal, Trash2, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'
import { usePlugins } from '@/store/plugins'
import { ipc, isDesktop } from '@/lib/ipc'

type Command = {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void | Promise<void>
  keywords?: string
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen)
  const setOpen = useApp((s) => s.setPaletteOpen)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const refreshSnapshot = useApp((s) => s.refreshSnapshot)
  const toast = useApp((s) => s.toast)
  const pluginCommands = usePlugins((s) => s.commands)

  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands: Command[] = useMemo(() => {
    const builtIn: Command[] = [
      { id: 'nav.dash',   group: 'Navigate', icon: LayoutDashboard, label: 'Go to Dashboard',   run: () => nav('/dashboard') },
      { id: 'nav.proj',   group: 'Navigate', icon: FolderGit2,      label: 'Go to Projects',    run: () => nav('/projects') },
      { id: 'nav.term',   group: 'Navigate', icon: SquareTerminal,  label: 'Open Terminal',     run: () => nav('/terminal') },
      { id: 'nav.files',  group: 'Navigate', icon: Files,           label: 'Go to Files',       run: () => nav('/files') },
      { id: 'nav.git',    group: 'Navigate', icon: GitBranch,       label: 'Go to Git',         run: () => nav('/git') },
      { id: 'nav.svc',    group: 'Navigate', icon: Boxes,           label: 'Go to Services',    run: () => nav('/services') },
      { id: 'nav.cont',   group: 'Navigate', icon: Container,       label: 'Go to Containers',  run: () => nav('/containers') },
      { id: 'nav.db',     group: 'Navigate', icon: Database,        label: 'Go to Database',    run: () => nav('/database') },
      { id: 'nav.api',    group: 'Navigate', icon: Send,            label: 'Go to API Tester',  run: () => nav('/api') },
      { id: 'nav.env',    group: 'Navigate', icon: KeyRound,        label: 'Go to Environment', run: () => nav('/environment') },
      { id: 'nav.logs',   group: 'Navigate', icon: ScrollText,      label: 'Go to Logs',        run: () => nav('/logs') },
      { id: 'nav.mon',    group: 'Navigate', icon: Activity,        label: 'Go to Monitoring',  run: () => nav('/monitoring') },
      { id: 'nav.proc',   group: 'Navigate', icon: Cpu,             label: 'Go to Processes',   run: () => nav('/processes') },
      { id: 'nav.snip',   group: 'Navigate', icon: Code2,           label: 'Go to Snippets',    run: () => nav('/snippets') },
      { id: 'nav.plug',   group: 'Navigate', icon: Puzzle,          label: 'Go to Plugins',     run: () => nav('/plugins') },
      { id: 'nav.set',    group: 'Navigate', icon: SettingsIcon,    label: 'Open Settings',     run: () => nav('/settings') },

      { id: 'act.sb',     group: 'Actions', icon: PanelLeft, label: 'Toggle sidebar', hint: '⌘B', run: toggleSidebar },
      {
        id: 'act.refresh', group: 'Actions', icon: RefreshCw, label: 'Refresh system telemetry',
        run: async () => { await refreshSnapshot(); toast({ tone: 'success', title: 'Telemetry refreshed' }) },
      },
      {
        id: 'act.clearlogs', group: 'Actions', icon: Trash2, label: 'Clear all logs',
        keywords: 'danger destructive',
        run: async () => {
          if (!confirm('Clear all stored logs? This cannot be undone.')) return
          if (isDesktop) await ipc.clearLogs()
          toast({ tone: 'warn', title: 'Logs cleared' })
        },
      },
      {
        id: 'act.clearhist', group: 'Actions', icon: Trash2, label: 'Clear terminal history',
        keywords: 'danger destructive',
        run: async () => {
          if (!confirm('Clear terminal history?')) return
          if (isDesktop) await ipc.clearHistory()
          toast({ tone: 'warn', title: 'History cleared' })
        },
      },
    ]

    const fromPlugins: Command[] = pluginCommands.map((pc) => ({
      id: pc.qualifiedId,
      label: pc.label,
      hint: pc.pluginName,
      group: 'Plugins',
      icon: Zap,
      keywords: `${pc.pluginId} ${pc.commandId} ${pc.description ?? ''}`,
      run: async () => {
        try {
          await pc.run()
        } catch (e) {
          toast({
            tone: 'error',
            title: `Plugin command failed: ${pc.label}`,
            description: String(e),
          })
        }
      },
    }))

    return [...builtIn, ...fromPlugins]
  }, [nav, toggleSidebar, refreshSnapshot, toast, pluginCommands])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) =>
      (c.label + ' ' + c.group + ' ' + (c.keywords ?? '')).toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1))
  }, [filtered.length, active])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const grouped = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    ;(acc[c.group] ??= []).push(c)
    return acc
  }, {})
  const flat = Object.values(grouped).flat()

  const execute = async (cmd: Command) => {
    setOpen(false)
    await cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = flat[active]
      if (cmd) execute(cmd)
    }
  }

  return (
    <div
      className="cmdk-overlay fixed inset-0 z-40 flex items-start justify-center pt-[12vh] animate-fade-in"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="cmdk-panel mx-4 flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl animate-slide-down">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
          <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-2xs text-ink-500">
            esc
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto scroll-thin p-2">
          {flat.length === 0 && (
            <div className="p-8 text-center text-sm text-ink-500">
              <Zap className="mx-auto mb-2 h-5 w-5 text-ink-600" />
              No matching commands
            </div>
          )}

          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1">
              <div className="px-3 py-1.5 text-2xs uppercase tracking-widest text-ink-500">
                {group}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((cmd) => {
                  const idx = flat.indexOf(cmd)
                  const isActive = idx === active
                  const Icon = cmd.icon
                  return (
                    <button
                      key={cmd.id}
                      data-active={isActive}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => execute(cmd)}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm',
                        'transition-colors duration-100',
                        isActive ? 'text-ink-100' : 'text-ink-300 hover:text-ink-100',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent-soft' : 'text-ink-500')} />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                          {cmd.hint}
                        </kbd>
                      )}
                      {isActive && <ArrowRight className="h-3.5 w-3.5 text-ink-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2 text-2xs text-ink-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> select</span>
          </div>
          <span>{flat.length} command{flat.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}
