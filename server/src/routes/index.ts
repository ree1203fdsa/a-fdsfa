import { Router } from 'express'
import { startOfKstMonth, nextKstMidnight } from '../../../shared/progression.ts'
import { requireUser } from '../auth.ts'
import { prisma } from '../db.ts'
import { missionList, missionsRouter } from './missions.ts'
import { draftsRouter, weaponsRouter } from './weapons.ts'
import { phoneRouter } from './phone.ts'
import { itemsRouter, shopRouter } from './shop.ts'
import { attendanceRouter, mailRouter, meRouter, notificationsRouter, profileRouter } from './account.ts'

export const apiRouter = Router()

apiRouter.use(requireUser)
apiRouter.use('/missions', missionsRouter)
apiRouter.use('/weapons', weaponsRouter)
apiRouter.use('/drafts', draftsRouter)
apiRouter.use('/phone', phoneRouter)
apiRouter.use('/shop', shopRouter)
apiRouter.use('/items', itemsRouter)
apiRouter.use('/attendance', attendanceRouter)
apiRouter.use('/notifications', notificationsRouter)
apiRouter.use('/mail', mailRouter)
apiRouter.use('/me', meRouter)
apiRouter.use('/profile', profileRouter)

/** Current season = current calendar month (KST); score = sum of match scores this month. */
async function seasonTop(userId: number) {
  const since = startOfKstMonth()
  const rows = await prisma.matchParticipant.groupBy({
    by: ['userId'],
    where: { userId: { not: null }, createdAt: { gte: since }, validParticipation: true },
    _sum: { score: true },
    orderBy: { _sum: { score: 'desc' } },
    take: 100,
  })
  const top = rows.slice(0, 3)
  const users = await prisma.user.findMany({
    where: { id: { in: top.map((r) => r.userId!) } },
    select: { id: true, nickname: true, level: true },
  })
  const myIndex = rows.findIndex((r) => r.userId === userId)
  return {
    top: top.map((r, i) => ({ rank: i + 1, score: r._sum.score ?? 0, ...users.find((u) => u.id === r.userId)! })),
    me: myIndex >= 0 ? { rank: myIndex + 1, score: rows[myIndex]._sum.score ?? 0 } : null,
  }
}

apiRouter.get('/home', async (req, res) => {
  const now = new Date()
  const userId = req.user!.id
  const [notices, events, unread, season, missions] = await Promise.all([
    prisma.notice.findMany({
      where: { deletedAt: null, publishAt: { lte: now } },
      orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }],
      take: 5,
      select: { id: true, title: true, body: true, pinned: true, publishAt: true },
    }),
    prisma.gameEvent.findMany({
      where: { deletedAt: null, active: true, startAt: { lte: now }, endAt: { gt: now } },
      orderBy: { endAt: 'asc' },
      select: { id: true, title: true, description: true, endAt: true, coinBonus: true },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
    seasonTop(userId),
    missionList(userId),
  ])
  res.json({
    notices, events, unread, season,
    dailyMissions: missions.filter((m) => m.period === 'DAILY'),
    dailyResetAt: nextKstMidnight(),
  })
})
