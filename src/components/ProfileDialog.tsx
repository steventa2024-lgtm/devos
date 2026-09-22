import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { EnvProfile } from '@/lib/ipc'
import { useApp } from '@/store/app'

export interface ProfileDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (profile: EnvProfile) => void
  initial?: EnvProfile | null
}

export function ProfileDialog({ open, onClose, onSaved, initial }: ProfileDialogProps) {
  const isEdit = Boolean(initial?.id)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setError(null)
    setSaving(false)
  }, [open, initial])

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    setSaving(true)
    try {
      const payload: EnvProfile = {
        id: initial?.id ?? '',
        projectId: initial?.projectId ?? null,
        name: trimmed,
        isActive: initial?.isActive ?? false,
        createdAt: initial?.createdAt ?? '',
      }
      const saved = await ipc.upsertEnvProfile(payload)
      onSaved(saved)
      toast({
        tone: 'success',
        title: isEdit ? 'Profile updated' : 'Profile created',
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
      size="sm"
      title={isEdit ? 'Edit profile' : 'New profile'}
      description={
        isEdit
          ? 'Rename this environment profile.'
          : 'Group related variables. Only one profile is active at a time.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create profile'}
          </Button>
        </>
      }
    >
      <Field label="Name" required error={error ?? undefined} hint="e.g. atlas · development">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="project · environment"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
      </Field>
      <div className="mt-3 flex items-center gap-2 text-2xs text-ink-500">
        <Layers className="h-3 w-3" />
        <span>Variables are stored encrypted when marked secret.</span>
      </div>
    </Modal>
  )
}
