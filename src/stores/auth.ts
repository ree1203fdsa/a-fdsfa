import { create } from 'zustand'
import { api } from '@/lib/api'
import type { Me } from '@/lib/types'

interface AuthState {
  user: Me | null
  loaded: boolean
  offline: boolean
  blocked: string | null
  setUser: (u: Me | null) => void
  patch: (p: Partial<Me>) => void
  refresh: () => Promise<Me | null>
  logout: () => Promise<void>
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  offline: false,
  blocked: null,
  setUser: (user) => set({ user, loaded: true, offline: false }),
  patch: (p) => {
    const u = get().user
    if (u) set({ user: { ...u, ...p } })
  },
  refresh: async () => {
    // A failed request means "server unreachable", not "logged out" — retry before giving up,
    // so a server restart doesn't bounce players to the login screen.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await api.get<{ user: Me | null; blocked?: string }>('/auth/me')
        set({ user: r.user, loaded: true, offline: false, blocked: r.blocked ?? null })
        return r.user
      } catch {
        await wait(800 * (attempt + 1))
      }
    }
    set({ loaded: true, offline: get().user === null })
    return get().user
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      set({ user: null })
    }
  },
}))
