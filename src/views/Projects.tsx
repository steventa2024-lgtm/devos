import { useEffect, useState } from 'react'
import { FolderGit2, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton } from '@/components/ui'
import { ProjectDialog } from '@/components/ProjectDialog'
import { ipc } from '@/lib/ipc'
import type { Project } from '@/lib/ipc'
import { relativeTime } from '@/lib/format'
import { useApp } from '@/store/app'
import { cn } from '@/lib/utils'

export default function Projects() {
  const [items, setItems] = useState<Project[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const toast = useApp((s) => s.toast)

  const load = () => ipc.listProjects().then(setItems)
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (p: Project) => {
    setEditing(p)
    setDialogOpen(true)
  }

  const onSaved = (saved: Project) => {
    // Optimistic update so the card appears immediately.
    setItems((prev) => {
      if (!prev) return [saved]
      const idx = prev.findIndex((p) => p.id === saved.id)
      if (idx === -1) return [saved, ...prev]
      return prev.map((p) => (p.id === saved.id ? saved : p))
    })
    // Refresh in the background to get the canonical ordering.
    load()
  }

  const toggleFavorite = async (p: Project) => {
    try {
      await ipc.upsertProject({ ...p, favorite: !p.favorite })
      setItems((prev) =>
        prev?.map((x) => (x.id === p.id ? { ...x, favorite: !x.favorite } : x)) ?? null,
      )
    } catch (e) {
      toast({ tone: 'error', title: 'Update failed', description: String(e) })
    }
  }

  const remove = async (p: Project) => {
    if (!confirm(`Remove "${p.name}" from DevOS?\n\nYour files on disk are not touched.`)) return
    try {
      await ipc.deleteProject(p.id)
      setItems((prev) => prev?.filter((x) => x.id !== p.id) ?? null)
      toast({ tone: 'warn', title: `Removed ${p.name}` })
    } catch (e) {
      toast({ tone: 'error', title: 'Delete failed', description: String(e) })
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Projects</h1>
          <p className="mt-1 text-sm text-ink-400">
            {items
              ? `${items.length} tracked workspace${items.length === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={openCreate}
          leading={<Plus className="h-3.5 w-3.5" />}
        >
          New Project
        </Button>
      </div>

      {!items && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
            <FolderGit2 className="h-6 w-6 text-ink-500" />
          </div>
          <div className="text-sm text-ink-200">No projects yet</div>
          <div className="mt-2 max-w-sm text-xs text-ink-500">
            Point DevOS at a folder on disk. Your files stay where they are — DevOS just remembers the path.
          </div>
          <Button
            variant="primary"
            onClick={openCreate}
            className="mt-5"
            leading={<Plus className="h-3.5 w-3.5" />}
          >
            Add your first project
          </Button>
        </Panel>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <Panel key={p.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg border"
                    style={{
                      background: `${p.color ?? '#5b8cff'}18`,
                      borderColor: `${p.color ?? '#5b8cff'}55`,
                    }}
                  >
                    <FolderGit2
                      className="h-4 w-4"
                      style={{ color: p.color ?? '#5b8cff' }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink-100">{p.name}</div>
                    <div className="truncate font-mono text-2xs text-ink-500">{p.kind}</div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <IconButton label="Toggle favorite" onClick={() => toggleFavorite(p)}>
                    <Star className={cn('h-3.5 w-3.5', p.favorite && 'fill-amber text-amber')} />
                  </IconButton>
                  <IconButton label="Edit" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Remove" tone="danger" onClick={() => remove(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>

              <div className="truncate font-mono text-2xs text-ink-500">{p.path}</div>

              <div className="flex flex-wrap gap-1.5">
                {p.tags.length === 0 && (
                  <span className="text-2xs text-ink-600">no tags</span>
                )}
                {p.tags.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                  </Badge>
                ))}
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-white/[0.05] pt-3 text-2xs text-ink-500">
                <span>opened {relativeTime(p.lastOpenedAt)}</span>
                <Button size="sm" variant="ghost">
                  Open →
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={onSaved}
        initial={editing}
      />
    </div>
  )
}
