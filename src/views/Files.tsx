import { useCallback, useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { json as jsonLang } from '@codemirror/lang-json'
import { rust as rustLang } from '@codemirror/lang-rust'
import {
  ChevronDown, ChevronRight, Eye, EyeOff, ExternalLink, File as FileIcon,
  FileCode2, FileJson, FileText, Folder, FolderOpen, HardDrive, Home,
  Loader2, RefreshCw, Usb,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton } from '@/components/ui'
import { ipc, isDesktop, type DirEntry, type FileContents, type MountRoot } from '@/lib/ipc'
import { bytes, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

/* ==========================================================================
   Helpers
   ========================================================================= */

function fileIcon(name: string, isText: boolean) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'json') return FileJson
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'rs', 'go', 'py', 'rb'].includes(ext)) return FileCode2
  if (isText) return FileText
  return FileIcon
}

function languageFor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return javascript({ typescript: ext.startsWith('ts'), jsx: ext.endsWith('x') })
  }
  if (ext === 'json' || ext === 'json5') return jsonLang()
  if (ext === 'rs') return rustLang()
  return []
}

function joinPath(base: string, name: string) {
  if (base.endsWith('/')) return base + name
  return base + '/' + name
}

function parentPath(p: string) {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

/* ==========================================================================
   Tree node
   ========================================================================= */

interface TreeNodeProps {
  entry: DirEntry
  depth: number
  selectedPath: string | null
  onSelectFile: (entry: DirEntry) => void
  showHidden: boolean
}

function TreeNode({ entry, depth, selectedPath, onSelectFile, showHidden }: TreeNodeProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDir = entry.kind === 'dir'
  const isSelected = selectedPath === entry.path
  const Icon = isDir
    ? open ? FolderOpen : Folder
    : fileIcon(entry.name, entry.isText)

  const toggle = useCallback(async () => {
    if (!isDir) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (children === null && !loading) {
      setLoading(true)
      setError(null)
      try {
        const list = await ipc.listDirectory(entry.path)
        setChildren(list)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
  }, [isDir, open, children, loading, entry.path])

  const onClick = () => {
    if (isDir) {
      toggle()
    } else if (entry.isText) {
      onSelectFile(entry)
    }
  }

  const visible = useMemo(() => {
    if (!children) return null
    return showHidden ? children : children.filter((c) => !c.hidden)
  }, [children, showHidden])

  return (
    <>
      <button
        onClick={onClick}
        onDoubleClick={() => { if (isDir) toggle() }}
        disabled={!isDir && !entry.isText}
        title={entry.path}
        className={cn(
          'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs',
          'transition-colors duration-100',
          isSelected
            ? 'bg-accent/12 text-ink-100 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
            : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-100',
          !isDir && !entry.isText && 'opacity-50 cursor-not-allowed',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-ink-500" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-ink-500" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={cn(
          'h-3.5 w-3.5 shrink-0',
          isDir ? 'text-accent-soft/70' : entry.isText ? 'text-ink-400' : 'text-ink-600',
        )} />
        <span className={cn('min-w-0 flex-1 truncate', entry.hidden && 'text-ink-500')}>
          {entry.name}
        </span>
        {!isDir && entry.size > 0 && (
          <span className="shrink-0 font-mono text-2xs text-ink-600">
            {bytes(entry.size, 0)}
          </span>
        )}
      </button>

      {open && (
        <div>
          {loading && (
            <div
              className="flex items-center gap-2 py-1 text-2xs text-ink-500"
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              loading…
            </div>
          )}
          {error && (
            <div
              className="py-1 text-2xs text-rose"
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
            >
              {error}
            </div>
          )}
          {visible?.length === 0 && !loading && (
            <div
              className="py-1 text-2xs text-ink-600 italic"
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
            >
              empty
            </div>
          )}
          {visible?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              showHidden={showHidden}
            />
          ))}
        </div>
      )}
    </>
  )
}

/* ==========================================================================
   Root of the tree: mount chips + top-level listing
   ========================================================================= */

interface FileTreeProps {
  root: string
  selectedPath: string | null
  onSelectFile: (entry: DirEntry) => void
  showHidden: boolean
  refreshKey: number
}

function FileTree({ root, selectedPath, onSelectFile, showHidden, refreshKey }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEntries(null)
    setError(null)
    ipc.listDirectory(root)
      .then(setEntries)
      .catch((e) => setError(String(e)))
  }, [root, refreshKey])

  const visible = useMemo(() => {
    if (!entries) return null
    return showHidden ? entries : entries.filter((e) => !e.hidden)
  }, [entries, showHidden])

  if (error) {
    return (
      <div className="px-3 py-4 text-xs text-rose">
        {error}
      </div>
    )
  }

  if (!visible) {
    return (
      <div className="space-y-1 p-2">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-6" />)}
      </div>
    )
  }

  if (visible.length === 0) {
    return <div className="px-3 py-4 text-xs italic text-ink-600">empty folder</div>
  }

  return (
    <div className="p-1">
      {visible.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          showHidden={showHidden}
        />
      ))}
    </div>
  )
}

/* ==========================================================================
   Main view
   ========================================================================= */

export default function Files() {
  const toast = useApp((s) => s.toast)

  const [mounts, setMounts] = useState<MountRoot[]>([])
  const [root, setRoot] = useState<string>('')
  const [selected, setSelected] = useState<DirEntry | null>(null)
  const [contents, setContents] = useState<FileContents | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load mount roots once.
  useEffect(() => {
    if (!isDesktop) return
    ipc.listMountRoots()
      .then((m) => {
        setMounts(m)
        const home = m.find((x) => x.kind === 'home')
        setRoot(home?.path ?? m[0]?.path ?? '')
      })
      .catch(() => null)
  }, [])

  // Load file contents whenever the selected file changes.
  useEffect(() => {
    if (!selected) {
      setContents(null)
      return
    }
    setLoadingFile(true)
    ipc.readTextFile(selected.path)
      .then(setContents)
      .catch((e) => toast({ tone: 'error', title: 'Read failed', description: String(e) }))
      .finally(() => setLoadingFile(false))
  }, [selected, toast])

  const selectFile = useCallback((entry: DirEntry) => {
    setSelected(entry)
  }, [])

  const openExternal = async () => {
    if (!selected || !isDesktop) return
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(selected.path)
    } catch (e) {
      toast({ tone: 'error', title: 'Open failed', description: String(e) })
    }
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Files</h1>
          <p className="mt-1 text-sm text-ink-400">Browse and preview files from your projects.</p>
        </div>
        <Panel className="flex flex-col items-center justify-center py-16 text-center">
          <Folder className="mb-3 h-8 w-8 text-ink-500" />
          <div className="text-sm text-ink-200">The file browser is desktop-only.</div>
          <div className="mt-2 text-2xs text-ink-500">
            Run <code className="font-mono text-ink-300">pnpm tauri:dev</code> to launch DevOS natively.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Files</h1>
          <p className="mt-1 text-sm text-ink-400">
            Browse and preview files from your projects.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="subtle"
            leading={showHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
          </Button>
          <Button
            size="sm"
            variant="subtle"
            leading={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: mount chips + tree --------------------------------------- */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-4 xl:col-span-3">
          {/* Mount chips */}
          <div className="flex flex-wrap gap-1.5">
            {mounts.map((m) => {
              const Icon = m.kind === 'home' ? Home : m.kind === 'usb' ? Usb : HardDrive
              const active = root === m.path
              return (
                <button
                  key={m.path}
                  onClick={() => setRoot(m.path)}
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

          {/* Breadcrumb */}
          <div className="truncate rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-1.5 font-mono text-2xs text-ink-400">
            {root || '—'}
          </div>

          {/* Tree */}
          <Panel padded={false} className="min-h-0 flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto scroll-thin">
              {root ? (
                <FileTree
                  root={root}
                  selectedPath={selected?.path ?? null}
                  onSelectFile={selectFile}
                  showHidden={showHidden}
                  refreshKey={refreshKey}
                />
              ) : (
                <div className="p-4 text-xs text-ink-500">Select a location…</div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right: file preview ------------------------------------------- */}
        <div className="flex min-h-0 flex-col lg:col-span-8 xl:col-span-9">
          <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.05] px-4 py-3">
              {selected ? (
                <>
                  <FileCode2 className="h-4 w-4 shrink-0 text-accent-soft" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-100">
                      {selected.name}
                    </div>
                    <div className="truncate font-mono text-2xs text-ink-500">
                      {parentPath(selected.path)}
                    </div>
                  </div>
                  {contents && (
                    <div className="hidden items-center gap-2 sm:flex">
                      <Badge tone="neutral">{bytes(contents.size)}</Badge>
                      <Badge tone="neutral">{contents.lines} lines</Badge>
                      {contents.truncated && <Badge tone="amber">truncated</Badge>}
                    </div>
                  )}
                  <IconButton label="Open in external editor" onClick={openExternal}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </IconButton>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 text-ink-500" />
                  <div className="text-sm text-ink-400">Select a file to preview</div>
                </>
              )}
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {!selected && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <FileText className="mb-3 h-8 w-8 text-ink-600" />
                  <div className="text-sm text-ink-400">Nothing selected</div>
                  <div className="mt-1 max-w-sm text-2xs text-ink-500">
                    Pick a text file from the tree on the left. Binary files can still
                    be opened with the external editor button.
                  </div>
                </div>
              )}
              {selected && loadingFile && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
                </div>
              )}
              {selected && !loadingFile && contents && (
                <div className="h-full overflow-auto scroll-thin">
                  <CodeMirror
                    value={contents.content}
                    height="100%"
                    readOnly
                    extensions={[languageFor(selected.name)].flat()}
                    theme="dark"
                    basicSetup={{
                      lineNumbers: true,
                      foldGutter: true,
                      highlightActiveLine: false,
                      highlightActiveLineGutter: false,
                      indentOnInput: false,
                    }}
                  />
                </div>
              )}
              {selected && !loadingFile && !contents && (
                <div className="flex h-full items-center justify-center text-xs text-ink-500">
                  Unable to load file.
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
