import type { Server, Socket } from 'socket.io'
import { filterChat } from '../../../shared/text.ts'

export interface ChatMessage {
  id: number
  userId: number
  nickname: string
  level: number
  text: string
  at: number
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

  socket.on('lobby:chat', (raw: unknown, ack?: (r: { ok: boolean; error?: string }) => void) => {
    const reply = typeof ack === 'function' ? ack : () => {}
    const userId = socket.data.userId as number
    const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
    if (!text) return reply({ ok: false, error: '메시지를 입력해 주세요.' })
    const now = Date.now()
    if (now - (lastSent.get(userId) ?? 0) < 1500) return reply({ ok: false, error: '너무 빨리 보내고 있어요. 잠시만요!' })
    if (socket.data.muted) return reply({ ok: false, error: '채팅이 제한된 계정이에요.' })
    lastSent.set(userId, now)
    const msg: ChatMessage = { id: ++seq, userId, nickname: socket.data.nickname, level: socket.data.level ?? 1, text: filterChat(text), at: now }
    history.push(msg)
    if (history.length > 200) history.splice(0, history.length - 200)
    io.to('lobby').emit('lobby:message', msg)
    reply({ ok: true })
  })
}

export function findLobbyMessage(id: number) {
  return history.find((m) => m.id === id)
}
