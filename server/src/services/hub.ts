import type { Server } from 'socket.io'

let io: Server | null = null

export function setIo(server: Server) {
  io = server
}

export function emitToUser(userId: number, event: string, payload: unknown) {
  io?.to('user:' + userId).emit(event, payload)
}

export function emitAll(event: string, payload: unknown) {
  io?.emit(event, payload)
}

export function socketCount() {
  return io?.engine.clientsCount ?? 0
}
