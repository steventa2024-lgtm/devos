import { GitBranch, Command as CommandIcon } from 'lucide-react'
import { useApp } from '@/store/app'
import { isDesktop } from '@/lib/ipc'
import { StatusDot } from '@/components/ui'

export function StatusBar() {
  const snapshot = useApp((s) => s.snapshot)

  return (
    <footer className="chrome-blur z-20 flex h-[30px] shrink-0 items-center justify-between border-t border-white/[0.05] px-4 text-2xs text-ink-500">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <StatusDot tone={isDesktop ? 'mint' : 'amber'} />
          <span className="uppercase tracking-widest">
            {isDesktop ? 'native' : 'browser preview'}
          </span>
        </span>
        <span className="hidden items-center gap-1.5 md:flex">
          <GitBranch className="h-3 w-3" />
          <span className="font-mono text-ink-400">main</span>
        </span>
        {snapshot && (
          <span className="hidden items-center gap-1.5 lg:flex">
            <span className="uppercase tracking-widest">procs</span>
            <span className="tabular font-mono text-ink-400">{snapshot.host.processCount}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-1.5 sm:flex">
          <CommandIcon className="h-3 w-3" />
          <kbd className="font-mono">⌘K</kbd>
          <span className="uppercase tracking-widest">palette</span>
        </span>
        <span className="hidden items-center gap-1.5 lg:flex">
          <kbd className="font-mono">⌘B</kbd>
          <span className="uppercase tracking-widest">sidebar</span>
        </span>
        <span className="font-mono">v0.1.0</span>
      </div>
    </footer>
  )
}
