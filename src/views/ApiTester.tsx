import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json as jsonLang } from '@codemirror/lang-json'
import {
  Check, Copy, Loader2, Plus, Save, Send, Trash2, X,
} from 'lucide-react'
import { Badge, Button, IconButton, Input, Panel, Skeleton } from '@/components/ui'
import { ApiSaveDialog } from '@/components/ApiSaveDialog'
import { ipc, isDesktop } from '@/lib/ipc'
import type { ApiHeader, ApiRequest, ApiResponse } from '@/lib/ipc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

function methodTone(m: string): 'mint' | 'amber' | 'rose' | 'accent' | 'violet' | 'neutral' {
  switch (m) {
    case 'GET':     return 'mint'
    case 'POST':    return 'accent'
    case 'PUT':     return 'amber'
    case 'PATCH':   return 'violet'
    case 'DELETE':  return 'rose'
    default:        return 'neutral'
  }
}

function statusTone(status: number): 'mint' | 'amber' | 'rose' | 'accent' | 'neutral' {
  if (status === 0) return 'rose'
  if (status < 300) return 'mint'
  if (status < 400) return 'accent'
  if (status < 500) return 'amber'
  return 'rose'
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export default function ApiTester() {
  const toast = useApp((s) => s.toast)

  /* ----------------------------------------------------------- state */

  const [saved, setSaved] = useState<ApiRequest[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Editor working copy
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<ApiHeader[]>([])
  const [body, setBody] = useState('')
  const [bodyKind, setBodyKind] = useState<'json' | 'text' | 'form'>('json')

  const [tab, setTab] = useState<'headers' | 'body'>('headers')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [sending, setSending] = useState(false)
  const [respTab, setRespTab] = useState<'body' | 'headers'>('body')
  const [saveOpen, setSaveOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const activeSaved = useMemo(
    () => saved?.find((r) => r.id === activeId) ?? null,
    [saved, activeId],
  )

  const dirty = useMemo(() => {
    if (!activeSaved) return Boolean(url.trim())
    return (
      activeSaved.method !== method ||
      activeSaved.url !== url ||
      activeSaved.body !== body ||
      activeSaved.bodyKind !== bodyKind ||
      JSON.stringify(activeSaved.headers) !== JSON.stringify(headers)
    )
  }, [activeSaved, method, url, body, bodyKind, headers])

  /* ----------------------------------------------------------- load */

  const load = useCallback(async () => {
    const list = await ipc.apiListRequests()
    setSaved(list)
    return list
  }, [])

  useEffect(() => { load() }, [load])

  const newRequest = () => {
    setActiveId(null)
    setMethod('GET')
    setUrl('')
    setHeaders([])
    setBody('')
    setBodyKind('json')
    setResponse(null)
    setTab('headers')
  }

  const selectRequest = (r: ApiRequest) => {
    setActiveId(r.id)
    setMethod(r.method)
    setUrl(r.url)
    setHeaders(r.headers.map((h) => ({ ...h })))
    setBody(r.body)
    setBodyKind((r.bodyKind as any) ?? 'json')
    setResponse(null)
  }

  const removeRequest = async (r: ApiRequest) => {
    if (!confirm(`Delete saved request "${r.name}"?`)) return
    try {
      await ipc.apiDeleteRequest(r.id)
      const list = await load()
      if (activeId === r.id) {
        if (list[0]) selectRequest(list[0])
        else newRequest()
      }
      toast({ tone: 'warn', title: `Deleted ${r.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  /* ----------------------------------------------------------- headers */

  const addHeader = () => setHeaders((h) => [...h, { key: '', value: '', enabled: true }])
  const removeHeader = (i: number) =>
    setHeaders((h) => h.filter((_, idx) => idx !== i))
  const updateHeader = (i: number, patch: Partial<ApiHeader>) =>
    setHeaders((h) => h.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  /* ----------------------------------------------------------- send */

  const send = useCallback(async () => {
    if (!url.trim() || sending) return
    setSending(true)
    setResponse(null)
    setRespTab('body')
    try {
      const res = await ipc.apiSend(method, url.trim(), headers, body)
      setResponse(res)
    } catch (e) {
      toast({ tone: 'error', title: 'Request failed', description: String(e) })
    } finally {
      setSending(false)
    }
  }, [url, sending, method, headers, body, toast])

  /* ----------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        send()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (url.trim()) setSaveOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [send, url])

  const copyResponseBody = () => {
    if (!response) return
    navigator.clipboard.writeText(response.body).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  /* ----------------------------------------------------------- render */

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">API Tester</h1>
          <p className="mt-1 text-sm text-ink-400">HTTP client.</p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Desktop-only.
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">API Tester</h1>
          <p className="mt-1 text-sm text-ink-400">
            Send HTTP requests and save them for later.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={newRequest}
          leading={<Plus className="h-3.5 w-3.5" />}
        >
          New request
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left rail: saved requests ------------------------------------ */}
        <Panel padded={false} className="flex min-h-0 flex-col overflow-hidden lg:col-span-3 xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2.5">
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Saved
            </span>
            {saved && (
              <span className="ml-auto font-mono text-2xs text-ink-500">{saved.length}</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-1.5">
            {!saved && [...Array(4)].map((_, i) => <Skeleton key={i} className="mb-1 h-9" />)}
            {saved?.length === 0 && (
              <div className="px-3 py-8 text-center text-2xs text-ink-500">
                No saved requests.
              </div>
            )}
            {saved?.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-all',
                  activeId === r.id ? 'bg-accent/12 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]' : 'hover:bg-white/[0.04]',
                )}
              >
                <button
                  onClick={() => selectRequest(r)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      'shrink-0 font-mono text-2xs font-medium',
                      methodTone(r.method) === 'mint' && 'text-mint',
                      methodTone(r.method) === 'accent' && 'text-accent-soft',
                      methodTone(r.method) === 'amber' && 'text-amber',
                      methodTone(r.method) === 'rose' && 'text-rose',
                      methodTone(r.method) === 'violet' && 'text-violet',
                      methodTone(r.method) === 'neutral' && 'text-ink-400',
                    )}
                  >
                    {r.method}
                  </span>
                  <span className={cn('truncate text-xs', activeId === r.id ? 'text-ink-100' : 'text-ink-300')}>
                    {r.name}
                  </span>
                </button>
                <IconButton
                  label="Delete"
                  tone="danger"
                  onClick={() => removeRequest(r)}
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
            ))}
          </div>
        </Panel>

        {/* Main pane: builder + response -------------------------------- */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-9 xl:col-span-10">
          {/* Builder */}
          <Panel padded={false} className="flex shrink-0 flex-col overflow-hidden">
            {/* URL bar */}
            <div className="flex items-center gap-2 border-b border-white/[0.05] p-3">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 appearance-none rounded-lg border border-white/[0.08] bg-black/25 px-2 pr-6 font-mono text-xs font-medium text-ink-100 outline-none focus:border-accent/50"
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <Input
                wrapClassName="flex-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) send() }}
                placeholder="https://api.example.com/v1/users"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
              <Button
                variant="primary"
                onClick={send}
                disabled={sending || !url.trim()}
                leading={sending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
              >
                {sending ? 'Sending' : 'Send'}
              </Button>
              <Button
                variant="subtle"
                onClick={() => setSaveOpen(true)}
                disabled={!url.trim()}
                leading={<Save className={cn('h-3.5 w-3.5', dirty && 'text-accent-soft')} />}
              >
                {dirty ? 'Save ●' : 'Save'}
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-white/[0.05] px-3 py-1.5">
              {(['headers', 'body'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-2xs uppercase tracking-widest transition-colors',
                    tab === t
                      ? 'bg-white/[0.06] text-ink-100'
                      : 'text-ink-500 hover:text-ink-300',
                  )}
                >
                  {t}
                  {t === 'headers' && headers.length > 0 && (
                    <span className="ml-1.5 font-mono">{headers.length}</span>
                  )}
                  {t === 'body' && body.trim() && (
                    <span className="ml-1.5 font-mono text-accent-soft">●</span>
                  )}
                </button>
              ))}
              <span className="ml-auto font-mono text-2xs text-ink-500">
                ⌘↵ send · ⌘S save
              </span>
            </div>

            {/* Tab content */}
            <div className="max-h-[280px] overflow-auto scroll-thin">
              {tab === 'headers' && (
                <div className="p-3">
                  {headers.length === 0 && (
                    <div className="py-4 text-center text-2xs text-ink-500">
                      No headers yet.
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={h.enabled}
                          onChange={(e) => updateHeader(i, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
                        />
                        <input
                          value={h.key}
                          onChange={(e) => updateHeader(i, { key: e.target.value })}
                          placeholder="Header name"
                          spellCheck={false}
                          className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/25 px-2.5 py-1.5 font-mono text-xs text-ink-100 outline-none focus:border-accent/50"
                        />
                        <input
                          value={h.value}
                          onChange={(e) => updateHeader(i, { value: e.target.value })}
                          placeholder="value"
                          spellCheck={false}
                          className="min-w-0 flex-[2] rounded-md border border-white/[0.08] bg-black/25 px-2.5 py-1.5 font-mono text-xs text-ink-100 outline-none focus:border-accent/50"
                        />
                        <IconButton label="Remove" tone="danger" onClick={() => removeHeader(i)}>
                          <X className="h-3 w-3" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={addHeader}
                    className="mt-2"
                    leading={<Plus className="h-3 w-3" />}
                  >
                    Add header
                  </Button>
                </div>
              )}

              {tab === 'body' && (
                <div>
                  <div className="flex items-center gap-1.5 border-b border-white/[0.05] px-3 py-1.5">
                    {(['json', 'text', 'form'] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => setBodyKind(k)}
                        className={cn(
                          'rounded px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors',
                          bodyKind === k
                            ? 'bg-accent/15 text-accent-soft'
                            : 'text-ink-500 hover:text-ink-300',
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <CodeMirror
                    value={body}
                    onChange={setBody}
                    extensions={bodyKind === 'json' ? [jsonLang()] : []}
                    theme="dark"
                    height="180px"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: true,
                      bracketMatching: true,
                    }}
                  />
                </div>
              )}
            </div>
          </Panel>

          {/* Response */}
          <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
              <span className="text-2xs uppercase tracking-widest text-ink-500">Response</span>
              {response?.error && (
                <Badge tone="rose">error</Badge>
              )}
              {response && !response.error && (
                <>
                  <Badge tone={statusTone(response.status)}>
                    {response.status} {response.statusText}
                  </Badge>
                  <span className="font-mono text-2xs text-ink-500">{response.durationMs}ms</span>
                  <span className="font-mono text-2xs text-ink-500">{bytes(response.sizeBytes)}</span>
                  {response.bodyTruncated && (
                    <Badge tone="amber">truncated</Badge>
                  )}
                </>
              )}
              <div className="ml-auto flex items-center gap-1">
                {response && !response.error && (
                  <>
                    <button
                      onClick={() => setRespTab('body')}
                      className={cn(
                        'rounded px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors',
                        respTab === 'body' ? 'bg-white/[0.08] text-ink-100' : 'text-ink-500 hover:text-ink-300',
                      )}
                    >
                      body
                    </button>
                    <button
                      onClick={() => setRespTab('headers')}
                      className={cn(
                        'rounded px-2 py-0.5 font-mono text-2xs uppercase tracking-widest transition-colors',
                        respTab === 'headers' ? 'bg-white/[0.08] text-ink-100' : 'text-ink-500 hover:text-ink-300',
                      )}
                    >
                      headers · {response.headers.length}
                    </button>
                    <IconButton label={copied ? 'Copied' : 'Copy body'} onClick={copyResponseBody}>
                      {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
                    </IconButton>
                  </>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              {!response && !sending && (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <Send className="mb-3 h-6 w-6 text-ink-500" />
                  <div className="text-sm text-ink-200">No response yet</div>
                  <div className="mt-1 text-2xs text-ink-500">
                    Press ⌘↵ or click Send.
                  </div>
                </div>
              )}
              {sending && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
                </div>
              )}
              {response?.error && (
                <div className="m-4 rounded-lg border border-rose/25 bg-rose/[0.06] p-4 font-mono text-xs text-rose">
                  {response.error}
                </div>
              )}
              {response && !response.error && respTab === 'body' && (
                <CodeMirror
                  value={response.body}
                  readOnly
                  extensions={[]}
                  theme="dark"
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                />
              )}
              {response && !response.error && respTab === 'headers' && (
                <table className="w-full text-xs">
                  <tbody>
                    {response.headers.map((h, i) => (
                      <tr key={i} className="border-b border-white/[0.03]">
                        <td className="w-1/3 px-4 py-2 font-mono text-accent-soft">{h.key}</td>
                        <td className="break-all px-4 py-2 font-mono text-ink-300">{h.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <ApiSaveDialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSaved={async () => { await load() }}
        draft={{
          id: activeSaved?.id,
          method, url, headers, body, bodyKind,
        }}
        initial={activeSaved}
      />
    </div>
  )
}
