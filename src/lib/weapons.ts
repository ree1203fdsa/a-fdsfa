import type { WeaponType } from '@shared/constants'
import type { ModelParams, Stroke } from '@shared/weapon'
import type { StatBlock } from '@/components/StatBars'

export interface WeaponSummary {
  id: number
  userId: number
  name: string
  type: WeaponType
  paperId: string
  previewPng: string
  modelParams: ModelParams
  toolsUsed: string[]
  stats: StatBlock
  special: string
  favorite: boolean
  createdAt: string
}

export interface WeaponDetail extends WeaponSummary {
  strokes: Stroke[]
}

export interface WeaponList {
  weapons: WeaponSummary[]
  slots: number
  used: number
  equippedWeaponId: number | null
}

export const statTotal = (s: StatBlock) => s.attack + s.speed + s.area + s.range + s.defense
