import { Router } from 'express'
import { nextKstMidnight, nextKstMonday } from '../../../shared/progression.ts'
import { prisma } from '../db.ts'
import { bad, idParam, notFound, parse } from '../http.ts'
import { grant } from '../services/economy.ts'
import { activeMissions, periodKeyFor } from '../services/missions.ts'

export const missionsRouter = Router()

export async function missionList(userId: number) {
  const missions = await prisma.$transaction((tx) => activeMissions(tx))
  const keys = missions.map((m) => ({ missionId: m.id, periodKey: periodKeyFor(m) }))
  const progress = keys.length
    ? await prisma.userMission.findMany({ where: { userId, OR: keys } })
    : []
  const byId = new Map(progress.map((p) => [p.missionId + ':' + p.periodKey, p]))
  return missions.map((m) => {
    const p = byId.get(m.id + ':' + periodKeyFor(m))
    return {
      id: m.id, title: m.title, description: m.description, period: m.period, goalType: m.goalType, goalCount: m.goalCount,
      rewardCoins: m.rewardCoins, rewardXp: m.rewardXp, eventTitle: m.event?.title ?? null,
      progress: p?.progress ?? 0, completed: Boolean(p?.completedAt), claimed: Boolean(p?.claimedAt),
      resetAt: m.period === 'DAILY' ? nextKstMidnight() : m.period === 'WEEKLY' ? nextKstMonday() : (m.endAt ?? m.event?.endAt ?? null),
    }
  })
}

missionsRouter.get('/', async (req, res) => {
  res.json({ missions: await missionList(req.user!.id), dailyResetAt: nextKstMidnight(), weeklyResetAt: nextKstMonday() })
})

missionsRouter.post('/:id/claim', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const userId = req.user!.id
  const result = await prisma.$transaction(async (tx) => {
    const m = (await activeMissions(tx)).find((x) => x.id === id)
    if (!m) throw notFound('진행 중인 미션이 아니에요.')
    const periodKey = periodKeyFor(m)
    const um = await tx.userMission.findUnique({ where: { userId_missionId_periodKey: { userId, missionId: id, periodKey } } })
    if (!um?.completedAt) throw bad('아직 완료하지 않은 미션이에요.')
    const claimed = await tx.userMission.updateMany({ where: { id: um.id, claimedAt: null }, data: { claimedAt: new Date() } })
    if (claimed.count === 0) throw bad('이미 보상을 받았어요.', 'ALREADY_CLAIMED')
    return grant(tx, userId, `mission:${id}:${periodKey}`, m.rewardCoins, m.rewardXp, `미션 보상: ${m.title}`)
  })
  if (!result.granted) throw bad('이미 보상을 받았어요.', 'ALREADY_CLAIMED')
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, xp: true, level: true } })
  res.json({ coins: result.coins, xp: result.xp, levelUps: result.levelUps, wallet: u })
})
