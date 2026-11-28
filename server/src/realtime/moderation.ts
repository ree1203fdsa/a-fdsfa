import type { Server, Socket } from 'socket.io'
import { adminPlay, hasPermission, roleRank } from '../auth.ts'
import { prisma } from '../db.ts'
import { adminLog, notify } from '../services/economy.ts'
import { staffKickFromRoom } from './rooms.ts'

const mutedUntil = new Map<number, number>()

export function isMuted(userId: number) {
  const t = mutedUntil.get(userId)
  return Boolean(t && t > Date.now())
}

type Ack = (r: { ok: boolean; error?: string }) => void

/**
 * Moderation from inside the game. Only staff currently playing in admin mode may use it, and the
 * usual role rules apply (same checks as the admin center).
 */
export function setupModeration(io: Server, socket: Socket) {
  const me = socket.data.userId as number
  const guard = async (raw: unknown, fn: unknown) => {
    const reply: Ack = typeof fn === 'function' ? (fn as Ack) : () => {}
    const actor = await prisma.user.findUnique({ where: { id: me } })
    if (!actor || !adminPlay(actor)) return { reply, error: reply({ ok: false, error: '관리자로 플레이 중일 때만 쓸 수 있어요.' }) }
    const targetId = Number((raw as { userId?: number })?.userId)
    const target = await prisma.user.findFirst({ where: { id: targetId, deletedAt: null } })
    if (!target) return { reply, error: reply({ ok: false, error: '플레이어를 찾을 수 없어요.' }) }
    if (target.id === me) return { reply, error: reply({ ok: false, error: '자기 자신에게는 할 수 없어요.' }) }
    if (actor.role !== 'SUPER_ADMIN' && roleRank(target.role) >= roleRank(actor.role)) return { reply, error: reply({ ok: false, error: '같거나 높은 등급의 운영진은 관리할 수 없어요.' }) }
    return { reply, actor, target }
  }

  socket.on('mod:mute', async (raw: unknown, fn) => {
    const g = await guard(raw, fn)
    if (!g.actor) return
    const minutes = Math.max(1, Math.min(1440, Number((raw as { minutes?: number })?.minutes) || 10))
    mutedUntil.set(g.target.id, Date.now() + minutes * 60_000)
    await notify(prisma, g.target.id, 'SECURITY', `운영진이 채팅을 ${minutes}분 동안 막았어요`, '바른 말을 써 주세요.')
    await adminLog(prisma, me, `게임 안 채팅 금지 ${minutes}분`, 'USER', g.target.id)
    g.reply({ ok: true })
  })

  socket.on('mod:suspend', async (raw: unknown, fn) => {
    const g = await guard(raw, fn)
    if (!g.actor) return
    if (!hasPermission(g.actor.role, 'users.suspend')) return g.reply({ ok: false, error: '정지 권한이 없어요.' })
    const days = Math.max(1, Math.min(365, Number((raw as { days?: number })?.days) || 1))
    if (days > 7 && !hasPermission(g.actor.role, 'users.ban')) return g.reply({ ok: false, error: '최대 7일까지 정지할 수 있어요.' })
    const reason = String((raw as { reason?: string })?.reason ?? '').slice(0, 200) || '게임 안에서 운영진 판단'
    await prisma.$transaction([
      prisma.user.update({ where: { id: g.target.id }, data: { status: 'SUSPENDED', suspendedUntil: new Date(Date.now() + days * 86400_000), statusReason: reason } }),
      prisma.session.deleteMany({ where: { userId: g.target.id } }),
    ])
    io.to('user:' + g.target.id).emit('account:suspended', { days, reason })
    io.in('user:' + g.target.id).disconnectSockets(true)
    await adminLog(prisma, me, `게임 안 계정 ${days}일 정지`, 'USER', g.target.id, reason)
    g.reply({ ok: true })
  })

  socket.on('mod:kick-room', async (raw: unknown, fn) => {
    const g = await guard(raw, fn)
    if (!g.actor) return
    const ok = await staffKickFromRoom(io, g.target.id)
    if (ok) await adminLog(prisma, me, '게임 안 방에서 내보내기', 'USER', g.target.id)
    g.reply(ok ? { ok: true } : { ok: false, error: '그 플레이어는 대기 중인 방에 있지 않아요.' })
  })
}
