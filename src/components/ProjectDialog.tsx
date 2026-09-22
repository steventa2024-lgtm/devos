import { useEffect, useState } from 'react'
import {
  AlertTriangle, FolderOpen, HardDrive, Home, Loader2, Usb,
} from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Field, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ipc, isDesktop, type MountRoot, type WindowsDrive } from '@/lib/ipc'
import type { Project } from '@/lib/ipc'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'

const KIND_OPTIONS = ['node', 'rust', 'python', 'go', 'tauri', 'docker', 'unknown'] as const
const COLOR_OPTIONS = ['#5b8cff', '#48d6a5', '#a479ff', '#f0b45f', '#f2607a'] as const

export interface ProjectDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (project: Project) => void
  initial?: Project | null
}

type Errors = { name?: string; path?: string }

const kindIcon = { home: Home, drive: HardDrive, usb: Usb } as const

export function ProjectDialog({ open, onClose, onSaved, initial }: ProjectDialogProps) {
  const isEdit = Boolean(initial?.id)
  const toast = useApp((s) => s.toast)

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [kind, setKind] = useState<string>('unknown')
  const [color, setColor] = useState<string>(COLOR_OPTIONS[0])
  const [tags, setTags] = useState('')
  const [favorite, setFavorite] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const [mounts, setMounts] = useState<MountRoot[]>([])
  const [winDrives, setWinDrives] = useState<WindowsDrive[]>([])
  const [wsl, setWsl] = useState(false)
  const [mounting, setMounting] = useState<string | null>(null)

  // Refresh the drive lists.
  const refreshContext = async () => {
    if (!isDesktop) return
    const [m, w, isW] = await Promise.all([
      ipc.listMountRoots().catch(() => [] as MountRoot[]),
      ipc.listWindowsDrives().catch(() => [] as WindowsDrive[]),
      ipc.isWsl().catch(() => false),
    ])
    setMounts(m)
    setWinDrives(w)
    setWsl(isW)
  }

  useEffect(() => {
    if (!open) return
    refreshContext()
  }, [open])

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setPath(initial?.path ?? '')
    setKind(initial?.kind ?? 'unknown')
    setColor(initial?.color ?? COLOR_OPTIONS[0])
    setTags((initial?.tags ?? []).join(', '))
    setFavorite(initial?.favorite ?? false)
    setErrors({})
    setSaving(false)
    setMounting(null)
  }, [open, initial])

  const inferName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? ''

  const pickerDefault = (): string | undefined => {
    if (path.trim()) {
      const parts = path.replace(/\/+$/, '').split(/[\\/]/)
      parts.pop()
      if (parts.length && parts.join('/')) return parts.join('/')
    }
    const mountedDrive = winDrives.find((d) => d.mounted)
    if (mountedDrive) return mountedDrive.wslPath
    return mounts.find((m) => m.kind === 'home')?.path
  }

  const browse = async () => {
    const picked = await ipc.pickFolder('Select project folder', pickerDefault())
    if (!picked) return
    setPath(picked)
    if (!name.trim()) setName(inferName(picked))
  }

  /** Click on a Windows drive chip. Mounts it if needed, then sets the path. */
  const chooseWindowsDrive = async (d: WindowsDrive) => {
    if (mounting) return

    if (!d.mounted) {
      setMounting(d.letter)
      try {
        await ipc.mountWindowsDrive(d.letter)
        toast({
          tone: 'success',
          title: `Mounted ${d.letter}:`,
          description: d.wslPath,
        })
        // Refresh so the chip turns from amber to normal.
        await refreshContext()
        setPath(d.wslPath)
      } catch (e) {
        const msg = String(e)
        toast({
          tone: 'error',
          title: `Could not mount ${d.letter}:`,
          description:
            'Open a terminal and run the mount command shown in the browser console, then try again.',
        })
        // Copy the command and log it so they can paste.
        const cmd = `sudo mkdir -p /mnt/${d.letter.toLowerCase()} && sudo mount -t drvfs '${d.letter}:' /mnt/${d.letter.toLowerCase()}`
        navigator.clipboard.writeText(cmd).catch(() => null)
        console.warn('[devos] run this once:\n\n' + cmd + '\n\nReason: ' + msg)
      } finally {
        setMounting(null)
      }
      return
    }

    setPath(d.wslPath)
  }

  const validate = (): boolean => {
    const next: Errors = {}
    if (!name.trim()) next.name = 'Name is required'
    if (!path.trim()) next.path = 'Path is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload: Project = {
        id: initial?.id ?? '',
        name: name.trim(),
        path: path.trim(),
        kind,
        color,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        favorite,
        lastOpenedAt: initial?.lastOpenedAt ?? null,
        createdAt: initial?.createdAt ?? '',
      }
      const saved = await ipc.upsertProject(payload)
      onSaved(saved)
      toast({
        tone: 'success',
        title: isEdit ? 'Project updated' : 'Project added',
        description: saved.name,
      })
      onClose()
    } catch (e) {
      toast({ tone: 'error', title: 'Save failed', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  // Which chips to show? On WSL: real Windows drives. Elsewhere: Linux mounts.
  const showWindows = wsl && winDrives.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? 'Edit project' : 'New project'}
      description={
        isEdit
          ? 'Update metadata for this workspace. The folder itself is untouched.'
          : 'Point DevOS at a folder on disk. Nothing is moved or copied.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add project'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="atlas-api"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Path"
          required
          error={errors.path}
          hint={
            showWindows
              ? 'Click a drive below, or use Browse to descend into it.'
              : 'Click a location below, or use Browse.'
          }
        >
          <div className="flex flex-col gap-2">
            {/* Windows drives (WSL only). */}
            {showWindows && (
              <div className="flex flex-wrap gap-1.5">
                {winDrives.map((d) => {
                  const isBusy = mounting === d.letter
                  const active = path === d.wslPath || path.startsWith(d.wslPath + '/')
                  return (
                    <button
                      key={d.letter}
                      type="button"
                      disabled={Boolean(mounting)}
                      onClick={() => chooseWindowsDrive(d)}
                      title={
                        d.mounted
                          ? d.wslPath
                          : `${d.wslPath} — not mounted in WSL, click to mount`
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-mono transition-all',
                        'disabled:opacity-50',
                        isBusy && 'border-accent/40 bg-accent/10 text-accent-soft',
                        !isBusy && active && d.mounted
                          ? 'border-accent/40 bg-accent/12 text-accent-soft'
                          : !isBusy && d.mounted
                            ? 'border-white/[0.08] bg-white/[0.03] text-ink-400 hover:border-white/[0.16] hover:text-ink-200'
                            : !isBusy
                              ? 'border-amber/25 bg-amber/[0.06] text-amber/80 hover:border-amber/40'
                              : '',
                      )}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : d.mounted ? (
                        <HardDrive className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {d.label}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Linux mounts. Shown when not on WSL, or as a fallback. */}
            {!showWindows && mounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mounts.map((m) => {
                  const Icon = kindIcon[m.kind as keyof typeof kindIcon] ?? HardDrive
                  const active = path === m.path || path.startsWith(m.path + '/')
                  return (
                    <button
                      key={m.path}
                      type="button"
                      onClick={() => setPath(m.path)}
                      title={m.path}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-mono transition-all',
                        active
                          ? 'border-accent/40 bg-accent/12 text-accent-soft'
                          : 'border-white/[0.08] bg-white/[0.03] text-ink-400 hover:border-white/[0.16] hover:text-ink-200',
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {m.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                wrapClassName="flex-1"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={
                  showWindows ? '/mnt/e/my-drive/my-project'
                  : isDesktop ? '/home/you/code'
                  : 'unavailable'
                }
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
              <Button
                variant="subtle"
                onClick={browse}
                disabled={!isDesktop}
                leading={<FolderOpen className="h-3.5 w-3.5" />}
              >
                Browse
              </Button>
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Color">
            <div className="flex h-9 items-center gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full border transition-all',
                    color === c
                      ? 'border-white/60 ring-2 ring-white/15'
                      : 'border-white/10 hover:border-white/30',
                  )}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </Field>
        </div>

        <Field label="Tags" hint="Comma-separated. Lowercase recommended.">
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="backend, fastify, postgres"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => setFavorite(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black/30 accent-[#5b8cff]"
          />
          Pin to top of dashboard
        </label>
      </div>
    </Modal>
  )
}
