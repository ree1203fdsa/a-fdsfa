import { create } from 'zustand'
import type { Team } from '@shared/constants'

export interface RoomMember { userId: number; nickname: string; level: number; team: Team; ready: boolean; weapon: string; weaponType: string; connected: boolean; staff?: boolean }
export interface RoomView {
  code: string; hostId: number; isPublic: boolean; mapId: string; fillBots: boolean; status: 'WAITING' | 'PLAYING'; max: number
  members: RoomMember[]; chat: { id: number; nickname: string; text: string; at: number; system?: boolean }[]
}

interface RoomState {
  room: RoomView | null
  invite: { code: string; from: string } | null
  set: (r: RoomView | null) => void
  setInvite: (i: { code: string; from: string } | null) => void
}

export const useRoom = create<RoomState>((set) => ({
  room: null,
  invite: null,
  set: (room) => set({ room }),
  setInvite: (invite) => set({ invite }),
}))
