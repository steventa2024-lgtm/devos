import { useEffect, useState } from 'react'
import { Info, RotateCcw, Shield, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, Panel } from '@/components/ui'
import { ipc, isDesktop } from '@/lib/ipc'
import { useApp } from '@/store/app'

export default function Settings() {
  const sidebarCollapsed = useApp((s) => s.sidebarCollapsed)
  const toggleSidebar = useApp((s) => s.toggleSidebar)
  const reduceMotion = useApp((s) => s.reduceMotion)
  const setReduceMotion = useApp((s) => s.setReduceMotion)
  const toast = useApp((s) => s.toast)

  const [prefs, setPrefs] = useState<[string, string][] | null>(null)

  useEffect(() => {
    if (isDesktop) ipc.allPreferences().then(setPrefs).catch(() => setPrefs([]))
    else setPrefs([])
  }, [])

  const clearLogs = async () => {
    if (!confirm('Delete all stored logs?')) return
    if (isDesktop) await ipc.clearLogs()
    toast({ tone: 'warn', title: 'Logs cleared' })
  }

  const clearHistory = async () => {
    if (!confirm('Delete all terminal history?')) return
    if (isDesktop) await ipc.clearHistory()
    toast({ tone: 'warn', title: 'History cleared' })
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-100">Settings</h1>
        <p className="mt-1 text-sm text-ink-400">
          Preferences are stored locally, never synced.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel>
          <div className="mb-3.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-ink-500" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Appearance</h3>
          </div>
          <SettingRow
            title="Collapse sidebar"
            description="Start DevOS with the navigation collapsed."
          >
            <Toggle on={sidebarCollapsed} onChange={toggleSidebar} />
          </SettingRow>
          <SettingRow
            title="Reduce motion"
            description="Disable non-essential animations."
          >
            <Toggle on={reduceMotion} onChange={() => setReduceMotion(!reduceMotion)} />
          </SettingRow>
        </Panel>

        <Panel>
          <div className="mb-3.5 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-ink-500" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Security</h3>
          </div>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Runtime</span>
              <Badge tone={isDesktop ? 'mint' : 'amber'}>
                {isDesktop ? 'native shell' : 'browser preview'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Secret storage</span>
              <span className="font-mono text-xs text-ink-400">XChaCha20-Poly1305</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-300">Cloud accounts</span>
              <span className="font-mono text-xs text-ink-400">none required</span>
            </div>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="mb-3.5 flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5 text-rose" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-rose">Danger zone</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" leading={<Trash2 className="h-3.5 w-3.5" />} onClick={clearLogs}>
              Clear all logs
            </Button>
            <Button variant="danger" leading={<Trash2 className="h-3.5 w-3.5" />} onClick={clearHistory}>
              Clear terminal history
            </Button>
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="mb-3.5 flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-ink-500" />
            <h3 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Preferences on disk</h3>
          </div>
          {!prefs && <div className="text-sm text-ink-500">Loading…</div>}
          {prefs && prefs.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/[0.06] p-6 text-center text-sm text-ink-500">
              No preferences persisted yet.
            </div>
          )}
          {prefs && prefs.length > 0 && (
            <div className="rounded-lg border border-white/[0.06]">
              <table className="w-full text-sm">
                <tbody>
                  {prefs.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04] last:border-0">
                      <td className="w-1/3 px-3 py-2 font-mono text-2xs text-ink-500">{k}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-200">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function SettingRow({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-ink-100">{title}</div>
        <div className="mt-0.5 text-xs text-ink-500">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={on}
      className={
        'relative h-5 w-9 rounded-full border transition-all duration-200 ' +
        (on
          ? 'border-accent/40 bg-accent/40'
          : 'border-white/[0.08] bg-white/[0.05]')
      }
    >
      <span
        className={
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-200 ' +
          (on ? 'left-[18px]' : 'left-0.5')
        }
      />
    </button>
  )
}
