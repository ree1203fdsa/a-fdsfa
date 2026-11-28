/** Free base look every player designs in 캐릭터 만들기. Bought cosmetics are drawn on top of it. */

export const SKIN_TONES = ['#ffe3cc', '#ffd8b5', '#f1c193', '#e0a878', '#c68a5a', '#9a6440', '#6e4428', '#b9e6ff', '#c8f7c5'] as const
export const HAIR_COLORS = ['#121218', '#3b2414', '#6b3a1a', '#a8642c', '#e8b04a', '#f3e2a8', '#e8ecff', '#9aa0a6', '#ff4d4d', '#ff5fa2', '#7b5cff', '#2e86ff', '#3ddc84'] as const
export const CLOTH_COLORS = ['#1c1c24', '#ffffff', '#9aa0a6', '#ff3b4e', '#ff9f1c', '#ffd23f', '#3ddc84', '#1fb5a8', '#2e86ff', '#1e3a8a', '#7b5cff', '#ff5fa2', '#8b5a2b', '#2a1418'] as const

export const HAIR_STYLES = [
  { id: 'spiky', name: '삐죽머리' },
  { id: 'short', name: '짧은 머리' },
  { id: 'long', name: '긴 머리' },
  { id: 'ponytail', name: '포니테일' },
  { id: 'mohawk', name: '모히칸' },
  { id: 'curly', name: '곱슬머리' },
  { id: 'buzz', name: '까까머리' },
] as const
export const EYES = [
  { id: 'normal', name: '기본' },
  { id: 'happy', name: '웃는 눈' },
  { id: 'angry', name: '화난 눈' },
  { id: 'cool', name: '시크한 눈' },
  { id: 'big', name: '왕눈' },
  { id: 'wink', name: '윙크' },
] as const
export const MOUTHS = [
  { id: 'smile', name: '미소' },
  { id: 'grin', name: '활짝' },
  { id: 'flat', name: '무표정' },
  { id: 'open', name: '외침' },
  { id: 'smirk', name: '씨익' },
] as const
export const BUILDS = [
  { id: 'slim', name: '날씬' },
  { id: 'normal', name: '보통' },
  { id: 'strong', name: '튼튼' },
] as const

export type HairStyle = (typeof HAIR_STYLES)[number]['id']
export type Eyes = (typeof EYES)[number]['id']
export type Mouth = (typeof MOUTHS)[number]['id']
export type Build = (typeof BUILDS)[number]['id']

export interface Avatar {
  skin: string
  hairStyle: HairStyle
  hairColor: string
  eyes: Eyes
  mouth: Mouth
  build: Build
  shirt: string
  pants: string
  shoes: string
  emblem: string
  /** true once the player has saved 캐릭터 만들기 at least once */
  created?: boolean
}

export const DEFAULT_AVATAR: Avatar = {
  skin: '#ffd8b5', hairStyle: 'spiky', hairColor: '#121218', eyes: 'normal', mouth: 'smile', build: 'normal',
  shirt: '#1c1c24', pants: '#1c1c24', shoes: '#1c1c24', emblem: '#ffd23f',
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const ids = <T extends { id: string }>(list: readonly T[]) => list.map((x) => x.id) as T['id'][]

/** Keeps only known options; anything else falls back to the default. Safe for untrusted input and old data. */
export function sanitizeAvatar(raw: unknown): Avatar {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_AVATAR
  return {
    skin: pick(r.skin, SKIN_TONES, d.skin as (typeof SKIN_TONES)[number]),
    hairStyle: pick(r.hairStyle, ids(HAIR_STYLES), d.hairStyle),
    hairColor: pick(r.hairColor, HAIR_COLORS, d.hairColor as (typeof HAIR_COLORS)[number]),
    eyes: pick(r.eyes, ids(EYES), d.eyes),
    mouth: pick(r.mouth, ids(MOUTHS), d.mouth),
    build: pick(r.build, ids(BUILDS), d.build),
    shirt: pick(r.shirt, CLOTH_COLORS, d.shirt as (typeof CLOTH_COLORS)[number]),
    pants: pick(r.pants, CLOTH_COLORS, d.pants as (typeof CLOTH_COLORS)[number]),
    shoes: pick(r.shoes, CLOTH_COLORS, d.shoes as (typeof CLOTH_COLORS)[number]),
    emblem: pick(r.emblem, CLOTH_COLORS, d.emblem as (typeof CLOTH_COLORS)[number]),
    created: r.created === true,
  }
}

/** A random but valid look (for the 🎲 button and AI bots). */
export function randomAvatar(rand: () => number = Math.random): Avatar {
  const one = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]
  return {
    skin: one(SKIN_TONES.slice(0, 7)), hairStyle: one(ids(HAIR_STYLES)), hairColor: one(HAIR_COLORS), eyes: one(ids(EYES)), mouth: one(ids(MOUTHS)),
    build: one(ids(BUILDS)), shirt: one(CLOTH_COLORS), pants: one(CLOTH_COLORS), shoes: one(CLOTH_COLORS), emblem: one(CLOTH_COLORS),
  }
}
