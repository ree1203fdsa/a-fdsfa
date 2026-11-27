import type { Server } from 'socket.io'
import { accountBlockReason, GAME_COOKIE, parseCookies, userFromToken } from '../auth.ts'
import { setupLobby } from './lobby.ts'

export function setupRealtime(io: Server) {
  io.use(async (socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie)
    const user = await userFromToken(cookies[GAME_COOKIE], 'GAME')
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
