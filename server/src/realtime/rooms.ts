import crypto from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import type { BattlePlayerInfo } from '../../../shared/battle.ts'
import { PALETTE, WEAPON_TYPES, type Team } from '../../../shared/constants.ts'
import { MAPS } from '../../../shared/maps.ts'
import { filterChat } from '../../../shared/text.ts'
import { prisma, parseJson } from '../db.ts'
import { notify } from '../services/economy.ts'
import { botWeapon, inBattle, launchBattle, playerLook, playerWeapon } from '../game/matches.ts'
import { areFriends, isBlockedEitherWay } from '../routes/friends.ts'
import { setStatus } from './presence.ts'

interface Member { userId: number; nickname: string; level: number; team: Team; ready: boolean; weapon: string; weaponType: string; connected: boolean }
interface ChatLine { id: number; nickname: string; text: string; at: number; system?: boolean }
export interface Room {
  dbId: number
  code: string
  hostId: number
  isPublic: boolean
  mapId: string
  fillBots: boolean
  status: 'WAITING' | 'PLAYING'
  members: Member[]
  kicked: Set<number>
  chat: ChatLine[]
}

const MAX = 4
const rooms = new Map<string, Room>()
const userRoom = new Map<number, string>()
const leaveTimers = new Map<number, ReturnType<typeof setTimeout>>()
let chatSeq = 0

export function activeRooms() {
  return [...rooms.values()]
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
async function newCode() {
  for (let i = 0; i < 50; i++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
    // Codes are never reused: unique in the DB forever, so an old/expired code can't land in a new room.
    if (!rooms.has(code) && !(await prisma.room.findUnique({ where: { code } }))) return code
  }
  throw new Error('방 코드를 만들지 못했어요.')
}

function view(r: Room) {
  return {
    code: r.code, hostId: r.hostId, isPublic: r.isPublic, mapId: r.mapId, fillBots: r.fillBots, status: r.status, max: MAX,
    members: r.members, chat: r.chat.slice(-50),
  }
}

function broadcast(io: Server, r: Room) {
  io.to('room:' + r.code).emit('room:update', view(r))
}

function system(r: Room, text: string) {
  r.chat.push({ id: ++chatSeq, nickname: '알림', text, at: Date.now(), system: true })
  if (r.chat.length > 100) r.chat.splice(0, r.chat.length - 100)
}

async function memberFor(userId: number, team: Team): Promise<Member> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const w = await playerWeapon(userId)
  return { userId, nickname: u.nickname, level: u.level, team, ready: false, weapon: w.name, weaponType: w.type, connected: true }
}

function teamCount(r: Room, t: Team) {
  return r.members.filter((m) => m.team === t).length
}

async function closeRoom(io: Server, r: Room) {
  rooms.delete(r.code)
  for (const m of r.members) userRoom.delete(m.userId)
  io.to('room:' + r.code).emit('room:closed')
  io.in('room:' + r.code).socketsLeave('room:' + r.code)
  await prisma.room.update({ where: { id: r.dbId }, data: { status: 'CLOSED', closedAt: new Date() } }).catch(() => {})
}

async function removeMember(io: Server, r: Room, userId: number, reason: string) {
  const m = r.members.find((x) => x.userId === userId)
  if (!m) return
  r.members = r.members.filter((x) => x.userId !== userId)
  userRoom.delete(userId)
  setStatus(userId, 'online')
  io.in('user:' + userId).socketsLeave('room:' + r.code)
  await prisma.roomMember.updateMany({ where: { roomId: r.dbId, userId, leftAt: null }, data: { leftAt: new Date() } })
  if (!r.members.length) return closeRoom(io, r)
  if (r.hostId === userId) {
    r.hostId = r.members[0].userId
    system(r, `${r.members[0].nickname}님이 새 방장이 됐어요.`)
    await prisma.room.update({ where: { id: r.dbId }, data: { hostId: r.hostId } })
  }
  system(r, `${m.nickname}님이 ${reason}`)
  broadcast(io, r)
}

type Ack = (r: { ok: boolean; error?: string; room?: ReturnType<typeof view>; code?: string }) => void

export function setupRooms(io: Server, socket: Socket) {
  const userId = socket.data.userId as number
  const ack = (fn: unknown): Ack => (typeof fn === 'function' ? (fn as Ack) : () => {})
  const myRoom = () => {
    const code = userRoom.get(userId)
    return code ? rooms.get(code) : undefined
  }

  // Reconnect: put the socket back into its room.
  const existing = myRoom()
  if (existing) {
    clearTimeout(leaveTimers.get(userId))
    socket.join('room:' + existing.code)
    const m = existing.members.find((x) => x.userId === userId)
    if (m) m.connected = true
    broadcast(io, existing)
  }

  socket.on('room:current', (fn) => {
    const r = myRoom()
    ack(fn)(r ? { ok: true, room: view(r) } : { ok: false })
  })

  socket.on('room:create', async (raw: unknown, fn) => {
    const reply = ack(fn)
    try {
      if (myRoom()) return reply({ ok: false, error: '이미 다른 방에 들어가 있어요.' })
      if (inBattle(userId)) return reply({ ok: false, error: '전투 중에는 방을 만들 수 없어요.' })
      const o = (raw ?? {}) as { isPublic?: boolean; mapId?: string }
      const code = await newCode()
      const db = await prisma.room.create({ data: { code, hostId: userId, isPublic: o.isPublic === true, mapId: MAPS[o.mapId ?? ''] ? o.mapId! : 'arena' } })
      const r: Room = { dbId: db.id, code, hostId: userId, isPublic: db.isPublic, mapId: db.mapId, fillBots: true, status: 'WAITING', members: [await memberFor(userId, 'RED')], kicked: new Set(), chat: [] }
      system(r, '방이 만들어졌어요. 방 코드를 친구에게 알려 주세요!')
      rooms.set(code, r)
      userRoom.set(userId, code)
      await prisma.roomMember.create({ data: { roomId: db.id, userId, team: 'RED' } })
      socket.join('room:' + code)
      setStatus(userId, 'lobby')
      reply({ ok: true, room: view(r) })
    } catch (e) {
      console.error('[room:create]', e)
      reply({ ok: false, error: '방을 만들지 못했어요.' })
    }
  })

  socket.on('room:join', async (raw: unknown, fn) => {
    const reply = ack(fn)
    const code = String((raw as { code?: string })?.code ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) return reply({ ok: false, error: '방 코드는 영문과 숫자 6자리예요.' })
    const cur = myRoom()
    if (cur?.code === code) return reply({ ok: true, room: view(cur) })
    if (cur) return reply({ ok: false, error: '이미 다른 방에 들어가 있어요. 먼저 나가 주세요.' })
    if (inBattle(userId)) return reply({ ok: false, error: '전투 중에는 방에 들어갈 수 없어요.' })
    const r = rooms.get(code)
    if (!r) return reply({ ok: false, error: '존재하지 않는 방입니다.' })
    if (r.status === 'PLAYING') return reply({ ok: false, error: '이미 시작된 게임입니다.' })
    if (r.members.length >= MAX) return reply({ ok: false, error: '방 인원이 가득 찼습니다.' })
    if (r.kicked.has(userId)) return reply({ ok: false, error: '이 방에서 내보내져서 다시 들어갈 수 없어요.' })
    for (const m of r.members) if (await isBlockedEitherWay(userId, m.userId)) return reply({ ok: false, error: '들어갈 수 없는 방이에요.' })
    const team: Team = teamCount(r, 'RED') <= teamCount(r, 'BLUE') ? 'RED' : 'BLUE'
    const m = await memberFor(userId, team)
    r.members.push(m)
    userRoom.set(userId, code)
    await prisma.roomMember.create({ data: { roomId: r.dbId, userId, team } })
    socket.join('room:' + code)
    setStatus(userId, 'lobby')
    system(r, `${m.nickname}님이 들어왔어요.`)
    broadcast(io, r)
    reply({ ok: true, room: view(r) })
  })

  socket.on('room:leave', async (fn) => {
    const r = myRoom()
    if (r) await removeMember(io, r, userId, '나갔어요.')
    ack(fn)({ ok: true })
  })

  socket.on('room:team', (raw: unknown) => {
    const r = myRoom()
    const team = (raw as { team?: string })?.team
    if (!r || r.status !== 'WAITING' || (team !== 'RED' && team !== 'BLUE')) return
    const m = r.members.find((x) => x.userId === userId)
    if (!m || m.team === team || teamCount(r, team) >= 2) return
    m.team = team
    m.ready = false
    broadcast(io, r)
  })

  socket.on('room:ready', (raw: unknown) => {
    const r = myRoom()
    const m = r?.members.find((x) => x.userId === userId)
    if (!r || !m || r.status !== 'WAITING') return
    m.ready = (raw as { ready?: boolean })?.ready === true
    broadcast(io, r)
  })

  socket.on('room:settings', (raw: unknown) => {
    const r = myRoom()
    if (!r || r.hostId !== userId || r.status !== 'WAITING') return
    const o = (raw ?? {}) as { isPublic?: boolean; mapId?: string; fillBots?: boolean }
    if (typeof o.isPublic === 'boolean') r.isPublic = o.isPublic
    if (o.mapId && (MAPS[o.mapId] || o.mapId === 'random')) r.mapId = o.mapId
    if (typeof o.fillBots === 'boolean') r.fillBots = o.fillBots
    void prisma.room.update({ where: { id: r.dbId }, data: { isPublic: r.isPublic, mapId: r.mapId } })
    broadcast(io, r)
  })

  socket.on('room:kick', async (raw: unknown) => {
    const r = myRoom()
    const target = Number((raw as { userId?: number })?.userId)
    if (!r || r.hostId !== userId || target === userId || r.status !== 'WAITING') return
    r.kicked.add(target)
    io.to('user:' + target).emit('room:kicked', { code: r.code })
    await removeMember(io, r, target, '방에서 내보내졌어요.')
  })

  socket.on('room:transfer', (raw: unknown) => {
    const r = myRoom()
    const target = Number((raw as { userId?: number })?.userId)
    if (!r || r.hostId !== userId || !r.members.some((m) => m.userId === target)) return
    r.hostId = target
    system(r, `${r.members.find((m) => m.userId === target)!.nickname}님이 새 방장이 됐어요.`)
    void prisma.room.update({ where: { id: r.dbId }, data: { hostId: target } })
    broadcast(io, r)
  })

  socket.on('room:chat', (raw: unknown) => {
    const r = myRoom()
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
    if (!r || !text) return
    const m = r.members.find((x) => x.userId === userId)!
    r.chat.push({ id: ++chatSeq, nickname: m.nickname, text: filterChat(text), at: Date.now() })
    if (r.chat.length > 100) r.chat.splice(0, r.chat.length - 100)
    broadcast(io, r)
  })

  socket.on('room:invite', async (raw: unknown, fn) => {
    const reply = ack(fn)
    const r = myRoom()
    const target = Number((raw as { userId?: number })?.userId)
    if (!r) return reply({ ok: false, error: '먼저 방에 들어가 주세요.' })
    const t = await prisma.user.findFirst({ where: { id: target, deletedAt: null } })
    if (!t) return reply({ ok: false, error: '플레이어를 찾을 수 없어요.' })
    if (await isBlockedEitherWay(userId, target)) return reply({ ok: false, error: '초대할 수 없는 사용자입니다.' })
    const pref = parseJson<{ allowInvites?: string }>(t.settings, {}).allowInvites ?? 'friends'
    const friend = await areFriends(userId, target)
    if (pref === 'none' || (pref === 'friends' && !friend)) return reply({ ok: false, error: '초대할 수 없는 사용자입니다.' })
    const from = r.members.find((m) => m.userId === userId)!.nickname
    io.to('user:' + target).emit('room:invited', { code: r.code, from })
    await notify(prisma, target, 'ROOM_INVITE', `${from}님이 게임에 초대했어요`, `방 코드: ${r.code}`, { code: r.code })
    reply({ ok: true })
  })

  socket.on('room:start', async (fn) => {
    const reply = ack(fn)
    const r = myRoom()
    if (!r || r.hostId !== userId) return reply({ ok: false, error: '방장만 게임을 시작할 수 있어요.' })
    if (r.status !== 'WAITING') return reply({ ok: false, error: '이미 시작된 게임입니다.' })
    const others = r.members.filter((m) => m.userId !== userId)
    if (others.some((m) => !m.ready)) return reply({ ok: false, error: '모든 참가자가 준비해야 시작할 수 있어요.' })
    const red = teamCount(r, 'RED'), blue = teamCount(r, 'BLUE')
    if (!r.fillBots && (red === 0 || blue === 0)) return reply({ ok: false, error: '인원이 부족해요. 양 팀에 1명 이상 있어야 해요. (또는 "빈 자리 AI로 채우기"를 켜 주세요)' })
    if (r.members.length < 2 && !r.fillBots) return reply({ ok: false, error: '인원이 부족해요. 친구를 기다려 주세요.' })
    const players: BattlePlayerInfo[] = []
    for (const m of r.members) {
      players.push({ id: 'p' + m.userId, userId: m.userId, name: m.nickname, level: m.level, team: m.team, bot: false, look: await playerLook(m.userId), weapon: await playerWeapon(m.userId) })
    }
    if (r.fillBots) {
      let i = 0
      for (const team of ['RED', 'BLUE'] as const) {
        while (players.filter((p) => p.team === team).length < 2) {
          const seed = crypto.randomInt(1000)
          players.push({ id: 'b' + i, userId: null, name: `AI 도우미 ${i + 1}`, level: 10, team, bot: true, look: [{ slot: 'top', effect: { color: PALETTE[2 + (seed % 12)] } }], weapon: botWeapon(WEAPON_TYPES[seed % WEAPON_TYPES.length], seed) })
          i++
        }
      }
    }
    r.status = 'PLAYING'
    for (const m of r.members) setStatus(m.userId, 'playing')
    void prisma.room.update({ where: { id: r.dbId }, data: { status: 'PLAYING' } })
    broadcast(io, r)
    const mapIds = Object.keys(MAPS)
    const mapId = r.mapId === 'random' ? mapIds[crypto.randomInt(mapIds.length)] : r.mapId
    await launchBattle(io, {
      mode: 'FRIEND', mapId, difficulty: r.fillBots ? 'normal' : null, roomId: r.dbId, players,
      onDone: () => {
        // Back to the waiting room after the match.
        if (!rooms.has(r.code)) return
        r.status = 'WAITING'
        for (const m of r.members) {
          m.ready = false
          setStatus(m.userId, 'lobby')
        }
        void prisma.room.update({ where: { id: r.dbId }, data: { status: 'WAITING' } })
        system(r, '전투가 끝났어요. 한 판 더?')
        broadcast(io, r)
      },
    })
    reply({ ok: true })
  })

  socket.on('room:public', (fn) => {
    ack(fn)({ ok: true, ...({ rooms: [...rooms.values()].filter((r) => r.isPublic && r.status === 'WAITING' && r.members.length < MAX).map((r) => ({ code: r.code, host: r.members.find((m) => m.userId === r.hostId)?.nickname, count: r.members.length, mapId: r.mapId })) } as object) })
  })

  socket.on('disconnect', () => {
    const r = myRoom()
    if (!r) return
    const m = r.members.find((x) => x.userId === userId)
    if (m) m.connected = false
    broadcast(io, r)
    leaveTimers.set(userId, setTimeout(() => {
      const still = myRoom()
      if (still && still.status === 'WAITING' && !still.members.find((x) => x.userId === userId)?.connected) void removeMember(io, still, userId, '연결이 끊어졌어요.')
    }, 30_000))
  })
}
