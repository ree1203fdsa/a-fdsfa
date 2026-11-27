import { DEFAULT_BATTLE, DEFAULT_REWARDS, type BattleConfig, type RewardConfig } from '../../../shared/progression.ts'
import { prisma, parseJson } from '../db.ts'

const cache = new Map<string, unknown>()

async function get<T extends object>(key: string, fallback: T): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T
  const row = await prisma.gameConfig.findUnique({ where: { key } })
  const value = { ...fallback, ...parseJson<Partial<T>>(row?.value, {}) } as T
  cache.set(key, value)
  return value
}

async function set<T extends object>(key: string, value: T) {
  await prisma.gameConfig.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
  cache.set(key, value)
}

export const getRewards = () => get<RewardConfig>('rewards', DEFAULT_REWARDS)
export const setRewards = (v: RewardConfig) => set('rewards', v)
export const getBattle = () => get<BattleConfig>('battle', DEFAULT_BATTLE)
export const setBattle = (v: BattleConfig) => set('battle', v)
