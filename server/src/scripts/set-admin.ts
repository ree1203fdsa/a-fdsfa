import bcrypt from 'bcryptjs'
import { checkPassword, checkUsername } from '../../../shared/text.ts'
import { prisma } from '../db.ts'

// Usage: ADMIN_USERNAME=... ADMIN_PASSWORD=... [ADMIN_NICKNAME=...] tsx src/scripts/set-admin.ts
async function main() {
  const username = (process.env.ADMIN_USERNAME ?? '').trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  const nickname = process.env.ADMIN_NICKNAME ?? '컬러운영팀'
  const err = checkUsername(username) ?? checkPassword(password, username)
  if (err) throw new Error(err)
  const passwordHash = await bcrypt.hash(password, 10)
  const renameFrom = process.env.ADMIN_RENAME_FROM
  if (renameFrom && !(await prisma.user.findUnique({ where: { username } }))) {
    const old = await prisma.user.findUnique({ where: { username: renameFrom } })
    if (old) await prisma.user.update({ where: { id: old.id }, data: { username } })
  }
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, role: 'SUPER_ADMIN', status: 'ACTIVE', failedLogins: 0, lockedUntil: null } })
    await prisma.session.deleteMany({ where: { userId: existing.id } })
    console.log(`기존 계정 ${username}을 최고 관리자로 설정하고 비밀번호를 바꿨어요.`)
  } else {
    const u = await prisma.user.create({ data: { username, nickname, passwordHash, role: 'SUPER_ADMIN', tutorialDone: true } })
    await prisma.userItem.create({ data: { userId: u.id, itemId: 'tool_ballpoint', equipped: true } })
    console.log(`최고 관리자 계정 ${username}을 만들었어요.`)
  }
}

main().finally(() => prisma.$disconnect())
