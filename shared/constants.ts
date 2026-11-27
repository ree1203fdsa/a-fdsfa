export const WEAPON_TYPES = [
  'sword', 'longsword', 'dagger', 'gun', 'bow', 'spear', 'axe',
  'hammer', 'shield', 'staff', 'scythe', 'twinblades', 'special', 'freeform',
] as const
export type WeaponType = (typeof WEAPON_TYPES)[number]

export type AttackStyle = 'melee' | 'ranged' | 'magic'

export interface WeaponTypeInfo {
  id: WeaponType
  name: string
  nameEn: string
  emoji: string
  desc: string
  style: AttackStyle
  base: { attack: number; speed: number; area: number; range: number; weight: number; defense: number }
  special: string
  specialName: string
  specialDesc: string
  reach: number
  /** Which way the drawing's long axis is held: 'up' for blades, 'forward' for guns/bows. */
  hold: 'up' | 'forward' | 'arm'
}

export const WEAPON_INFO: Record<WeaponType, WeaponTypeInfo> = {
  sword: {
    id: 'sword', name: '검', nameEn: 'Sword', emoji: '🗡️', desc: '공격력과 속도의 균형이 좋아요.', style: 'melee',
    base: { attack: 55, speed: 55, area: 50, range: 40, weight: 45, defense: 40 },
    special: 'dash_slash', specialName: '돌진 베기', specialDesc: '앞으로 돌진하며 길 위의 적을 벱니다.', reach: 2.2, hold: 'up',
  },
  longsword: {
    id: 'longsword', name: '장검', nameEn: 'Longsword', emoji: '⚔️', desc: '길고 묵직한 검. 사거리가 길지만 조금 느려요.', style: 'melee',
    base: { attack: 65, speed: 40, area: 55, range: 55, weight: 60, defense: 35 },
    special: 'dash_slash', specialName: '돌진 베기', specialDesc: '앞으로 돌진하며 길 위의 적을 벱니다.', reach: 2.8, hold: 'up',
  },
  dagger: {
    id: 'dagger', name: '단검', nameEn: 'Dagger', emoji: '🔪', desc: '아주 빠르지만 사거리가 짧아요.', style: 'melee',
    base: { attack: 40, speed: 85, area: 35, range: 20, weight: 20, defense: 25 },
    special: 'shadow_combo', specialName: '그림자 연타', specialDesc: '잠시 동안 매우 빠르고 강하게 공격합니다.', reach: 1.6, hold: 'up',
  },
  gun: {
    id: 'gun', name: '총', nameEn: 'Gun', emoji: '🔫', desc: '멀리서 공격해요. 탄창을 다 쓰면 재장전해야 해요.', style: 'ranged',
    base: { attack: 40, speed: 60, area: 20, range: 85, weight: 40, defense: 20 },
    special: 'rapid_fire', specialName: '연사', specialDesc: '짧은 시간 동안 탄을 빠르게 연속 발사합니다.', reach: 1.2, hold: 'forward',
  },
  bow: {
    id: 'bow', name: '활', nameEn: 'Bow', emoji: '🏹', desc: '사거리가 아주 길어요. 화살을 재장전해야 해요.', style: 'ranged',
    base: { attack: 50, speed: 45, area: 20, range: 95, weight: 30, defense: 20 },
    special: 'arrow_rain', specialName: '화살비', specialDesc: '부채꼴로 화살 여러 발을 동시에 쏩니다.', reach: 1.2, hold: 'forward',
  },
  spear: {
    id: 'spear', name: '창', nameEn: 'Spear', emoji: '🔱', desc: '긴 사거리로 찌르는 무기예요.', style: 'melee',
    base: { attack: 55, speed: 50, area: 30, range: 70, weight: 50, defense: 35 },
    special: 'pierce', specialName: '꿰뚫기', specialDesc: '아주 멀리까지 강하게 찌릅니다.', reach: 3.2, hold: 'up',
  },
  axe: {
    id: 'axe', name: '도끼', nameEn: 'Axe', emoji: '🪓', desc: '강한 한 방과 넓은 범위를 가졌어요.', style: 'melee',
    base: { attack: 70, speed: 38, area: 60, range: 35, weight: 65, defense: 32 },
    special: 'whirlwind', specialName: '회오리 도끼', specialDesc: '빙글빙글 돌며 주변의 적을 모두 공격합니다.', reach: 2.3, hold: 'up',
  },
  hammer: {
    id: 'hammer', name: '망치', nameEn: 'Hammer', emoji: '🔨', desc: '공격력이 매우 높지만 느려요.', style: 'melee',
    base: { attack: 85, speed: 25, area: 65, range: 30, weight: 85, defense: 40 },
    special: 'ground_slam', specialName: '대지 강타', specialDesc: '땅을 내리쳐 주변 적에게 피해를 주고 잠시 기절시킵니다.', reach: 2.2, hold: 'up',
  },
  shield: {
    id: 'shield', name: '방패', nameEn: 'Shield', emoji: '🛡️', desc: '방어력이 매우 높아요. 공격은 약해요.', style: 'melee',
    base: { attack: 25, speed: 45, area: 40, range: 20, weight: 70, defense: 95 },
    special: 'guardian_wall', specialName: '수호의 벽', specialDesc: '잠시 동안 나와 근처 팀원이 받는 피해를 크게 줄입니다.', reach: 1.6, hold: 'arm',
  },
  staff: {
    id: 'staff', name: '지팡이', nameEn: 'Staff', emoji: '🪄', desc: '마법 구슬을 쏘고, 특수 기술이 강력해요.', style: 'magic',
    base: { attack: 40, speed: 45, area: 45, range: 65, weight: 35, defense: 30 },
    special: 'healing_light', specialName: '치유의 빛', specialDesc: '나와 근처 팀원의 체력을 회복합니다.', reach: 1.5, hold: 'up',
  },
  scythe: {
    id: 'scythe', name: '낫', nameEn: 'Scythe', emoji: '🌙', desc: '넓게 휘두르는 무기. 특수 기술로 체력을 흡수해요.', style: 'melee',
    base: { attack: 60, speed: 42, area: 75, range: 45, weight: 55, defense: 25 },
    special: 'harvest', specialName: '수확', specialDesc: '아주 넓게 베고 입힌 피해만큼 체력을 회복합니다.', reach: 2.6, hold: 'up',
  },
  twinblades: {
    id: 'twinblades', name: '쌍검', nameEn: 'Twin Blades', emoji: '✂️', desc: '두 자루의 칼로 빠르게 연속 공격해요.', style: 'melee',
    base: { attack: 45, speed: 75, area: 45, range: 25, weight: 35, defense: 25 },
    special: 'blade_storm', specialName: '칼날 폭풍', specialDesc: '회전하며 주변을 여러 번 벱니다.', reach: 1.8, hold: 'up',
  },
  special: {
    id: 'special', name: '특수 무기', nameEn: 'Special', emoji: '✨', desc: '독특한 모양의 무기. 특수 기술이 강해요.', style: 'magic',
    base: { attack: 45, speed: 50, area: 55, range: 50, weight: 40, defense: 30 },
    special: 'color_burst', specialName: '컬러 폭발', specialDesc: '주변에 물감 폭발을 일으킵니다.', reach: 2.0, hold: 'up',
  },
  freeform: {
    id: 'freeform', name: '자유 형태', nameEn: 'Freeform', emoji: '🎨', desc: '마음대로 그린 무기. 모든 능력이 고르게 나와요.', style: 'melee',
    base: { attack: 50, speed: 50, area: 50, range: 45, weight: 50, defense: 35 },
    special: 'paint_bomb', specialName: '물감 폭탄', specialDesc: '물감 폭탄을 던져 넓은 범위에 피해를 줍니다.', reach: 2.0, hold: 'up',
  },
}

export interface ToolInfo {
  id: string
  itemId: string
  name: string
  price: number
  desc: string
  /** Rendering style used by the drawing canvas. */
  render: 'ballpoint' | 'eraser' | 'pencil' | 'marker' | 'highlighter' | 'brush' | 'rainbow' | 'neon' | 'gold' | 'legendary'
  minWidth: number
  maxWidth: number
  defaultWidth: number
  specialBonus: number
}

export const TOOLS: ToolInfo[] = [
  { id: 'ballpoint', itemId: 'tool_ballpoint', name: '일반 볼펜', price: 0, desc: '처음 지급되는 기본 펜. 그린 선은 지울 수 없어요.', render: 'ballpoint', minWidth: 2, maxWidth: 10, defaultWidth: 4, specialBonus: 0 },
  { id: 'eraser', itemId: 'tool_eraser', name: '지우개', price: 400, desc: '그림을 지울 수 있어요.', render: 'eraser', minWidth: 8, maxWidth: 60, defaultWidth: 24, specialBonus: 0 },
  { id: 'pencil', itemId: 'tool_pencil', name: '색연필', price: 600, desc: '부드러운 색상 표현', render: 'pencil', minWidth: 3, maxWidth: 16, defaultWidth: 6, specialBonus: 0.01 },
  { id: 'marker', itemId: 'tool_marker', name: '매직펜', price: 900, desc: '굵고 선명한 선', render: 'marker', minWidth: 6, maxWidth: 30, defaultWidth: 14, specialBonus: 0.02 },
  { id: 'highlighter', itemId: 'tool_highlighter', name: '형광펜', price: 1200, desc: '반투명한 형광 효과', render: 'highlighter', minWidth: 10, maxWidth: 40, defaultWidth: 20, specialBonus: 0.02 },
  { id: 'brush', itemId: 'tool_brush', name: '붓', price: 1500, desc: '붓 느낌의 표현', render: 'brush', minWidth: 4, maxWidth: 40, defaultWidth: 16, specialBonus: 0.03 },
  { id: 'rainbow', itemId: 'tool_rainbow', name: '무지개 펜', price: 3000, desc: '여러 색상이 섞이는 선', render: 'rainbow', minWidth: 4, maxWidth: 30, defaultWidth: 10, specialBonus: 0.04 },
  { id: 'neon', itemId: 'tool_neon', name: '네온 펜', price: 5000, desc: '빛나는 선', render: 'neon', minWidth: 3, maxWidth: 24, defaultWidth: 8, specialBonus: 0.05 },
  { id: 'gold', itemId: 'tool_gold', name: '금색 펜', price: 7000, desc: '금색 표현', render: 'gold', minWidth: 3, maxWidth: 30, defaultWidth: 10, specialBonus: 0.06 },
  { id: 'legendary', itemId: 'tool_legendary', name: '전설의 펜', price: 10000, desc: '특별한 시각 효과', render: 'legendary', minWidth: 4, maxWidth: 30, defaultWidth: 12, specialBonus: 0.08 },
]
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<string, ToolInfo>

export interface PaperInfo {
  id: string
  name: string
  unlockLevel: number
  bg: string
  pattern: 'none' | 'lines' | 'grid' | 'texture' | 'stars' | 'glow' | 'sparkle'
  patternColor: string
  dark: boolean
}

export const PAPERS: PaperInfo[] = [
  { id: 'white', name: '흰 종이', unlockLevel: 1, bg: '#ffffff', pattern: 'none', patternColor: '#000000', dark: false },
  { id: 'lined', name: '줄무늬 종이', unlockLevel: 3, bg: '#fffdf5', pattern: 'lines', patternColor: '#9ec5ff', dark: false },
  { id: 'grid', name: '모눈 종이', unlockLevel: 5, bg: '#f8fbff', pattern: 'grid', patternColor: '#b8d4f0', dark: false },
  { id: 'drawing', name: '도화지', unlockLevel: 8, bg: '#fbf6ea', pattern: 'texture', patternColor: '#e6dcc4', dark: false },
  { id: 'blue', name: '파란 종이', unlockLevel: 12, bg: '#cfe6ff', pattern: 'none', patternColor: '#a8ccf5', dark: false },
  { id: 'black', name: '검은 종이', unlockLevel: 16, bg: '#1e1f26', pattern: 'none', patternColor: '#33343f', dark: true },
  { id: 'gold', name: '금색 종이', unlockLevel: 20, bg: '#f5d98a', pattern: 'sparkle', patternColor: '#fff3c4', dark: false },
  { id: 'neon', name: '네온 종이', unlockLevel: 30, bg: '#140a2e', pattern: 'glow', patternColor: '#ff3df2', dark: true },
  { id: 'legend', name: '전설의 종이', unlockLevel: 50, bg: '#0b1840', pattern: 'stars', patternColor: '#ffe27a', dark: true },
]
export const PAPER_BY_ID = Object.fromEntries(PAPERS.map((p) => [p.id, p])) as Record<string, PaperInfo>

export const CANVAS_SIZE = 1000
export const MAX_STROKES = 600
export const MAX_POINTS_TOTAL = 40000
export const MAX_PREVIEW_BYTES = 400_000
export const BASE_INVENTORY_SLOTS = 5
export const MAX_INVENTORY_SLOTS = 30
export const SLOT_EXPANSION = { itemId: 'slot_expand', price: 800, amount: 5 }

export const PALETTE = [
  '#111111', '#ffffff', '#ff4d4d', '#ff9f1c', '#ffd23f', '#3ddc84', '#1fb5a8', '#2e86ff',
  '#7b5cff', '#ff5fa2', '#8b5a2b', '#9aa0a6', '#5c6470', '#c0c4cc', '#ffb3c6', '#a0e7ff',
]

export const AI_DIFFICULTIES = ['easy', 'normal', 'hard', 'expert', 'legend'] as const
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number]
export const AI_DIFFICULTY_NAMES: Record<AiDifficulty, string> = {
  easy: '쉬움', normal: '보통', hard: '어려움', expert: '전문가', legend: '전설',
}

export const TEAMS = ['RED', 'BLUE'] as const
export type Team = (typeof TEAMS)[number]

export const ROLES = ['USER', 'MODERATOR', 'OPERATOR', 'ADMIN', 'SUPER_ADMIN'] as const
export type Role = (typeof ROLES)[number]
export const ROLE_NAMES: Record<Role, string> = {
  USER: '플레이어', MODERATOR: '모더레이터', OPERATOR: '운영자', ADMIN: '관리자', SUPER_ADMIN: '최고 관리자',
}

export const COSMETIC_SLOTS = [
  'hair', 'face', 'top', 'bottom', 'shoes', 'gloves', 'hat', 'glasses', 'accessory', 'color', 'back', 'victory',
] as const
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number]
export const COSMETIC_SLOT_NAMES: Record<CosmeticSlot, string> = {
  hair: '머리 모양', face: '얼굴', top: '상의', bottom: '하의', shoes: '신발', gloves: '장갑', hat: '모자',
  glasses: '안경', accessory: '액세서리', color: '캐릭터 색상', back: '등 장식', victory: '승리 효과',
}
export const PROFILE_SLOTS = ['frame', 'background', 'title', 'decoration'] as const
export type ProfileSlot = (typeof PROFILE_SLOTS)[number]
export const PROFILE_SLOT_NAMES: Record<ProfileSlot, string> = {
  frame: '프로필 테두리', background: '배경', title: '칭호', decoration: '프로필 장식',
}

export const MISSION_GOALS = ['PLAY_GAMES', 'WIN_GAMES', 'CREATE_WEAPONS', 'PLAY_WITH_FRIENDS', 'AI_GAMES', 'ATTEND'] as const
export type MissionGoal = (typeof MISSION_GOALS)[number]
export const MISSION_GOAL_NAMES: Record<MissionGoal, string> = {
  PLAY_GAMES: '게임 플레이', WIN_GAMES: '전투 승리', CREATE_WEAPONS: '무기 제작',
  PLAY_WITH_FRIENDS: '친구와 플레이', AI_GAMES: 'AI 대전 완료', ATTEND: '출석',
}

export const ATTENDANCE_REWARDS = [50, 60, 70, 80, 100, 120, 500]

export const CONTEST_CATEGORIES: Record<string, string> = {
  cool: '가장 멋진 무기', creative: '가장 창의적인 무기', cute: '가장 귀여운 무기',
  unique: '가장 독특한 무기', weekly: '주간 무기 대회', event: '특별 이벤트 대회',
}
export const CONTEST_VOTES_PER_USER = 3

export const REPORT_TYPES: Record<string, string> = {
  USER: '사용자 신고', CHAT: '채팅 신고', WEAPON: '무기 신고', NICKNAME: '부적절한 닉네임',
}
