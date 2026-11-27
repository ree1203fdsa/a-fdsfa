import { prisma } from '../db.ts'

/** Periodic housekeeping: expired sessions. */
export function startJobs() {
  const run = async () => {
    try {
      await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    } catch (e) {
      console.error('[jobs]', e)
    }
  }
  run()
  setInterval(run, 10 * 60_000).unref()
}
