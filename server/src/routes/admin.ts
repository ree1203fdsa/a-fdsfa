import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { MISSION_GOALS, ROLES } from '../../../shared/constants.ts'
import { DEFAULT_BATTLE, DEFAULT_REWARDS, levelFromXp, totalXpForLevel } from '../../../shared/progression.ts'
import { MAP_IDS } from '../../../shared/maps.ts'
import { adminView, hasPermission, recoveryCode, requirePerm, roleRank, sha256 } from '../auth.ts'
import { prisma, parseJson } from '../db.ts'
import { bad, forbidden, idParam, notFound, parse } from '../http.ts'
import { adminLog, changeCoins, notify } from '../services/economy.ts'
import { getBattle, getRewards, setBattle, setRewards } from '../services/config.ts'
import { socketCount } from '../services/hub.ts'
import { aiAvailable, VISION_MODEL } from '../services/ai.ts'
import { activeBattles } from '../game/matches.ts'
import { activeRooms } from '../realtime/rooms.ts'
import { onlineCount } from '../realtime/presence.ts'
import { contestStatus } from './content.ts'

export const adminRouter = Router()
const started = Date.now()
const me = (req: Request) => req.admin!
const page = (q: unknown) => parse(z.object({ page: z.coerce.number().int().min(1).default(1), q: z.string().max(40).optional() }).passthrough(), q)
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

adminRouter.use(requirePerm('dashboard'))

adminRouter.get('/me', (req, res) => res.json({ admin: adminView(me(req)) }))

// ── dashboard ──
adminRouter.get('/dashboard', async (_req, res) => {
  const today = dayStart()
  const [users, newUsers, matches, weapons, issued, spent, reports, logs] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.match.count({ where: { startedAt: { gte: today } } }),
    prisma.weapon.count({ where: { createdAt: { gte: today } } }),
    prisma.coinTransaction.aggregate({ where: { createdAt: { gte: today }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.coinTransaction.aggregate({ where: { createdAt: { gte: today }, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.report.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 5, include: { reporter: { select: { nickname: true } } } }),
    prisma.adminLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { admin: { select: { nickname: true } } } }),
  ])
  res.json({
    users, online: onlineCount(), newUsers, matches, weapons, rooms: activeRooms().length, battles: activeBattles().length,
    coinsIssued: issued._sum.amount ?? 0, coinsSpent: -(spent._sum.amount ?? 0),
    server: { uptimeSec: Math.round((Date.now() - started) / 1000), memMb: Math.round(process.memoryUsage().rss / 1048576), sockets: socketCount() },
    reports: reports.map((r) => ({ id: r.id, type: r.targetType, reason: r.reason, reporter: r.reporter.nickname, at: r.createdAt })),
    logs: logs.map((l) => ({ id: l.id, admin: l.admin.nickname, action: l.action, target: l.targetType ? `${l.targetType} ${l.targetId}` : '', at: l.createdAt })),
  })
})

// ── users ──
const userRow = (u: { id: number; username: string; nickname: string; level: number; coins: number; role: string; status: string; suspendedUntil: Date | null; createdAt: Date; lastLoginAt: Date | null }) => ({
  id: u.id, username: u.username, nickname: u.nickname, level: u.level, coins: u.coins, role: u.role, status: u.status,
  suspendedUntil: u.suspendedUntil, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
})

adminRouter.get('/users', requirePerm('users.view'), async (req, res) => {
  const { page: p, q } = page(req.query)
  const where = { deletedAt: null, ...(q ? { OR: [{ nickname: { contains: q } }, { username: { contains: q.toLowerCase() } }] } : {}) }
  const [rows, total] = await Promise.all([prisma.user.findMany({ where, orderBy: { id: 'desc' }, skip: (p - 1) * 30, take: 30 }), prisma.user.count({ where })])
  res.json({ rows: rows.map(userRow), total, page: p, pages: Math.ceil(total / 30) })
})

adminRouter.get('/users/:id', requirePerm('users.view'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const u = await prisma.user.findUnique({ where: { id } })
  if (!u) throw notFound('회원을 찾을 수 없어요.')
  const [coins, logins, matches, reports, weapons, adminActs] = await Promise.all([
    prisma.coinTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.loginHistory.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 15 }),
    prisma.matchParticipant.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 10, include: { match: { select: { mode: true, mapId: true } } } }),
    prisma.report.findMany({ where: { targetUserId: id }, orderBy: { createdAt: 'desc' }, take: 10, include: { reporter: { select: { nickname: true } } } }),
    prisma.weapon.count({ where: { userId: id, deletedAt: null } }),
    prisma.adminLog.findMany({ where: { targetType: 'USER', targetId: String(id) }, orderBy: { createdAt: 'desc' }, take: 10, include: { admin: { select: { nickname: true } } } }),
  ])
  res.json({
    user: { ...userRow(u), xp: u.xp, statusReason: u.statusReason, stats: { games: u.totalGames, wins: u.wins, losses: u.losses, weapons: u.weaponsCreated }, inventorySlots: u.inventorySlots },
    weapons, coins, logins: logins.map((l) => ({ ...l, userAgent: l.userAgent?.slice(0, 80) })), matches, reports, adminActs,
  })
})

/** Staff may only act on accounts ranked below themselves (the super admin may act on anyone else). */
async function target(req: Request, id: number) {
  const u = await prisma.user.findUnique({ where: { id } })
  if (!u || u.deletedAt) throw notFound('회원을 찾을 수 없어요.')
  if (u.id === me(req).id) throw bad('자기 자신에게는 할 수 없어요.')
  if (me(req).role !== 'SUPER_ADMIN' && roleRank(u.role) >= roleRank(me(req).role)) throw forbidden('같거나 높은 등급의 운영진은 관리할 수 없어요.')
  return u
}

adminRouter.post('/users/:id/suspend', requirePerm('users.suspend'), async (req, res) => {
  const u = await target(req, parse(idParam, req.params.id))
  const { days, reason } = parse(z.object({ days: z.number().int().min(1).max(365), reason: z.string().trim().min(2, '사유를 적어 주세요.').max(200) }), req.body)
  if (!hasPermission(me(req).role, 'users.ban') && days > 7) throw forbidden('모더레이터·운영자는 최대 7일까지 정지할 수 있어요.')
  const until = new Date(Date.now() + days * 86400_000)
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED', suspendedUntil: until, statusReason: reason } }),
    prisma.session.deleteMany({ where: { userId: u.id } }),
  ])
  await adminLog(prisma, me(req).id, `계정 ${days}일 정지`, 'USER', u.id, reason)
  res.json({ ok: true })
})

adminRouter.post('/users/:id/ban', requirePerm('users.ban'), async (req, res) => {
  const u = await target(req, parse(idParam, req.params.id))
  const { reason } = parse(z.object({ reason: z.string().trim().min(2, '사유를 적어 주세요.').max(200) }), req.body)
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { status: 'BANNED', statusReason: reason } }),
    prisma.session.deleteMany({ where: { userId: u.id } }),
  ])
  await adminLog(prisma, me(req).id, '계정 영구 차단', 'USER', u.id, reason)
  res.json({ ok: true })
})

adminRouter.post('/users/:id/restore', requirePerm('users.suspend'), async (req, res) => {
  const u = await target(req, parse(idParam, req.params.id))
  if (u.status === 'BANNED' && !hasPermission(me(req).role, 'users.ban')) throw forbidden('영구 차단 해제는 관리자 이상만 할 수 있어요.')
  await prisma.user.update({ where: { id: u.id }, data: { status: 'ACTIVE', suspendedUntil: null, statusReason: null } })
  await adminLog(prisma, me(req).id, '정지/차단 해제', 'USER', u.id)
  res.json({ ok: true })
})

adminRouter.post('/users/:id/coins', requirePerm('users.economy'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const u = await prisma.user.findUnique({ where: { id } })
  if (!u) throw notFound('회원을 찾을 수 없어요.')
  const { amount, reason } = parse(z.object({ amount: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, '0은 지급할 수 없어요.'), reason: z.string().trim().min(2, '사유를 적어 주세요.').max(200) }), req.body)
  await prisma.$transaction(async (tx) => {
    await changeCoins(tx, id, amount, `운영 ${amount > 0 ? '지급' : '회수'}: ${reason}`, 'admin', me(req).id)
    if (amount > 0) await notify(tx, id, 'REWARD', `운영팀이 ${amount}코인을 보냈어요`, reason)
  })
  await adminLog(prisma, me(req).id, `코인 ${amount > 0 ? '지급' : '회수'} ${amount}`, 'USER', id, reason)
  res.json({ ok: true })
})

adminRouter.post('/users/:id/xp', requirePerm('users.economy'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const body = parse(z.object({ level: z.number().int().min(1).max(99).optional(), xp: z.number().int().min(0).max(10_000_000).optional(), reason: z.string().trim().min(2, '사유를 적어 주세요.').max(200) }), req.body)
  const xp = body.level ? totalXpForLevel(body.level) : body.xp
  if (xp === undefined) throw bad('레벨이나 경험치를 입력해 주세요.')
  await prisma.user.update({ where: { id }, data: { xp, level: levelFromXp(xp).level } })
  await adminLog(prisma, me(req).id, body.level ? `레벨을 ${body.level}로 조정` : `경험치를 ${xp}로 조정`, 'USER', id, body.reason)
  res.json({ ok: true })
})

adminRouter.post('/users/:id/role', requirePerm('users.role'), async (req, res) => {
  const u = await target(req, parse(idParam, req.params.id))
  const { role } = parse(z.object({ role: z.enum(ROLES) }), req.body)
  if (u.role === 'SUPER_ADMIN' && (await prisma.user.count({ where: { role: 'SUPER_ADMIN', deletedAt: null } })) <= 1) throw bad('마지막 최고 관리자의 등급은 내릴 수 없어요.')
  await prisma.$transaction([prisma.user.update({ where: { id: u.id }, data: { role } }), prisma.session.deleteMany({ where: { userId: u.id, kind: 'ADMIN' } })])
  await adminLog(prisma, me(req).id, `등급 변경 ${u.role} → ${role}`, 'USER', u.id)
  res.json({ ok: true })
})

// ── password reset requests (admins never see passwords; they hand out a one-time code) ──
adminRouter.get('/resets', requirePerm('users.password'), async (_req, res) => {
  const rows = await prisma.passwordResetRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { user: { select: { username: true, nickname: true } } } })
  res.json(rows.map((r) => ({ id: r.id, status: r.status, message: r.message, user: r.user, createdAt: r.createdAt, expiresAt: r.expiresAt })))
})

adminRouter.post('/resets/:id/issue', requirePerm('users.password'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const r = await prisma.passwordResetRequest.findUnique({ where: { id } })
  if (!r || r.status !== 'PENDING') throw bad('처리할 수 없는 요청이에요.')
  const code = recoveryCode()
  await prisma.passwordResetRequest.update({ where: { id }, data: { status: 'ISSUED', codeHash: sha256(code), expiresAt: new Date(Date.now() + 86400_000), handledBy: me(req).id, handledAt: new Date() } })
  await adminLog(prisma, me(req).id, '비밀번호 재설정 임시 코드 발급', 'USER', r.userId)
  res.json({ code, expiresInHours: 24 })
})

adminRouter.post('/resets/:id/reject', requirePerm('users.password'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  await prisma.passwordResetRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', handledBy: me(req).id, handledAt: new Date() } })
  await adminLog(prisma, me(req).id, '비밀번호 재설정 요청 거절', 'RESET', id)
  res.json({ ok: true })
})

// ── weapons ──
adminRouter.get('/weapons', requirePerm('weapons.moderate'), async (req, res) => {
  const { page: p, q, filter } = page(req.query) as { page: number; q?: string; filter?: string }
  const where = {
    ...(filter === 'deleted' ? { deletedAt: { not: null } } : { deletedAt: null }),
    ...(filter === 'hidden' ? { hidden: true } : {}),
    ...(q ? { OR: [{ name: { contains: q } }, { user: { nickname: { contains: q } } }] } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.weapon.findMany({ where, orderBy: { id: 'desc' }, skip: (p - 1) * 24, take: 24, include: { user: { select: { nickname: true } } } }),
    prisma.weapon.count({ where }),
  ])
  res.json({
    rows: rows.map((w) => ({ id: w.id, name: w.name, type: w.type, owner: w.user.nickname, userId: w.userId, previewPng: w.previewPng, hidden: w.hidden, hiddenReason: w.hiddenReason, deleted: Boolean(w.deletedAt), createdAt: w.createdAt, stats: { attack: w.attack, speed: w.speed, area: w.area, range: w.range, weight: w.weight, defense: w.defense } })),
    total, pages: Math.ceil(total / 24),
  })
})

adminRouter.post('/weapons/:id/hide', requirePerm('weapons.moderate'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { hidden, reason } = parse(z.object({ hidden: z.boolean(), reason: z.string().max(200).default('') }), req.body)
  await prisma.weapon.update({ where: { id }, data: { hidden, hiddenReason: hidden ? reason : null } })
  await adminLog(prisma, me(req).id, hidden ? '무기 숨김' : '무기 숨김 해제', 'WEAPON', id, reason)
  res.json({ ok: true })
})

adminRouter.post('/weapons/:id/delete', requirePerm('weapons.delete'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { restore } = parse(z.object({ restore: z.boolean().default(false) }), req.body)
  await prisma.weapon.update({ where: { id }, data: { deletedAt: restore ? null : new Date() } })
  await adminLog(prisma, me(req).id, restore ? '무기 복구' : '무기 삭제', 'WEAPON', id)
  res.json({ ok: true })
})

// ── shop ──
const itemSchema = z.object({
  category: z.enum(['TOOL', 'COSMETIC', 'PROFILE', 'SLOT']), slot: z.string().max(20).nullable().optional(), name: z.string().trim().min(1).max(30),
  description: z.string().max(200).default(''), price: z.number().int().min(0).max(1_000_000), effect: z.record(z.string(), z.unknown()).default({}),
  onSale: z.boolean().default(true), limited: z.boolean().default(false), stock: z.number().int().min(0).nullable().optional(), sortOrder: z.number().int().default(0),
})

adminRouter.get('/items', requirePerm('shop'), async (_req, res) => {
  const items = await prisma.item.findMany({ where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { purchases: true } } } })
  res.json(items.map((i) => ({ ...i, effect: parseJson(i.effect, {}), sold: i._count.purchases })))
})

adminRouter.post('/items', requirePerm('shop'), async (req, res) => {
  const body = parse(itemSchema.extend({ id: z.string().regex(/^[a-z0-9_]{3,40}$/, '상품 ID는 영문 소문자·숫자·_ 3~40자예요.') }), req.body)
  if (await prisma.item.findUnique({ where: { id: body.id } })) throw bad('이미 있는 상품 ID예요.')
  await prisma.item.create({ data: { ...body, effect: JSON.stringify(body.effect) } })
  await adminLog(prisma, me(req).id, '상품 등록', 'ITEM', body.id, body.name)
  res.json({ ok: true })
})

adminRouter.patch('/items/:id', requirePerm('shop'), async (req, res) => {
  const id = String(req.params.id)
  const body = parse(itemSchema.partial(), req.body)
  const before = await prisma.item.findUnique({ where: { id } })
  if (!before) throw notFound('상품을 찾을 수 없어요.')
  await prisma.item.update({ where: { id }, data: { ...body, effect: body.effect ? JSON.stringify(body.effect) : undefined } })
  const changes = [body.price !== undefined && body.price !== before.price && `가격 ${before.price}→${body.price}`, body.onSale !== undefined && body.onSale !== before.onSale && (body.onSale ? '판매 재개' : '판매 중지')].filter(Boolean).join(', ')
  await adminLog(prisma, me(req).id, '상품 수정', 'ITEM', id, changes)
  res.json({ ok: true })
})

adminRouter.delete('/items/:id', requirePerm('shop'), async (req, res) => {
  const id = String(req.params.id)
  if (id === 'tool_ballpoint') throw bad('기본 펜은 지울 수 없어요.')
  await prisma.item.update({ where: { id }, data: { deletedAt: new Date(), onSale: false } })
  await adminLog(prisma, me(req).id, '상품 삭제', 'ITEM', id)
  res.json({ ok: true })
})

adminRouter.get('/purchases', requirePerm('shop'), async (req, res) => {
  const { page: p } = page(req.query)
  const rows = await prisma.purchase.findMany({ orderBy: { createdAt: 'desc' }, skip: (p - 1) * 50, take: 50, include: { user: { select: { nickname: true } }, item: { select: { name: true } } } })
  res.json(rows.map((r) => ({ id: r.id, user: r.user.nickname, userId: r.userId, item: r.item.name, itemId: r.itemId, price: r.price, createdAt: r.createdAt, refundedAt: r.refundedAt, refundReason: r.refundReason })))
})

adminRouter.post('/purchases/:id/refund', requirePerm('shop'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { reason } = parse(z.object({ reason: z.string().trim().min(2, '사유를 적어 주세요.').max(200) }), req.body)
  await prisma.$transaction(async (tx) => {
    const p = await tx.purchase.findUnique({ where: { id }, include: { item: true } })
    if (!p || p.refundedAt) throw bad('환불할 수 없는 구매예요.')
    await tx.purchase.update({ where: { id }, data: { refundedAt: new Date(), refundedBy: me(req).id, refundReason: reason } })
    if (p.item.category === 'SLOT') {
      const slots = parseJson<{ slots?: number }>(p.item.effect, {}).slots ?? 5
      await tx.user.update({ where: { id: p.userId }, data: { inventorySlots: { decrement: slots } } })
    } else await tx.userItem.deleteMany({ where: { userId: p.userId, itemId: p.itemId } })
    await changeCoins(tx, p.userId, p.price, `환불: ${p.item.name}`, 'refund', id)
    await notify(tx, p.userId, 'REWARD', `${p.item.name} 구매가 환불됐어요`, `${p.price}코인을 돌려드렸어요. 사유: ${reason}`)
  })
  await adminLog(prisma, me(req).id, '구매 환불', 'PURCHASE', id, reason)
  res.json({ ok: true })
})

// ── generic CRUD for missions, events, notices, contests ──
const date = z.coerce.date()
const crud = {
  missions: {
    perm: 'missions' as const, label: '미션',
    schema: z.object({ title: z.string().trim().min(1).max(60), description: z.string().max(200).default(''), period: z.enum(['DAILY', 'WEEKLY', 'EVENT']), goalType: z.enum(MISSION_GOALS), goalCount: z.number().int().min(1).max(1000), rewardCoins: z.number().int().min(0).max(100000), rewardXp: z.number().int().min(0).max(100000), active: z.boolean().default(true), startAt: date.nullable().optional(), endAt: date.nullable().optional(), eventId: z.number().int().nullable().optional(), sortOrder: z.number().int().default(0) }),
    model: () => prisma.mission,
  },
  events: {
    perm: 'events' as const, label: '이벤트',
    schema: z.object({ title: z.string().trim().min(1).max(60), description: z.string().max(300).default(''), startAt: date, endAt: date, active: z.boolean().default(true), rewardCoins: z.number().int().min(0).default(0), rewardXp: z.number().int().min(0).default(0), coinBonus: z.number().min(1).max(5).default(1) }),
    model: () => prisma.gameEvent,
  },
  notices: {
    perm: 'notices' as const, label: '공지',
    schema: z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(3000), pinned: z.boolean().default(false), publishAt: date.default(() => new Date()), notifyAll: z.boolean().default(false) }),
    model: () => prisma.notice,
  },
  contests: {
    perm: 'contests' as const, label: '무기 대회',
    schema: z.object({ title: z.string().trim().min(1).max(60), category: z.enum(['cool', 'creative', 'cute', 'unique', 'weekly', 'event']), description: z.string().max(300).default(''), submitStartAt: date, submitEndAt: date, voteEndAt: date, rewards: z.array(z.number().int().min(0)).max(10).default([1000, 600, 300]) }),
    model: () => prisma.contest,
  },
}

for (const [name, def] of Object.entries(crud)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = () => def.model() as any
  const schema = def.schema as unknown as z.ZodObject<z.ZodRawShape>
  adminRouter.get(`/${name}`, requirePerm(def.perm), async (_req, res) => {
    const rows = await m().findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' }, take: 200 })
    res.json(rows.map((r: Record<string, unknown>) => (name === 'contests' ? { ...r, rewards: parseJson(r.rewards as string, []), status: contestStatus(r as never) } : r)))
  })
  adminRouter.post(`/${name}`, requirePerm(def.perm), async (req, res) => {
    const body = parse(schema, req.body) as Record<string, unknown>
    if (name === 'notices') body.createdById = me(req).id
    if (name === 'contests') body.rewards = JSON.stringify(body.rewards)
    const row = await m().create({ data: body })
    await adminLog(prisma, me(req).id, `${def.label} 생성`, name.toUpperCase(), row.id, String(body.title ?? ''))
    res.json({ ok: true, id: row.id })
  })
  adminRouter.patch(`/${name}/:id`, requirePerm(def.perm), async (req, res) => {
    const id = parse(idParam, req.params.id)
    const body = parse(schema.partial(), req.body) as Record<string, unknown>
    if (name === 'contests' && body.rewards) body.rewards = JSON.stringify(body.rewards)
    if (name === 'notices' && body.notifyAll) body.notifiedAt = null
    await m().update({ where: { id }, data: body })
    await adminLog(prisma, me(req).id, `${def.label} 수정`, name.toUpperCase(), id)
    res.json({ ok: true })
  })
  adminRouter.delete(`/${name}/:id`, requirePerm(def.perm), async (req, res) => {
    const id = parse(idParam, req.params.id)
    await m().update({ where: { id }, data: { deletedAt: new Date(), ...(name === 'missions' || name === 'events' ? { active: false } : {}) } })
    await adminLog(prisma, me(req).id, `${def.label} 삭제`, name.toUpperCase(), id)
    res.json({ ok: true })
  })
}

// ── game management ──
adminRouter.get('/game', requirePerm('game'), async (_req, res) => {
  res.json({
    rooms: activeRooms().map((r) => ({ code: r.code, status: r.status, isPublic: r.isPublic, mapId: r.mapId, members: r.members.map((m) => `${m.nickname}(${m.team})`) })),
    battles: activeBattles().map((b) => ({ matchId: b.matchId, mode: b.mode, mapId: b.map.id, difficulty: b.difficulty, time: Math.round(b.time), score: b.score(), players: b.fighters.map((f) => `${f.info.name}${f.info.bot ? '(AI)' : ''}`) })),
    battle: await getBattle(), rewards: await getRewards(), maps: MAP_IDS,
  })
})

adminRouter.post('/battles/:id/end', requirePerm('game'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const b = activeBattles().find((x) => x.matchId === id)
  if (!b) throw notFound('진행 중인 전투가 아니에요.')
  b.finish('DRAW', 'abandon')
  await adminLog(prisma, me(req).id, '전투 강제 종료', 'MATCH', id)
  res.json({ ok: true })
})

adminRouter.put('/config/battle', requirePerm('game'), async (req, res) => {
  const body = parse(z.object({ durationSec: z.number().int().min(60).max(900), respawn: z.boolean(), enabledMaps: z.array(z.enum(MAP_IDS as [string, ...string[]])).min(1), maxFriendRewardsCount: z.number().int().min(0).max(100) }), req.body)
  await setBattle({ ...DEFAULT_BATTLE, ...body })
  await adminLog(prisma, me(req).id, '전투 설정 변경', 'CONFIG', 'battle', JSON.stringify(body))
  res.json({ ok: true })
})

adminRouter.put('/config/rewards', requirePerm('game'), async (req, res) => {
  const n = z.number().int().min(0).max(100000)
  const body = parse(z.object({
    participateCoins: n, participateXp: n, winCoins: n, winXp: n, lossCoins: n, lossXp: n, drawCoins: n, drawXp: n, friendPlayXp: n, friendAddCoins: n, firstLoginCoins: n, tutorialCoins: n,
    aiMultiplier: z.record(z.string(), z.number().min(0).max(5)),
  }), req.body)
  await setRewards({ ...DEFAULT_REWARDS, ...body })
  await adminLog(prisma, me(req).id, '보상 설정 변경', 'CONFIG', 'rewards', JSON.stringify(body))
  res.json({ ok: true })
})

// ── reports & support ──
adminRouter.get('/reports', requirePerm('reports'), async (req, res) => {
  const { status } = parse(z.object({ status: z.string().optional() }), req.query)
  const rows = await prisma.report.findMany({
    where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 100,
    include: { reporter: { select: { nickname: true } }, handler: { select: { nickname: true } } },
  })
  const targets = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.targetUserId).filter((x): x is number => Boolean(x)) } }, select: { id: true, nickname: true } })
  res.json(rows.map((r) => ({ ...r, reporter: r.reporter.nickname, handler: r.handler?.nickname ?? null, targetNickname: targets.find((t) => t.id === r.targetUserId)?.nickname ?? null })))
})

adminRouter.patch('/reports/:id', requirePerm('reports'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const body = parse(z.object({ status: z.enum(['PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED']), resolution: z.string().max(300).default('') }), req.body)
  await prisma.report.update({ where: { id }, data: { ...body, handlerId: me(req).id, handledAt: new Date() } })
  await adminLog(prisma, me(req).id, `신고 처리: ${body.status}`, 'REPORT', id, body.resolution)
  res.json({ ok: true })
})

adminRouter.get('/tickets', requirePerm('support'), async (_req, res) => {
  const rows = await prisma.supportTicket.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { nickname: true, username: true } } } })
  res.json(rows)
})

adminRouter.post('/tickets/:id/reply', requirePerm('support'), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { reply } = parse(z.object({ reply: z.string().trim().min(1).max(2000) }), req.body)
  const t = await prisma.supportTicket.update({ where: { id }, data: { reply, status: 'ANSWERED', repliedBy: me(req).id, repliedAt: new Date() } })
  if (t.userId) await notify(prisma, t.userId, 'NOTICE', '문의에 답변이 도착했어요', t.title)
  await adminLog(prisma, me(req).id, '문의 답변', 'TICKET', id)
  res.json({ ok: true })
})

// ── mail (rewards/gifts to one player or everyone) ──
adminRouter.post('/mail', requirePerm('users.economy'), async (req, res) => {
  const body = parse(z.object({
    userId: z.number().int().positive().nullable(), type: z.enum(['REWARD', 'EVENT', 'ADMIN', 'GIFT']).default('ADMIN'), title: z.string().trim().min(1).max(60), body: z.string().max(1000).default(''),
    coins: z.number().int().min(0).max(1_000_000).default(0), xp: z.number().int().min(0).max(1_000_000).default(0), itemId: z.string().nullable().default(null), days: z.number().int().min(1).max(365).default(30),
  }), req.body)
  const expiresAt = new Date(Date.now() + body.days * 86400_000)
  const ids = body.userId ? [body.userId] : (await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } })).map((u) => u.id)
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.mail.createMany({ data: ids.slice(i, i + 500).map((userId) => ({ userId, type: body.type, title: body.title, body: body.body, coins: body.coins, xp: body.xp, itemId: body.itemId, expiresAt })) })
  }
  for (const id of ids.slice(0, 2000)) await notify(prisma, id, 'MAIL', '📮 새 우편이 도착했어요', body.title)
  await adminLog(prisma, me(req).id, `우편 발송 (${ids.length}명)`, 'MAIL', body.userId ?? 'ALL', `${body.title} / 코인 ${body.coins}`)
  res.json({ ok: true, count: ids.length })
})

// ── server status & logs ──
adminRouter.get('/server', requirePerm('server'), async (_req, res) => {
  let dbBytes = 0
  try {
    dbBytes = statSync(path.resolve(import.meta.dirname, '../../data/colorwars.db')).size
  } catch { /* not sqlite */ }
  const t = Date.now()
  await prisma.$queryRaw`SELECT 1`
  res.json({
    uptimeSec: Math.round((Date.now() - started) / 1000), node: process.version, platform: `${os.platform()} ${os.release()}`,
    memMb: Math.round(process.memoryUsage().rss / 1048576), load: os.loadavg(), freeMemMb: Math.round(os.freemem() / 1048576),
    dbMs: Date.now() - t, dbMb: Math.round((dbBytes / 1048576) * 10) / 10, sockets: socketCount(), online: onlineCount(),
    rooms: activeRooms().length, battles: activeBattles().length, ai: { model: VISION_MODEL, available: await aiAvailable() },
  })
})

adminRouter.get('/logs', requirePerm('logs'), async (req, res) => {
  const { page: p } = page(req.query)
  const rows = await prisma.adminLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (p - 1) * 50, take: 50, include: { admin: { select: { nickname: true, role: true } } } })
  res.json(rows.map((r) => ({ ...r, admin: `${r.admin.nickname} (${r.admin.role})` })))
})

adminRouter.get('/staff', requirePerm('users.role'), async (_req, res) => {
  const rows = await prisma.user.findMany({ where: { role: { not: 'USER' }, deletedAt: null }, orderBy: { id: 'asc' } })
  res.json(rows.map(userRow))
})
