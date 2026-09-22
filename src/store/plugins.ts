import { create } from 'zustand'
import {
  clearPluginCommands,
  loadPlugin,
  listPluginCommands,
  type RegisteredPluginCommand,
} from '@/lib/plugins'
import { ipc, isDesktop, type PluginInfo } from '@/lib/ipc'

type PluginsState = {
  plugins: PluginInfo[]
  commands: RegisteredPluginCommand[]
  loaded: boolean
  loading: boolean
  error: string | null
  /** Ids that failed to load, mapped to the error message. */
  failures: Record<string, string>
  /** Ids the user disabled in this session. */
  disabled: Set<string>

  load: (host: { toast: (t: any) => void; navigate: (r: string) => void }) => Promise<void>
  setEnabled: (id: string, enabled: boolean, host: { toast: (t: any) => void; navigate: (r: string) => void }) => Promise<void>
}

export const usePlugins = create<PluginsState>((set, get) => ({
  plugins: [],
  commands: [],
  loaded: false,
  loading: false,
  error: null,
  failures: {},
  disabled: new Set(),

  async load(host) {
    if (!isDesktop) {
      set({ loaded: true, plugins: [], commands: [] })
      return
    }
    set({ loading: true, error: null })
    try {
      await ipc.pluginEnsureDir()
      const list = await ipc.pluginList()
      set({ plugins: list })

      clearPluginCommands()
      const failures: Record<string, string> = {}
      const disabled = get().disabled

      for (const info of list) {
        if (disabled.has(info.manifest.id)) continue
        if (info.error) {
          failures[info.manifest.id] = info.error
          continue
        }
        try {
          await loadPlugin(info, host)
        } catch (e) {
          failures[info.manifest.id] = String(e)
        }
      }

      set({
        commands: listPluginCommands(),
        failures,
        loaded: true,
      })
    } catch (e) {
      set({ error: String(e), loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  async setEnabled(id, enabled, host) {
    const disabled = new Set(get().disabled)
    if (enabled) disabled.delete(id)
    else disabled.add(id)
    set({ disabled })
    // Reload to re-execute or drop the plugin's commands.
    await get().load(host)
  },
}))
