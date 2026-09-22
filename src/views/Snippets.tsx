import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json as jsonLang } from '@codemirror/lang-json'
import {
  Check, Code2, Copy, Loader2, Play, Plus, Save, Search, Trash2,
  Terminal, X,
} from 'lucide-react'
import { Badge, Button, IconButton, Input, Panel, Skeleton } from '@/components/ui'
import { ipc } from '@/lib/ipc'
import type { CommandResult, Snippet } from '@/lib/ipc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const LANGUAGES = [
  'bash', 'sh', 'zsh', 'powershell',
  'python', 'node', 'typescript', 'javascript',
  'sql', 'docker', 'other',
] as const

function languageExt(lang: string) {
  switch (lang) {
    case 'typescript': return [javascript({ typescript: true })]
    case 'javascript':
    case 'node':       return [javascript()]
    case 'json':       return [jsonLang()]
    default:           return []
  }
}

export default function Snippets() {
  const toast = useApp((s) => s.toast)

  const [snippets, setSnippets] = useState<Snippet[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Snippet | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<CommandResult | null>(null)
  const [showOutput, setShowOutput] = useState(true)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  /* -------------------------------------------------------------- load */

  const load = useCallback(async () => {
    const list = await ipc.listSnippets()
    setSnippets(list)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-select first snippet once loaded.
  useEffect(() => {
    if (!snippets || selectedId) return
    if (snippets[0]) setSelectedId(snippets[0].id)
  }, [snippets, selectedId])

  // Load the selected snippet into the editor draft.
  // Note: this effect deliberately does NOT depend on `snippets`.
  // Refreshing the list (e.g. after a run, to bump runCount) must not
  // clear the editor or wipe the output panel.
  useEffect(() => {
    if (!selectedId) {
      setDraft(null)
      setLastResult(null)
      return
    }
    const s = snippets?.find((x) => x.id === selectedId)
    if (!s) return
    setDraft({ ...s, tags: [...s.tags] })
    setLastResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  /* -------------------------------------------------------------- dirty */

  const dirty = useMemo(() => {
    if (!draft) return false
    const original = snippets?.find((s) => s.id === draft.id)
    if (!original) return true
    return (
      original.name !== draft.name ||
      original.body !== draft.body ||
      original.language !== draft.language ||
      (original.description ?? '') !== (draft.description ?? '') ||
      original.tags.join('\u0000') !== draft.tags.join('\u0000')
    )
  }, [draft, snippets])

  /* -------------------------------------------------------------- save */

  const save = useCallback(async (silent = false) => {
    if (!draft || saving) return
    setSaving(true)
    try {
      const saved = await ipc.upsertSnippet(draft)
      setSnippets((prev) => {
        if (!prev) return [saved]
        const idx = prev.findIndex((s) => s.id === saved.id)
        if (idx === -1) return [saved, ...prev]
        return prev.map((s) => (s.id === saved.id ? saved : s))
      })
      setDraft({ ...saved, tags: [...saved.tags] })
      if (!silent) toast({ tone: 'success', title: 'Saved', description: saved.name })
    } catch (e) {
      toast({ tone: 'error', title: 'Save failed', description: String(e) })
    } finally {
      setSaving(false)
    }
  }, [draft, saving, toast])

  /* -------------------------------------------------------------- run */

  const run = useCallback(async () => {
    if (!draft || running) return
    // Ensure the persisted body matches what we're about to run.
    if (dirty) await save(true)
    setRunning(true)
    setShowOutput(true)
    setLastResult(null)
    try {
      const res = await ipc.runSnippet(draft.id)
      setLastResult(res)
      // Refresh run count without clobbering the draft.
      const list = await load()
      const fresh = list.find((s) => s.id === draft.id)
      if (fresh) {
        setSnippets(list)
        setDraft((d) => d ? { ...d, runCount: fresh.runCount, lastRunAt: fresh.lastRunAt } : d)
      }
    } catch (e) {
      setLastResult({
        stdout: '',
        stderr: String(e),
        exitCode: 1,
        durationMs: 0,
      })
    } finally {
      setRunning(false)
    }
  }, [draft, running, dirty, save, load])

  /* ------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty) save()
      } else if (mod && e.key === 'Enter') {
        e.preventDefault()
        if (draft) run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, save, run, draft])

  /* --------------------------------------------------------- actions */

  const create = async () => {
    const payload: Snippet = {
      id: '',
      name: 'Untitled snippet',
      description: '',
      language: 'bash',
      body: '# New snippet\n',
      tags: [],
      runCount: 0,
      lastRunAt: null,
      createdAt: '',
    }
    try {
      const saved = await ipc.upsertSnippet(payload)
      const list = await load()
      setSnippets(list)
      setSelectedId(saved.id)
    } catch (e) {
      toast({ tone: 'error', title: 'Create failed', description: String(e) })
    }
  }

  const remove = async (s: Snippet) => {
    if (!confirm(`Delete snippet "${s.name}"?\n\nThis cannot be undone.`)) return
    try {
      await ipc.deleteSnippet(s.id)
      const list = await load()
      setSnippets(list)
      toast({ tone: 'warn', title: `Deleted ${s.name}` })
      if (selectedId === s.id) {
        setSelectedId(list[0]?.id ?? null)
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  const copyOutput = () => {
    if (!lastResult) return
    const text = [lastResult.stdout, lastResult.stderr].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  /* ------------------------------------------------------------ filter */

  const filtered = useMemo(() => {
    if (!snippets) return null
    const q = query.trim().toLowerCase()
    if (!q) return snippets
    return snippets.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.language.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }, [snippets, query])

  /* ------------------------------------------------------------ render */

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Snippets</h1>
          <p className="mt-1 text-sm text-ink-400">
            Saved commands and scripts. Press ⌘S to save, ⌘↵ to run.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={create}
          leading={<Plus className="h-3.5 w-3.5" />}
        >
          New snippet
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left rail -------------------------------------------------- */}
        <Panel padded={false} className="min-h-0 flex flex-col overflow-hidden lg:col-span-4 xl:col-span-3">
          <div className="flex items-center gap-2 border-b border-white/[0.05] p-2.5">
            <Input
              wrapClassName="flex-1 h-8"
              placeholder="Filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leading={<Search className="h-3.5 w-3.5" />}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-1.5">
            {!filtered && (
              <div className="space-y-1.5 p-1">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11" />)}
              </div>
            )}
            {filtered?.length === 0 && snippets?.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Code2 className="h-6 w-6 text-ink-500" />
                <div className="text-sm text-ink-300">No snippets yet</div>
                <Button size="sm" variant="subtle" onClick={create} leading={<Plus className="h-3 w-3" />}>
                  Create one
                </Button>
              </div>
            )}
            {filtered?.length === 0 && snippets && snippets.length > 0 && (
              <div className="py-8 text-center text-xs text-ink-500">No matches.</div>
            )}
            {filtered?.map((s) => {
              const isActive = s.id === selectedId
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'group flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-all',
                    isActive
                      ? 'bg-accent/12 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
                      : 'hover:bg-white/[0.04]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        isActive ? 'text-ink-100' : 'text-ink-200',
                      )}
                    >
                      {s.name}
                    </span>
                    {s.runCount > 0 && (
                      <span className="shrink-0 font-mono text-2xs text-ink-500">
                        {s.runCount}×
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                      {s.language}
                    </span>
                    {s.tags.slice(0, 2).map((t) => (
                      <span key={t} className="truncate text-2xs text-ink-600">
                        #{t}
                      </span>
                    ))}
                    {s.tags.length > 2 && (
                      <span className="text-2xs text-ink-600">+{s.tags.length - 2}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>

        {/* Right pane -------------------------------------------------- */}
        <div className="flex min-h-0 flex-col gap-0 lg:col-span-8 xl:col-span-9">
          {!draft ? (
            <Panel className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <Code2 className="mb-3 h-8 w-8 text-ink-500" />
              <div className="text-sm text-ink-200">Select a snippet</div>
              <div className="mt-1 max-w-sm text-2xs text-ink-500">
                Or create a new one to get started.
              </div>
            </Panel>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {/* Meta + actions bar */}
              <Panel padded={false} className="shrink-0">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <Code2 className="h-4 w-4 shrink-0 text-accent-soft" />
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Untitled snippet"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink-100 outline-none placeholder:text-ink-500"
                  />
                  <select
                    value={draft.language}
                    onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    className="h-7 appearance-none rounded border border-white/[0.08] bg-black/25 px-2 font-mono text-2xs text-ink-300 outline-none focus:border-accent/50"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>

                  <div className="ml-auto flex items-center gap-1">
                    {dirty && (
                      <span className="mr-1 text-2xs text-amber">●&nbsp;unsaved</span>
                    )}
                    <IconButton
                      label={copied ? 'Copied' : 'Copy output'}
                      onClick={copyOutput}
                      disabled={!lastResult}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={saving ? 'Saving…' : 'Save (⌘S)'}
                      onClick={() => save()}
                      disabled={!dirty || saving}
                    >
                      {saving
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Save className={cn('h-3.5 w-3.5', dirty && 'text-accent-soft')} />}
                    </IconButton>
                    <IconButton
                      label="Delete"
                      tone="danger"
                      onClick={() => remove(draft)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={run}
                      disabled={running}
                      leading={
                        running
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Play className="h-3.5 w-3.5" />
                      }
                    >
                      {running ? 'Running' : 'Run'}
                    </Button>
                  </div>
                </div>

                {/* Tags + description row */}
                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-3 py-2">
                  <input
                    value={(draft.tags ?? []).join(', ')}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                      })
                    }
                    placeholder="tags, comma-separated"
                    spellCheck={false}
                    className="w-[200px] bg-transparent font-mono text-2xs text-ink-400 outline-none placeholder:text-ink-600"
                  />
                  <input
                    value={draft.description ?? ''}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="description…"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-2xs text-ink-400 outline-none placeholder:text-ink-600"
                  />
                  {draft.lastRunAt && (
                    <span className="shrink-0 font-mono text-2xs text-ink-600">
                      ran {relativeTime(draft.lastRunAt)}
                    </span>
                  )}
                </div>
              </Panel>

              {/* Editor */}
              <Panel padded={false} className="min-h-0 flex flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-auto scroll-thin">
                  <CodeMirror
                    value={draft.body}
                    onChange={(v) => setDraft({ ...draft, body: v })}
                    extensions={languageExt(draft.language)}
                    theme="dark"
                    height="100%"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                      highlightActiveLineGutter: true,
                      indentOnInput: true,
                      autocompletion: true,
                      bracketMatching: true,
                    }}
                  />
                </div>
              </Panel>

              {/* Output panel */}
              <Panel padded={false} className={cn(
                'shrink-0 overflow-hidden transition-all',
                showOutput ? 'h-[220px]' : 'h-[38px]',
              )}>
                <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
                  <Terminal className="h-3.5 w-3.5 text-ink-500" />
                  <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                    Output
                  </span>
                  {lastResult && (
                    <>
                      <Badge tone={lastResult.exitCode === 0 ? 'mint' : 'rose'}>
                        exit {lastResult.exitCode ?? '?'}
                      </Badge>
                      <span className="font-mono text-2xs text-ink-500">
                        {lastResult.durationMs}ms
                      </span>
                    </>
                  )}
                  <button
                    onClick={() => setShowOutput((v) => !v)}
                    className="ml-auto text-2xs text-ink-500 transition-colors hover:text-ink-200"
                  >
                    {showOutput ? 'collapse' : 'expand'}
                  </button>
                </div>

                {showOutput && (
                  <div className="h-[calc(220px-38px)] overflow-y-auto scroll-thin p-3 font-mono text-xs">
                    {!lastResult && !running && (
                      <div className="text-ink-600">
                        Press <kbd className="rounded border border-white/10 px-1">⌘↵</kbd> to run.
                      </div>
                    )}
                    {running && (
                      <div className="flex items-center gap-2 text-ink-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        running…
                      </div>
                    )}
                    {lastResult && (
                      <>
                        {lastResult.stdout && (
                          <pre className="whitespace-pre-wrap break-words text-ink-200">
                            {lastResult.stdout}
                          </pre>
                        )}
                        {lastResult.stderr && (
                          <pre className="mt-2 whitespace-pre-wrap break-words text-rose">
                            {lastResult.stderr}
                          </pre>
                        )}
                        {!lastResult.stdout && !lastResult.stderr && (
                          <div className="text-ink-600">(no output)</div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
