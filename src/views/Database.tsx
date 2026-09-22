import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, Database as DbIcon, Download, Eye, KeyRound, Loader2,
  Pencil, Play, Plus, RefreshCw, Table2, Trash2,
} from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { DbConnectionDialog } from '@/components/DbConnectionDialog'
import { ipc, isDesktop } from '@/lib/ipc'
import type { DbColumn, DbConnection, DbTable, QueryResult } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

export default function Database() {
  const toast = useApp((s) => s.toast)

  const [connections, setConnections] = useState<DbConnection[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tables, setTables] = useState<DbTable[] | null>(null)
  const [openTable, setOpenTable] = useState<string | null>(null)
  const [columns, setColumns] = useState<DbColumn[] | null>(null)

  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 20;")
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [allowWrites, setAllowWrites] = useState(false)
  const [limit, setLimit] = useState(500)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DbConnection | null>(null)

  const active = useMemo(
    () => connections?.find((c) => c.id === activeId) ?? null,
    [connections, activeId],
  )

  const loadConnections = useCallback(async () => {
    const list = await ipc.dbListConnections()
    setConnections(list)
    if (!activeId && list[0]) setActiveId(list[0].id)
    return list
  }, [activeId])

  useEffect(() => { loadConnections() }, [loadConnections])

  const loadSchema = useCallback(async (conn: DbConnection | null) => {
    if (!conn?.path) { setTables([]); return }
    setTables(null)
    setOpenTable(null)
    setColumns(null)
    try {
      const list = await ipc.dbTables(conn.path)
      setTables(list)
    } catch (e) {
      setTables([])
      toast({ tone: 'error', title: 'Could not read schema', description: String(e) })
    }
  }, [toast])

  useEffect(() => { loadSchema(active) }, [active, loadSchema])

  const loadColumns = async (conn: DbConnection, table: string) => {
    if (!conn.path) return
    if (openTable === table) { setOpenTable(null); setColumns(null); return }
    setOpenTable(table)
    setColumns(null)
    try {
      const cols = await ipc.dbTableSchema(conn.path, table)
      setColumns(cols)
    } catch {
      setColumns([])
    }
  }

  const run = async () => {
    if (!active?.path || !sql.trim() || running) return
    setRunning(true)
    try {
      const res = await ipc.dbQuery(active.path, sql, limit, allowWrites)
      setResult(res)
      ipc.dbTouchConnection(active.id).catch(() => null)
    } catch (e) {
      toast({ tone: 'error', title: 'Query failed', description: String(e) })
    } finally {
      setRunning(false)
    }
  }

  const previewTable = async (t: DbTable) => {
    if (!active?.path) return
    const esc = t.name.replace(/"/g, '""')
    setSql(`SELECT * FROM "${esc}" LIMIT ${limit};`)
    await loadColumns(active, t.name)
  }

  const exportCsv = () => {
    if (!result) return
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const rows = [
      result.columns.map(esc).join(','),
      ...result.rows.map((r) => r.map(esc).join(',')),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ tone: 'success', title: `Exported ${result.rowCount} rows` })
  }

  const removeConnection = async (c: DbConnection) => {
    if (!confirm(`Remove connection "${c.name}"?\n\nThe file on disk is untouched.`)) return
    try {
      await ipc.dbDeleteConnection(c.id)
      const list = await loadConnections()
      if (activeId === c.id) setActiveId(list[0]?.id ?? null)
      toast({ tone: 'warn', title: `Removed ${c.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Database</h1>
          <p className="mt-1 text-sm text-ink-400">Browse SQLite files and run ad-hoc queries.</p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Database manager is desktop-only.
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Database</h1>
          <p className="mt-1 text-sm text-ink-400">Browse SQLite files and run ad-hoc queries.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => { setEditing(null); setDialogOpen(true) }}
          leading={<Plus className="h-3.5 w-3.5" />}
        >
          New connection
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        <Panel padded={false} className="flex min-h-0 flex-col overflow-hidden lg:col-span-3 xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2.5">
            <DbIcon className="h-3.5 w-3.5 text-ink-500" />
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Connections
            </span>
            {connections && (
              <span className="ml-auto font-mono text-2xs text-ink-500">{connections.length}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-1.5">
            {!connections && [...Array(3)].map((_, i) => <Skeleton key={i} className="mb-1 h-10" />)}
            {connections?.length === 0 && (
              <div className="px-3 py-6 text-center text-2xs text-ink-500">
                No connections yet.
              </div>
            )}
            {connections?.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-all',
                  activeId === c.id
                    ? 'bg-accent/12 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
                    : 'hover:bg-white/[0.04]',
                )}
              >
                <button
                  onClick={() => setActiveId(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <StatusDot tone={c.readOnly ? 'accent' : 'amber'} />
                  <span className={cn('truncate', activeId === c.id ? 'text-ink-100' : 'text-ink-300')}>
                    {c.name}
                  </span>
                </button>
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <IconButton
                    label="Edit"
                    onClick={() => { setEditing(c); setDialogOpen(true) }}
                    className="h-6 w-6"
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label="Delete"
                    tone="danger"
                    onClick={() => removeConnection(c)}
                    className="h-6 w-6"
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel padded={false} className="flex min-h-0 flex-col overflow-hidden lg:col-span-3 xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2.5">
            <Table2 className="h-3.5 w-3.5 text-ink-500" />
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Schema
            </span>
            {tables && (
              <span className="ml-auto font-mono text-2xs text-ink-500">{tables.length}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-1.5">
            {!tables && active && [...Array(6)].map((_, i) => <Skeleton key={i} className="mb-1 h-7" />)}
            {!active && (
              <div className="px-3 py-6 text-center text-2xs text-ink-500">
                Select a connection.
              </div>
            )}
            {tables?.length === 0 && active && (
              <div className="px-3 py-6 text-center text-2xs text-ink-500">
                No tables.
              </div>
            )}
            {tables?.map((t) => (
              <div key={t.name}>
                <div
                  className={cn(
                    'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all',
                    openTable === t.name ? 'bg-white/[0.05]' : 'hover:bg-white/[0.04]',
                  )}
                >
                  <button
                    onClick={() => active && loadColumns(active, t.name)}
                    className="flex min-w-0 flex-1 items-center gap-1.5"
                  >
                    <ChevronRight className={cn(
                      'h-3 w-3 shrink-0 text-ink-500 transition-transform',
                      openTable === t.name && 'rotate-90',
                    )} />
                    <span className="truncate text-ink-300">{t.name}</span>
                  </button>
                  {t.rowEstimate != null && (
                    <span className="shrink-0 font-mono text-2xs text-ink-600">{t.rowEstimate}</span>
                  )}
                  <button
                    onClick={() => previewTable(t)}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    title="Preview"
                  >
                    <Eye className="h-3 w-3 text-ink-500 hover:text-accent-soft" />
                  </button>
                </div>
                {openTable === t.name && columns && (
                  <div className="ml-5 flex flex-col gap-0.5 border-l border-white/[0.06] py-1 pl-2">
                    {columns.map((c) => (
                      <div key={c.name} className="flex items-center gap-2 py-0.5 text-2xs">
                        {c.primaryKey
                          ? <KeyRound className="h-2.5 w-2.5 shrink-0 text-amber" />
                          : <span className="h-2.5 w-2.5 shrink-0" />}
                        <span className="truncate font-mono text-ink-400">{c.name}</span>
                        <span className="shrink-0 text-ink-600">{c.typeName || 'ANY'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex min-h-0 flex-col gap-4 lg:col-span-6 xl:col-span-8">
          <Panel padded={false} className="flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.05] px-3 py-2">
              <Play className="h-3.5 w-3.5 text-accent-soft" />
              <span className="text-2xs uppercase tracking-widest text-ink-500">SQL</span>
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-2xs text-ink-400">
                  <input
                    type="checkbox"
                    checked={allowWrites}
                    onChange={(e) => setAllowWrites(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
                  />
                  Allow writes
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="h-7 appearance-none rounded border border-white/[0.08] bg-black/25 px-2 font-mono text-2xs text-ink-300 outline-none focus:border-accent/50"
                >
                  <option value={100}>limit 100</option>
                  <option value={500}>limit 500</option>
                  <option value={2000}>limit 2000</option>
                  <option value={10000}>limit 10000</option>
                </select>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={run}
                  disabled={running || !active}
                  leading={running
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Play className="h-3 w-3" />}
                >
                  Run
                </Button>
              </div>
            </div>
            <div className="max-h-[220px] overflow-auto scroll-thin">
              <CodeMirror
                value={sql}
                onChange={setSql}
                theme="dark"
                height="180px"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  highlightActiveLine: true,
                  bracketMatching: true,
                  autocompletion: true,
                }}
              />
            </div>
          </Panel>

          <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
              <span className="text-2xs uppercase tracking-widest text-ink-500">Results</span>
              {result && (
                <>
                  <span className="font-mono text-2xs text-ink-500">
                    {result.rowCount} rows · {result.durationMs}ms
                  </span>
                  {result.truncated && (
                    <span className="rounded bg-amber/[0.12] px-1.5 py-0.5 font-mono text-2xs text-amber">
                      truncated
                    </span>
                  )}
                </>
              )}
              <div className="ml-auto flex items-center gap-1">
                {result && (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={exportCsv}
                    leading={<Download className="h-3 w-3" />}
                  >
                    Export
                  </Button>
                )}
                <IconButton label="Refresh" onClick={run} disabled={running || !active}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              {!result && (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <Play className="mb-3 h-6 w-6 text-ink-500" />
                  <div className="text-sm text-ink-200">Run a query</div>
                  <div className="mt-1 max-w-sm text-2xs text-ink-500">
                    Write SQL above or click a table in the schema tree.
                  </div>
                </div>
              )}
              {result && result.rows.length === 0 && (
                <div className="flex h-full items-center justify-center py-16 text-xs text-ink-500">
                  No rows returned.
                </div>
              )}
              {result && result.rows.length > 0 && (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-base-900/95 backdrop-blur">
                    <tr className="border-b border-white/[0.06] text-2xs uppercase tracking-widest text-ink-500">
                      {result.columns.map((c) => (
                        <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                      >
                        {row.map((cell, j) => (
                          <td key={j} className="max-w-[340px] truncate px-3 py-1.5 font-mono">
                            {cell === null ? (
                              <span className="italic text-ink-600">NULL</span>
                            ) : typeof cell === 'object' ? (
                              <span className="text-ink-400">{JSON.stringify(cell)}</span>
                            ) : (
                              <span className="text-ink-200">{String(cell)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <DbConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => { await loadConnections() }}
        initial={editing}
      />
    </div>
  )
}
