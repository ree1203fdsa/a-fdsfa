import { PLAYER_RADIUS, type BattleInput } from '../../../shared/battle.ts'
import type { AiDifficulty } from '../../../shared/constants.ts'
import { segmentBlocked } from '../../../shared/maps.ts'
import { angleDiff, type Battle, type Fighter } from './engine.ts'

interface Profile {
  reaction: number
  aimError: number
  attackRate: number
  block: number
  dodge: number
  strafe: number
  retreatHp: number
  strong: number
  focusWeak: boolean
  smartSpecial: boolean
}

const PROFILES: Record<AiDifficulty, Profile> = {
  easy: { reaction: 0.7, aimError: 0.55, attackRate: 0.45, block: 0, dodge: 0, strafe: 0, retreatHp: 0, strong: 0, focusWeak: false, smartSpecial: false },
  normal: { reaction: 0.45, aimError: 0.3, attackRate: 0.7, block: 0.2, dodge: 0.05, strafe: 0.15, retreatHp: 0, strong: 0.1, focusWeak: false, smartSpecial: false },
  hard: { reaction: 0.28, aimError: 0.15, attackRate: 0.85, block: 0.4, dodge: 0.2, strafe: 0.45, retreatHp: 25, strong: 0.25, focusWeak: false, smartSpecial: true },
  expert: { reaction: 0.17, aimError: 0.08, attackRate: 0.95, block: 0.6, dodge: 0.35, strafe: 0.6, retreatHp: 30, strong: 0.35, focusWeak: true, smartSpecial: true },
  legend: { reaction: 0.09, aimError: 0.03, attackRate: 1, block: 0.75, dodge: 0.5, strafe: 0.75, retreatHp: 35, strong: 0.45, focusWeak: true, smartSpecial: true },
}

/** Per-bot memory: a small state machine (seek → engage ↔ strafe, retreat when hurt). */
interface Memory {
  state: 'seek' | 'engage' | 'retreat'
  target: string | null
  nextDecision: number
  strafeDir: number
  holdUntil: number
  stuckCheck: { x: number; z: number; t: number }
  detour: number
  wantAttack: boolean
  wantStrong: boolean
  wantBlockUntil: number
  wantDodge: boolean
}

const memory = new WeakMap<Fighter, Memory>()

export function think(battle: Battle, bot: Fighter) {
  const p = PROFILES[battle.difficulty ?? 'normal']
  const t = battle.time
  let m = memory.get(bot)
  if (!m) {
    m = { state: 'seek', target: null, nextDecision: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, holdUntil: 0, stuckCheck: { x: bot.x, z: bot.z, t }, detour: 0, wantAttack: false, wantStrong: false, wantBlockUntil: 0, wantDodge: false }
    memory.set(bot, m)
  }
  const enemies = battle.fighters.filter((f) => f.alive && f.team !== bot.team)
  const allies = battle.fighters.filter((f) => f.alive && f.team === bot.team && f !== bot)
  const input: BattleInput = { seq: 0, mx: 0, mz: 0, yaw: bot.yaw, attack: false, block: false, jump: false, run: false, special: false, dodge: false }
  if (!enemies.length) return void (bot.input = input)

  // ── decide (only every `reaction` seconds, like a human's reaction time) ──
  if (t >= m.nextDecision) {
    m.nextDecision = t + p.reaction * (0.7 + Math.random() * 0.6)
    const dist = (f: Fighter) => Math.hypot(f.x - bot.x, f.z - bot.z)
    let target = enemies.find((e) => e.id === m.target)
    const nearest = enemies.reduce((a, b) => (dist(a) < dist(b) ? a : b))
    if (!target || dist(target) > dist(nearest) + 4) target = nearest
    if (p.focusWeak) {
      const weak = enemies.filter((e) => dist(e) < 12).sort((a, b) => a.hp - b.hp)[0]
      if (weak && weak.hp < 40) target = weak
    }
    m.target = target.id
    m.state = bot.hp < p.retreatHp && allies.length && Math.random() < 0.7 ? 'retreat' : dist(target) < engageRange(bot) + 2 ? 'engage' : 'seek'
    if (Math.random() < 0.25) m.strafeDir *= -1

    const attacking = ['attack', 'strong', 'special'].includes(target.act) && t - target.actAt < 0.3 && dist(target) < target.prof.reach + 1.5
    if (attacking && bot.prof.style === 'melee' && Math.random() < p.block) m.wantBlockUntil = t + 0.6
    const incoming = attacking && Math.random() < p.dodge
    m.wantDodge = incoming
    m.wantAttack = Math.random() < p.attackRate
    m.wantStrong = Math.random() < p.strong
  }

  const target = enemies.find((e) => e.id === m.target) ?? enemies[0]
  const dx = target.x - bot.x, dz = target.z - bot.z
  const d = Math.hypot(dx, dz)
  const toTarget = Math.atan2(-dx, -dz)
  input.yaw = toTarget + (Math.random() - 0.5) * p.aimError
  const want = engageRange(bot)

  // ── move ──
  let mx = 0, mz = 0
  if (m.state === 'retreat' && !allies.length) m.state = 'engage'
  if (m.state === 'retreat') {
    const ally = allies.reduce((a, b) => (Math.hypot(a.x - bot.x, a.z - bot.z) < Math.hypot(b.x - bot.x, b.z - bot.z) ? a : b))
    mx = ally.x - bot.x - dx * 0.5
    mz = ally.z - bot.z - dz * 0.5
    input.run = true
  } else if (d > want) {
    mx = dx
    mz = dz
    input.run = d > want + 5
  } else if (d < want * 0.6 && bot.prof.style !== 'melee') {
    mx = -dx
    mz = -dz
  } else if (Math.random() < p.strafe) {
    mx = -dz * m.strafeDir
    mz = dx * m.strafeDir
  }
  // Detour around obstacles when the direct line is blocked or we're stuck.
  if (t - m.stuckCheck.t > 0.8) {
    const moved = Math.hypot(bot.x - m.stuckCheck.x, bot.z - m.stuckCheck.z)
    if (moved < 0.4 && (mx || mz)) m.detour = t + 1.2
    m.stuckCheck = { x: bot.x, z: bot.z, t }
  }
  if (t < m.detour || (d > 2 && segmentBlocked(battle.map, bot.x, bot.z, target.x, target.z, 1))) {
    const side = m.strafeDir
    const ox = mx, oz = mz
    mx = ox * 0.4 - oz * side
    mz = oz * 0.4 + ox * side
    if (t < m.detour && Math.random() < 0.05) input.jump = true
  }
  const len = Math.hypot(mx, mz)
  if (len > 0.01) {
    input.mx = mx / len
    input.mz = mz / len
  }

  // ── act ──
  const facing = Math.abs(angleDiff(bot.yaw, toTarget)) < 0.5
  const inRange = bot.prof.style === 'melee' ? d < bot.prof.reach + PLAYER_RADIUS : d < bot.prof.projectileRange * 0.9 && !segmentBlocked(battle.map, bot.x, bot.z, target.x, target.z, 1.2)
  if (t < m.wantBlockUntil) input.block = true
  if (m.wantDodge) {
    input.dodge = true
    input.mx = -dz / (d || 1) * m.strafeDir
    input.mz = dx / (d || 1) * m.strafeDir
    m.wantDodge = false
  }
  // Attacks fire on button release, so press on one decision and release on the next tick.
  if (bot.prev.attack) {
    const heldFor = bot.attackHeldSince === null ? 0 : t - bot.attackHeldSince
    input.attack = m.wantStrong && heldFor < 0.6
  } else if (inRange && facing && m.wantAttack && t >= bot.cooldownUntil && !input.block) {
    input.attack = true
  }
  if (bot.sp >= 100) {
    const lowAlly = allies.some((a) => a.hp < 50 && Math.hypot(a.x - bot.x, a.z - bot.z) < 6) || bot.hp < 50
    const good = bot.special === 'healing_light' ? lowAlly : bot.special === 'guardian_wall' ? d < 6 : d < Math.max(5, want + 2)
    if (!p.smartSpecial || good) input.special = true
  }
  bot.input = input
}

function engageRange(f: Fighter) {
  return f.prof.style === 'melee' ? f.prof.reach * 0.85 : Math.min(14, f.prof.projectileRange * 0.6)
}
