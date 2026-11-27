import cookieParser from 'cookie-parser'
import express from 'express'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { Server } from 'socket.io'
import { adminAuthRouter, authRouter, loadAdmin, loadUser } from './auth.ts'
import { prisma } from './db.ts'
import { errorHandler, HttpError, rateLimit } from './http.ts'
import { setIo } from './services/hub.ts'
import { apiRouter } from './routes/index.ts'
import { adminRouter } from './routes/admin.ts'
import { setupRealtime } from './realtime/index.ts'
import { startJobs } from './services/jobs.ts'
import { startPhoneSync } from './routes/phone.ts'
import { supportRouter } from './routes/content.ts'

const PORT = Number(process.env.PORT ?? 3001)
export const startedAt = new Date()

const app = express()
// Requests come through up to two proxies (Vercel rewrite → Tailscale Funnel); trust both so
// rate limits key on the real player address instead of Vercel's.
app.set('trust proxy', 2)
app.disable('x-powered-by')
const jsonSmall = express.json({ limit: '1.5mb' })
const jsonLarge = express.json({ limit: '9mb' })
app.use((req, res, next) => (req.path === '/api/phone/send' ? jsonLarge : jsonSmall)(req, res, next))
app.use(cookieParser())
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  // Cross-site forms can't set custom headers, so this blocks CSRF on state-changing calls.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'colorwars') {
    return next(new HttpError(403, '허용되지 않은 요청이에요.', 'CSRF'))
  }
  next()
})
app.use('/api', rateLimit('api', 600, 60_000))

app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ ok: true, startedAt })
})
app.get('/api/lan', (_req, res) => {
  // LAN addresses let a phone on the same Wi-Fi open the game (e.g. to save .glb files on it).
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254'))
    .map((n) => n!.address)
  res.json({ ips, port: 5180 })
})
app.use('/api/support', supportRouter)
app.use('/api/auth', authRouter)
app.use('/api/admin-auth', adminAuthRouter)
app.use('/api/admin', loadAdmin, adminRouter)
app.use('/api', loadUser, apiRouter)
app.use('/api', (_req, _res, next) => next(new HttpError(404, '없는 주소예요.', 'NOT_FOUND')))

const dist = path.resolve(import.meta.dirname, '../../dist')
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
} else {
  // Screens are served by Vite locally or by Vercel publicly; this server only answers /api and sockets.
  app.get('/', (req, res) => {
    if (req.hostname.endsWith('.ts.net')) return void res.type('text/plain; charset=utf-8').send('컬러워즈 게임 서버가 실행 중이에요.')
    res.redirect(`http://${req.hostname}:5180/`)
  })
}
app.use(errorHandler)

const server = createServer(app)
// Browsers may open the socket from the Vercel site; identity comes from a signed ticket, not cookies.
const SOCKET_ORIGINS = [/^https:\/\/[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost:\d+$/, /^http:\/\/(\d+\.){3}\d+:5180$/]
const io = new Server(server, {
  path: '/socket.io',
  maxHttpBufferSize: 64_000,
  cors: { origin: (origin, cb) => cb(null, !origin || SOCKET_ORIGINS.some((r) => r.test(origin))), credentials: false },
})
setIo(io)
setupRealtime(io)
startJobs()
startPhoneSync()

server.listen(PORT, () => {
  console.log(`[컬러워즈 서버] http://localhost:${PORT} 에서 실행 중`)
})
