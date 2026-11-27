import { kstDateKey, kstWeekKey } from '../../../shared/progression.ts'
import type { MissionGoal } from '../../../shared/constants.ts'
import type { Tx } from '../db.ts'
import { notify } from './economy.ts'

export function periodKeyFor(m: { id: number; period: string; eventId: number | null }, now = new Date()) {
  if (m.period === 'DAILY') return kstDateKey(now)
  if (m.period === 'WEEKLY') return kstWeekKey(now)
  return 'E' + (m.eventId ?? m.id)
}

export async function activeMissions(tx: Tx, now = new Date()) {
  const list = await tx.mission.findMany({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }],
    },
    include: { event: true },
    orderBy: [{ period: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  })
  return list.filter((m) => !m.event || (m.event.active && !m.event.deletedAt && m.event.startAt <= now && m.event.endAt > now))
}

/** Records progress toward every active mission with this goal. */
export async function progress(tx: Tx, userId: number, goal: MissionGoal, amount = 1) {
  const missions = (await activeMissions(tx)).filter((m) => m.goalType === goal)
  for (const m of missions) {
    const periodKey = periodKeyFor(m)
    const um = await tx.userMission.upsert({
      where: { userId_missionId_periodKey: { userId, missionId: m.id, periodKey } },
      create: { userId, missionId: m.id, periodKey, progress: 0 },
      update: {},
    })
    if (um.completedAt) continue
    const next = Math.min(m.goalCount, um.progress + amount)
    const done = next >= m.goalCount
    await tx.userMission.update({ where: { id: um.id }, data: { progress: next, completedAt: done ? new Date() : null } })
    if (done) await notify(tx, userId, 'MISSION_DONE', '미션 완료!', `"${m.title}" 미션을 완료했어요. 보상을 받아 가세요.`, { missionId: m.id })
  }
}
