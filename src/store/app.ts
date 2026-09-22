import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ipc, isDesktop } from '@/lib/ipc'
import type { SystemSnapshot } from '@/lib/ipc'

export type Toast = {
  id: string
  title: string
  description?: string
  tone: 'info' | 'success' | 'warn' | 'error'
}

type AppState = {
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  togglePalette: () => void

  snapshot: SystemSnapshot | null
  refreshSnapshot: () => Promise<void>

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  reduceMotion: boolean
  setReduceMotion: (v: boolean) => void
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      paletteOpen: false,
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),

      snapshot: null,
      refreshSnapshot: async () => {
        try {
          const snap = await ipc.systemSnapshot()
          set({ snapshot: snap })
        } catch {
          /* telemetry is best-effort */
        }
      },

      toasts: [],
      toast: (t) => {
        const id = Math.random().toString(36).slice(2)
        set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
        setTimeout(() => get().dismissToast(id), 4200)
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      reduceMotion: false,
      setReduceMotion: (v) => set({ reduceMotion: v }),
    }),
    {
      name: 'devos-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        reduceMotion: s.reduceMotion,
      }),
    },
  ),
)

export async function persistPref(key: string, value: string) {
  if (!isDesktop) return
  try {
    await ipc.setPreference(key, value)
  } catch {
    /* non-fatal */
  }
}
