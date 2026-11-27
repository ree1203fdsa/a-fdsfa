import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

// Empty in development (same origin via the Vite proxy); the game server's public URL on Vercel.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined

export function getSocket(): Socket {
  if (!socket) {
    const opts = {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      // Cross-origin sockets can't use the login cookie, so fetch a short-lived ticket on every (re)connect.
      auth: (cb: (data: object) => void) => {
        fetch('/api/auth/socket-token', { method: 'POST', headers: { 'x-requested-with': 'colorwars' }, credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : { token: null }))
          .then((j: { token: string | null }) => cb({ token: j.token }))
          .catch(() => cb({}))
      },
    }
    socket = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts)
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
