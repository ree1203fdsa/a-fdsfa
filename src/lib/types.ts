export interface Me {
  id: number
  username: string
  nickname: string
  level: number
  xp: number
  xpInto: number
  xpNeed: number
  coins: number
  avatar: Record<string, string>
  profile: Record<string, string>
  repWeaponId: number | null
  equippedWeaponId: number | null
  inventorySlots: number
  tutorialDone: boolean
  settings: Settings
  isStaff: boolean
  role: string
  adminPlay: boolean
  stats: { totalGames: number; wins: number; losses: number; draws: number; battleScore: number; weaponsCreated: number }
  createdAt: string
}

export interface Settings {
  bgm?: number
  sfx?: number
  quality?: 'low' | 'medium' | 'high'
  sensitivity?: number
  language?: 'ko' | 'en'
  brightness?: number
  notifications?: boolean
  mobileButtonScale?: number
  mobileLayout?: 'right' | 'left'
  autoRun?: boolean
  keys?: Record<string, string>
  showOnline?: boolean
  allowInvites?: 'all' | 'friends' | 'none'
  tutorialSlidesSeen?: boolean
}
