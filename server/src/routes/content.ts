import { Router } from 'express'
import { z } from 'zod'
import { CODEX, CODEX_REWARDS } from '../../../shared/codex.ts'
import { CONTEST_CATEGORIES, CONTEST_VOTES_PER_USER, REPORT_TYPES } from '../../../shared/constants.ts'
import { kstDateKey, previousKstDateKey, startOfKstMonth, startOfKstWeek } from '../../../shared/progression.ts'
import { prisma, parseJson } from '../db.ts'
import { bad, conflict, idParam, notFound, parse, rateLimit } from '../http.ts'
import { userFromToken, GAME_COOKIE } from '../auth.ts'
import { grant, notify } from '../services/economy.ts'

// ── ranking ──
export const rankingRouter = Router()

const BOARDS = ['level', 'wins', 'score', 'weapons', 'friends', 'weekly', 'monthly'] as const
type Board = (typeof BOARDS)[number]

async function computeBoard(board: Board, me: number): Promise<{ id: number; nickname: string; level: number; score: number }[]> {
  const base = { deletedAt: null, role: 'USER', status: { not: 'BANNED' } }
  const sel = { id: true, nickname: true, level: true, xp: true, wins: true, battleScore: true, weaponsCreated: true }
  const pick = (u: { id: number; nickname: string; level: number }, score: number) => ({ id: u.id, nickname: u.nickname, level: u.level, score })
  if (board === 'weekly' || board === 'monthly') {
    const since = board === 'weekly' ? startOfKstWeek() : startOfKstMonth()
    const rows = await prisma.matchParticipant.groupBy({ by: ['userId'], where: { userId: { not: null }, validParticipation: true, createdAt: { gte: since } }, _sum: { score: true }, orderBy: { _sum: { score: 'desc' } }, take: 100 })
    const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId!) }, ...base }, select: sel })
    return rows.flatMap((r) => {
      const u = users.find((x) => x.id === r.userId)
      return u ? [pick(u, r._sum.score ?? 0)] : []
    })
  }
  if (board === 'friends') {
    const f = await prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] } })
    const ids = [me, ...f.map((x) => (x.requesterId === me ? x.addresseeId : x.requesterId))]
    const users = await prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: sel })
    return users.map((u) => pick(u, u.battleScore)).sort((a, b) => b.score - a.score)
  }
  const orderBy = board === 'level' ? [{ xp: 'desc' as const }] : board === 'wins' ? [{ wins: 'desc' as const }] : board === 'score' ? [{ battleScore: 'desc' as const }] : [{ weaponsCreated: 'desc' as const }]
  const users = await prisma.user.findMany({ where: base, orderBy: [...orderBy, { id: 'asc' }], take: 100, select: sel })
  return users.map((u) => pick(u, board === 'level' ? u.xp : board === 'wins' ? u.wins : board === 'score' ? u.battleScore : u.weaponsCreated))
}

rankingRouter.get('/', async (req, res) => {
  const { board } = parse(z.object({ board: z.enum(BOARDS).default('level') }), req.query)
  const me = req.user!.id
  const rows = await computeBoard(board, me)
  // Rank change vs. the first snapshot taken yesterday (one snapshot per board per KST day).
  const today = kstDateKey()
  const key = board === 'friends' ? `friends:${me}` : board
  const [hasToday, yesterday] = await Promise.all([
    prisma.rankingSnapshot.count({ where: { board: key, date: today } }),
    prisma.rankingSnapshot.findMany({ where: { board: key, date: previousKstDateKey(today) } }),
  ])
  if (!hasToday && rows.length) {
    await prisma.rankingSnapshot.createMany({ data: rows.map((r, i) => ({ board: key, date: today, userId: r.id, rank: i + 1 })) }).catch(() => {})
  }
  const prev = new Map(yesterday.map((s) => [s.userId, s.rank]))
  const list = rows.map((r, i) => ({ rank: i + 1, ...r, change: prev.has(r.id) ? prev.get(r.id)! - (i + 1) : null }))
  res.json({ board, rows: list, me: list.find((r) => r.id === me) ?? null })
})

// ── codex ──
export const codexRouter = Router()

codexRouter.get('/', async (req, res) => {
  const userId = req.user!.id
  const [found, claimed] = await Promise.all([
    prisma.userCodex.findMany({ where: { userId } }),
    prisma.rewardLedger.findMany({ where: { userId, key: { startsWith: 'codex:' } } }),
  ])
  const pct = Math.floor((found.length / CODEX.length) * 100)
  res.json({
    entries: CODEX.map((e) => {
      const f = found.find((x) => x.entryKey === e.key)
      return { ...e, discovered: Boolean(f), source: f?.source ?? null, at: f?.discoveredAt ?? null }
    }),
    pct, total: CODEX.length, found: found.length,
    rewards: CODEX_REWARDS.map((r) => ({ ...r, reached: pct >= r.pct, claimed: claimed.some((c) => c.key === `codex:${r.pct}`) })),
  })
})

codexRouter.post('/claim', async (req, res) => {
  const { pct } = parse(z.object({ pct: z.number().int() }), req.body)
  const reward = CODEX_REWARDS.find((r) => r.pct === pct)
  if (!reward) throw bad('없는 보상이에요.')
  const userId = req.user!.id
  const found = await prisma.userCodex.count({ where: { userId } })
  if (Math.floor((found / CODEX.length) * 100) < pct) throw bad('아직 도감을 충분히 채우지 않았어요.')
  const g = await prisma.$transaction((tx) => grant(tx, userId, `codex:${pct}`, reward.coins, 0, `도감 ${pct}% 달성 보상`))
  if (!g.granted) throw bad('이미 받은 보상이에요.', 'ALREADY_CLAIMED')
  res.json({ coins: g.coins })
})

// ── weapon contests ──
export const contestRouter = Router()

export function contestStatus(c: { submitStartAt: Date; submitEndAt: Date; voteEndAt: Date }, now = new Date()) {
  if (now < c.submitStartAt) return 'UPCOMING'
  if (now < c.submitEndAt) return 'SUBMISSION'
  if (now < c.voteEndAt) return 'VOTING'
  return 'ENDED'
}

contestRouter.get('/', async (req, res) => {
  const list = await prisma.contest.findMany({ where: { deletedAt: null }, orderBy: { submitStartAt: 'desc' }, take: 30, include: { _count: { select: { entries: true } } } })
  res.json(list.map((c) => ({
    id: c.id, title: c.title, category: c.category, categoryName: CONTEST_CATEGORIES[c.category] ?? c.category, description: c.description,
    submitStartAt: c.submitStartAt, submitEndAt: c.submitEndAt, voteEndAt: c.voteEndAt, rewards: parseJson<number[]>(c.rewards, []),
    status: contestStatus(c), entries: c._count.entries,
  })))
})

contestRouter.get('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const c = await prisma.contest.findFirst({ where: { id, deletedAt: null } })
  if (!c) throw notFound('대회를 찾을 수 없어요.')
  const status = contestStatus(c)
  const [entries, myVotes] = await Promise.all([
    prisma.contestEntry.findMany({ where: { contestId: id }, include: { user: { select: { nickname: true } } }, orderBy: status === 'ENDED' ? [{ rank: 'asc' }, { voteCount: 'desc' }] : { createdAt: 'desc' } }),
    prisma.contestVote.findMany({ where: { contestId: id, voterId: req.user!.id } }),
  ])
  res.json({
    id: c.id, title: c.title, categoryName: CONTEST_CATEGORIES[c.category] ?? c.category, description: c.description, status,
    submitEndAt: c.submitEndAt, voteEndAt: c.voteEndAt, rewards: parseJson<number[]>(c.rewards, []), votesLeft: CONTEST_VOTES_PER_USER - myVotes.length,
    entries: entries.map((e) => ({
      id: e.id, userId: e.userId, nickname: e.user.nickname, snapshot: parseJson(e.snapshot, {}), mine: e.userId === req.user!.id,
      voted: myVotes.some((v) => v.entryId === e.id),
      // Vote counts stay hidden until voting ends so results can't snowball.
      votes: status === 'ENDED' ? e.voteCount : null, rank: e.rank,
    })),
  })
})

contestRouter.post('/:id/enter', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { weaponId } = parse(z.object({ weaponId: z.number().int().positive() }), req.body)
  const userId = req.user!.id
  const c = await prisma.contest.findFirst({ where: { id, deletedAt: null } })
  if (!c) throw notFound('대회를 찾을 수 없어요.')
  if (contestStatus(c) !== 'SUBMISSION') throw bad('지금은 작품을 낼 수 있는 기간이 아니에요.')
  const w = await prisma.weapon.findFirst({ where: { id: weaponId, userId, deletedAt: null, hidden: false } })
  if (!w) throw notFound('무기를 찾을 수 없어요.')
  const snapshot = JSON.stringify({ weaponId: w.id, name: w.name, type: w.type, previewPng: w.previewPng, strokes: parseJson(w.strokes, []), paperId: w.paperId, modelParams: parseJson(w.modelParams, {}) })
  await prisma.contestEntry.upsert({ where: { contestId_userId: { contestId: id, userId } }, create: { contestId: id, userId, weaponId, snapshot }, update: { weaponId, snapshot } })
  res.json({ ok: true })
})

contestRouter.post('/:id/vote', rateLimit('vote', 30, 60_000), async (req, res) => {
  const id = parse(idParam, req.params.id)
  const { entryId } = parse(z.object({ entryId: z.number().int().positive() }), req.body)
  const voterId = req.user!.id
  await prisma.$transaction(async (tx) => {
    const c = await tx.contest.findFirst({ where: { id, deletedAt: null } })
    if (!c) throw notFound('대회를 찾을 수 없어요.')
    if (contestStatus(c) !== 'VOTING') throw bad('지금은 투표 기간이 아니에요.')
    const entry = await tx.contestEntry.findFirst({ where: { id: entryId, contestId: id } })
    if (!entry) throw notFound('작품을 찾을 수 없어요.')
    if (entry.userId === voterId) throw bad('내 작품에는 투표할 수 없어요.')
    const used = await tx.contestVote.count({ where: { contestId: id, voterId } })
    if (used >= CONTEST_VOTES_PER_USER) throw bad(`투표는 대회마다 ${CONTEST_VOTES_PER_USER}번까지 할 수 있어요.`)
    const dup = await tx.contestVote.findUnique({ where: { voterId_entryId: { voterId, entryId } } })
    if (dup) throw conflict('이미 투표한 작품이에요.')
    await tx.contestVote.create({ data: { contestId: id, entryId, voterId } })
    await tx.contestEntry.update({ where: { id: entryId }, data: { voteCount: { increment: 1 } } })
  })
  res.json({ ok: true })
})

/** Ranks entries and pays prizes for contests whose voting has ended. Safe to run repeatedly. */
export async function finalizeContests() {
  const due = await prisma.contest.findMany({ where: { deletedAt: null, finalizedAt: null, voteEndAt: { lte: new Date() } } })
  for (const c of due) {
    const entries = await prisma.contestEntry.findMany({ where: { contestId: c.id }, orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }], include: { user: true } })
    const prizes = parseJson<number[]>(c.rewards, [])
    await prisma.$transaction(async (tx) => {
      for (const [i, e] of entries.entries()) {
        await tx.contestEntry.update({ where: { id: e.id }, data: { rank: i + 1 } })
        const coins = prizes[i] ?? 0
        if (coins > 0 && e.voteCount > 0) {
          await tx.mail.create({ data: { userId: e.userId, type: 'REWARD', title: `🏆 ${c.title} ${i + 1}위!`, body: `"${parseJson<{ name?: string }>(e.snapshot, {}).name}" 작품이 ${e.voteCount}표를 받아 ${i + 1}위를 했어요. 축하해요!`, coins } })
          await notify(tx, e.userId, 'REWARD', `무기 대회 ${i + 1}위!`, '우편함에서 상금을 받아 가세요.')
        }
      }
      await tx.contest.update({ where: { id: c.id }, data: { finalizedAt: new Date() } })
    })
  }
}

/** Keeps one weekly contest running: submissions Mon–Thu, voting Fri–Sun (KST). */
export async function ensureWeeklyContest() {
  const start = startOfKstWeek()
  const exists = await prisma.contest.count({ where: { category: 'weekly', submitStartAt: start } })
  if (exists) return
  const day = 86400_000
  await prisma.contest.create({
    data: {
      title: `주간 무기 대회 (${kstDateKey(start).slice(5).replace('-', '/')})`, category: 'weekly',
      description: '이번 주 가장 멋진 무기를 뽑아요! 월~목 작품 제출, 금~일 투표.',
      submitStartAt: start, submitEndAt: new Date(start.getTime() + 4 * day), voteEndAt: new Date(start.getTime() + 7 * day), rewards: JSON.stringify([1000, 600, 300]),
    },
  })
}

// ── support & reports (support works even when logged out, e.g. from the login screen) ──
export const supportRouter = Router()

supportRouter.post('/', rateLimit('support', 5, 3600_000), async (req, res) => {
  const body = parse(z.object({
    category: z.enum(['ACCOUNT', 'BUG', 'PAYMENT', 'REPORT', 'IDEA', 'ETC']), title: z.string().trim().min(2, '제목을 2자 이상 적어 주세요.').max(60),
    body: z.string().trim().min(5, '내용을 5자 이상 적어 주세요.').max(2000), contact: z.string().trim().max(100).default(''),
  }), req.body)
  const u = await userFromToken(req.cookies?.[GAME_COOKIE], 'GAME')
  const t = await prisma.supportTicket.create({ data: { ...body, userId: u?.id } })
  res.json({ ok: true, id: t.id })
})

supportRouter.get('/mine', async (req, res) => {
  const u = await userFromToken(req.cookies?.[GAME_COOKIE], 'GAME')
  if (!u) return void res.json([])
  res.json(await prisma.supportTicket.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 20 }))
})

export const reportsRouter = Router()

reportsRouter.post('/', rateLimit('report', 20, 3600_000), async (req, res) => {
  const body = parse(z.object({
    targetType: z.enum(Object.keys(REPORT_TYPES) as [string, ...string[]]), targetId: z.string().max(40), targetUserId: z.number().int().optional(),
    reason: z.string().trim().min(1).max(40), detail: z.string().trim().max(500).default(''), context: z.string().max(300).default(''),
  }), req.body)
  if (body.targetUserId === req.user!.id) throw bad('자기 자신은 신고할 수 없어요.')
  const dup = await prisma.report.count({ where: { reporterId: req.user!.id, targetType: body.targetType, targetId: body.targetId, status: 'PENDING' } })
  if (dup) throw conflict('이미 신고했어요. 운영팀이 확인 중이에요.')
  await prisma.report.create({ data: { ...body, reporterId: req.user!.id } })
  res.json({ ok: true })
})
