import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, Download, Pause, Play, RefreshCw, Search, Trash2,
  X, Zap,
} from 'lucide-react'
import { Badge, Button, IconButton, Input, Panel, Skeleton } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import type { LogEntry } from '@/lib/ipc'
import { clockTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const LEVELS = ['all', 'debug', 'info', 'warn', 'error'] as const
type Level = typeof LEVELS[number]

const levelColor: Record<string, string> = {
  debug: 'text-ink-500',
  info: 'text-accent-soft',
  warn: 'text-amber',
  error: 'text-rose',
}

const levelTone: Record<string, 'neutral' | 'accent' | 'amber' | 'rose'> = {
  debug: 'neutral',
  info: 'accent',
  warn: 'amber',
  error: 'rose',
}

export default function Logs() {
  const toast = useApp((s) => s.toast)

  const [items, setItems] = useState<LogEntry[] | null>(null)
  const [sources, setSources] = useState<string[]>([])
  const [level, setLevel] = useState<Level>('all')
  const [source, setSource] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [live, setLive] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)

  /* ---------------------------------------------------------- load */

  const load = useCallback(async () => {
    try {
      const list = await ipc.listLogs({ limit: 500 })
      setItems(list)
    } catch (e) {
      toast({ tone: 'error', title: 'Load failed', description: String(e) })
    }
  }, [toast])

  const loadSources = useCallback(async () => {
    try {
      const list = await ipc.logSources()
      setSources(list)
    } catch {
      /* non-fatal */
    }
  }, [])

  useEffect(() => {
    load()
    loadSources()
  }, [load, loadSources])

  /* ---------------------------------------------------------- live tail */

  useEffect(() => {
    if (!live || !isDesktop) return
    const id = setInterval(async () => {
      try {
        const list = await ipc.listLogs({ limit: 500 })
        setItems(list)
      } catch {
        /* keep quiet on transient failures */
      }
    }, 1500)
    return () => clearInterval(id)
  }, [live])

  /* ---------------------------------------------------------- autoscroll */

  useEffect(() => {
    if (!autoScroll || !scrollRef.current || !items) return
    // Scroll to bottom (newest) when the list changes.
    const el = scrollRef.current
    el.scrollTop = el.scrollHeight
  }, [items, autoScroll])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    // Disable autoscroll when the user scrolls away from the bottom.
    setAutoScroll(atBottom)
  }

  /* ---------------------------------------------------------- filter */

  const filtered = useMemo(() => {
    if (!items) return null
    let list = items
    if (level !== 'all') list = list.filter((l) => l.level === level)
    if (source !== 'all') list = list.filter((l) => l.source === source)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((l) =>
        l.message.toLowerCase().includes(q) ||
        l.source.toLowerCase().includes(q),
      )
    }
    return list
  }, [items, level, source, query])

  const counts = useMemo(() => {
    if (!items) return null
    const c = { debug: 0, info: 0, warn: 0, error: 0 } as Record<string, number>
    for (const l of items) c[l.level] = (c[l.level] ?? 0) + 1
    return c
  }, [items])

  /* ---------------------------------------------------------- actions */

  const clearAll = async () => {
    if (!confirm('Clear all stored logs?\n\nThis cannot be undone.')) return
    if (isDesktop) await ipc.clearLogs()
    toast({ tone: 'warn', title: 'Logs cleared' })
    setItems([])
    loadSources()
  }

  const testEntry = async () => {
    if (!isDesktop) return
    const levels = ['debug', 'info', 'info', 'info', 'warn', 'error']
    const lvl = levels[Math.floor(Math.random() * levels.length)]
    const msg = `test entry @ ${new Date().toISOString()}`
    try {
      await ipc.appendLog('devos', lvl, msg)
      await load()
      await loadSources()
    } catch (e) {
      toast({ tone: 'error', title: 'Append failed', description: String(e) })
    }
  }

  const exportCsv = () => {
    if (!filtered) return
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const rows = [
      ['at', 'level', 'source', 'message'].join(','),
      ...filtered.map((l) =>
        [l.at, l.level, l.source, l.message].map((x) => esc(String(x))).join(','),
      ),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `devos-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ tone: 'success', title: `Exported ${filtered.length} entries` })
  }

  const jumpToBottom = () => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    setAutoScroll(true)
  }

  /* ---------------------------------------------------------- render */

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Logs</h1>
          <p className="mt-1 text-sm text-ink-400">
            Everything DevOS and your services wrote locally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={live ? 'primary' : 'subtle'}
            onClick={() => setLive((v) => !v)}
            leading={live ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          >
            {live ? 'Live' : 'Live'}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={testEntry}
            disabled={!isDesktop}
            leading={<Zap className="h-3.5 w-3.5" />}
            title="Append a test log entry"
          >
            Test
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={load}
            leading={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={exportCsv}
            disabled={!filtered || filtered.length === 0}
            leading={<Download className="h-3.5 w-3.5" />}
          >
            Export
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={clearAll}
            leading={<Trash2 className="h-3.5 w-3.5" />}
          >
            Clear
          </Button>
        </div>
      </div>

      <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] p-3">
          <Input
            wrapClassName="w-full max-w-[300px]"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leading={<Search className="h-3.5 w-3.5" />}
          />

          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-9 appearance-none rounded-lg border border-white/[0.08] bg-black/25 px-3 pr-8 font-mono text-xs text-ink-300 outline-none transition-all focus:border-accent/50"
          >
            <option value="all">all sources</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <div className="flex items-center gap-1">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-mono text-2xs uppercase tracking-widest transition-all',
                  level === l
                    ? 'border-accent/40 bg-accent/12 text-accent-soft'
                    : 'border-white/[0.06] bg-white/[0.02] text-ink-500 hover:text-ink-300',
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3 text-2xs text-ink-500">
            {counts && (
              <>
                <span className="flex items-center gap-1"><span className="text-rose">{counts.error}</span> err</span>
                <span className="flex items-center gap-1"><span className="text-amber">{counts.warn}</span> warn</span>
                <span className="flex items-center gap-1"><span className="text-accent-soft">{counts.info}</span> info</span>
              </>
            )}
            <span>
              {filtered ? `${filtered.length} / ${items?.length ?? 0}` : '…'}
            </span>
            {!autoScroll && (
              <button
                onClick={jumpToBottom}
                className="flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-accent-soft transition-colors hover:bg-accent/15"
              >
                <ArrowDownToLine className="h-3 w-3" />
                newest
              </button>
            )}
          </div>
        </div>

        {/* Stream */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto scroll-thin"
        >
          {!filtered && (
            <div className="space-y-1.5 p-3">
              {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
          )}
          {filtered && filtered.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <Zap className="mb-3 h-6 w-6 text-ink-500" />
              <div className="text-sm text-ink-200">No matching entries</div>
              <div className="mt-1 text-2xs text-ink-500">
                {live ? 'Waiting for the next event…' : 'Enable Live or click Test to add one.'}
              </div>
            </div>
          )}
          {filtered?.map((l) => (
            <div
              key={l.id}
              className="flex items-start gap-3 border-b border-white/[0.03] px-4 py-1.5 font-mono text-xs transition-colors hover:bg-white/[0.02]"
            >
              <span className="w-20 shrink-0 tabular text-ink-500">{clockTime(l.at)}</span>
              <span className={cn('w-12 shrink-0 uppercase', levelColor[l.level] ?? 'text-ink-400')}>
                {l.level}
              </span>
              <Badge tone={levelTone[l.level] ?? 'neutral'} className="shrink-0">
                {l.source}
              </Badge>
              <span className="min-w-0 flex-1 break-words text-ink-200">{l.message}</span>
            </div>
          ))}
        </div>

        {/* Live tail indicator */}
        {live && (
          <div className="flex items-center justify-center gap-2 border-t border-white/[0.05] bg-accent/[0.04] py-1.5 text-2xs uppercase tracking-widest text-accent-soft">
            <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            live tail · polling every 1.5s
            <IconButton
              label="Stop live tail"
              onClick={() => setLive(false)}
              className="h-5 w-5"
            >
              <X className="h-3 w-3" />
            </IconButton>
          </div>
        )}
      </Panel>
    </div>
  )
}
