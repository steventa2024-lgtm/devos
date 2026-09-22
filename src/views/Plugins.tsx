import { useEffect, useMemo, useState } from 'react'
import {
  Check, ExternalLink, FolderOpen, Loader2, Package, Pencil, RefreshCw,
  ShieldAlert, Trash2, X, Zap,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import { useApp } from '@/store/app'
import { usePlugins } from '@/store/plugins'
import { cn } from '@/lib/utils'

export default function Plugins() {
  const toast = useApp((s) => s.toast)
  const navigate = useApp.getState() // never used directly, but reserved

  const plugins = usePlugins((s) => s.plugins)
  const commands = usePlugins((s) => s.commands)
  const loading = usePlugins((s) => s.loading)
  const loaded = usePlugins((s) => s.loaded)
  const error = usePlugins((s) => s.error)
  const failures = usePlugins((s) => s.failures)
  const disabled = usePlugins((s) => s.disabled)
  const reload = usePlugins((s) => s.load)
  const setEnabled = usePlugins((s) => s.setEnabled)

  const [dir, setDir] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // We reuse the app's toast + navigation for the plugin host.
  const host = useMemo(
    () => ({
      toast,
      navigate: (route: string) => {
        // Route strings from plugins are like '/dashboard'.
        window.location.hash = `#${route.startsWith('/') ? route : '/' + route}`
      },
    }),
    [toast],
  )

  useEffect(() => {
    reload(host)
    if (isDesktop) ipc.pluginDir().then(setDir).catch(() => null)
  }, [reload, host])

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete plugin "${name}"?\n\nThis removes its folder from disk.`)) return
    setDeleting(id)
    try {
      await ipc.pluginDelete(id)
      toast({ tone: 'warn', title: `Deleted ${name}` })
      await reload(host)
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    } finally {
      setDeleting(null)
    }
  }

  const reveal = async () => {
    try {
      await ipc.pluginRevealDir()
    } catch (e) {
      toast({ tone: 'error', title: 'Reveal failed', description: String(e) })
    }
  }

  const openFolderPath = dir

  // Group commands by plugin for the summary card.
  const commandCount = commands.length

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Plugins</h1>
          <p className="mt-1 text-sm text-ink-400">
            Local JS modules that extend DevOS with new palette commands.
          </p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          The plugin host is desktop-only.
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Plugins</h1>
          <p className="mt-1 text-sm text-ink-400">
            Local JS modules that extend DevOS. They register commands in the palette.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="md"
            variant="subtle"
            onClick={reveal}
            leading={<FolderOpen className="h-3.5 w-3.5" />}
          >
            Open folder
          </Button>
          <Button
            size="md"
            variant="subtle"
            onClick={() => reload(host)}
            disabled={loading}
            leading={loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
          >
            Reload
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip label="installed"  value={plugins.length}            tone="neutral" />
        <StatChip label="enabled"    value={plugins.length - disabled.size} tone="mint" />
        <StatChip label="commands"   value={commandCount}              tone="accent" />
        <StatChip label="failures"   value={Object.keys(failures).length} tone="rose" />
      </div>

      {/* Plugin directory line */}
      {openFolderPath && (
        <div className="truncate rounded-md border border-white/[0.06] bg-black/25 px-3 py-2 font-mono text-2xs text-ink-400">
          {openFolderPath}
        </div>
      )}

      {error && (
        <Panel className="border-rose/25 bg-rose/[0.06]">
          <div className="flex items-center gap-2 text-sm text-rose">
            <ShieldAlert className="h-4 w-4" />
            {error}
          </div>
        </Panel>
      )}

      {!loaded && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      )}

      {loaded && plugins.length === 0 && (
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
            <Package className="h-6 w-6 text-ink-500" />
          </div>
          <div className="text-sm text-ink-200">No plugins installed</div>
          <div className="mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            Drop a folder with <code className="font-mono text-ink-300">manifest.json</code> and
            <code className="mx-1 font-mono text-ink-300">index.js</code> into the plugins directory
            and click Reload.
          </div>
          <Button
            variant="primary"
            className="mt-5"
            onClick={reveal}
            leading={<FolderOpen className="h-3.5 w-3.5" />}
          >
            Open plugins folder
          </Button>
        </Panel>
      )}

      {loaded && plugins.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plugins.map((p) => {
            const isDisabled = disabled.has(p.manifest.id)
            const failure = failures[p.manifest.id]
            const status: 'ok' | 'error' | 'disabled' =
              failure ? 'error' : isDisabled ? 'disabled' : 'ok'

            return (
              <Panel key={p.manifest.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <StatusDot
                      tone={status === 'ok' ? 'mint' : status === 'error' ? 'rose' : 'neutral'}
                      pulse={status === 'ok'}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-100">
                        {p.manifest.name}
                      </div>
                      <div className="truncate font-mono text-2xs text-ink-500">
                        {p.manifest.id}
                        {p.manifest.version && ` · v${p.manifest.version}`}
                      </div>
                    </div>
                  </div>
                  <Badge
                    tone={
                      status === 'ok' ? 'mint'
                      : status === 'error' ? 'rose'
                      : 'neutral'
                    }
                  >
                    {status}
                  </Badge>
                </div>

                {p.manifest.description && (
                  <p className="text-xs leading-relaxed text-ink-400">
                    {p.manifest.description}
                  </p>
                )}

                {/* Meta row: commands count + allowShell */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                    {p.manifest.commands.length} command{p.manifest.commands.length === 1 ? '' : 's'}
                  </span>
                  {p.manifest.allowShell && (
                    <span className="flex items-center gap-1 rounded border border-amber/25 bg-amber/[0.06] px-1.5 py-0.5 font-mono text-2xs text-amber">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      shell
                    </span>
                  )}
                  {p.manifest.author && (
                    <span className="text-2xs text-ink-600">by {p.manifest.author}</span>
                  )}
                </div>

                {failure && (
                  <div className="rounded-md border border-rose/25 bg-rose/[0.06] p-2.5 font-mono text-2xs text-rose">
                    {failure}
                  </div>
                )}

                {/* Command list */}
                {p.manifest.commands.length > 0 && (
                  <details className="rounded-md border border-white/[0.06] bg-black/20">
                    <summary className="cursor-pointer select-none px-2.5 py-1.5 text-2xs uppercase tracking-widest text-ink-500">
                      registered commands
                    </summary>
                    <div className="flex flex-col gap-0.5 border-t border-white/[0.05] p-1.5">
                      {p.manifest.commands.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 px-1.5 py-1 text-2xs">
                          <Zap className="h-2.5 w-2.5 shrink-0 text-accent-soft" />
                          <span className="truncate text-ink-200">{c.label}</span>
                          <span className="ml-auto shrink-0 truncate font-mono text-ink-600">
                            {c.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] pt-3">
                  <button
                    onClick={() => setEnabled(p.manifest.id, isDisabled, host)}
                    disabled={Boolean(failure)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs transition-all',
                      isDisabled
                        ? 'border-white/[0.08] bg-white/[0.02] text-ink-400 hover:border-white/[0.14] hover:text-ink-200'
                        : 'border-mint/25 bg-mint/[0.06] text-mint hover:border-mint/40',
                      failure && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {isDisabled ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {isDisabled ? 'Enable' : 'Disable'}
                  </button>
                  <IconButton
                    label="Delete plugin"
                    tone="danger"
                    disabled={deleting === p.manifest.id}
                    onClick={() => remove(p.manifest.id, p.manifest.name)}
                  >
                    {deleting === p.manifest.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </IconButton>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatChip({
  label, value, tone,
}: {
  label: string
  value: number
  tone: 'mint' | 'amber' | 'rose' | 'neutral' | 'accent'
}) {
  const tones = {
    mint:    'border-mint/25  bg-mint/[0.06]',
    amber:   'border-amber/25 bg-amber/[0.06]',
    rose:    'border-rose/25  bg-rose/[0.06]',
    neutral: 'border-white/[0.08] bg-white/[0.02]',
    accent:  'border-accent/25 bg-accent/[0.06]',
  }
  const valueColor = {
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    neutral: 'text-ink-100',
    accent: 'text-accent-soft',
  }
  return (
    <div className={cn('rounded-lg border px-3.5 py-2.5', tones[tone])}>
      <div className={cn('text-xl font-semibold tabular', valueColor[tone])}>{value}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-widest text-ink-500">{label}</div>
    </div>
  )
}
