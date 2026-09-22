import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderGit2, SquareTerminal, Files, GitBranch,
  Boxes, KeyRound, ScrollText, Activity, Code2, Puzzle, Settings as SettingsIcon, Database, Send, Container,
  ChevronsLeft, ChevronsRight, Cpu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/store/app'

const NAV = [
  { to: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/projects',    label: 'Projects',    icon: FolderGit2 },
  { to: '/terminal',    label: 'Terminal',    icon: SquareTerminal },
  { to: '/files',       label: 'Files',       icon: Files },
  { to: '/git',         label: 'Git',         icon: GitBranch },
  { to: '/services',    label: 'Services',    icon: Boxes },
  { to: '/containers',  label: 'Containers',  icon: Container },
  { to: '/database',    label: 'Database',    icon: Database },
  { to: '/api',         label: 'API Tester',  icon: Send },
  { to: '/environment', label: 'Environment', icon: KeyRound },
  { to: '/logs',        label: 'Logs',        icon: ScrollText },
  { to: '/monitoring',  label: 'Monitoring',  icon: Activity },
  { to: '/processes',   label: 'Processes',   icon: Cpu },
  { to: '/snippets',    label: 'Snippets',    icon: Code2 },
  { to: '/plugins',     label: 'Plugins',     icon: Puzzle },
  { to: '/settings',    label: 'Settings',    icon: SettingsIcon },
] as const

export function Sidebar() {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggle = useApp((s) => s.toggleSidebar)

  return (
    <aside
      className={cn(
        'chrome-blur z-20 flex h-full flex-col border-r border-white/[0.05] transition-all duration-300 ease-swift',
        collapsed ? 'w-[60px]' : 'w-[224px]',
      )}
    >
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/15">
          <Cpu className="h-3.5 w-3.5 text-accent-soft" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold tracking-tight text-ink-100">DevOS</div>
            <div className="truncate text-2xs uppercase tracking-widest text-ink-500">
              workstation
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-3">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                title={label}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm',
                    'transition-all duration-150 ease-swift',
                    isActive
                      ? 'bg-accent/12 text-ink-100 shadow-[inset_0_0_0_1px_rgba(91,140,255,0.22)]'
                      : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-200',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-[15px] w-[15px] shrink-0 transition-colors',
                        isActive ? 'text-accent-soft' : 'text-ink-500 group-hover:text-ink-300',
                      )}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/[0.05] p-2">
        <button
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs text-ink-500 transition-all hover:bg-white/[0.05] hover:text-ink-300"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" />
          ) : (
            <>
              <ChevronsLeft className="h-3.5 w-3.5" />
              <span className="text-2xs uppercase tracking-widest">collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
