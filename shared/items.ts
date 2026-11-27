import { TOOLS, SLOT_EXPANSION } from './constants.ts'

export interface ItemSeed {
  id: string
  category: 'TOOL' | 'COSMETIC' | 'PROFILE' | 'SLOT'
  slot?: string
  name: string
  description: string
  price: number
  effect: Record<string, unknown>
  sortOrder: number
  limited?: boolean
}

const c = (slot: string, key: string, name: string, price: number, effect: Record<string, unknown>, description = ''): ItemSeed => ({
  id: `cos_${slot}_${key}`, category: 'COSMETIC', slot, name, price, effect, description, sortOrder: price,
})
const p = (slot: string, key: string, name: string, price: number, effect: Record<string, unknown>, description = ''): ItemSeed => ({
  id: `pro_${slot}_${key}`, category: 'PROFILE', slot, name, price, effect, description, sortOrder: price,
})

export const ITEM_SEEDS: ItemSeed[] = [
  ...TOOLS.map((t, i) => ({
    id: t.itemId, category: 'TOOL' as const, name: t.name, description: t.desc, price: t.price,
    effect: { tool: t.id }, sortOrder: i,
  })),
  {
    id: SLOT_EXPANSION.itemId, category: 'SLOT', name: '보관함 확장', price: SLOT_EXPANSION.price,
    description: `무기 보관함을 ${SLOT_EXPANSION.amount}칸 늘려요.`, effect: { slots: SLOT_EXPANSION.amount }, sortOrder: 0,
  },
  c('hair', 'spiky', '삐죽 머리', 300, { shape: 'spiky', color: '#3a2a1f' }),
  c('hair', 'bob', '단발 머리', 300, { shape: 'bob', color: '#6b3e26' }),
  c('hair', 'pony', '포니테일', 500, { shape: 'pony', color: '#e0a030' }),
  c('hair', 'rainbow', '무지개 머리', 1500, { shape: 'spiky', color: 'rainbow' }),
  c('face', 'smile', '활짝 웃음', 200, { eyes: 'happy', mouth: 'smile' }),
  c('face', 'cool', '쿨한 표정', 300, { eyes: 'line', mouth: 'flat' }),
  c('face', 'wink', '윙크', 400, { eyes: 'wink', mouth: 'smile' }),
  c('top', 'hoodie', '후드티', 400, { color: '#2e86ff' }),
  c('top', 'armor', '기사 갑옷', 1200, { color: '#c0c4cc', metal: true }),
  c('top', 'stripe', '줄무늬 티', 300, { color: '#ff5fa2' }),
  c('bottom', 'jeans', '청바지', 300, { color: '#2a4d8f' }),
  c('bottom', 'shorts', '반바지', 250, { color: '#ffb347' }),
  c('shoes', 'sneakers', '운동화', 300, { color: '#ffffff' }),
  c('shoes', 'boots', '부츠', 500, { color: '#5a3a22' }),
  c('gloves', 'red', '빨간 장갑', 250, { color: '#ff4d4d' }),
  c('gloves', 'gold', '금색 장갑', 1000, { color: '#ffd23f', metal: true }),
  c('hat', 'cap', '야구 모자', 300, { shape: 'cap', color: '#ff4d4d' }),
  c('hat', 'crown', '왕관', 2000, { shape: 'crown', color: '#ffd23f' }),
  c('hat', 'wizard', '마법사 모자', 800, { shape: 'wizard', color: '#7b5cff' }),
  c('hat', 'bunny', '토끼 귀', 600, { shape: 'bunny', color: '#ffffff' }),
  c('glasses', 'round', '동그란 안경', 300, { shape: 'round', color: '#111111' }),
  c('glasses', 'sun', '선글라스', 500, { shape: 'sun', color: '#111111' }),
  c('accessory', 'scarf', '목도리', 400, { shape: 'scarf', color: '#ff9f1c' }),
  c('accessory', 'bell', '방울', 300, { shape: 'bell', color: '#ffd23f' }),
  c('color', 'mint', '민트 피부', 300, { color: '#a8f0d0' }),
  c('color', 'pink', '분홍 피부', 300, { color: '#ffc7dd' }),
  c('color', 'sky', '하늘 피부', 300, { color: '#bfe3ff' }),
  c('color', 'lavender', '라벤더 피부', 300, { color: '#d9c8ff' }),
  c('back', 'cape', '망토', 800, { shape: 'cape', color: '#ff4d4d' }),
  c('back', 'wings', '천사 날개', 2500, { shape: 'wings', color: '#ffffff' }),
  c('back', 'bag', '책가방', 400, { shape: 'bag', color: '#3ddc84' }),
  c('victory', 'confetti', '꽃가루 승리', 600, { effect: 'confetti' }),
  c('victory', 'fireworks', '불꽃놀이 승리', 1500, { effect: 'fireworks' }),
  c('victory', 'rainbow', '무지개 승리', 2000, { effect: 'rainbow' }),
  p('frame', 'gold', '금색 테두리', 800, { color: '#ffd23f' }),
  p('frame', 'rainbow', '무지개 테두리', 1500, { color: 'rainbow' }),
  p('frame', 'neon', '네온 테두리', 1200, { color: '#ff3df2', glow: true }),
  p('background', 'sky', '하늘 배경', 300, { gradient: ['#a0e7ff', '#e8f7ff'] }),
  p('background', 'sunset', '노을 배경', 500, { gradient: ['#ff9f1c', '#ff5fa2'] }),
  p('background', 'space', '우주 배경', 900, { gradient: ['#0b1840', '#3a1c71'] }),
  p('title', 'artist', '꼬마 화가', 200, { text: '꼬마 화가' }),
  p('title', 'smith', '무기 장인', 800, { text: '무기 장인' }),
  p('title', 'legend', '전설의 화가', 3000, { text: '전설의 화가' }),
  p('decoration', 'stars', '반짝이 별', 400, { emoji: '⭐' }),
  p('decoration', 'hearts', '하트 뿅뿅', 400, { emoji: '💖' }),
  p('decoration', 'fire', '불꽃', 600, { emoji: '🔥' }),
]
