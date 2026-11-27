import { create } from 'zustand'
import type { BattleEvent, BattleInit, BattleResult, BattleSnapshot, PlayerSnap } from '@shared/battle'

interface Stamped { at: number; snap: BattleSnapshot }

interface BattleState {
  init: BattleInit | null
  countdown: number | null
  started: boolean
  result: BattleResult | null
  /** Recent snapshots with local arrival time, for interpolation. */
  buffer: Stamped[]
  latest: BattleSnapshot | null
  setInit: (i: BattleInit | null) => void
  pushSnapshot: (s: BattleSnapshot) => void
  setCountdown: (n: number | null) => void
  setResult: (r: BattleResult | null) => void
  reset: () => void
}

export const useBattle = create<BattleState>((set, get) => ({
  init: null,
  countdown: null,
  started: false,
  result: null,
  buffer: [],
  latest: null,
  setInit: (init) => set({ init, result: null, buffer: [], latest: null, started: false, countdown: null }),
  pushSnapshot: (snap) => {
    const buffer = [...get().buffer, { at: performance.now(), snap }].slice(-12)
    set({ buffer, latest: snap, started: true, countdown: null })
  },
  setCountdown: (countdown) => set({ countdown }),
  setResult: (result) => set({ result }),
  reset: () => set({ init: null, countdown: null, started: false, result: null, buffer: [], latest: null }),
}))

// Battle events are consumed by the 3D scene/HUD each frame rather than stored in React state.
type Listener = (events: BattleEvent[]) => void
const listeners = new Set<Listener>()
export const battleEvents = {
  on: (fn: Listener) => {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  emit: (events: BattleEvent[]) => listeners.forEach((fn) => fn(events)),
}

export const INTERP_DELAY = 110

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function lerpAngle(a: number, b: number, t: number) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** Player states at `INTERP_DELAY` ms in the past, smoothly blended between snapshots. */
export function interpolatedPlayers(now = performance.now()): Map<string, PlayerSnap> {
  const buf = useBattle.getState().buffer
  const out = new Map<string, PlayerSnap>()
  if (!buf.length) return out
  const target = now - INTERP_DELAY
  let a = buf[0], b = buf[buf.length - 1]
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i].at <= target && buf[i + 1].at >= target) {
      a = buf[i]
      b = buf[i + 1]
      break
    }
  }
  if (target >= buf[buf.length - 1].at) a = b = buf[buf.length - 1]
  const t = a === b ? 1 : Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)))
  for (const pb of b.snap.players) {
    const pa = a.snap.players.find((p) => p.id === pb.id) ?? pb
    out.set(pb.id, { ...pb, x: lerp(pa.x, pb.x, t), y: lerp(pa.y, pb.y, t), z: lerp(pa.z, pb.z, t), yaw: lerpAngle(pa.yaw, pb.yaw, t) })
  }
  return out
}

export function interpolatedProjectiles(now = performance.now()) {
  const buf = useBattle.getState().buffer
  if (!buf.length) return []
  const last = buf[buf.length - 1]
  const prev = buf[buf.length - 2] ?? last
  const t = Math.min(1.5, (now - last.at) / Math.max(1, last.at - prev.at))
  return last.snap.projectiles.map((p) => {
    const q = prev.snap.projectiles.find((x) => x.id === p.id)
    return q ? { ...p, x: p.x + (p.x - q.x) * t, y: p.y + (p.y - q.y) * t, z: p.z + (p.z - q.z) * t } : p
  })
}
