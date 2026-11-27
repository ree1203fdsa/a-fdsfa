import type { Server } from 'socket.io'
import { accountBlockReason, GAME_COOKIE, parseCookies, userFromToken, verifySocketToken } from '../auth.ts'
import { prisma } from '../db.ts'
import { setupLobby } from './lobby.ts'

export function setupRealtime(io: Server) {
  io.use(async (socket, next) => {
    // Same-origin sockets (local dev) carry the login cookie; Vercel-hosted pages send a signed ticket.
    const ticketUser = verifySocketToken(socket.handshake.auth?.token)
    const user = ticketUser
      ? await prisma.user.findFirst({ where: { id: ticketUser, deletedAt: null } })
      : await userFromToken(parseCookies(socket.handshake.headers.cookie)[GAME_COOKIE], 'GAME')
    if (!user || accountBlockReason(user)) return next(new Error('UNAUTHORIZED'))
    socket.data.userId = user.id
    socket.data.nickname = user.nickname
    socket.data.level = user.level
    next()
  })

  io.on('connection', (socket) => {
    socket.join('user:' + socket.data.userId)
    setupLobby(io, socket)
  })
}
