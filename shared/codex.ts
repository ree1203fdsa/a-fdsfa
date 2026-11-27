import { TOOLS, WEAPON_INFO, WEAPON_TYPES } from './constants.ts'

export interface CodexEntry {
  key: string
  group: 'type' | 'style'
  name: string
  icon: string
  desc: string
}

export const CODEX: CodexEntry[] = [
  ...WEAPON_TYPES.map((t) => ({ key: 'type:' + t, group: 'type' as const, name: WEAPON_INFO[t].name, icon: WEAPON_INFO[t].emoji, desc: WEAPON_INFO[t].desc })),
  ...TOOLS.filter((t) => !['ballpoint', 'eraser'].includes(t.id)).map((t) => ({
    key: 'tool:' + t.id, group: 'style' as const, name: `${t.name} 무기`, icon: '🖌️', desc: `${t.name}으로 그린 무기. ${t.desc}`,
  })),
]

export const CODEX_REWARDS = [
  { pct: 25, coins: 300 },
  { pct: 50, coins: 600 },
  { pct: 75, coins: 1000 },
  { pct: 100, coins: 2000 },
]
