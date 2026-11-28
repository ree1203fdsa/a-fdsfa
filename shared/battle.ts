import type { AiDifficulty, Team, WeaponType } from './constants.ts'
import type { ModelParams, Stroke } from './weapon.ts'

export const TICK_HZ = 30
export const SNAPSHOT_EVERY = 2
export const PLAYER_RADIUS = 0.45
export const MAX_HP = 100
export const WALK_SPEED = 4.6
export const RUN_SPEED = 7.2
export const JUMP_VELOCITY = 7.5
export const GRAVITY = 22
export const DODGE_DISTANCE = 4.5
export const DODGE_TIME = 0.25
export const DODGE_COOLDOWN = 2.5
export const STRONG_HOLD = 0.55
export const COMBO_WINDOW = 1.2

/** What the client sends ~30 times a second. Positions are never sent; the server simulates them. */
export interface BattleInput {
  seq: number
  /** Desired move direction in world space, length ≤ 1. */
  mx: number
  mz: number
  /** Facing (radians, 0 = +Z). */
  yaw: number
  attack: boolean
  block: boolean
  jump: boolean
  run: boolean
  special: boolean
  dodge: boolean
}

export interface BattleWeaponInfo {
  name: string
  type: WeaponType
  strokes: Stroke[]
  paperId: string
  params: ModelParams
  stats: { attack: number; speed: number; area: number; range: number; weight: number; defense: number }
}

export interface BattlePlayerInfo {
  id: string
  userId: number | null
  name: string
  level: number
  team: Team
  bot: boolean
  /** Staff playing in admin mode: shown with a badge, invincible, special always ready, no rewards. */
  staff?: boolean
  look: { slot: string | null; effect: Record<string, unknown> }[]
  weapon: BattleWeaponInfo
}

export interface BattleInit {
  matchId: number
  mode: 'AI' | 'FRIEND'
  mapId: string
  durationSec: number
  difficulty: AiDifficulty | null
  you: string
  players: BattlePlayerInfo[]
}

/** Compact per-player state in a snapshot. */
export interface PlayerSnap {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  hp: number
  sp: number
  alive: boolean
  /** Animation state flags. */
  act: 'idle' | 'move' | 'run' | 'attack' | 'strong' | 'block' | 'dodge' | 'special' | 'stun' | 'dead'
  /** Seconds since current action started (for animation). */
  at: number
  ammo: number
  mag: number
  reload: number
  shield: number
}

export interface ProjectileSnap {
  id: number
  x: number
  y: number
  z: number
  kind: 'bullet' | 'arrow' | 'orb' | 'bomb'
  team: Team
}

export interface BattleSnapshot {
  t: number
  remaining: number
  score: { RED: number; BLUE: number }
  players: PlayerSnap[]
  projectiles: ProjectileSnap[]
}

export type BattleEvent =
  | { e: 'hit'; from: string; to: string; dmg: number; x: number; y: number; z: number; blocked: boolean; crit: boolean }
  | { e: 'kill'; from: string; to: string }
  | { e: 'special'; who: string; kind: string; x: number; z: number; r: number }
  | { e: 'heal'; who: string; to: string; amount: number }
  | { e: 'swing'; who: string; strong: boolean }
  | { e: 'shot'; who: string }
  | { e: 'disconnect'; who: string }
  | { e: 'reconnect'; who: string }

export interface BattleResultPlayer {
  id: string
  userId: number | null
  name: string
  team: Team
  bot: boolean
  kills: number
  deaths: number
  damage: number
  score: number
}

export interface BattleResult {
  matchId: number
  winner: Team | 'DRAW'
  reason: 'elimination' | 'time' | 'abandon'
  score: { RED: number; BLUE: number }
  durationSec: number
  players: BattleResultPlayer[]
  /** Filled per receiving player. */
  reward?: { coins: number; xp: number; levelUps: number[]; valid: boolean; result: 'WIN' | 'LOSS' | 'DRAW' }
}

export function sanitizeInput(raw: unknown): BattleInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  let mx = num(r.mx), mz = num(r.mz)
  const len = Math.hypot(mx, mz)
  if (len > 1) { mx /= len; mz /= len }
  return {
    seq: Math.floor(num(r.seq)), mx, mz, yaw: num(r.yaw) % (Math.PI * 2),
    attack: r.attack === true, block: r.block === true, jump: r.jump === true, run: r.run === true, special: r.special === true, dodge: r.dodge === true,
  }
}
