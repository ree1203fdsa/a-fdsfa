import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.ts'
import { bad, conflict, forbidden, idParam, notFound, parse, rateLimit } from '../http.ts'
import { getBattle, getRewards } from '../services/config.ts'
import { grant, notify } from '../services/economy.ts'
import { visiblePresence } from '../realtime/presence.ts'

export const friendsRouter = Router()
export const blocksRouter = Router()

const MAX_FRIENDS = 100
const pub = (u: { id: number; nickname: string; level: number }) => ({ id: u.id, nickname: u.nickname, level: u.level })

export async function isBlockedEitherWay(a: number, b: number) {
  return (await prisma.block.count({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } })) > 0
}

export async function areFriends(a: number, b: number) {
  return (await prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } })) > 0
}

friendsRouter.get('/', async (req, res) => {
  const me = req.user!.id
  const [rows, blocks, recent] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ requesterId: me }, { addresseeId: me }] },
      include: { requester: { select: { id: true, nickname: true, level: true, deletedAt: true } }, addressee: { select: { id: true, nickname: true, level: true, deletedAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.block.findMany({ where: { blockerId: me }, include: { blocked: { select: { id: true, nickname: true, level: true } } } }),
    prisma.matchParticipant.findMany({ where: { userId: me, match: { mode: 'FRIEND' } }, orderBy: { createdAt: 'desc' }, take: 10, select: { matchId: true } }),
  ])
  const friends = await Promise.all(
    rows.filter((r) => r.status === 'ACCEPTED').map(async (r) => {
      const other = r.requesterId === me ? r.addressee : r.requester
      return { ...pub(other), since: r.respondedAt ?? r.createdAt, status: await visiblePresence(other.id) }
    }),
  )
  const order = { playing: 0, lobby: 1, online: 2, away: 3, offline: 4 }
  friends.sort((a, b) => order[a.status] - order[b.status] || a.nickname.localeCompare(b.nickname))
  const recentIds = recent.length
    ? await prisma.matchParticipant.findMany({ where: { matchId: { in: recent.map((r) => r.matchId) }, userId: { not: me } }, include: { user: { select: { id: true, nickname: true, level: true } } } })
    : []
  const recentPlayers = [...new Map(recentIds.filter((r) => r.user).map((r) => [r.user!.id, pub(r.user!)])).values()]
  res.json({
    friends,
    incoming: rows.filter((r) => r.status === 'PENDING' && r.addresseeId === me).map((r) => ({ requestId: r.id, ...pub(r.requester), at: r.createdAt })),
    outgoing: rows.filter((r) => r.status === 'PENDING' && r.requesterId === me).map((r) => ({ requestId: r.id, ...pub(r.addressee), at: r.createdAt })),
    blocked: blocks.map((b) => pub(b.blocked)),
    recent: recentPlayers,
  })
})

friendsRouter.get('/search', rateLimit('friend-search', 60, 60_000), async (req, res) => {
  const { q } = parse(z.object({ q: z.string().trim().min(1, '닉네임을 입력해 주세요.').max(20) }), req.query)
  const me = req.user!.id
  const users = await prisma.user.findMany({
    where: { nickname: { contains: q }, id: { not: me }, deletedAt: null, status: { not: 'BANNED' } },
    take: 20, select: { id: true, nickname: true, level: true },
  })
  const rels = await prisma.friendship.findMany({ where: { OR: [{ requesterId: me, addresseeId: { in: users.map((u) => u.id) } }, { addresseeId: me, requesterId: { in: users.map((u) => u.id) } }] } })
  const blocked = await prisma.block.findMany({ where: { OR: [{ blockerId: me }, { blockedId: me }] } })
  res.json(users
    .filter((u) => !blocked.some((b) => b.blockedId === me && b.blockerId === u.id))
    .map((u) => {
      const r = rels.find((x) => x.requesterId === u.id || x.addresseeId === u.id)
      const relation = blocked.some((b) => b.blockerId === me && b.blockedId === u.id) ? 'blocked' : !r ? 'none' : r.status === 'ACCEPTED' ? 'friend' : r.requesterId === me ? 'sent' : 'received'
      return { ...pub(u), relation }
    }))
})

friendsRouter.post('/request', rateLimit('friend-request', 30, 3600_000), async (req, res) => {
  const { userId } = parse(z.object({ userId: z.number().int().positive() }), req.body)
  const me = req.user!.id
  if (userId === me) throw bad('자기 자신에게는 친구 요청을 보낼 수 없어요.')
  const target = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } })
  if (!target) throw notFound('플레이어를 찾을 수 없어요.')
  if (await isBlockedEitherWay(me, userId)) throw forbidden('친구 요청을 보낼 수 없는 사용자예요.')
  const existing = await prisma.friendship.findFirst({ where: { OR: [{ requesterId: me, addresseeId: userId }, { requesterId: userId, addresseeId: me }] } })
  if (existing?.status === 'ACCEPTED') throw conflict('이미 친구예요.')
  if (existing && existing.requesterId === me) throw conflict('이미 친구 요청을 보냈어요.')
  if (existing && existing.addresseeId === me) return void res.json(await accept(me, existing.id))
  const count = await prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] } })
  if (count >= MAX_FRIENDS) throw bad(`친구는 최대 ${MAX_FRIENDS}명까지 맺을 수 있어요.`)
  const f = await prisma.friendship.create({ data: { requesterId: me, addresseeId: userId } })
  await notify(prisma, userId, 'FRIEND_REQUEST', `${req.user!.nickname}님이 친구 요청을 보냈어요`, '친구 화면에서 수락하거나 거절할 수 있어요.', { requestId: f.id, from: me })
  res.json({ ok: true, requestId: f.id })
})

async function accept(me: number, requestId: number) {
  const rewards = await getRewards()
  const cfg = await getBattle()
  return prisma.$transaction(async (tx) => {
    const f = await tx.friendship.findFirst({ where: { id: requestId, addresseeId: me, status: 'PENDING' }, include: { requester: true, addressee: true } })
    if (!f) throw notFound('친구 요청을 찾을 수 없어요.')
    await tx.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } })
    // Friend-add coins are paid once per pair and only for the first N friends (stops alt-account farming).
    const pair = [f.requesterId, f.addresseeId].sort((a, b) => a - b).join('-')
    for (const uid of [f.requesterId, f.addresseeId]) {
      const paid = await tx.rewardLedger.count({ where: { userId: uid, key: { startsWith: 'friend:' } } })
      if (paid < cfg.maxFriendRewardsCount) await grant(tx, uid, `friend:${pair}`, rewards.friendAddCoins, 0, '친구 추가 보상')
    }
    await notify(tx, f.requesterId, 'FRIEND_ACCEPT', `${f.addressee.nickname}님과 친구가 됐어요!`, '함께 게임을 해 보세요.')
    return { ok: true }
  })
}

friendsRouter.post('/:id/accept', async (req, res) => {
  res.json(await accept(req.user!.id, parse(idParam, req.params.id)))
})

friendsRouter.post('/:id/decline', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const r = await prisma.friendship.deleteMany({ where: { id, status: 'PENDING', OR: [{ addresseeId: req.user!.id }, { requesterId: req.user!.id }] } })
  if (!r.count) throw notFound('친구 요청을 찾을 수 없어요.')
  res.json({ ok: true })
})

friendsRouter.delete('/:userId', async (req, res) => {
  const other = parse(idParam, req.params.userId)
  const me = req.user!.id
  await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: me, addresseeId: other }, { requesterId: other, addresseeId: me }] } })
  res.json({ ok: true })
})

blocksRouter.post('/', async (req, res) => {
  const { userId } = parse(z.object({ userId: z.number().int().positive() }), req.body)
  const me = req.user!.id
  if (userId === me) throw bad('자기 자신은 차단할 수 없어요.')
  await prisma.$transaction([
    prisma.friendship.deleteMany({ where: { OR: [{ requesterId: me, addresseeId: userId }, { requesterId: userId, addresseeId: me }] } }),
    prisma.block.upsert({ where: { blockerId_blockedId: { blockerId: me, blockedId: userId } }, create: { blockerId: me, blockedId: userId }, update: {} }),
  ])
  res.json({ ok: true })
})

blocksRouter.delete('/:userId', async (req, res) => {
  await prisma.block.deleteMany({ where: { blockerId: req.user!.id, blockedId: parse(idParam, req.params.userId) } })
  res.json({ ok: true })
})
