export const MAX_LEVEL = 99

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(100 + (level - 1) * 60 + Math.pow(level - 1, 1.6) * 8)
}

export function totalXpForLevel(level: number): number {
  let sum = 0
  for (let l = 1; l < level; l++) sum += xpToNext(l)
  return sum
}

export function levelFromXp(totalXp: number): { level: number; into: number; need: number } {
  let level = 1
  let remaining = totalXp
  while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level)
    level++
  }
  return { level, into: remaining, need: xpToNext(level) }
}

export function levelUpReward(level: number): number {
  return 50 + level * 10
}

export interface RewardConfig {
  participateCoins: number
  participateXp: number
  winCoins: number
  winXp: number
  lossCoins: number
  lossXp: number
  drawCoins: number
  drawXp: number
  friendPlayXp: number
  friendAddCoins: number
  firstLoginCoins: number
  tutorialCoins: number
  aiMultiplier: Record<string, number>
}

export const DEFAULT_REWARDS: RewardConfig = {
  participateCoins: 30,
  participateXp: 50,
  winCoins: 100,
  winXp: 100,
  lossCoins: 20,
  lossXp: 30,
  drawCoins: 50,
  drawXp: 60,
  friendPlayXp: 30,
  friendAddCoins: 50,
  firstLoginCoins: 100,
  tutorialCoins: 300,
  aiMultiplier: { easy: 0.5, normal: 0.8, hard: 1, expert: 1.2, legend: 1.5 },
}

export interface BattleConfig {
  durationSec: number
  respawn: boolean
  enabledMaps: string[]
  maxFriendRewardsCount: number
}

export const DEFAULT_BATTLE: BattleConfig = {
  durationSec: 180,
  respawn: false,
  enabledMaps: ['arena', 'forest', 'desert', 'ice', 'space'],
  maxFriendRewardsCount: 10,
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** Calendar date in Korea (game day boundary is midnight KST). */
export function kstDateKey(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function kstWeekKey(d: Date = new Date()): string {
  const k = new Date(d.getTime() + KST_OFFSET_MS)
  const day = (k.getUTCDay() + 6) % 7
  k.setUTCDate(k.getUTCDate() - day)
  return 'W' + k.toISOString().slice(0, 10)
}

export function kstMonthKey(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 7)
}

export function nextKstMidnight(d: Date = new Date()): Date {
  const k = new Date(d.getTime() + KST_OFFSET_MS)
  k.setUTCHours(24, 0, 0, 0)
  return new Date(k.getTime() - KST_OFFSET_MS)
}

export function nextKstMonday(d: Date = new Date()): Date {
  const k = new Date(d.getTime() + KST_OFFSET_MS)
  const day = (k.getUTCDay() + 6) % 7
  k.setUTCDate(k.getUTCDate() + (7 - day))
  k.setUTCHours(0, 0, 0, 0)
  return new Date(k.getTime() - KST_OFFSET_MS)
}

export function startOfKstWeek(d: Date = new Date()): Date {
  return new Date(nextKstMonday(d).getTime() - 7 * 86400000)
}

export function startOfKstMonth(d: Date = new Date()): Date {
  const k = new Date(d.getTime() + KST_OFFSET_MS)
  k.setUTCDate(1)
  k.setUTCHours(0, 0, 0, 0)
  return new Date(k.getTime() - KST_OFFSET_MS)
}

export function previousKstDateKey(key: string): string {
  const d = new Date(key + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
