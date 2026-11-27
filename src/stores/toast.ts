import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error' | 'coin' | 'level'

interface Toast {
  id: number
  kind: ToastKind
  text: string
}

interface ToastState {
  toasts: Toast[]
  push: (text: string, kind?: ToastKind) => void
  remove: (id: number) => void
}

let seq = 0

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = 'info') => {
    const id = ++seq
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] })
    setTimeout(() => get().remove(id), kind === 'error' ? 4500 : 3000)
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = {
  info: (t: string) => useToast.getState().push(t, 'info'),
  success: (t: string) => useToast.getState().push(t, 'success'),
  error: (t: string) => useToast.getState().push(t, 'error'),
  coin: (t: string) => useToast.getState().push(t, 'coin'),
  level: (t: string) => useToast.getState().push(t, 'level'),
}
