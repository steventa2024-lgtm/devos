import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { ApiHeader, ApiRequest } from '@/lib/ipc'
import { useApp } from '@/store/app'

export interface ApiSaveDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (r: ApiRequest) => void
  /** Skeleton of the request currently in the editor. */
  draft: {
    id?: string
    method: string
    url: string
    headers: ApiHeader[]
    body: string
    bodyKind: string
  }
  initial?: ApiRequest | null
}

export function ApiSaveDialog({ open, onClose, onSaved, draft, initial }: ApiSaveDialogProps) {
  const isEdit = Boolean(draft.id)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [collection, setCollection] = useState('Default')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setCollection(initial?.collection ?? 'Default')
    setError(null)
    setSaving(false)
  }, [open, initial])

  const submit = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const payload: ApiRequest = {
        id: draft.id ?? '',
        collection: collection.trim() || 'Default',
        name: name.trim(),
        method: draft.method,
        url: draft.url,
        headers: draft.headers,
        body: draft.body,
        bodyKind: draft.bodyKind,
        sortOrder: initial?.sortOrder ?? 0,
        createdAt: initial?.createdAt ?? '',
        updatedAt: '',
      }
      const saved = await ipc.apiUpsertRequest(payload)
      onSaved(saved)
      toast({ tone: 'success', title: isEdit ? 'Request updated' : 'Request saved', description: saved.name })
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
      size="sm"
      title={isEdit ? 'Save request' : 'Save new request'}
      description="Give this request a name so you can recall it later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={saving}
            leading={<Save className="h-3.5 w-3.5" />}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={error ?? undefined}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Get user by ID"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
        </Field>
        <Field label="Collection" hint="Group related requests. Free text.">
          <Input
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="Default"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>
    </Modal>
  )
}
