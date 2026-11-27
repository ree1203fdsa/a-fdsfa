import type { Server, Socket } from 'socket.io'
import { sanitizeInput, type BattleInit, type BattlePlayerInfo, type BattleResult, type BattleWeaponInfo } from '../../../shared/battle.ts'
import { AI_DIFFICULTIES, PALETTE, WEAPON_INFO, WEAPON_TYPES, type AiDifficulty, type Team, type WeaponType } from '../../../shared/constants.ts'
import { MAPS } from '../../../shared/maps.ts'
import { analyzeStrokes, autoModelParams, computeStats, presetStrokes, type ModelParams, type Stroke } from '../../../shared/weapon.ts'
import { prisma, parseJson } from '../db.ts'
import { getBattle, getRewards } from '../services/config.ts'
import { grant, notify } from '../services/economy.ts'
import { progress } from '../services/missions.ts'
import { Battle } from './engine.ts'
import { think } from './ai.ts'

const battles = new Map<number, Battle>()
const userBattle = new Map<number, { matchId: number; fighterId: string }>()
const RECONNECT_GRACE_MS = 30_000
const disconnectTimers = new Map<number, ReturnType<typeof setTimeout>>()

export function activeBattles() {
  return [...battles.values()]
}

const BOT_NAMES = ['AI 토끼', 'AI 여우', 'AI 곰돌이', 'AI 펭귄', 'AI 고양이', 'AI 다람쥐', 'AI 부엉이', 'AI 판다']

export function botWeapon(type: WeaponType, seed: number): BattleWeaponInfo {
  const strokes = presetStrokes(type, PALETTE[2 + (seed % 10)], PALETTE[10 + (seed % 3)])
  const f = analyzeStrokes(strokes)
  const s = computeStats(type, f, 1)
  return { name: `연습용 ${WEAPON_INFO[type].name}`, type, strokes, paperId: 'white', params: autoModelParams(f), stats: { attack: s.attack, speed: s.speed, area: s.area, range: s.range, weight: s.weight, defense: s.defense } }
}

/** The player's equipped weapon, or a practice sword if they have none yet. */
export async function playerWeapon(userId: number): Promise<BattleWeaponInfo> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const w = u.equippedWeaponId ? await prisma.weapon.findFirst({ where: { id: u.equippedWeaponId, userId, deletedAt: null } }) : null
  if (!w) return { ...botWeapon('sword', userId), name: '연습용 검' }
  return {
    name: w.name, type: w.type as WeaponType, strokes: parseJson<Stroke[]>(w.strokes, []), paperId: w.paperId,
    params: parseJson<ModelParams>(w.modelParams, { angle: 0, flip: false, thickness: 1, scale: 1 }),
    stats: { attack: w.attack, speed: w.speed, area: w.area, range: w.range, weight: w.weight, defense: w.defense },
  }
}

export async function playerLook(userId: number) {
  const items = await prisma.userItem.findMany({ where: { userId, equipped: true, item: { category: 'COSMETIC' } }, include: { item: true } })
  return items.map((i) => ({ slot: i.item.slot, effect: parseJson<Record<string, unknown>>(i.item.effect, {}) }))
}

export function inBattle(userId: number) {
  return userBattle.has(userId)
}

/** Builds a battle, wires it to sockets, and starts it once every human is ready (or after 8s). */
export async function launchBattle(io: Server, opts: {
  mode: 'AI' | 'FRIEND'; mapId: string; difficulty: AiDifficulty | null; roomId?: number; players: BattlePlayerInfo[]
}) {
  const cfg = await getBattle()
  const match = await prisma.match.create({ data: { mode: opts.mode, mapId: opts.mapId, aiDifficulty: opts.difficulty, roomId: opts.roomId } })
  const room = 'battle:' + match.id
  const battle = new Battle({
    matchId: match.id, mode: opts.mode, mapId: opts.mapId, durationSec: cfg.durationSec, difficulty: opts.difficulty, players: opts.players,
    hooks: {
      think,
      emit: (event, data) => io.to(room).emit(event, data),
      onEnd: (result) => void finishMatch(io, battle, result),
    },
  })
  battles.set(match.id, battle)
  for (const p of opts.players) if (p.userId) userBattle.set(p.userId, { matchId: match.id, fighterId: p.id })
  const sockets = await io.fetchSockets()
  for (const s of sockets) if (opts.players.some((p) => p.userId === s.data.userId)) s.join(room)
  for (const p of opts.players) {
    if (!p.userId) continue
    const init: BattleInit = { matchId: match.id, mode: opts.mode, mapId: battle.map.id, durationSec: cfg.durationSec, difficulty: opts.difficulty, you: p.id, players: opts.players }
    io.to('user:' + p.userId).emit('battle:init', init)
  }
  const ready = new Set<number>()
  const begin = () => {
    if (battle.started || battle.ended) return
    io.to(room).emit('battle:countdown', 3)
    setTimeout(() => battle.start(), 3000)
  }
  ;(battle as Battle & { markReady?: (uid: number) => void }).markReady = (uid: number) => {
    ready.add(uid)
    if (opts.players.filter((p) => p.userId).every((p) => ready.has(p.userId!))) begin()
  }
  setTimeout(begin, 8000)
  return match.id
}

async function finishMatch(io: Server, battle: Battle, result: BattleResult) {
  battles.delete(battle.matchId)
  const rewards = await getRewards()
  const now = new Date()
  const events = await prisma.gameEvent.findMany({ where: { deletedAt: null, active: true, startAt: { lte: now }, endAt: { gt: now } } })
  const coinBonus = events.reduce((m, e) => Math.max(m, e.coinBonus), 1)
  const aiMul = battle.mode === 'AI' ? rewards.aiMultiplier[battle.difficulty ?? 'normal'] ?? 1 : 1
  const humans = result.players.filter((p) => p.userId)
  const humanIds = humans.map((h) => h.userId!)

  await prisma.match.update({
    where: { id: battle.matchId },
    data: { status: result.reason === 'abandon' ? 'ABORTED' : 'FINISHED', winner: result.winner, redScore: result.score.RED, blueScore: result.score.BLUE, durationSec: result.durationSec, endReason: result.reason, endedAt: now },
  })

  for (const p of result.players) {
    const f = battle.fighter(p.id)!
    const outcome: 'WIN' | 'LOSS' | 'DRAW' = result.winner === 'DRAW' ? 'DRAW' : result.winner === p.team ? 'WIN' : 'LOSS'
    // Counted only if the player was connected and actually played (not AFK, not an aborted match).
    const valid = Boolean(p.userId) && result.reason !== 'abandon' && f.connected && result.durationSec >= 15 && f.inputs >= result.durationSec * 3 && f.lastActiveAt > 0
    let coins = 0, xp = 0, levelUps: number[] = []
    if (p.userId) {
      const friendsInMatch = battle.mode === 'FRIEND' && humanIds.length > 1
        ? await prisma.friendship.count({ where: { status: 'ACCEPTED', OR: humanIds.filter((h) => h !== p.userId).flatMap((o) => [{ requesterId: p.userId!, addresseeId: o }, { requesterId: o, addresseeId: p.userId! }]) } })
        : 0
      if (valid) {
        const base = outcome === 'WIN' ? [rewards.winCoins, rewards.winXp] : outcome === 'LOSS' ? [rewards.lossCoins, rewards.lossXp] : [rewards.drawCoins, rewards.drawXp]
        coins = Math.round((rewards.participateCoins + base[0]) * aiMul * coinBonus)
        xp = Math.round((rewards.participateXp + base[1]) * aiMul + (friendsInMatch ? rewards.friendPlayXp : 0))
      }
      const r = await prisma.$transaction(async (tx) => {
        await tx.matchParticipant.create({
          data: {
            matchId: battle.matchId, userId: p.userId, team: p.team, weaponSnapshot: JSON.stringify({ name: f.info.weapon.name, type: f.type, stats: f.info.weapon.stats }),
            kills: p.kills, deaths: p.deaths, damage: p.damage, score: p.score, result: outcome, validParticipation: valid, coinsEarned: coins, xpEarned: xp,
          },
        })
        if (!valid) return { levelUps: [] as number[] }
        await tx.user.update({
          where: { id: p.userId! },
          data: {
            totalGames: { increment: 1 }, battleScore: { increment: p.score },
            ...(outcome === 'WIN' ? { wins: { increment: 1 } } : outcome === 'LOSS' ? { losses: { increment: 1 } } : { draws: { increment: 1 } }),
          },
        })
        const g = await grant(tx, p.userId!, `match:${battle.matchId}`, coins, xp, `${battle.mode === 'AI' ? 'AI 대전' : '친구 대전'} ${outcome === 'WIN' ? '승리' : outcome === 'LOSS' ? '참여' : '무승부'}`)
        await progress(tx, p.userId!, 'PLAY_GAMES', 1)
        if (outcome === 'WIN') await progress(tx, p.userId!, 'WIN_GAMES', 1)
        if (battle.mode === 'AI') await progress(tx, p.userId!, 'AI_GAMES', 1)
        if (friendsInMatch) await progress(tx, p.userId!, 'PLAY_WITH_FRIENDS', 1)
        // Opponents' weapon types count as "discovered" in the codex.
        for (const o of battle.fighters.filter((x) => x.team !== p.team)) {
          const key = 'type:' + o.type
          const has = await tx.userCodex.findUnique({ where: { userId_entryKey: { userId: p.userId!, entryKey: key } } })
          if (!has) await tx.userCodex.create({ data: { userId: p.userId!, entryKey: key, source: 'BATTLE' } })
        }
        return { levelUps: g.levelUps }
      })
      levelUps = r.levelUps
      userBattle.delete(p.userId)
      io.to('user:' + p.userId).emit('battle:end', { ...result, reward: { coins, xp, levelUps, valid, result: outcome } } satisfies BattleResult)
      if (!valid && result.reason !== 'abandon') {
        await notify(prisma, p.userId, 'REWARD', '전투 보상을 받지 못했어요', '전투에 거의 참여하지 않았거나 연결이 끊겨서 보상이 지급되지 않았어요.')
      }
    } else {
      await prisma.matchParticipant.create({
        data: { matchId: battle.matchId, botName: p.name, team: p.team, weaponSnapshot: JSON.stringify({ type: f.type }), kills: p.kills, deaths: p.deaths, damage: p.damage, score: p.score, result: outcome },
      })
    }
  }
  io.in('battle:' + battle.matchId).socketsLeave('battle:' + battle.matchId)
}

export function setupBattleSockets(io: Server, socket: Socket) {
  const userId = socket.data.userId as number

  // Rejoin a running battle after a refresh/reconnect.
  const current = userBattle.get(userId)
  if (current) {
    const b = battles.get(current.matchId)
    if (b && !b.ended) {
      socket.join('battle:' + b.matchId)
      clearTimeout(disconnectTimers.get(userId))
      b.setConnected(current.fighterId, true)
    }
  }

  socket.on('battle:start-ai', async (raw: unknown, ack?: (r: { ok: boolean; error?: string; matchId?: number }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    try {
      if (userBattle.has(userId)) return reply({ ok: false, error: '이미 진행 중인 전투가 있어요.' })
      const o = (raw ?? {}) as { difficulty?: string; mapId?: string; teamSize?: number }
      const difficulty = (AI_DIFFICULTIES as readonly string[]).includes(o.difficulty ?? '') ? (o.difficulty as AiDifficulty) : 'normal'
      const cfg = await getBattle()
      const maps = cfg.enabledMaps.filter((m) => MAPS[m])
      const mapId = o.mapId === 'random' || !o.mapId || !maps.includes(o.mapId) ? maps[Math.floor(Math.random() * maps.length)] : o.mapId
      const teamSize = o.teamSize === 1 ? 1 : 2
      const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
      const players: BattlePlayerInfo[] = [
        { id: 'p' + userId, userId, name: u.nickname, level: u.level, team: 'RED', bot: false, look: await playerLook(userId), weapon: await playerWeapon(userId) },
      ]
      const pool = [...WEAPON_TYPES].sort(() => Math.random() - 0.5)
      const names = [...BOT_NAMES].sort(() => Math.random() - 0.5)
      const addBot = (team: Team, i: number) => {
        const seed = Math.floor(Math.random() * 1000)
        players.push({ id: `b${i}`, userId: null, name: names[i], level: 1 + AI_DIFFICULTIES.indexOf(difficulty) * 8, team, bot: true, look: [{ slot: 'top', effect: { color: PALETTE[2 + (seed % 12)] } }], weapon: botWeapon(pool[i % pool.length], seed) })
      }
      let i = 0
      if (teamSize === 2) addBot('RED', i++)
      for (let k = 0; k < teamSize; k++) addBot('BLUE', i++)
      const matchId = await launchBattle(io, { mode: 'AI', mapId, difficulty, players })
      reply({ ok: true, matchId })
    } catch (e) {
      console.error('[battle:start-ai]', e)
      reply({ ok: false, error: '전투를 시작하지 못했어요.' })
    }
  })

  socket.on('battle:ready', () => {
    const cur = userBattle.get(userId)
    const b = cur && (battles.get(cur.matchId) as (Battle & { markReady?: (uid: number) => void }) | undefined)
    b?.markReady?.(userId)
  })

  socket.on('battle:sync', (ack?: (r: unknown) => void) => {
    // Lets a refreshed page fetch the init payload of the battle it belongs to.
    const cur = userBattle.get(userId)
    const b = cur && battles.get(cur.matchId)
    if (typeof ack !== 'function') return
    if (!cur || !b || b.ended) return ack(null)
    socket.join('battle:' + b.matchId)
    ack({ matchId: b.matchId, mode: b.mode, mapId: b.map.id, durationSec: b.durationSec, difficulty: b.difficulty, you: cur.fighterId, players: b.fighters.map((f) => f.info) } satisfies BattleInit)
  })

  socket.on('battle:input', (raw: unknown) => {
    const cur = userBattle.get(userId)
    const b = cur && battles.get(cur.matchId)
    const input = sanitizeInput(raw)
    if (b && input) b.setInput(cur.fighterId, input)
  })

  socket.on('battle:leave', () => {
    const cur = userBattle.get(userId)
    const b = cur && battles.get(cur.matchId)
    if (!cur || !b) return
    // Leaving on purpose forfeits: the character drops out and no reward is paid.
    b.setConnected(cur.fighterId, false)
    const f = b.fighter(cur.fighterId)
    if (f && f.alive) {
      f.hp = 0
      f.alive = false
      f.act = 'dead'
    }
    leftOrAbandon(b)
  })

  socket.on('disconnect', () => {
    const cur = userBattle.get(userId)
    const b = cur && battles.get(cur.matchId)
    if (!cur || !b || b.ended) return
    b.setConnected(cur.fighterId, false)
    disconnectTimers.set(userId, setTimeout(() => leftOrAbandon(b), RECONNECT_GRACE_MS))
  })
}

/** An AI match with no connected human ends without rewards; a friend match keeps going. */
function leftOrAbandon(b: Battle) {
  if (b.ended) return
  const humans = b.fighters.filter((f) => !f.info.bot)
  if (humans.every((f) => !f.connected)) b.finish('DRAW', 'abandon')
}
