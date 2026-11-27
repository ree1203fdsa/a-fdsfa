import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.ts'
import { bad, idParam, notFound, parse, rateLimit } from '../http.ts'

const run = promisify(execFile)
const DATA = path.resolve(import.meta.dirname, '../../data')
const PENDING = path.join(DATA, 'exports', 'pending')
const SENT = path.join(DATA, 'exports', 'sent')

interface PhoneConfig { autoSave: boolean; sshHost: string; remoteDir: string }

/**
 * Every saved weapon is exported as .glb and copied to the PC owner's Galaxy S22
 * (Termux sshd reached over Tailscale; host alias `s22` in ~/.ssh/config).
 * Files wait in exports/pending until the phone is reachable, then move to exports/sent.
 */
function config(): PhoneConfig | null {
  const file = path.join(DATA, 'phone.json')
  if (!existsSync(file)) return null
  try {
    const c = JSON.parse(readFileSync(file, 'utf8')) as PhoneConfig
    return c.autoSave ? c : null
  } catch {
    return null
  }
}

const ssh = (host: string, cmd: string) => run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, cmd], { timeout: 20_000 })
const safeName = (s: string) => s.replace(/[^가-힣a-zA-Z0-9_-]/g, '').slice(0, 24) || 'x'

let syncing: Promise<number> | null = null

/** Pushes every pending file to the phone. Returns how many were delivered. */
export function syncPending(): Promise<number> {
  if (syncing) return syncing
  syncing = (async () => {
    const c = config()
    if (!c || !existsSync(PENDING)) return 0
    const users = readdirSync(PENDING, { withFileTypes: true }).filter((d) => d.isDirectory())
    let sent = 0
    for (const u of users) {
      const files = readdirSync(path.join(PENDING, u.name)).filter((f) => f.endsWith('.glb'))
      if (!files.length) continue
      const remote = `${c.remoteDir}/${u.name}`
      await ssh(c.sshHost, `mkdir -p "${remote}"`)
      for (const f of files) {
        const local = path.join(PENDING, u.name, f)
        await run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', local, `${c.sshHost}:${remote}/${f}`], { timeout: 60_000 })
        // Ask Android to index it so it also shows in the Files app's Downloads view.
        await ssh(c.sshHost, `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$(realpath '${remote}/${f}')"`).catch(() => {})
        mkdirSync(path.join(SENT, u.name), { recursive: true })
        renameSync(local, path.join(SENT, u.name, f))
        sent++
      }
    }
    return sent
  })().catch(() => 0).finally(() => {
    syncing = null
  })
  return syncing
}

export function startPhoneSync() {
  setInterval(() => void syncPending(), 60_000).unref()
  void syncPending()
}

export const phoneRouter = Router()

phoneRouter.get('/status', (_req, res) => {
  res.json({ enabled: config() !== null })
})

phoneRouter.post('/send', rateLimit('phone', 30, 60_000), async (req, res) => {
  if (!config()) return void res.json({ enabled: false })
  const body = parse(z.object({ weaponId: idParam, glb: z.string().max(8_000_000) }), req.body)
  const user = req.user!
  const w = await prisma.weapon.findFirst({ where: { id: body.weaponId, userId: user.id, deletedAt: null } })
  if (!w) throw notFound('무기를 찾을 수 없어요.')
  const buf = Buffer.from(body.glb, 'base64')
  if (buf.length < 20 || buf.subarray(0, 4).toString('ascii') !== 'glTF') throw bad('3D 파일 형식이 올바르지 않아요.')

  const folder = safeName(user.username)
  const fileName = `${safeName(w.name)}_${w.id}.glb`
  mkdirSync(path.join(PENDING, folder), { recursive: true })
  writeFileSync(path.join(PENDING, folder, fileName), buf)

  const before = existsSync(path.join(SENT, folder, fileName))
  await syncPending()
  const delivered = !before && existsSync(path.join(SENT, folder, fileName))
  res.json({ enabled: true, delivered, queued: !delivered, phonePath: `다운로드/ColorWars/${folder}/${fileName}`, bytes: buf.length })
})
