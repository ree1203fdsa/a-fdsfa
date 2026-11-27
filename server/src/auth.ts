import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { checkNickname, checkPassword, checkUsername } from '../../shared/text.ts'
import { ROLES, type Role } from '../../shared/constants.ts'
import { levelFromXp } from '../../shared/progression.ts'
import { prisma, parseJson } from './db.ts'
import { bad, forbidden, HttpError, parse, rateLimit } from './http.ts'
import { grant, notify } from './services/economy.ts'
import { getRewards } from './services/config.ts'
import type { User } from './generated/prisma/client.ts'

export const GAME_COOKIE = 'cw_session'
export const ADMIN_COOKIE = 'cw_admin'
const SECURE = process.env.NODE_ENV === 'production'
// Compared against for unknown usernames so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('colorwars-dummy-password', 10)

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User
      admin?: User
    }
  }
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

// Signing key for socket tickets; generated once and kept out of git (server/data is ignored).
const SECRET_FILE = path.resolve(import.meta.dirname, '../data/secret.key')
const SECRET = (() => {
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, 'utf8').trim()
  const s = crypto.randomBytes(32).toString('hex')
  mkdirSync(path.dirname(SECRET_FILE), { recursive: true })
  writeFileSync(SECRET_FILE, s)
  return s
})()

/** Short-lived ticket so a socket on another origin (Vercel → this PC) can prove who the player is. */
export function socketToken(userId: number) {
  const exp = Date.now() + 120_000
  const body = `${userId}.${exp}`
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`
}

export function verifySocketToken(token: unknown): number | null {
  if (typeof token !== 'string') return null
  const [uid, exp, sig] = token.split('.')
  if (!uid || !exp || !sig) return null
  const expected = crypto.createHmac('sha256', SECRET).update(`${uid}.${exp}`).digest('base64url')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  if (Number(exp) < Date.now()) return null
  return Number(uid)
}

export function recoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const part = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('')
  return `${part()}-${part()}-${part()}`
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

async function createSession(req: Request, res: Response, userId: number, kind: 'GAME' | 'ADMIN', remember: boolean) {
  const token = crypto.randomBytes(32).toString('base64url')
  const ttl = kind === 'ADMIN' ? 8 * 3600_000 : remember ? 30 * 86400_000 : 86400_000
  await prisma.session.create({
    data: {
      tokenHash: sha256(token), userId, kind, expiresAt: new Date(Date.now() + ttl),
      ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200),
    },
  })
  res.cookie(kind === 'ADMIN' ? ADMIN_COOKIE : GAME_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: SECURE || req.secure, path: '/',
    maxAge: remember || kind === 'ADMIN' ? ttl : undefined,
  })
}

export async function userFromToken(token: string | undefined, kind: 'GAME' | 'ADMIN'): Promise<User | null> {
  if (!token) return null
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
  if (!s || s.kind !== kind || s.expiresAt < new Date() || s.user.deletedAt) return null
  return s.user
}

export function accountBlockReason(u: User): string | null {
  if (u.status === 'BANNED') return '이용이 영구 제한된 계정이에요.' + (u.statusReason ? ` (사유: ${u.statusReason})` : '')
  if (u.status === 'SUSPENDED' && u.suspendedUntil && u.suspendedUntil > new Date()) {
    return `${u.suspendedUntil.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}까지 이용이 정지된 계정이에요.` + (u.statusReason ? ` (사유: ${u.statusReason})` : '')
  }
  return null
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const u = await userFromToken(req.cookies?.[GAME_COOKIE], 'GAME')
  if (u && !accountBlockReason(u)) req.user = u
  next()
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, '로그인이 필요해요.', 'UNAUTHORIZED'))
  next()
}

const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, OPERATOR: 2, ADMIN: 3, SUPER_ADMIN: 4 }
export const PERMISSIONS = {
  dashboard: 'MODERATOR', 'users.view': 'MODERATOR', 'users.suspend': 'MODERATOR', 'users.ban': 'ADMIN',
  'users.economy': 'ADMIN', 'users.password': 'ADMIN', 'users.role': 'SUPER_ADMIN', 'weapons.moderate': 'MODERATOR',
  'weapons.delete': 'OPERATOR', shop: 'ADMIN', missions: 'OPERATOR', events: 'OPERATOR', notices: 'OPERATOR',
  contests: 'OPERATOR', game: 'OPERATOR', reports: 'MODERATOR', server: 'ADMIN', logs: 'ADMIN', support: 'MODERATOR',
} as const satisfies Record<string, Role>
export type Permission = keyof typeof PERMISSIONS

export const hasPermission = (role: string, p: Permission) => (RANK[role as Role] ?? 0) >= RANK[PERMISSIONS[p]]
export const isStaff = (role: string) => (RANK[role as Role] ?? 0) >= RANK.MODERATOR
export const roleRank = (role: string) => RANK[role as Role] ?? 0

export async function loadAdmin(req: Request, _res: Response, next: NextFunction) {
  const u = await userFromToken(req.cookies?.[ADMIN_COOKIE], 'ADMIN')
  if (u && isStaff(u.role) && !accountBlockReason(u)) req.admin = u
  next()
}

export function requirePerm(p: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) return next(new HttpError(401, '운영자 로그인이 필요해요.', 'ADMIN_UNAUTHORIZED'))
    if (!hasPermission(req.admin.role, p)) return next(forbidden('이 기능을 쓸 권한이 없어요.'))
    next()
  }
}

export function meView(u: User) {
  const lv = levelFromXp(u.xp)
  return {
    id: u.id, username: u.username, nickname: u.nickname, level: u.level, xp: u.xp, xpInto: lv.into, xpNeed: lv.need,
    coins: u.coins, avatar: parseJson(u.avatar, {}), profile: parseJson(u.profile, {}), repWeaponId: u.repWeaponId,
    equippedWeaponId: u.equippedWeaponId, inventorySlots: u.inventorySlots, tutorialDone: u.tutorialDone,
    settings: parseJson(u.settings, {}), isStaff: isStaff(u.role),
    stats: { totalGames: u.totalGames, wins: u.wins, losses: u.losses, draws: u.draws, battleScore: u.battleScore, weaponsCreated: u.weaponsCreated },
    createdAt: u.createdAt,
  }
}

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().max(32),
  password: z.string().max(128),
  remember: z.boolean().optional().default(true),
})

export const authRouter = Router()

authRouter.post('/check-username', rateLimit('check', 60, 60_000), async (req, res) => {
  const { username } = parse(z.object({ username: z.string().trim().toLowerCase() }), req.body)
  const err = checkUsername(username)
  if (err) return void res.json({ available: false, message: err })
  const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } })
  res.json({ available: !exists, message: exists ? '이미 사용 중인 아이디예요.' : '사용할 수 있는 아이디예요.' })
})

authRouter.post('/check-nickname', rateLimit('check', 60, 60_000), async (req, res) => {
  const { nickname } = parse(z.object({ nickname: z.string().trim() }), req.body)
  const err = checkNickname(nickname)
  if (err) return void res.json({ available: false, message: err })
  const exists = await prisma.user.findUnique({ where: { nickname }, select: { id: true } })
  res.json({ available: !exists, message: exists ? '이미 사용 중인 닉네임이에요.' : '사용할 수 있는 닉네임이에요.' })
})

authRouter.post('/register', rateLimit('register', 10, 3600_000), async (req, res) => {
  const body = parse(z.object({
    username: z.string().trim().toLowerCase(),
    nickname: z.string().trim(),
    password: z.string(),
    passwordConfirm: z.string(),
    agreeTerms: z.literal(true, { message: '이용약관에 동의해 주세요.' }),
    agreePrivacy: z.literal(true, { message: '개인정보 처리 안내에 동의해 주세요.' }),
  }), req.body)
  const e = checkUsername(body.username) ?? checkNickname(body.nickname) ?? checkPassword(body.password, body.username)
  if (e) throw bad(e)
  if (body.password !== body.passwordConfirm) throw bad('비밀번호 확인이 일치하지 않아요.')
  const [u1, u2] = await Promise.all([
    prisma.user.findUnique({ where: { username: body.username } }),
    prisma.user.findUnique({ where: { nickname: body.nickname } }),
  ])
  if (u1) throw bad('이미 사용 중인 아이디예요.', 'USERNAME_TAKEN')
  if (u2) throw bad('이미 사용 중인 닉네임이에요.', 'NICKNAME_TAKEN')
  const code = recoveryCode()
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        username: body.username, nickname: body.nickname,
        passwordHash: await bcrypt.hash(body.password, 10), recoveryCodeHash: sha256(code),
        settings: JSON.stringify({ bgm: 60, sfx: 80, quality: 'medium', sensitivity: 1, language: 'ko', brightness: 100, notifications: true }),
      },
    })
    await tx.userItem.create({ data: { userId: u.id, itemId: 'tool_ballpoint', equipped: true } })
    return u
  }).catch((err) => {
    if (String(err?.code) === 'P2002') throw bad('이미 사용 중인 아이디 또는 닉네임이에요.')
    throw err
  })
  await createSession(req, res, user.id, 'GAME', true)
  await afterLogin(req, user.id, true)
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  res.json({ user: meView(fresh), recoveryCode: code })
})

async function afterLogin(req: Request, userId: number, isNew: boolean) {
  const ip = req.ip ?? ''
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 200)
  const recent = await prisma.loginHistory.findMany({ where: { userId, success: true }, orderBy: { createdAt: 'desc' }, take: 10 })
  const suspicious = !isNew && recent.length > 0 && !recent.some((h) => h.ip === ip || h.userAgent === ua)
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  await prisma.loginHistory.create({ data: { userId, username: u.username, ip, userAgent: ua, success: true, suspicious } })
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } })
  const rewards = await getRewards()
  await prisma.$transaction(async (tx) => {
    const r = await grant(tx, userId, 'first_login', rewards.firstLoginCoins, 0, '첫 로그인 보상')
    if (r.granted) await notify(tx, userId, 'REWARD', '컬러워즈에 오신 것을 환영해요!', `첫 로그인 보상으로 ${r.coins}코인을 받았어요.`)
    if (suspicious) await notify(tx, userId, 'SECURITY', '새로운 환경에서 로그인했어요', '본인이 아니라면 바로 비밀번호를 바꿔 주세요.', { ip })
  })
}

authRouter.post('/login', rateLimit('login', 30, 10 * 60_000), async (req, res) => {
  const body = parse(loginSchema, req.body)
  const u = await prisma.user.findUnique({ where: { username: body.username } })
  const fail = async (reason: string, message: string) => {
    await prisma.loginHistory.create({
      data: { userId: u?.id, username: body.username.slice(0, 32), ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200), success: false, reason },
    })
    throw new HttpError(401, message, 'LOGIN_FAILED')
  }
  if (!u || u.deletedAt) {
    await bcrypt.compare(body.password, DUMMY_HASH)
    return fail('NO_USER', '아이디 또는 비밀번호가 올바르지 않아요.')
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    const min = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000)
    return fail('LOCKED', `로그인을 여러 번 실패해서 잠겼어요. ${min}분 뒤에 다시 시도해 주세요.`)
  }
  if (!(await bcrypt.compare(body.password, u.passwordHash))) {
    const failed = u.failedLogins + 1
    await prisma.user.update({
      where: { id: u.id },
      data: { failedLogins: failed >= 5 ? 0 : failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : undefined },
    })
    if (failed >= 5) await notify(prisma, u.id, 'SECURITY', '로그인 시도가 여러 번 실패했어요', '계정을 보호하기 위해 15분 동안 로그인을 막았어요.')
    return fail('BAD_PASSWORD', failed >= 5 ? '비밀번호를 5번 틀려서 15분 동안 로그인이 잠겼어요.' : `아이디 또는 비밀번호가 올바르지 않아요. (${failed}/5)`)
  }
  const blocked = accountBlockReason(u)
  if (blocked) return fail('BLOCKED', blocked)
  await createSession(req, res, u.id, 'GAME', body.remember)
  await afterLogin(req, u.id, false)
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
  res.json({ user: meView(fresh) })
})

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[GAME_COOKIE]
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
  res.clearCookie(GAME_COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.[GAME_COOKIE]
  const u = await userFromToken(token, 'GAME')
  if (!u) return void res.json({ user: null })
  const blocked = accountBlockReason(u)
  if (blocked) {
    res.clearCookie(GAME_COOKIE, { path: '/' })
    return void res.json({ user: null, blocked })
  }
  res.json({ user: meView(u) })
})

authRouter.post('/socket-token', async (req, res) => {
  const u = await userFromToken(req.cookies?.[GAME_COOKIE], 'GAME')
  if (!u || accountBlockReason(u)) throw new HttpError(401, '로그인이 필요해요.', 'UNAUTHORIZED')
  res.json({ token: socketToken(u.id) })
})

authRouter.post('/password', requireUser, async (req, res) => {
  const body = parse(z.object({ current: z.string(), next: z.string(), confirm: z.string() }), req.body)
  const u = req.user!
  if (!(await bcrypt.compare(body.current, u.passwordHash))) throw bad('현재 비밀번호가 올바르지 않아요.')
  const e = checkPassword(body.next, u.username)
  if (e) throw bad(e)
  if (body.next !== body.confirm) throw bad('새 비밀번호 확인이 일치하지 않아요.')
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(body.next, 10) } })
  const keep = sha256(req.cookies[GAME_COOKIE])
  await prisma.session.deleteMany({ where: { userId: u.id, NOT: { tokenHash: keep } } })
  await notify(prisma, u.id, 'SECURITY', '비밀번호가 변경되었어요', '다른 기기에서는 자동으로 로그아웃되었어요.')
  res.json({ ok: true })
})

authRouter.post('/recovery-code', requireUser, async (req, res) => {
  const { password } = parse(z.object({ password: z.string() }), req.body)
  if (!(await bcrypt.compare(password, req.user!.passwordHash))) throw bad('비밀번호가 올바르지 않아요.')
  const code = recoveryCode()
  await prisma.user.update({ where: { id: req.user!.id }, data: { recoveryCodeHash: sha256(code) } })
  res.json({ recoveryCode: code })
})

authRouter.post('/delete', requireUser, async (req, res) => {
  const { password } = parse(z.object({ password: z.string() }), req.body)
  const u = req.user!
  if (!(await bcrypt.compare(password, u.passwordHash))) throw bad('비밀번호가 올바르지 않아요.')
  if (u.role !== 'USER') throw bad('운영 계정은 탈퇴할 수 없어요. 최고 관리자에게 문의해 주세요.')
  const tag = 'del_' + u.id + '_' + Date.now().toString(36)
  await prisma.$transaction([
    prisma.user.update({ where: { id: u.id }, data: { deletedAt: new Date(), username: tag, nickname: tag.slice(0, 20), status: 'DELETED', recoveryCodeHash: null } }),
    prisma.session.deleteMany({ where: { userId: u.id } }),
    prisma.friendship.deleteMany({ where: { OR: [{ requesterId: u.id }, { addresseeId: u.id }] } }),
  ])
  res.clearCookie(GAME_COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/login-history', requireUser, async (req, res) => {
  const rows = await prisma.loginHistory.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 20 })
  res.json(rows.map((r) => ({ id: r.id, success: r.success, ip: r.ip, device: r.userAgent, suspicious: r.suspicious, reason: r.reason, createdAt: r.createdAt })))
})

authRouter.post('/recover', rateLimit('recover', 10, 3600_000), async (req, res) => {
  const body = parse(z.object({
    username: z.string().trim().toLowerCase(), code: z.string().trim().toUpperCase(), password: z.string(), confirm: z.string(),
  }), req.body)
  const u = await prisma.user.findUnique({ where: { username: body.username } })
  const generic = bad('아이디 또는 복구 코드가 올바르지 않아요.')
  if (!u || u.deletedAt) throw generic
  const h = sha256(body.code)
  let viaRequest: number | null = null
  if (u.recoveryCodeHash !== h) {
    const r = await prisma.passwordResetRequest.findFirst({
      where: { userId: u.id, status: 'ISSUED', codeHash: h, expiresAt: { gt: new Date() } },
    })
    if (!r) throw generic
    viaRequest = r.id
  }
  const e = checkPassword(body.password, u.username)
  if (e) throw bad(e)
  if (body.password !== body.confirm) throw bad('비밀번호 확인이 일치하지 않아요.')
  const next = recoveryCode()
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(body.password, 10), recoveryCodeHash: sha256(next), failedLogins: 0, lockedUntil: null },
    })
    await tx.session.deleteMany({ where: { userId: u.id } })
    if (viaRequest) await tx.passwordResetRequest.update({ where: { id: viaRequest }, data: { status: 'USED' } })
  })
  res.json({ ok: true, recoveryCode: next })
})

authRouter.post('/reset-request', rateLimit('reset', 5, 3600_000), async (req, res) => {
  const body = parse(z.object({
    username: z.string().trim().toLowerCase().max(32), nickname: z.string().trim().max(20), message: z.string().max(500).default(''),
  }), req.body)
  const u = await prisma.user.findUnique({ where: { username: body.username } })
  if (u && !u.deletedAt && u.nickname === body.nickname) {
    const pending = await prisma.passwordResetRequest.count({ where: { userId: u.id, status: 'PENDING' } })
    if (!pending) await prisma.passwordResetRequest.create({ data: { userId: u.id, message: body.message } })
  }
  res.json({ ok: true })
})

export const adminAuthRouter = Router()

adminAuthRouter.post('/login', rateLimit('admin-login', 10, 10 * 60_000), async (req, res) => {
  const body = parse(loginSchema, req.body)
  const u = await prisma.user.findUnique({ where: { username: body.username } })
  const ok = u && !u.deletedAt && (await bcrypt.compare(body.password, u.passwordHash))
  await prisma.loginHistory.create({
    data: { userId: u?.id, username: body.username.slice(0, 32), ip: req.ip, userAgent: 'ADMIN ' + String(req.headers['user-agent'] ?? '').slice(0, 190), success: Boolean(ok && isStaff(u!.role)), reason: ok ? (isStaff(u!.role) ? 'ADMIN' : 'NOT_STAFF') : 'BAD_PASSWORD' },
  })
  if (!ok) throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않아요.', 'LOGIN_FAILED')
  if (!isStaff(u!.role)) throw forbidden('운영 권한이 없는 계정이에요.')
  const blocked = accountBlockReason(u!)
  if (blocked) throw forbidden(blocked)
  await createSession(req, res, u!.id, 'ADMIN', false)
  await prisma.adminLog.create({ data: { adminId: u!.id, action: '운영자 로그인', detail: req.ip ?? '' } })
  res.json({ admin: adminView(u!) })
})

adminAuthRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[ADMIN_COOKIE]
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } })
  res.clearCookie(ADMIN_COOKIE, { path: '/' })
  res.json({ ok: true })
})

adminAuthRouter.get('/me', loadAdmin, (req, res) => {
  res.json({ admin: req.admin ? adminView(req.admin) : null })
})

export function adminView(u: User) {
  const perms = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(u.role, p))
  return { id: u.id, username: u.username, nickname: u.nickname, role: u.role, permissions: perms }
}

export const isRole = (r: string): r is Role => (ROLES as readonly string[]).includes(r)
