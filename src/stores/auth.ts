import { create } from 'zustand'
import { api } from '@/lib/api'
import type { Me } from '@/lib/types'

interface AuthState {
  user: Me | null
  loaded: boolean
  blocked: string | null
  setUser: (u: Me | null) => void
  patch: (p: Partial<Me>) => void
  refresh: () => Promise<Me | null>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loaded: false,
  blocked: null,
  setUser: (user) => set({ user, loaded: true }),
  patch: (p) => {
    const u = get().user
    if (u) set({ user: { ...u, ...p } })
  },
  refresh: async () => {
    try {
      const r = await api.get<{ user: Me | null; blocked?: string }>('/auth/me')
      set({ user: r.user, loaded: true, blocked: r.blocked ?? null })
      return r.user
    } catch {
      set({ loaded: true })
      return get().user
    }
  },
  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      set({ user: null })
    }
  },
}))
