import { prisma, parseJson } from '../db.ts'
import { emitToUser } from '../services/hub.ts'

export type Presence = 'online' | 'offline' | 'playing' | 'lobby' | 'away'

const sockets = new Map<number, number>()
const status = new Map<number, Presence>()

export function presenceOf(userId: number): Presence {
  return (sockets.get(userId) ?? 0) > 0 ? status.get(userId) ?? 'online' : 'offline'
}

async function friendIds(userId: number) {
  const rows = await prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] } })
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
}

/** What friends see: hidden users always appear offline. */
export async function visiblePresence(userId: number): Promise<Presence> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } })
  if (parseJson<{ showOnline?: boolean }>(u?.settings, {}).showOnline === false) return 'offline'
  return presenceOf(userId)
}

async function broadcast(userId: number) {
  const p = await visiblePresence(userId)
  for (const f of await friendIds(userId)) emitToUser(f, 'friend:status', { userId, status: p })
}

export function connected(userId: number) {
  sockets.set(userId, (sockets.get(userId) ?? 0) + 1)
  if (!status.has(userId) || status.get(userId) === 'away') status.set(userId, 'online')
  void broadcast(userId)
}

export function disconnected(userId: number) {
  const n = (sockets.get(userId) ?? 1) - 1
  if (n <= 0) {
    sockets.delete(userId)
    status.delete(userId)
  } else sockets.set(userId, n)
  void broadcast(userId)
}

export function setStatus(userId: number, s: Exclude<Presence, 'offline'>) {
  if (status.get(userId) === s) return
  status.set(userId, s)
  void broadcast(userId)
}

export function onlineCount() {
  return sockets.size
}
