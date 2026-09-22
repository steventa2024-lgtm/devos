import { useEffect, useState } from 'react'
import { Boxes, ExternalLink } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { Service } from '@/lib/ipc'
import { useApp } from '@/store/app'

const KIND_OPTIONS = [
  'node', 'docker', 'postgres', 'redis', 'mysql', 'nginx', 'process', 'other',
] as const

export interface ServiceDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (service: Service) => void
  initial?: Service | null
}

export function ServiceDialog({ open, onClose, onSaved, initial }: ServiceDialogProps) {
  const isEdit = Boolean(initial?.id)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [kind, setKind] = useState<string>('process')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('')
  const [autostart, setAutostart] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setKind(initial?.kind ?? 'process')
    setTarget(initial?.target ?? '')
    setUrl(initial?.url ?? '')
    setAutostart(initial?.autostart ?? false)
    setError(null)
    setSaving(false)
  }, [open, initial])

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSaving(true)
    try {
      const payload: Service = {
        id: initial?.id ?? '',
        name: name.trim(),
        kind,
        target: target.trim() || null,
        url: url.trim() || null,
        health: initial?.health ?? 'unknown',
        autostart,
        meta: initial?.meta ?? {},
        updatedAt: initial?.updatedAt ?? '',
      }
      const saved = await ipc.upsertService(payload)
      onSaved(saved)
      toast({
        tone: 'success',
        title: isEdit ? 'Service updated' : 'Service added',
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
      title={isEdit ? 'Edit service' : 'New service'}
      description={
        isEdit
          ? 'Update this service. URL changes take effect on the next probe.'
          : 'Register a local process, container, or database. DevOS probes its URL.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add service'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="atlas-api"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Field>

        <Field
          label="URL"
          hint="Used by the health probe. Leave blank for a non-HTTP service."
        >
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:4000"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            leading={<ExternalLink className="h-3.5 w-3.5" />}
          />
        </Field>

        <Field
          label="Target"
          hint="Container name, start command, or a note about how to run this."
        >
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="atlas-db  •  pnpm dev  •  docker compose up"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            leading={<Boxes className="h-3.5 w-3.5" />}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => setAutostart(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
          />
          Mark as autostart candidate
        </label>
      </div>
    </Modal>
  )
}
