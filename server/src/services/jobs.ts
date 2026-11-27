import { prisma } from '../db.ts'
import { ensureWeeklyContest, finalizeContests } from '../routes/content.ts'
import { emitAll } from './hub.ts'

/** Periodic housekeeping: expired sessions, weekly contests, contest results, scheduled notices. */
export function startJobs() {
  const run = async () => {
    try {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      await ensureWeeklyContest()
      await finalizeContests()
      await sendScheduledNotices()
    } catch (e) {
      console.error('[jobs]', e)
    }
  }
  void run()
  setInterval(run, 60_000).unref()
}

/** Notices marked "notify everyone" are pushed once their publish time arrives. */
async function sendScheduledNotices() {
  const due = await prisma.notice.findMany({ where: { deletedAt: null, notifyAll: true, notifiedAt: null, publishAt: { lte: new Date() } } })
  for (const n of due) {
    const users = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } })
    for (let i = 0; i < users.length; i += 500) {
      await prisma.notification.createMany({
        data: users.slice(i, i + 500).map((u) => ({ userId: u.id, type: 'NOTICE', title: n.title, body: n.body.slice(0, 120) })),
      })
    }
    await prisma.notice.update({ where: { id: n.id }, data: { notifiedAt: new Date() } })
    emitAll('notification', { type: 'NOTICE', title: n.title, body: '' })
  }
}
