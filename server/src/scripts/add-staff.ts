import bcrypt from 'bcryptjs'
import { isRole } from '../auth.ts'
import { prisma } from '../db.ts'

// Usage: STAFF_USERNAME=... STAFF_PASSWORD=... STAFF_ROLE=OPERATOR [STAFF_NICKNAME=...] tsx src/scripts/add-staff.ts
// Staff accounts are created by the owner directly, so the player sign-up rules (ID format,
// password length) are not enforced here.
async function main() {
  const username = (process.env.STAFF_USERNAME ?? '').trim().toLowerCase()
  const password = process.env.STAFF_PASSWORD ?? ''
  const role = process.env.STAFF_ROLE ?? 'OPERATOR'
  const nickname = (process.env.STAFF_NICKNAME ?? username).trim()
  if (!username || !password) throw new Error('STAFF_USERNAME과 STAFF_PASSWORD가 필요해요.')
  if (!isRole(role) || role === 'USER' || role === 'SUPER_ADMIN') throw new Error('STAFF_ROLE은 MODERATOR, OPERATOR, ADMIN 중 하나여야 해요.')
  const passwordHash = await bcrypt.hash(password, 10)
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, role, status: 'ACTIVE', failedLogins: 0, lockedUntil: null } })
    await prisma.session.deleteMany({ where: { userId: existing.id } })
    console.log(`기존 계정 ${username}의 등급을 ${role}로 바꾸고 비밀번호를 새로 정했어요.`)
    return
  }
  const taken = await prisma.user.findUnique({ where: { nickname } })
  const u = await prisma.user.create({
    data: { username, nickname: taken ? `${nickname}_${Date.now() % 1000}` : nickname, passwordHash, role, tutorialDone: true },
  })
  await prisma.userItem.create({ data: { userId: u.id, itemId: 'tool_ballpoint', equipped: true } })
  console.log(`${role} 계정 ${username}(닉네임 ${u.nickname})을 만들었어요.`)
}

main().finally(() => prisma.$disconnect())
