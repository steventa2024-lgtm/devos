/**
 * Plugin runtime.
 *
 * Each plugin's index.js is loaded through `new Function` with a scoped
 * `devos` object injected. The plugin calls `devos.registerCommand(...)`
 * for each command it declared in its manifest.
 *
 * Trust model: plugins are local code the user installed. We do not
 * execute anything from the network. The `devos` API is deliberately
 * narrow; shell execution requires `allowShell: true` in the manifest.
 */
import { ipc, isDesktop, type PluginInfo } from './ipc'

export type PluginToastTone = 'info' | 'success' | 'warn' | 'error'

export interface PluginApi {
  /** The plugin's own id, from the manifest. */
  readonly pluginId: string
  readonly version: string
  /** The full manifest, read-only. */
  readonly manifest: Readonly<PluginInfo['manifest']>

  registerCommand(id: string, run: () => void | Promise<void>): void

  toast(input: { tone?: PluginToastTone; title: string; description?: string }): void
  log(message: string): void

  getPreference(key: string): Promise<string | null>
  setPreference(key: string, value: string): Promise<void>

  runShell(command: string): Promise<{ stdout: string; stderr: string; exitCode: number | null }>
  openExternal(url: string): Promise<void>
  navigate(route: string): void
}

export interface RegisteredPluginCommand {
  /** Fully-qualified id: `<pluginId>.<commandId>` */
  qualifiedId: string
  /** Just the command id from the manifest, e.g. `hello.greet`. */
  commandId: string
  label: string
  description?: string
  pluginId: string
  pluginName: string
  run: () => void | Promise<void>
}

/** Callbacks the runtime uses to reach into the rest of the app. */
export interface PluginRuntimeHost {
  toast(input: { tone?: PluginToastTone; title: string; description?: string }): void
  navigate(route: string): void
}

/** Holds every command registered by every plugin. */
const registry = new Map<string, RegisteredPluginCommand>()

export function listPluginCommands(): RegisteredPluginCommand[] {
  return Array.from(registry.values()).sort((a, b) =>
    a.pluginName.localeCompare(b.pluginName) || a.label.localeCompare(b.label),
  )
}

export function clearPluginCommands() {
  registry.clear()
}

/**
 * Load one plugin and execute its source. Returns the number of commands
 * the plugin registered.
 */
export async function loadPlugin(
  info: PluginInfo,
  host: PluginRuntimeHost,
): Promise<number> {
  if (!info.hasSource || info.error) {
    throw new Error(info.error ?? 'plugin has no source')
  }

  const declared = new Map(
    info.manifest.commands.map((c) => [c.id, c] as const),
  )

  // Track commands the plugin actually registers, so we can warn if the
  // manifest over-declares.
  const seen = new Set<string>()

  const api: PluginApi = {
    pluginId: info.manifest.id,
    version: info.manifest.version,
    manifest: Object.freeze({ ...info.manifest }),

    registerCommand(id, run) {
      const def = declared.get(id)
      if (!def) {
        // eslint-disable-next-line no-console
        console.warn(
          `[plugin:${info.manifest.id}] registered "${id}" which is not declared in manifest.json`,
        )
      }
      seen.add(id)

      const qualifiedId = `${info.manifest.id}.${id}`
      registry.set(qualifiedId, {
        qualifiedId,
        commandId: id,
        label: def?.label ?? id,
        description: def?.description ?? undefined,
        pluginId: info.manifest.id,
        pluginName: info.manifest.name,
        run,
      })
    },

    toast(input) {
      host.toast({
        tone: input.tone ?? 'info',
        title: input.title,
        description: input.description,
      })
    },

    log(message) {
      // Route through the app's own log so it shows up in the Logs view.
      const text = `[plugin:${info.manifest.id}] ${message}`
      // eslint-disable-next-line no-console
      console.log(text)
      if (isDesktop) {
        ipc.appendLog('plugin', 'info', text).catch(() => null)
      }
    },

    async getPreference(key) {
      return ipc.getPreference(`plugin.${info.manifest.id}.${key}`)
    },

    async setPreference(key, value) {
      await ipc.setPreference(`plugin.${info.manifest.id}.${key}`, value)
    },

    async runShell(command) {
      if (!info.manifest.allowShell) {
        throw new Error(
          `plugin "${info.manifest.id}" is not allowed to run shell commands ` +
          `(set "allowShell": true in manifest.json to enable)`,
        )
      }
      const res = await ipc.runCommand(command)
      return {
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode ?? null,
      }
    },

    async openExternal(url) {
      if (!isDesktop) {
        window.open(url, '_blank')
        return
      }
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    },

    navigate(route) {
      host.navigate(route)
    },
  }

  // Fetch source then run it. `new Function` wraps the body so that top-level
  // `devos.*` calls work without any module system.
  const source = await ipc.pluginReadSource(info.manifest.id)

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(
    'devos',
    `"use strict";\n${source}\n//# sourceURL=plugin://${info.manifest.id}/index.js`,
  )

  try {
    await fn(api)
  } catch (e) {
    throw new Error(`plugin threw during load: ${e}`)
  }

  // Warn if the manifest lists commands the plugin never registered.
  for (const id of declared.keys()) {
    if (!seen.has(id)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[plugin:${info.manifest.id}] command "${id}" is declared in manifest.json but never registered`,
      )
    }
  }

  return seen.size
}
