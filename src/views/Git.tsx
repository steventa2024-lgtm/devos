import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, FolderGit2,
  GitBranch, GitCommit as CommitIcon, Loader2, Minus, Plus, RefreshCw,
  X,
} from 'lucide-react'
import { Badge, Button, IconButton, Panel, Skeleton, StatusDot } from '@/components/ui'
import { ipc, isDesktop, type GitCommit, type GitFileStatus, type GitRepoStatus, type Project } from '@/lib/ipc'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

/* ------------------------------------------------------------------ helpers */

function statusLabel(f: GitFileStatus): string {
  if (f.untracked) return 'U'
  if (f.index !== ' ' && f.worktree !== ' ') return 'MM'
  if (f.index !== ' ') return f.index.trim() || 'S'
  return f.worktree.trim() || 'M'
}

function statusTone(f: GitFileStatus): 'mint' | 'amber' | 'rose' | 'accent' | 'neutral' {
  if (f.untracked) return 'neutral'
  if (f.index === 'A') return 'mint'
  if (f.index === 'D' || f.worktree === 'D') return 'rose'
  if (f.index === 'M' || f.worktree === 'M') return 'amber'
  return 'accent'
}

/* Diff rendering — minimal but readable */
function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-500">
        No diff. The file may be binary, or this section is empty.
      </div>
    )
  }
  const lines = diff.split('\n')
  return (
    <pre className="overflow-auto whitespace-pre p-4 font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        let cls = 'text-ink-300'
        if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-ink-500'
        else if (line.startsWith('+')) cls = 'text-mint bg-mint/5'
        else if (line.startsWith('-')) cls = 'text-rose bg-rose/5'
        else if (line.startsWith('@@')) cls = 'text-accent-soft'
        else if (line.startsWith('diff ') || line.startsWith('index ')) cls = 'text-ink-500'
        return (
          <div key={i} className={cls}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

/* ------------------------------------------------------------------ main view */

export default function GitView() {
  const toast = useApp((s) => s.toast)

  const [projects, setProjects] = useState<Project[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<GitRepoStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diff, setDiff] = useState<string>('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const activeRepo = useMemo(
    () => projects?.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  )

  // Load projects once.
  useEffect(() => {
    ipc.listProjects().then((ps) => {
      setProjects(ps)
      if (ps[0]) setActiveId(ps[0].id)
    })
  }, [])

  // Reload status + log when the repo changes or a refresh is requested.
  const reload = useCallback(async () => {
    if (!activeRepo) return
    setLoadingStatus(true)
    try {
      const [s, l] = await Promise.all([
        ipc.gitStatusFiles(activeRepo.path),
        ipc.gitLog(activeRepo.path, 20).catch(() => [] as GitCommit[]),
      ])
      setStatus(s)
      setCommits(l)
    } catch (e) {
      setStatus(null)
      setCommits([])
      toast({ tone: 'error', title: 'Git error', description: String(e) })
    } finally {
      setLoadingStatus(false)
    }
  }, [activeRepo, toast])

  useEffect(() => {
    if (!activeRepo) return
    setSelectedFile(null)
    setDiff('')
    setCommitMessage('')
    reload()
  }, [activeRepo, refreshKey, reload])

  // Load diff when a file is selected.
  useEffect(() => {
    if (!activeRepo || !selectedFile || !status) {
      setDiff('')
      return
    }
    const file = status.files.find((f) => f.path === selectedFile)
    if (!file) return

    setLoadingDiff(true)
    ipc.gitDiff(activeRepo.path, selectedFile, file.staged)
      .then(setDiff)
      .catch((e) => setDiff(`// diff failed: ${e}`))
      .finally(() => setLoadingDiff(false))
  }, [activeRepo, selectedFile, status])

  const toggleStage = async (file: GitFileStatus) => {
    if (!activeRepo) return
    try {
      if (file.staged) {
        await ipc.gitUnstage(activeRepo.path, [file.path])
      } else {
        await ipc.gitStage(activeRepo.path, [file.path])
      }
      await reload()
    } catch (e) {
      toast({ tone: 'error', title: 'Stage failed', description: String(e) })
    }
  }

  const stageAll = async () => {
    if (!activeRepo || !status) return
    const paths = status.files.filter((f) => !f.staged).map((f) => f.path)
    if (paths.length === 0) return
    try {
      await ipc.gitStage(activeRepo.path, paths)
      await reload()
    } catch (e) {
      toast({ tone: 'error', title: 'Stage failed', description: String(e) })
    }
  }

  const unstageAll = async () => {
    if (!activeRepo || !status) return
    const paths = status.files.filter((f) => f.staged).map((f) => f.path)
    if (paths.length === 0) return
    try {
      await ipc.gitUnstage(activeRepo.path, paths)
      await reload()
    } catch (e) {
      toast({ tone: 'error', title: 'Unstage failed', description: String(e) })
    }
  }

  const commit = async () => {
    if (!activeRepo || !status || !commitMessage.trim()) return
    const staged = status.files.filter((f) => f.staged)
    if (staged.length === 0) {
      toast({
        tone: 'warn',
        title: 'Nothing staged',
        description: 'Stage at least one file before committing.',
      })
      return
    }
    setCommitting(true)
    try {
      const summary = await ipc.gitCommit(activeRepo.path, commitMessage.trim())
      toast({
        tone: 'success',
        title: 'Commit created',
        description: summary.split('\n')[0].slice(0, 80),
      })
      setCommitMessage('')
      setSelectedFile(null)
      await reload()
    } catch (e) {
      toast({ tone: 'error', title: 'Commit failed', description: String(e) })
    } finally {
      setCommitting(false)
    }
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Git</h1>
          <p className="mt-1 text-sm text-ink-400">Repository status and history.</p>
        </div>
        <Panel className="flex items-center justify-center py-16 text-sm text-ink-500">
          Git panel is desktop-only.
        </Panel>
      </div>
    )
  }

  const stagedCount = status?.files.filter((f) => f.staged).length ?? 0
  const unstagedCount = status?.files.filter((f) => !f.staged).length ?? 0

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Git</h1>
          <p className="mt-1 text-sm text-ink-400">
            {activeRepo ? activeRepo.path : 'Select a repository'}
          </p>
        </div>
        <Button
          size="sm"
          variant="subtle"
          leading={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loadingStatus}
        >
          Refresh
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left rail: repo picker ------------------------------------------ */}
        <Panel padded={false} className="min-h-0 flex flex-col overflow-hidden lg:col-span-3 xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
            <FolderGit2 className="h-3.5 w-3.5 text-ink-500" />
            <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Repositories
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-thin p-1.5">
            {!projects && [...Array(3)].map((_, i) => <Skeleton key={i} className="mb-1 h-9" />)}
            {projects?.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                  activeId === p.id
                    ? 'bg-accent/12 text-ink-100 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
                    : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-200',
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: p.color ?? '#5b8cff' }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </Panel>

        {/* Middle: status + files ----------------------------------------- */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-5 xl:col-span-5">
          {/* Branch + counters */}
          <Panel className="shrink-0" padded={false}>
            <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <GitBranch className="h-3.5 w-3.5 text-accent-soft" />
                <span className="font-mono text-sm text-ink-100">
                  {status?.branch || (loadingStatus ? '…' : 'not a repo')}
                </span>
                {status?.upstream && (
                  <Badge tone="neutral">{status.upstream}</Badge>
                )}
              </div>
              {status && (status.ahead > 0 || status.behind > 0) && (
                <div className="flex items-center gap-2 font-mono text-2xs">
                  {status.ahead > 0 && (
                    <span className="flex items-center gap-1 text-mint">
                      <ArrowUpFromLine className="h-3 w-3" /> {status.ahead}
                    </span>
                  )}
                  {status.behind > 0 && (
                    <span className="flex items-center gap-1 text-amber">
                      <ArrowDownToLine className="h-3 w-3" /> {status.behind}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-3 py-2">
              <Badge tone={stagedCount > 0 ? 'mint' : 'neutral'}>
                {stagedCount} staged
              </Badge>
              <Badge tone={unstagedCount > 0 ? 'amber' : 'neutral'}>
                {unstagedCount} unstaged
              </Badge>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={stageAll} disabled={unstagedCount === 0}>
                  Stage all
                </Button>
                <Button size="sm" variant="ghost" onClick={unstageAll} disabled={stagedCount === 0}>
                  Unstage all
                </Button>
              </div>
            </div>
          </Panel>

          {/* File list */}
          <Panel padded={false} className="min-h-0 flex flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
              {loadingStatus && !status && (
                <div className="space-y-1 p-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7" />)}
                </div>
              )}
              {status && status.files.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Check className="mb-2 h-6 w-6 text-mint" />
                  <div className="text-sm text-ink-200">Working tree clean</div>
                  <div className="mt-1 text-2xs text-ink-500">No changes to stage.</div>
                </div>
              )}
              {status?.files.map((f) => {
                const isActive = selectedFile === f.path
                const tone = statusTone(f)
                return (
                  <div
                    key={f.path + f.index + f.worktree}
                    className={cn(
                      'group flex items-center gap-2 border-b border-white/[0.03] px-3 py-2 transition-colors',
                      isActive ? 'bg-accent/[0.08]' : 'hover:bg-white/[0.03]',
                    )}
                  >
                    <button
                      onClick={() => toggleStage(f)}
                      title={f.staged ? 'Unstage' : 'Stage'}
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        f.staged
                          ? 'border-mint/60 bg-mint/20 text-mint'
                          : 'border-white/15 bg-transparent text-transparent hover:border-white/40',
                      )}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => setSelectedFile(f.path)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          'w-5 shrink-0 font-mono text-2xs',
                          tone === 'mint' && 'text-mint',
                          tone === 'amber' && 'text-amber',
                          tone === 'rose' && 'text-rose',
                          tone === 'accent' && 'text-accent-soft',
                          tone === 'neutral' && 'text-ink-500',
                        )}
                      >
                        {statusLabel(f)}
                      </span>
                      <span className={cn(
                        'truncate text-xs',
                        isActive ? 'text-ink-100' : 'text-ink-300',
                      )}>
                        {f.path}
                      </span>
                      {f.renamedFrom && (
                        <span className="shrink-0 truncate font-mono text-2xs text-ink-600">
                          ← {f.renamedFrom}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Commit composer */}
            <div className="shrink-0 border-t border-white/[0.05] p-3">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={
                  stagedCount === 0
                    ? 'Stage files to write a commit message…'
                    : `Commit message (${stagedCount} file${stagedCount === 1 ? '' : 's'} staged)`
                }
                rows={2}
                disabled={stagedCount === 0 || committing}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    commit()
                  }
                }}
                className={cn(
                  'min-h-[54px] w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2',
                  'text-xs text-ink-100 placeholder:text-ink-500',
                  'transition-all duration-200 ease-swift',
                  'focus:border-accent/50 focus:bg-black/40 focus:outline-none focus:shadow-glow',
                  'disabled:opacity-50',
                )}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-2xs text-ink-500">
                  {committing ? 'Committing…' : '⌘↵ to commit'}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={commit}
                  disabled={committing || stagedCount === 0 || !commitMessage.trim()}
                  leading={committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CommitIcon className="h-3.5 w-3.5" />}
                >
                  Commit {stagedCount > 0 ? `(${stagedCount})` : ''}
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right: diff + log ---------------------------------------------- */}
        <div className="flex min-h-0 flex-col gap-4 lg:col-span-4 xl:col-span-5">
          <Panel padded={false} className="flex min-h-0 flex-[2] flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink-100">
                  {selectedFile ?? 'Diff'}
                </div>
                {selectedFile && (
                  <div className="font-mono text-2xs text-ink-500">
                    {status?.files.find((f) => f.path === selectedFile)?.staged ? 'staged' : 'unstaged'}
                  </div>
                )}
              </div>
              {selectedFile && (
                <IconButton label="Close diff" onClick={() => setSelectedFile(null)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {!selectedFile && (
                <div className="flex h-full items-center justify-center text-xs text-ink-500">
                  Select a file to see its diff.
                </div>
              )}
              {selectedFile && loadingDiff && (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-500" />
                </div>
              )}
              {selectedFile && !loadingDiff && diff && <DiffView diff={diff} />}
            </div>
          </Panel>

          <Panel padded={false} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
              <CommitIcon className="h-3.5 w-3.5 text-ink-500" />
              <span className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
                Recent commits
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
              {!commits && [...Array(5)].map((_, i) => <Skeleton key={i} className="m-2 h-9" />)}
              {commits?.map((c) => (
                <div
                  key={c.hash}
                  className="flex items-start gap-2 border-b border-white/[0.03] px-3 py-2 last:border-b-0"
                >
                  <span className="shrink-0 font-mono text-2xs text-accent-soft">{c.short}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-ink-200">{c.subject}</div>
                    <div className="flex items-center gap-2 text-2xs text-ink-500">
                      <span>{c.author}</span>
                      <span>·</span>
                      <span>{relativeTime(c.at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
