import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Lock } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc } from '@/lib/ipc'
import type { EnvVar } from '@/lib/ipc'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'

export interface EnvVarDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  profileId: string
  initial?: EnvVar | null
}

export function EnvVarDialog({
  open,
  onClose,
  onSaved,
  profileId,
  initial,
}: EnvVarDialogProps) {
  const isEdit = Boolean(initial?.id)
  const wasSecret = initial?.secret ?? false
  const toast = useApp((s) => s.toast)

  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [secret, setSecret] = useState(false)
  const [showValue, setShowValue] = useState(false)
  const [errors, setErrors] = useState<{ key?: string; value?: string }>({})
  const [saving, setSaving] = useState(false)

  // Value-is-new: for a new var or a non-secret var, always true.
  // For an existing secret where the user hasn't typed, it's false.
  const valueWasTouched = !isEdit || !wasSecret || value.length > 0

  useEffect(() => {
    if (!open) return
    setKey(initial?.key ?? '')
    // Never prefill a masked value into an editable field.
    setValue(initial && !initial.secret ? initial.value : '')
    setSecret(initial?.secret ?? false)
    setShowValue(false)
    setErrors({})
    setSaving(false)
  }, [open, initial])

  const submit = async () => {
    const next: { key?: string; value?: string } = {}
    if (!key.trim()) next.key = 'Key is required'
    // Non-secret values must be non-empty. Secret edits without a new value are OK.
    if (!isEdit && !value.trim()) next.value = 'Value is required'
    if (isEdit && !wasSecret && !value.trim()) next.value = 'Value is required'
    if (isEdit && wasSecret && value.length > 0 && value.length === 0) next.value = 'Invalid'

    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      if (isEdit && !valueWasTouched) {
        // Metadata-only change. Preserves the existing ciphertext.
        await ipc.updateEnvVarMeta(initial!.id, key.trim(), secret)
      } else {
        const payload: EnvVar = {
          id: initial?.id ?? '',
          profileId,
          key: key.trim(),
          value,
          secret,
        }
        await ipc.upsertEnvVar(payload)
      }
      toast({
        tone: 'success',
        title: isEdit ? 'Variable updated' : 'Variable added',
        description: key.trim(),
      })
      onSaved()
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
      title={isEdit ? 'Edit variable' : 'New variable'}
      description={
        wasSecret && isEdit
          ? 'The existing value is encrypted. Type a new one to replace it, or leave blank to keep it.'
          : 'Stored locally. Secret values are encrypted with a per-machine key.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add variable'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Key"
          required
          error={errors.key}
          hint="Convention: UPPER_SNAKE_CASE"
        >
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
            placeholder="DATABASE_URL"
            autoComplete="off"
            spellCheck={false}
            className="font-mono text-xs"
            leading={<KeyRound className="h-3.5 w-3.5" />}
          />
        </Field>

        <Field
          label="Value"
          required={!wasSecret || !isEdit}
          error={errors.value}
          hint={
            wasSecret && isEdit
              ? value.length === 0
                ? 'Leave blank to keep the current value.'
                : 'This will replace the stored value.'
              : undefined
          }
        >
          <div className="flex gap-2">
            <Input
              wrapClassName="flex-1"
              type={showValue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                wasSecret && isEdit
                  ? '(unchanged — type to replace)'
                  : 'postgres://localhost:5432/db'
              }
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
            />
            {wasSecret && (
              <Button
                variant="subtle"
                onClick={() => setShowValue((v) => !v)}
                title={showValue ? 'Hide' : 'Show'}
              >
                {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </Field>

        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all',
            secret
              ? 'border-accent/40 bg-accent/[0.06]'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
          )}
        >
          <input
            type="checkbox"
            checked={secret}
            onChange={(e) => setSecret(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm text-ink-100">
              <Lock className="h-3.5 w-3.5 text-accent-soft" />
              Mark as secret
            </div>
            <div className="mt-0.5 text-xs text-ink-500">
              Encrypted with XChaCha20-Poly1305 before being written to disk.
              Masked in the UI until explicitly revealed.
            </div>
          </div>
        </label>
      </div>
    </Modal>
  )
}
