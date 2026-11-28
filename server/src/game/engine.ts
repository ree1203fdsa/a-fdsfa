import {
  COMBO_WINDOW, DODGE_COOLDOWN, DODGE_DISTANCE, DODGE_TIME, GRAVITY, JUMP_VELOCITY, MAX_HP, PLAYER_RADIUS, RUN_SPEED,
  SNAPSHOT_EVERY, STRONG_HOLD, TICK_HZ, WALK_SPEED,
  type BattleEvent, type BattleInput, type BattlePlayerInfo, type BattleResult, type BattleSnapshot, type PlayerSnap, type ProjectileSnap,
} from '../../../shared/battle.ts'
import type { AiDifficulty, Team, WeaponType } from '../../../shared/constants.ts'
import { MAPS, onIce, resolveCollisions, segmentBlocked, type MapDef } from '../../../shared/maps.ts'
import { combatProfile, specialBonus, toolsUsed } from '../../../shared/weapon.ts'

const DT = 1 / TICK_HZ
const EMPTY_INPUT: BattleInput = { seq: 0, mx: 0, mz: 0, yaw: 0, attack: false, block: false, jump: false, run: false, special: false, dodge: false }

export interface Fighter {
  info: BattlePlayerInfo
  id: string
  team: Team
  type: WeaponType
  prof: ReturnType<typeof combatProfile>
  special: string
  x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number
  hp: number; sp: number; alive: boolean
  input: BattleInput
  prev: BattleInput
  attackHeldSince: number | null
  cooldownUntil: number
  combo: number
  lastAttackAt: number
  act: PlayerSnap['act']
  actAt: number
  stunUntil: number
  dodgeUntil: number
  dodgeReadyAt: number
  dodgeDir: [number, number]
  dashUntil: number
  dashHit: Set<string>
  buffUntil: number
  shieldUntil: number
  burst: { left: number; next: number }
  ammo: number
  reloadUntil: number
  kills: number; deaths: number; damage: number
  connected: boolean
  inputs: number
  inputWindow: { start: number; count: number }
  lastActiveAt: number
}

interface Projectile {
  id: number
  owner: Fighter
  team: Team
  x: number; y: number; z: number; vx: number; vz: number; vy: number
  dmg: number
  left: number
  kind: ProjectileSnap['kind']
  explode: number
}

export interface BattleHooks {
  emit: (event: 'battle:state' | 'battle:events', data: unknown) => void
  onEnd: (result: BattleResult) => void
  think?: (battle: Battle, bot: Fighter) => void
}

export class Battle {
  readonly matchId: number
  readonly mode: 'AI' | 'FRIEND'
  readonly map: MapDef
  readonly durationSec: number
  readonly difficulty: AiDifficulty | null
  readonly fighters: Fighter[]
  time = 0
  started = false
  ended = false
  private ticks = 0
  private projectiles: Projectile[] = []
  private nextProjectile = 1
  private events: BattleEvent[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private hooks: BattleHooks

  constructor(opts: { matchId: number; mode: 'AI' | 'FRIEND'; mapId: string; durationSec: number; difficulty: AiDifficulty | null; players: BattlePlayerInfo[]; hooks: BattleHooks }) {
    this.matchId = opts.matchId
    this.mode = opts.mode
    this.map = MAPS[opts.mapId] ?? MAPS.arena
    this.durationSec = opts.durationSec
    this.difficulty = opts.difficulty
    this.hooks = opts.hooks
    const spawnIdx = { RED: 0, BLUE: 0 }
    this.fighters = opts.players.map((p) => {
      const [sx, sz] = this.map.spawns[p.team][spawnIdx[p.team]++ % this.map.spawns[p.team].length]
      const prof = combatProfile(p.weapon.type, p.weapon.stats, specialBonus(toolsUsed(p.weapon.strokes)))
      return {
        info: p, id: p.id, team: p.team, type: p.weapon.type, prof, special: specialOf(p.weapon.type),
        // yaw 0 faces -Z: RED starts at +Z looking toward BLUE, and vice versa.
        x: sx, y: 0, z: sz, vx: 0, vy: 0, vz: 0, yaw: p.team === 'RED' ? 0 : Math.PI,
        hp: MAX_HP, sp: 0, alive: true,
        input: { ...EMPTY_INPUT, yaw: p.team === 'RED' ? 0 : Math.PI }, prev: { ...EMPTY_INPUT, yaw: p.team === 'RED' ? 0 : Math.PI },
        attackHeldSince: null, cooldownUntil: 0, combo: 0, lastAttackAt: -9, act: 'idle', actAt: 0, stunUntil: 0,
        dodgeUntil: 0, dodgeReadyAt: 0, dodgeDir: [0, 0], dashUntil: 0, dashHit: new Set(), buffUntil: 0, shieldUntil: 0,
        burst: { left: 0, next: 0 }, ammo: prof.magazine, reloadUntil: 0, kills: 0, deaths: 0, damage: 0,
        connected: true, inputs: 0, inputWindow: { start: 0, count: 0 }, lastActiveAt: 0,
      } satisfies Fighter
    })
  }

  start() {
    if (this.timer) return
    this.started = true
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  fighter(id: string) {
    return this.fighters.find((f) => f.id === id)
  }

  setInput(id: string, input: BattleInput) {
    const f = this.fighter(id)
    if (!f || this.ended) return
    // Simple flood guard: ignore more than 60 inputs in any one-second window.
    const now = Date.now()
    if (now - f.inputWindow.start > 1000) f.inputWindow = { start: now, count: 0 }
    if (++f.inputWindow.count > 60) return
    f.input = input
    f.inputs++
    if (input.mx || input.mz || input.attack || input.block || input.jump || input.special || input.dodge) f.lastActiveAt = this.time
  }

  setConnected(id: string, connected: boolean) {
    const f = this.fighter(id)
    if (!f) return
    f.connected = connected
    if (!connected) f.input = { ...EMPTY_INPUT, yaw: f.yaw }
    this.events.push({ e: connected ? 'reconnect' : 'disconnect', who: id })
  }

  score() {
    const s = { RED: 0, BLUE: 0 }
    for (const f of this.fighters) s[f.team] += f.kills * 100 + f.damage
    return s
  }

  // ── main loop ──
  private tick() {
    if (this.ended) return
    try {
      this.step()
    } catch (e) {
      // One broken match must never take the whole game server down.
      console.error(`[battle ${this.matchId}] tick failed`, e)
      this.finish('DRAW', 'abandon')
    }
  }

  private step() {
    this.time += DT
    this.ticks++
    for (const f of this.fighters) if (f.info.bot && f.alive) this.hooks.think?.(this, f)
    for (const f of this.fighters) this.updateFighter(f)
    this.separate()
    this.updateProjectiles()
    if (this.events.length) {
      this.hooks.emit('battle:events', this.events)
      this.events = []
    }
    if (this.ticks % SNAPSHOT_EVERY === 0) this.hooks.emit('battle:state', this.snapshot())
    this.checkEnd()
  }

  private updateFighter(f: Fighter) {
    const inp = f.input
    const prev = f.prev
    f.prev = inp
    if (!f.alive) return
    const now = this.time
    f.sp = f.info.staff ? 100 : Math.min(100, f.sp + 1.2 * DT * f.prof.specialRate)
    if (f.reloadUntil && now >= f.reloadUntil) {
      f.reloadUntil = 0
      f.ammo = f.prof.magazine
    }
    const stunned = now < f.stunUntil
    if (!stunned) f.yaw = inp.yaw

    // dodge
    if (!stunned && inp.dodge && !prev.dodge && now >= f.dodgeReadyAt) {
      const len = Math.hypot(inp.mx, inp.mz)
      f.dodgeDir = len > 0.1 ? [inp.mx / len, inp.mz / len] : [-Math.sin(f.yaw), -Math.cos(f.yaw)]
      f.dodgeUntil = now + DODGE_TIME
      f.dodgeReadyAt = now + DODGE_COOLDOWN
      this.setAct(f, 'dodge')
    }

    // attacks: tap = normal on release, hold ≥ STRONG_HOLD then release = strong
    if (!stunned && now >= f.dodgeUntil) {
      if (inp.attack && !prev.attack) f.attackHeldSince = now
      if (!inp.attack && prev.attack && f.attackHeldSince !== null) {
        const strong = now - f.attackHeldSince >= STRONG_HOLD
        f.attackHeldSince = null
        this.tryAttack(f, strong)
      }
      if (inp.special && !prev.special && f.sp >= 100) this.useSpecial(f)
    }
    if (f.burst.left > 0 && now >= f.burst.next) {
      f.burst.left--
      f.burst.next = now + 0.13
      this.fireProjectile(f, f.yaw + (Math.random() - 0.5) * 0.08, 0.9, 1)
    }

    // movement
    const blocking = inp.block && !stunned && now >= f.dodgeUntil
    let tx = 0, tz = 0
    if (now < f.dodgeUntil) {
      const sp = DODGE_DISTANCE / DODGE_TIME
      f.vx = f.dodgeDir[0] * sp
      f.vz = f.dodgeDir[1] * sp
    } else if (now < f.dashUntil) {
      f.vx = -Math.sin(f.yaw) * 20
      f.vz = -Math.cos(f.yaw) * 20
      this.dashHits(f)
    } else {
      if (!stunned) {
        const base = inp.run && !blocking ? RUN_SPEED : WALK_SPEED
        const slow = blocking ? (f.prof.style === 'melee' ? 0.5 : 0.6) : f.attackHeldSince !== null && now - f.attackHeldSince > 0.2 ? 0.7 : 1
        const speed = base * f.prof.moveMul * slow * (now < f.buffUntil && f.special === 'shadow_combo' ? 1.25 : 1)
        tx = inp.mx * speed
        tz = inp.mz * speed
      }
      const fr = (onIce(this.map, f.x, f.z) ? 2.2 : this.map.friction) * DT
      f.vx += (tx - f.vx) * Math.min(1, fr)
      f.vz += (tz - f.vz) * Math.min(1, fr)
    }
    if (!stunned && inp.jump && !prev.jump && f.y <= 0.001) f.vy = JUMP_VELOCITY
    f.vy -= GRAVITY * DT
    f.y = Math.max(0, f.y + f.vy * DT)
    if (f.y === 0 && f.vy < 0) f.vy = 0
    ;[f.x, f.z] = resolveCollisions(this.map, f.x + f.vx * DT, f.z + f.vz * DT, PLAYER_RADIUS, f.y)

    // animation state
    if (stunned) this.setAct(f, 'stun')
    else if (now < f.dodgeUntil) this.setAct(f, 'dodge')
    else if (now - f.actAt < 0.35 && ['attack', 'strong', 'special'].includes(f.act)) { /* keep swing animation */ }
    else if (blocking) this.setAct(f, 'block')
    else if (Math.hypot(f.vx, f.vz) > 0.6) this.setAct(f, inp.run ? 'run' : 'move')
    else this.setAct(f, 'idle')
  }

  private setAct(f: Fighter, act: PlayerSnap['act']) {
    if (f.act !== act) {
      f.act = act
      f.actAt = this.time
    }
  }

  private enemiesOf(f: Fighter) {
    return this.fighters.filter((o) => o.alive && o.team !== f.team)
  }
  private alliesOf(f: Fighter) {
    return this.fighters.filter((o) => o.alive && o.team === f.team)
  }

  private tryAttack(f: Fighter, strong: boolean) {
    const now = this.time
    if (now < f.cooldownUntil) return
    const buffed = now < f.buffUntil && f.special === 'shadow_combo'
    f.combo = now - f.lastAttackAt < COMBO_WINDOW ? f.combo + 1 : 1
    f.lastAttackAt = now
    let mult = strong ? 1.8 : 1
    if (f.combo % 3 === 0) mult *= 1.4
    if (f.y > 0.5) mult *= 1.3
    if (buffed) mult *= 1.3
    f.cooldownUntil = now + f.prof.cooldown * (strong ? 1.4 : 1) * (buffed ? 0.55 : 1)
    this.setAct(f, strong ? 'strong' : 'attack')

    if (f.prof.style === 'melee') {
      this.events.push({ e: 'swing', who: f.id, strong })
      this.meleeArc(f, f.prof.reach * (strong ? 1.15 : 1), f.prof.arc, f.prof.damage * mult, f.combo % 3 === 0 || strong)
    } else {
      if (f.prof.magazine > 0) {
        if (f.reloadUntil) return
        f.ammo--
        if (f.ammo <= 0) f.reloadUntil = now + f.prof.reloadSec
      }
      const aiming = f.input.block
      const spread = aiming ? 0 : (Math.random() - 0.5) * 0.1
      this.fireProjectile(f, f.yaw + spread, mult, aiming ? 1.2 : 1)
    }
  }

  private meleeArc(f: Fighter, reach: number, arc: number, dmg: number, crit: boolean) {
    for (const o of this.enemiesOf(f)) {
      const dx = o.x - f.x, dz = o.z - f.z
      const dist = Math.hypot(dx, dz)
      if (dist > reach + PLAYER_RADIUS || Math.abs(o.y - f.y) > 1.8) continue
      if (arc < Math.PI * 2 - 0.01) {
        const ang = Math.atan2(-dx, -dz)
        if (Math.abs(angleDiff(ang, f.yaw)) > arc / 2) continue
      }
      if (segmentBlocked(this.map, f.x, f.z, o.x, o.z, f.y + 1)) continue
      this.damage(f, o, dmg, crit)
    }
  }

  private fireProjectile(f: Fighter, yaw: number, mult: number, speedMul: number) {
    const kind: Projectile['kind'] = f.type === 'gun' ? 'bullet' : f.type === 'bow' ? 'arrow' : 'orb'
    const speed = f.prof.projectileSpeed * speedMul
    this.projectiles.push({
      id: this.nextProjectile++, owner: f, team: f.team, x: f.x - Math.sin(yaw) * 0.6, y: f.y + 1.2, z: f.z - Math.cos(yaw) * 0.6,
      vx: -Math.sin(yaw) * speed, vz: -Math.cos(yaw) * speed, vy: 0, dmg: f.prof.damage * mult, left: f.prof.projectileRange, kind, explode: 0,
    })
    this.events.push({ e: 'shot', who: f.id })
  }

  private updateProjectiles() {
    const keep: Projectile[] = []
    for (const p of this.projectiles) {
      let dead = false
      for (let s = 0; s < 3 && !dead; s++) {
        const step = DT / 3
        p.x += p.vx * step
        p.z += p.vz * step
        if (p.kind === 'bomb') {
          p.vy -= GRAVITY * 0.6 * step
          p.y += p.vy * step
        }
        p.left -= Math.hypot(p.vx, p.vz) * step
        const hitGround = p.y <= 0.1
        const hitWall = Math.abs(p.x) > this.map.half || Math.abs(p.z) > this.map.half || segmentBlocked(this.map, p.x, p.z, p.x + 0.001, p.z, p.y)
        const target = this.enemiesOf(p.owner).find((o) => Math.hypot(o.x - p.x, o.z - p.z) < PLAYER_RADIUS + 0.3 && p.y > o.y - 0.2 && p.y < o.y + 2.2)
        if (target || hitWall || hitGround || p.left <= 0) {
          dead = true
          if (p.explode > 0) this.explode(p.owner, p.x, p.z, p.explode, p.dmg, 'paint_bomb')
          else if (target) this.damage(p.owner, target, p.dmg, false, [p.x, p.z])
        }
      }
      if (!dead) keep.push(p)
    }
    this.projectiles = keep
  }

  private explode(from: Fighter, x: number, z: number, r: number, dmg: number, kind: string) {
    this.events.push({ e: 'special', who: from.id, kind, x, z, r })
    for (const o of this.enemiesOf(from)) if (Math.hypot(o.x - x, o.z - z) < r + PLAYER_RADIUS) this.damage(from, o, dmg, true, [x, z])
  }

  private dashHits(f: Fighter) {
    for (const o of this.enemiesOf(f)) {
      if (f.dashHit.has(o.id)) continue
      if (Math.hypot(o.x - f.x, o.z - f.z) < 1.4) {
        f.dashHit.add(o.id)
        this.damage(f, o, f.prof.damage * 1.8, true)
      }
    }
  }

  private useSpecial(f: Fighter) {
    f.sp = 0
    this.setAct(f, 'special')
    const now = this.time
    const d = f.prof.damage
    const evt = (r: number) => this.events.push({ e: 'special', who: f.id, kind: f.special, x: f.x, z: f.z, r })
    switch (f.special) {
      case 'dash_slash':
        f.dashUntil = now + 0.3
        f.dashHit = new Set()
        evt(1.5)
        break
      case 'shadow_combo':
        f.buffUntil = now + 4
        f.cooldownUntil = now
        evt(1)
        break
      case 'rapid_fire':
        f.burst = { left: 6, next: now }
        f.ammo = f.prof.magazine
        f.reloadUntil = 0
        evt(1)
        break
      case 'arrow_rain':
        for (let i = -2; i <= 2; i++) this.fireProjectile(f, f.yaw + i * 0.14, 1.1, 1)
        evt(1)
        break
      case 'pierce':
        evt(f.prof.reach * 2)
        this.meleeArc(f, f.prof.reach * 2, 0.5, d * 2, true)
        break
      case 'whirlwind':
        evt(f.prof.reach * 1.3)
        this.meleeArc(f, f.prof.reach * 1.3, Math.PI * 2, d * 1.6, true)
        break
      case 'blade_storm':
        evt(f.prof.reach * 1.25)
        this.meleeArc(f, f.prof.reach * 1.25, Math.PI * 2, d * 1.1, true)
        setTimeout(() => this.alive(f) && this.meleeArc(f, f.prof.reach * 1.25, Math.PI * 2, d * 0.8, false), 250)
        break
      case 'ground_slam':
        evt(4)
        for (const o of this.enemiesOf(f)) {
          if (Math.hypot(o.x - f.x, o.z - f.z) < 4 + PLAYER_RADIUS) {
            this.damage(f, o, d * 1.6, true)
            o.stunUntil = now + 0.9
          }
        }
        break
      case 'guardian_wall':
        evt(6)
        for (const a of this.alliesOf(f)) if (Math.hypot(a.x - f.x, a.z - f.z) < 6) a.shieldUntil = now + 4
        break
      case 'healing_light':
        evt(6)
        for (const a of this.alliesOf(f)) {
          if (Math.hypot(a.x - f.x, a.z - f.z) < 6) {
            const amount = Math.min(MAX_HP - a.hp, 35)
            a.hp += amount
            if (amount > 0) this.events.push({ e: 'heal', who: f.id, to: a.id, amount: Math.round(amount) })
          }
        }
        break
      case 'harvest': {
        evt(f.prof.reach * 1.2)
        const before = f.damage
        this.meleeArc(f, f.prof.reach * 1.2, (220 * Math.PI) / 180, d * 1.6, true)
        const heal = Math.min(MAX_HP - f.hp, (f.damage - before) * 0.5)
        if (heal > 0) {
          f.hp += heal
          this.events.push({ e: 'heal', who: f.id, to: f.id, amount: Math.round(heal) })
        }
        break
      }
      case 'color_burst':
        this.explode(f, f.x, f.z, 4.5, d * 1.5, 'color_burst')
        break
      default: {
        // paint_bomb: lobbed projectile that bursts on landing
        const yaw = f.yaw
        this.projectiles.push({
          id: this.nextProjectile++, owner: f, team: f.team, x: f.x, y: f.y + 1.5, z: f.z,
          vx: -Math.sin(yaw) * 11, vz: -Math.cos(yaw) * 11, vy: 6, dmg: d * 1.6, left: 30, kind: 'bomb', explode: 3.5,
        })
        evt(1)
      }
    }
  }

  private alive(f: Fighter) {
    return f.alive && !this.ended
  }

  private damage(from: Fighter, to: Fighter, raw: number, crit: boolean, src?: [number, number]) {
    if (!to.alive || this.time < to.dodgeUntil) return
    if (to.info.staff) {
      // Admin test mode: hits register visually but never hurt.
      this.events.push({ e: 'hit', from: from.id, to: to.id, dmg: 0, x: to.x, y: to.y + 1.2, z: to.z, blocked: true, crit: false })
      return
    }
    let dmg = raw
    let blocked = false
    if (this.time < to.shieldUntil) dmg *= 0.3
    if (to.input.block && to.prof.style === 'melee' && this.time >= to.stunUntil) {
      const [sx, sz] = src ?? [from.x, from.z]
      const ang = Math.atan2(-(sx - to.x), -(sz - to.z))
      if (Math.abs(angleDiff(ang, to.yaw)) < (Math.PI * 2) / 3) {
        dmg *= 1 - to.prof.blockReduce
        blocked = true
      }
    }
    dmg = Math.max(1, Math.round(dmg))
    to.hp -= dmg
    from.damage += dmg
    from.sp = Math.min(100, from.sp + dmg * 0.8 * from.prof.specialRate)
    to.sp = Math.min(100, to.sp + dmg * 0.4)
    this.events.push({ e: 'hit', from: from.id, to: to.id, dmg, x: to.x, y: to.y + 1.2, z: to.z, blocked, crit })
    if (to.hp <= 0) {
      to.hp = 0
      to.alive = false
      to.act = 'dead'
      to.actAt = this.time
      to.vx = to.vz = 0
      from.kills++
      to.deaths++
      this.events.push({ e: 'kill', from: from.id, to: to.id })
    }
  }

  private separate() {
    const alive = this.fighters.filter((f) => f.alive)
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j]
        const dx = b.x - a.x, dz = b.z - a.z
        const d = Math.hypot(dx, dz)
        const min = PLAYER_RADIUS * 2
        if (d < min && d > 1e-4 && Math.abs(a.y - b.y) < 1.5) {
          const push = (min - d) / 2
          a.x -= (dx / d) * push
          a.z -= (dz / d) * push
          b.x += (dx / d) * push
          b.z += (dz / d) * push
        }
      }
    }
  }

  snapshot(): BattleSnapshot {
    const r2 = (v: number) => Math.round(v * 100) / 100
    return {
      t: r2(this.time),
      remaining: Math.max(0, Math.ceil(this.durationSec - this.time)),
      score: this.score(),
      players: this.fighters.map((f) => ({
        id: f.id, x: r2(f.x), y: r2(f.y), z: r2(f.z), yaw: r2(f.yaw), hp: Math.round(f.hp), sp: Math.floor(f.sp), alive: f.alive,
        act: f.act, at: r2(this.time - f.actAt), ammo: f.ammo, mag: f.prof.magazine,
        reload: f.reloadUntil ? r2(Math.max(0, f.reloadUntil - this.time)) : 0, shield: this.time < f.shieldUntil ? 1 : 0,
      })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), kind: p.kind, team: p.team })),
    }
  }

  private checkEnd() {
    const redAlive = this.fighters.some((f) => f.team === 'RED' && f.alive)
    const blueAlive = this.fighters.some((f) => f.team === 'BLUE' && f.alive)
    if (!redAlive || !blueAlive) return this.finish(!redAlive && !blueAlive ? 'DRAW' : redAlive ? 'RED' : 'BLUE', 'elimination')
    if (this.time >= this.durationSec) {
      const s = this.score()
      this.finish(s.RED === s.BLUE ? 'DRAW' : s.RED > s.BLUE ? 'RED' : 'BLUE', 'time')
    }
  }

  finish(winner: Team | 'DRAW', reason: BattleResult['reason']) {
    if (this.ended) return
    this.ended = true
    this.stop()
    this.hooks.emit('battle:state', this.snapshot())
    this.hooks.onEnd({
      matchId: this.matchId, winner, reason, score: this.score(), durationSec: Math.round(this.time),
      players: this.fighters.map((f) => ({
        id: f.id, userId: f.info.userId, name: f.info.name, team: f.team, bot: f.info.bot,
        kills: f.kills, deaths: f.deaths, damage: f.damage, score: f.kills * 100 + f.damage,
      })),
    })
  }
}

export function angleDiff(a: number, b: number) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

function specialOf(type: WeaponType) {
  const map: Record<WeaponType, string> = {
    sword: 'dash_slash', longsword: 'dash_slash', dagger: 'shadow_combo', gun: 'rapid_fire', bow: 'arrow_rain', spear: 'pierce',
    axe: 'whirlwind', hammer: 'ground_slam', shield: 'guardian_wall', staff: 'healing_light', scythe: 'harvest',
    twinblades: 'blade_storm', special: 'color_burst', freeform: 'paint_bomb',
  }
  return map[type]
}
