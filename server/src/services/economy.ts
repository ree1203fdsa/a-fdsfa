import { levelFromXp, levelUpReward } from '../../../shared/progression.ts'
import { prisma, type Tx } from '../db.ts'
import { HttpError } from '../http.ts'
import { emitToUser } from './hub.ts'

type Db = Tx | typeof prisma

export async function notify(db: Db, userId: number, type: string, title: string, body = '', data: object = {}) {
  const n = await db.notification.create({ data: { userId, type, title, body, data: JSON.stringify(data) } })
  emitToUser(userId, 'notification', { id: n.id, type, title, body, data, createdAt: n.createdAt })
  return n
}

/** Adds (or with a negative amount, spends) coins atomically; never lets the balance go negative. */
export async function changeCoins(tx: Tx, userId: number, amount: number, reason: string, refType?: string, refId?: string | number) {
  if (amount === 0) return
  if (amount < 0) {
    const r = await tx.user.updateMany({ where: { id: userId, coins: { gte: -amount } }, data: { coins: { increment: amount } } })
    if (r.count === 0) throw new HttpError(400, '코인이 부족해요.', 'NOT_ENOUGH_COINS')
  } else {
    await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } })
  }
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } })
  await tx.coinTransaction.create({
    data: { userId, amount, balanceAfter: u.coins, reason, refType, refId: refId === undefined ? undefined : String(refId) },
  })
  emitToUser(userId, 'wallet', { coins: u.coins })
}

export async function addXp(tx: Tx, userId: number, xp: number): Promise<number[]> {
  if (xp <= 0) return []
  const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, level: true } })
  const total = before.xp + xp
  const { level } = levelFromXp(total)
  await tx.user.update({ where: { id: userId }, data: { xp: total, level } })
  const ups: number[] = []
  for (let l = before.level + 1; l <= level; l++) {
    ups.push(l)
    const key = 'levelup:' + l
    const exists = await tx.rewardLedger.findUnique({ where: { userId_key: { userId, key } } })
    if (!exists) {
      const coins = levelUpReward(l)
      await tx.rewardLedger.create({ data: { userId, key, coins, reason: `레벨 ${l} 달성` } })
      await changeCoins(tx, userId, coins, `레벨 ${l} 달성 보상`, 'levelup', l)
      await notify(tx, userId, 'LEVEL_UP', `레벨 ${l} 달성!`, `레벨업 보상으로 ${coins}코인을 받았어요.`, { level: l, coins })
    }
  }
  return ups
}

export interface GrantResult {
  granted: boolean
  coins: number
  xp: number
  levelUps: number[]
}

/**
 * Pays a reward exactly once per (user, key). A concurrent duplicate hits the unique
 * index and rolls the whole transaction back, so nothing is paid twice.
 */
export async function grant(tx: Tx, userId: number, key: string, coins: number, xp: number, reason: string): Promise<GrantResult> {
  const exists = await tx.rewardLedger.findUnique({ where: { userId_key: { userId, key } } })
  if (exists) return { granted: false, coins: 0, xp: 0, levelUps: [] }
  coins = Math.max(0, Math.round(coins))
  xp = Math.max(0, Math.round(xp))
  await tx.rewardLedger.create({ data: { userId, key, coins, xp, reason } })
  if (coins) await changeCoins(tx, userId, coins, reason, 'reward', key)
  const levelUps = await addXp(tx, userId, xp)
  return { granted: true, coins, xp, levelUps }
}

export async function adminLog(db: Db, adminId: number, action: string, targetType?: string, targetId?: string | number, detail = '') {
  await db.adminLog.create({
    data: { adminId, action, targetType, targetId: targetId === undefined ? undefined : String(targetId), detail },
  })
}
