import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster } from '@/components/ui'
import { useApp } from '@/store/app'
import { usePlugins } from '@/store/plugins'

export function AppShell() {
  const refresh = useApp((s) => s.refreshSnapshot)
  const togglePalette = useApp((s) => s.togglePalette)
  const toggleSidebar = useApp((s) => s.toggleSidebar)

  // Load plugins once on mount so their commands appear in the palette.
  useEffect(() => {
    const host = {
      toast: useApp.getState().toast,
      navigate: (route: string) => {
        window.location.hash = `#${route.startsWith('/') ? route : '/' + route}`
      },
    }
    usePlugins.getState().load(host)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll telemetry every 3s.
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [refresh])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette, toggleSidebar])

  return (
    <div className="app-bg relative flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="relative z-10 flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-[1600px] p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <Toaster />
    </div>
  )
}
