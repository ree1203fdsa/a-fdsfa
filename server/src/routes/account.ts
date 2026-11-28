import { Router } from 'express'
import { z } from 'zod'
import { ATTENDANCE_REWARDS } from '../../../shared/constants.ts'
import { kstDateKey, previousKstDateKey, levelFromXp } from '../../../shared/progression.ts'
import { prisma, parseJson } from '../db.ts'
import { bad, forbidden, idParam, notFound, parse } from '../http.ts'
import { isStaff, meView } from '../auth.ts'
import { sanitizeAvatar } from '../../../shared/avatar.ts'
import { grant, notify } from '../services/economy.ts'
import { progress } from '../services/missions.ts'
import { weaponView } from './weapons.ts'

// ── attendance ──
export const attendanceRouter = Router()

attendanceRouter.get('/', async (req, res) => {
  const userId = req.user!.id
  const today = kstDateKey()
  const recent = await prisma.attendance.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 40 })
  const last = recent[0]
  const checkedToday = last?.date === today
  // Streak continues only if the last check-in was yesterday (or today).
  const alive = last && (last.date === today || last.date === previousKstDateKey(today))
  const streak = alive ? last.streak : 0
  // Which of the 7 reward days today is (already claimed or about to be).
  const todayDay = checkedToday ? last.cycleDay : (streak % 7) + 1
  res.json({ today, checkedToday, streak, todayDay, rewards: ATTENDANCE_REWARDS, history: recent.map((r) => r.date) })
})

attendanceRouter.post('/check', async (req, res) => {
  const userId = req.user!.id
  const today = kstDateKey()
  const r = await prisma.$transaction(async (tx) => {
    const exists = await tx.attendance.findUnique({ where: { userId_date: { userId, date: today } } })
    if (exists) throw bad('오늘은 이미 출석했어요. 내일 또 와 주세요!', 'ALREADY_CHECKED')
    const yesterday = await tx.attendance.findUnique({ where: { userId_date: { userId, date: previousKstDateKey(today) } } })
    const streak = yesterday ? yesterday.streak + 1 : 1
    const cycleDay = ((streak - 1) % 7) + 1
    const reward = ATTENDANCE_REWARDS[cycleDay - 1]
    await tx.attendance.create({ data: { userId, date: today, streak, cycleDay, reward } })
    const g = await grant(tx, userId, 'attend:' + today, reward, 0, `${cycleDay}일차 출석 보상`)
    await progress(tx, userId, 'ATTEND', 1)
    if (cycleDay === 7) await notify(tx, userId, 'REWARD', '🎉 7일 연속 출석 달성!', `특별 보상 ${reward}코인을 받았어요.`)
    return { streak, cycleDay, reward: g.coins }
  })
  res.json(r)
})

// ── notifications ──
export const notificationsRouter = Router()

notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id
  const [list, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.notification.count({ where: { userId, read: false } }),
  ])
  res.json({ unread, notifications: list.map((n) => ({ ...n, data: parseJson(n.data, {}) })) })
})

notificationsRouter.post('/read', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int()).max(200).optional() }), req.body)
  await prisma.notification.updateMany({ where: { userId: req.user!.id, ...(ids ? { id: { in: ids } } : {}) }, data: { read: true } })
  res.json({ ok: true })
})

notificationsRouter.delete('/:id', async (req, res) => {
  await prisma.notification.deleteMany({ where: { id: parse(idParam, req.params.id), userId: req.user!.id } })
  res.json({ ok: true })
})

// ── mailbox ──
export const mailRouter = Router()

const mailView = (m: { id: number; type: string; title: string; body: string; coins: number; xp: number; itemId: string | null; readAt: Date | null; claimedAt: Date | null; expiresAt: Date | null; createdAt: Date }) => ({
  ...m, hasReward: m.coins > 0 || m.xp > 0 || Boolean(m.itemId), expired: Boolean(m.expiresAt && m.expiresAt < new Date()),
})

mailRouter.get('/', async (req, res) => {
  const list = await prisma.mail.findMany({ where: { userId: req.user!.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 100 })
  const items = await prisma.item.findMany({ where: { id: { in: list.map((m) => m.itemId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })
  res.json(list.map((m) => ({ ...mailView(m), itemName: items.find((i) => i.id === m.itemId)?.name ?? null })))
})

mailRouter.post('/:id/read', async (req, res) => {
  await prisma.mail.updateMany({ where: { id: parse(idParam, req.params.id), userId: req.user!.id, readAt: null }, data: { readAt: new Date() } })
  res.json({ ok: true })
})

async function claimMail(userId: number, id: number) {
  return prisma.$transaction(async (tx) => {
    const m = await tx.mail.findFirst({ where: { id, userId, deletedAt: null } })
    if (!m) throw notFound('우편을 찾을 수 없어요.')
    if (m.expiresAt && m.expiresAt < new Date()) throw bad('받을 수 있는 기간이 지났어요.', 'EXPIRED')
    const r = await tx.mail.updateMany({ where: { id, claimedAt: null }, data: { claimedAt: new Date(), readAt: m.readAt ?? new Date() } })
    if (!r.count) throw bad('이미 받은 보상이에요.', 'ALREADY_CLAIMED')
    const g = await grant(tx, userId, 'mail:' + id, m.coins, m.xp, `우편 보상: ${m.title}`)
    if (m.itemId) {
      const has = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId: m.itemId } } })
      if (!has) await tx.userItem.create({ data: { userId, itemId: m.itemId } })
    }
    return { coins: g.coins, xp: g.xp, itemId: m.itemId }
  })
}

mailRouter.post('/:id/claim', async (req, res) => {
  res.json(await claimMail(req.user!.id, parse(idParam, req.params.id)))
})

mailRouter.post('/claim-all', async (req, res) => {
  const userId = req.user!.id
  const list = await prisma.mail.findMany({ where: { userId, deletedAt: null, claimedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
  let coins = 0, xp = 0, count = 0
  for (const m of list.filter((x) => x.coins || x.xp || x.itemId)) {
    try {
      const r = await claimMail(userId, m.id)
      coins += r.coins
      xp += r.xp
      count++
    } catch { /* already claimed concurrently */ }
  }
  res.json({ count, coins, xp })
})

mailRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const m = await prisma.mail.findFirst({ where: { id, userId: req.user!.id, deletedAt: null } })
  if (!m) throw notFound('우편을 찾을 수 없어요.')
  const unclaimed = !m.claimedAt && (m.coins || m.xp || m.itemId) && !(m.expiresAt && m.expiresAt < new Date())
  if (unclaimed) throw bad('아직 받지 않은 보상이 있어요. 보상을 먼저 받아 주세요.', 'UNCLAIMED')
  await prisma.mail.update({ where: { id }, data: { deletedAt: new Date() } })
  res.json({ ok: true })
})

// ── my settings & profile ──
export const meRouter = Router()

const settingsSchema = z.object({
  bgm: z.number().min(0).max(100), sfx: z.number().min(0).max(100), quality: z.enum(['low', 'medium', 'high']),
  sensitivity: z.number().min(0.2).max(3), language: z.enum(['ko', 'en']), brightness: z.number().min(60).max(140),
  notifications: z.boolean(), mobileButtonScale: z.number().min(0.7).max(1.5), mobileLayout: z.enum(['right', 'left']),
  autoRun: z.boolean(), keys: z.record(z.string().max(20), z.string().max(20)), showOnline: z.boolean(), allowInvites: z.enum(['all', 'friends', 'none']),
}).partial()

meRouter.put('/settings', async (req, res) => {
  const patch = parse(settingsSchema, req.body)
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } })
  const settings = { ...parseJson<Record<string, unknown>>(u.settings, {}), ...patch }
  await prisma.user.update({ where: { id: u.id }, data: { settings: JSON.stringify(settings) } })
  res.json({ settings })
})

meRouter.put('/profile', async (req, res) => {
  const { repWeaponId } = parse(z.object({ repWeaponId: z.number().int().positive().nullable() }), req.body)
  if (repWeaponId) {
    const w = await prisma.weapon.findFirst({ where: { id: repWeaponId, userId: req.user!.id, deletedAt: null } })
    if (!w) throw notFound('무기를 찾을 수 없어요.')
  }
  await prisma.user.update({ where: { id: req.user!.id }, data: { repWeaponId } })
  res.json({ ok: true })
})

meRouter.put('/play-mode', async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['admin', 'player']) }), req.body)
  const u = req.user!
  if (mode === 'admin' && !isStaff(u.role)) throw forbidden('운영진만 관리자로 플레이할 수 있어요.')
  const s = parseJson<Record<string, unknown>>(u.settings, {})
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: u.id }, data: { settings: JSON.stringify({ ...s, playMode: mode }) } })
    // Items only borrowed in admin mode (quantity 0) are taken off when going back to normal play.
    if (mode === 'player') await tx.userItem.updateMany({ where: { userId: u.id, quantity: 0 }, data: { equipped: false } })
  })
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
  res.json({ user: meView(fresh) })
})

// 캐릭터 만들기: free base look. Unknown values are replaced with defaults by sanitizeAvatar.
meRouter.put('/avatar', async (req, res) => {
  const body = parse(z.object({ avatar: z.record(z.string(), z.unknown()) }), req.body)
  const avatar = { ...sanitizeAvatar(body.avatar), created: true }
  const u = await prisma.user.update({ where: { id: req.user!.id }, data: { avatar: JSON.stringify(avatar) } })
  res.json({ user: meView(u) })
})

meRouter.post('/tutorial-seen', async (req, res) => {
  // Marks the intro slides as seen; the coin reward is still tied to finishing the first weapon.
  const s = parseJson<Record<string, unknown>>(req.user!.settings, {})
  await prisma.user.update({ where: { id: req.user!.id }, data: { settings: JSON.stringify({ ...s, tutorialSlidesSeen: true }) } })
  res.json({ ok: true })
})

meRouter.get('/', async (req, res) => {
  res.json({ user: meView(req.user!) })
})

// ── public profiles (never exposes account/security fields) ──
export const profileRouter = Router()

profileRouter.get('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const u = await prisma.user.findFirst({ where: { id, deletedAt: null } })
  if (!u) throw notFound('플레이어를 찾을 수 없어요.')
  const [equipped, rep, friends] = await Promise.all([
    prisma.userItem.findMany({ where: { userId: id, equipped: true }, include: { item: true } }),
    u.repWeaponId ? prisma.weapon.findFirst({ where: { id: u.repWeaponId, deletedAt: null, hidden: false } }) : null,
    prisma.friendship.count({ where: { status: 'ACCEPTED', OR: [{ requesterId: id }, { addresseeId: id }] } }),
  ])
  const lv = levelFromXp(u.xp)
  res.json({
    id: u.id, nickname: u.nickname, level: u.level, xpInto: lv.into, xpNeed: lv.need, createdAt: u.createdAt, isMe: id === req.user!.id,
    stats: { totalGames: u.totalGames, wins: u.wins, losses: u.losses, draws: u.draws, battleScore: u.battleScore, weaponsCreated: u.weaponsCreated, friends },
    coins: id === req.user!.id ? u.coins : undefined,
    avatar: sanitizeAvatar(parseJson(u.avatar, {})),
    look: equipped.filter((e) => e.item.slot).map((e) => ({ category: e.item.category, slot: e.item.slot, itemId: e.itemId, name: e.item.name, effect: parseJson(e.item.effect, {}) })),
    repWeapon: rep ? weaponView(rep) : null,
  })
})
