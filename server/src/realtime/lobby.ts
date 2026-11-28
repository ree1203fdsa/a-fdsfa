import type { Server, Socket } from 'socket.io'
import { filterChat } from '../../../shared/text.ts'
import { adminPlay } from '../auth.ts'
import { prisma } from '../db.ts'
import { isMuted } from './moderation.ts'

export interface ChatMessage {
  id: number
  userId: number
  nickname: string
  level: number
  text: string
  at: number
  staff?: boolean
}

const history: ChatMessage[] = []
const lastSent = new Map<number, number>()
let seq = 0

export function setupLobby(io: Server, socket: Socket) {
  socket.on('lobby:join', (ack?: (msgs: ChatMessage[]) => void) => {
    socket.join('lobby')
    if (typeof ack === 'function') ack(history.slice(-40))
  })
  socket.on('lobby:leave', () => socket.leave('lobby'))

  socket.on('lobby:chat', async (raw: unknown, ack?: (r: { ok: boolean; error?: string }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const userId = socket.data.userId as number
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
    if (!text) return reply({ ok: false, error: '메시지를 입력해 주세요.' })
    const now = Date.now()
    if (now - (lastSent.get(userId) ?? 0) < 1500) return reply({ ok: false, error: '너무 빨리 보내고 있어요. 잠시만요!' })
    if (isMuted(userId)) return reply({ ok: false, error: '운영진이 잠시 채팅을 막았어요.' })
    lastSent.set(userId, now)
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true, level: true, role: true, settings: true } })
    if (!u) return reply({ ok: false })
    const msg: ChatMessage = { id: ++seq, userId, nickname: u.nickname, level: u.level, text: filterChat(text), at: now, staff: adminPlay(u) }
    history.push(msg)
    if (history.length > 200) history.splice(0, history.length - 200)
    io.to('lobby').emit('lobby:message', msg)
    reply({ ok: true })
  })
}

export function findLobbyMessage(id: number) {
  return history.find((m) => m.id === id)
}
