import { useCallback, useEffect, useState } from 'react'
import {
  Eye, EyeOff, KeyRound, Layers, Lock, Pencil, Plus, ShieldCheck,
  Trash2, Unlock,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { ProfileDialog } from '@/components/ProfileDialog'
import { EnvVarDialog } from '@/components/EnvVarDialog'
import { ipc, isDesktop } from '@/lib/ipc'
import type { EnvProfile, EnvVar } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

export default function Environment() {
  const toast = useApp((s) => s.toast)

  const [profiles, setProfiles] = useState<EnvProfile[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [vars, setVars] = useState<EnvVar[] | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<EnvProfile | null>(null)

  const [varDialogOpen, setVarDialogOpen] = useState(false)
  const [editingVar, setEditingVar] = useState<EnvVar | null>(null)

  const activeProfile = profiles?.find((p) => p.id === activeId) ?? null

  const loadProfiles = useCallback(async () => {
    const ps = await ipc.listEnvProfiles()
    setProfiles(ps)
    // Auto-select active, else first.
    const next = ps.find((p) => p.isActive) ?? ps[0]
    setActiveId(next?.id ?? null)
    return ps
  }, [])

  useEffect(() => { loadProfiles() }, [loadProfiles])

  const loadVars = useCallback(async (profileId: string | null) => {
    if (!profileId) { setVars([]); return }
    setVars(null)
    setRevealed({})
    try {
      const list = await ipc.listEnvVars(profileId)
      setVars(list)
    } catch (e) {
      setVars([])
      toast({ tone: 'error', title: 'Load failed', description: String(e) })
    }
  }, [toast])

  useEffect(() => { loadVars(activeId) }, [activeId, loadVars])

  const activateProfile = async (p: EnvProfile) => {
    try {
      await ipc.upsertEnvProfile({ ...p, isActive: true })
      setProfiles((prev) => prev?.map((x) => ({ ...x, isActive: x.id === p.id })) ?? null)
      toast({ tone: 'success', title: `Activated ${p.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Activate failed', description: String(e) })
    }
  }

  const deleteProfile = async (p: EnvProfile) => {
    if (!confirm(`Delete profile "${p.name}" and all of its variables?\n\nThis cannot be undone.`)) return
    try {
      await ipc.deleteEnvProfile(p.id)
      toast({ tone: 'warn', title: `Deleted ${p.name}` })
      const ps = await loadProfiles()
      if (p.id === activeId) {
        const next = ps.find((x) => x.isActive) ?? ps[0]
        setActiveId(next?.id ?? null)
      }
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  const revealVar = async (v: EnvVar) => {
    if (!v.secret) return
    if (revealed[v.id]) {
      setRevealed(({ [v.id]: _, ...rest }) => rest)
      return
    }
    try {
      const plain = await ipc.revealEnvVar(v.id)
      setRevealed((r) => ({ ...r, [v.id]: plain }))
    } catch (e) {
      toast({ tone: 'error', title: 'Reveal failed', description: String(e) })
    }
  }

  const deleteVar = async (v: EnvVar) => {
    if (!confirm(`Delete variable "${v.key}"?`)) return
    try {
      await ipc.deleteEnvVar(v.id)
      setVars((prev) => prev?.filter((x) => x.id !== v.id) ?? null)
      toast({ tone: 'warn', title: `Deleted ${v.key}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  const openNewProfile = () => {
    setEditingProfile(null)
    setProfileDialogOpen(true)
  }
  const openEditProfile = (p: EnvProfile) => {
    setEditingProfile(p)
    setProfileDialogOpen(true)
  }
  const onProfileSaved = async (saved: EnvProfile) => {
    const ps = await loadProfiles()
    // If we just created a new profile, select it.
    if (!profiles?.some((p) => p.id === saved.id)) {
      setActiveId(saved.id)
    } else {
      // Preserve current selection if it still exists.
      const stillThere = ps.some((p) => p.id === activeId)
      if (!stillThere) setActiveId(ps[0]?.id ?? null)
    }
  }

  const openNewVar = () => {
    if (!activeId) return
    setEditingVar(null)
    setVarDialogOpen(true)
  }
  const openEditVar = (v: EnvVar) => {
    setEditingVar(v)
    setVarDialogOpen(true)
  }
  const onVarSaved = () => {
    loadVars(activeId)
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Environment</h1>
          <p className="mt-1 text-sm text-ink-400">Profiles and secrets.</p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Environment manager is desktop-only.
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Environment</h1>
          <p className="mt-1 text-sm text-ink-400">
            Profiles and secrets, encrypted locally.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={openNewProfile}
          leading={<Plus className="h-3.5 w-3.5" />}
        >
          New profile
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Left: profiles */}
        <Panel padded={false} className="lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2.5">
            <Layers className="h-3.5 w-3.5 text-ink-500" />
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Profiles
            </span>
            {profiles && (
              <span className="ml-auto font-mono text-2xs text-ink-500">{profiles.length}</span>
            )}
          </div>
          <div className="p-1.5">
            {!profiles && (
              <div className="space-y-1">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            )}
            {profiles?.length === 0 && (
              <div className="px-3 py-6 text-center text-2xs text-ink-500">
                No profiles yet.
              </div>
            )}
            {profiles?.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm',
                  activeId === p.id
                    ? 'bg-accent/12 text-ink-100 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
                    : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-200',
                )}
              >
                <StatusDot tone={p.isActive ? 'mint' : 'neutral'} pulse={p.isActive} />
                <span className="truncate flex-1">{p.name}</span>
                {p.isActive && (
                  <ShieldCheck className="h-3 w-3 shrink-0 text-mint" />
                )}
              </button>
            ))}
          </div>
        </Panel>

        {/* Right: variables */}
        <div className="lg:col-span-3">
          {!activeProfile && (
            <Panel className="flex flex-col items-center justify-center py-16 text-center">
              <KeyRound className="mb-3 h-7 w-7 text-ink-500" />
              <div className="text-sm text-ink-200">No profile selected</div>
              <div className="mt-1 max-w-sm text-2xs text-ink-500">
                Create a profile to start adding environment variables.
              </div>
              <Button
                variant="primary"
                className="mt-5"
                onClick={openNewProfile}
                leading={<Plus className="h-3.5 w-3.5" />}
              >
                New profile
              </Button>
            </Panel>
          )}

          {activeProfile && (
            <Panel padded={false}>
              {/* Profile header */}
              <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound className="h-4 w-4 shrink-0 text-accent-soft" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink-100">
                        {activeProfile.name}
                      </span>
                      {activeProfile.isActive && <Badge tone="mint">active</Badge>}
                    </div>
                    <div className="text-2xs text-ink-500">
                      {vars?.length ?? 0} variable{(vars?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!activeProfile.isActive && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => activateProfile(activeProfile)}
                    >
                      Activate
                    </Button>
                  )}
                  <IconButton label="Edit profile" onClick={() => openEditProfile(activeProfile)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label="Delete profile"
                    tone="danger"
                    onClick={() => deleteProfile(activeProfile)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>

              {/* Actions bar */}
              <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
                <span className="text-2xs uppercase tracking-widest text-ink-500">
                  Variables
                </span>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={openNewVar}
                  leading={<Plus className="h-3 w-3" />}
                >
                  Add variable
                </Button>
              </div>

              {/* Variables table */}
              {!vars && (
                <div className="space-y-2 p-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8" />)}
                </div>
              )}
              {vars && vars.length === 0 && (
                <div className="p-12 text-center">
                  <Lock className="mb-2 inline-block h-5 w-5 text-ink-500" />
                  <div className="text-sm text-ink-200">No variables in this profile</div>
                  <div className="mt-1 text-2xs text-ink-500">
                    Add one to get started.
                  </div>
                </div>
              )}
              {vars && vars.length > 0 && (
                <div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.05] bg-white/[0.02] text-2xs uppercase tracking-widest text-ink-500">
                        <th className="px-4 py-2 text-left font-medium">key</th>
                        <th className="px-4 py-2 text-left font-medium">value</th>
                        <th className="w-24 px-4 py-2 text-right font-medium">actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vars.map((v) => {
                        const plain = revealed[v.id]
                        const shown = plain ?? (v.secret ? '••••••••••••••••' : v.value)
                        return (
                          <tr
                            key={v.id}
                            className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                          >
                            <td className="w-[30%] px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                {v.secret ? (
                                  <Lock className="h-3 w-3 shrink-0 text-accent-soft" />
                                ) : (
                                  <Unlock className="h-3 w-3 shrink-0 text-ink-500" />
                                )}
                                <span className="font-mono text-xs text-ink-100">{v.key}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  'break-all font-mono text-xs',
                                  plain ? 'text-ink-200' : 'text-ink-400',
                                )}
                              >
                                {shown}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-0.5">
                                {v.secret && (
                                  <IconButton
                                    label={plain ? 'Hide' : 'Reveal'}
                                    onClick={() => revealVar(v)}
                                  >
                                    {plain ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </IconButton>
                                )}
                                <IconButton label="Edit" onClick={() => openEditVar(v)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton
                                  label="Delete"
                                  tone="danger"
                                  onClick={() => deleteVar(v)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      <ProfileDialog
        open={profileDialogOpen}
        onClose={() => setProfileDialogOpen(false)}
        onSaved={onProfileSaved}
        initial={editingProfile}
      />
      {activeId && (
        <EnvVarDialog
          open={varDialogOpen}
          onClose={() => setVarDialogOpen(false)}
          onSaved={onVarSaved}
          profileId={activeId}
          initial={editingVar}
        />
      )}
    </div>
  )
}
