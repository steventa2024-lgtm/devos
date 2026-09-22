import { useEffect, useState } from 'react'
import { Database, FileSearch, Loader2 } from 'lucide-react'
import { Badge, Button, Input } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc, isDesktop } from '@/lib/ipc'
import type { DbConnection, DbProbe } from '@/lib/ipc'
import { useApp } from '@/store/app'

export interface DbConnectionDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (c: DbConnection) => void
  initial?: DbConnection | null
}

export function DbConnectionDialog({
  open, onClose, onSaved, initial,
}: DbConnectionDialogProps) {
  const isEdit = Boolean(initial?.id)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [probe, setProbe] = useState<DbProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setPath(initial?.path ?? '')
    setReadOnly(initial?.readOnly ?? true)
    setProbe(null)
    setError(null)
    setSaving(false)
    setProbing(false)
  }, [open, initial])

  const runProbe = async (p = path) => {
    if (!p.trim()) return
    setProbing(true)
    setProbe(null)
    try {
      const res = await ipc.dbTestConnection(p)
      setProbe(res)
    } catch (e) {
      setProbe({ ok: false, version: null, pageCount: null, pageSize: null, error: String(e) })
    } finally {
      setProbing(false)
    }
  }

  const pick = async () => {
    if (!isDesktop) return
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
    const picked = await openDialog({
      directory: false,
      multiple: false,
      title: 'Select a SQLite database',
      filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }],
    })
    if (typeof picked !== 'string') return
    setPath(picked)
    if (!name.trim()) {
      const base = picked.split(/[\\/]/).pop() ?? 'database'
      setName(base.replace(/\.(db|sqlite3?|db3)$/i, ''))
    }
    await runProbe(picked)
  }

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!path.trim()) { setError('Path is required'); return }
    setSaving(true)
    try {
      const payload: DbConnection = {
        id: initial?.id ?? '',
        name: name.trim(),
        kind: 'sqlite',
        path: path.trim(),
        url: null,
        readOnly,
        createdAt: initial?.createdAt ?? '',
        lastUsedAt: initial?.lastUsedAt ?? null,
      }
      const saved = await ipc.dbUpsertConnection(payload)
      onSaved(saved)
      toast({
        tone: 'success',
        title: isEdit ? 'Connection updated' : 'Connection added',
        description: saved.name,
      })
      onClose()
    } catch (e) {
      toast({ tone: 'error', title: 'Save failed', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit connection' : 'New SQLite connection'}
      description="Point DevOS at a .db / .sqlite / .sqlite3 file. The file is opened read-only unless you allow writes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saving || (probe ? !probe.ok : false)}
          >
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add connection'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="atlas-dev"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Path" required hint="Absolute path to a SQLite file.">
          <div className="flex gap-2">
            <Input
              wrapClassName="flex-1"
              value={path}
              onChange={(e) => { setPath(e.target.value); setProbe(null) }}
              onBlur={() => path.trim() && runProbe()}
              placeholder="/home/you/data/app.db"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            <Button
              variant="subtle"
              onClick={pick}
              disabled={!isDesktop}
              leading={<FileSearch className="h-3.5 w-3.5" />}
            >
              Browse
            </Button>
            <Button variant="subtle" onClick={() => runProbe()} disabled={!path.trim() || probing}>
              {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
            </Button>
          </div>
        </Field>

        {probe && (
          <div className={
            'rounded-lg border p-3 ' +
            (probe.ok ? 'border-mint/25 bg-mint/[0.06]' : 'border-rose/25 bg-rose/[0.06]')
          }>
            {probe.ok ? (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Badge tone="mint">reachable</Badge>
                {probe.version && (
                  <span className="font-mono text-ink-300">SQLite {probe.version}</span>
                )}
                {probe.pageCount != null && probe.pageSize != null && (
                  <span className="font-mono text-ink-400">
                    ~{((probe.pageCount * probe.pageSize) / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs text-rose">{probe.error ?? 'probe failed'}</div>
            )}
          </div>
        )}

        <label className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-ink-100">
              <Database className="h-3.5 w-3.5 text-accent-soft" />
              Read-only mode
            </div>
            <div className="mt-0.5 text-xs text-ink-500">
              Recommended. You can still lift this per-query with the "Allow writes" toggle in the editor.
            </div>
          </div>
        </label>
      </div>
    </Modal>
  )
}
