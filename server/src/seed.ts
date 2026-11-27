import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { PAPERS } from '../../shared/constants.ts'
import { ITEM_SEEDS } from '../../shared/items.ts'
import { prisma } from './db.ts'

async function main() {
  for (const it of ITEM_SEEDS) {
    await prisma.item.upsert({
      where: { id: it.id },
      create: { id: it.id, category: it.category, slot: it.slot, name: it.name, description: it.description, price: it.price, effect: JSON.stringify(it.effect), sortOrder: it.sortOrder, limited: it.limited ?? false },
      update: {},
    })
  }
  for (const [i, p] of PAPERS.entries()) {
    await prisma.paper.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, unlockLevel: p.unlockLevel, style: JSON.stringify({ bg: p.bg, pattern: p.pattern }), sortOrder: i },
      update: { name: p.name, unlockLevel: p.unlockLevel },
    })
  }

  if ((await prisma.mission.count()) === 0) {
    const daily = [
      ['게임 1회 플레이', 'PLAY_GAMES', 1], ['게임 3회 플레이', 'PLAY_GAMES', 3], ['무기 1개 제작', 'CREATE_WEAPONS', 1],
      ['친구와 1회 플레이', 'PLAY_WITH_FRIENDS', 1], ['전투 1회 승리', 'WIN_GAMES', 1], ['AI 대전 1회 완료', 'AI_GAMES', 1],
    ] as const
    const weekly = [
      ['게임 10회 플레이', 'PLAY_GAMES', 10], ['무기 5개 제작', 'CREATE_WEAPONS', 5], ['친구와 5회 플레이', 'PLAY_WITH_FRIENDS', 5],
      ['전투 5회 승리', 'WIN_GAMES', 5], ['AI 대전 5회 완료', 'AI_GAMES', 5],
    ] as const
    await prisma.mission.createMany({
      data: [
        ...daily.map(([title, goalType, goalCount], i) => ({ title, goalType, goalCount, period: 'DAILY', rewardCoins: 150, rewardXp: 100, sortOrder: i })),
        ...weekly.map(([title, goalType, goalCount], i) => ({ title, goalType, goalCount, period: 'WEEKLY', rewardCoins: 500, rewardXp: 300, sortOrder: i })),
      ],
    })
  }

  const adminName = process.env.ADMIN_USERNAME ?? 'cwadmin'
  let admin = (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', deletedAt: null } })) ?? (await prisma.user.findUnique({ where: { username: adminName } }))
  if (!admin) {
    const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url') + '1a'
    admin = await prisma.user.create({
      data: { username: adminName, nickname: '컬러운영팀', passwordHash: await bcrypt.hash(password, 10), role: 'SUPER_ADMIN', tutorialDone: true },
    })
    await prisma.userItem.create({ data: { userId: admin.id, itemId: 'tool_ballpoint', equipped: true } })
    const file = 'data/admin-credentials.txt'
    writeFileSync(file, `컬러워즈 최고 관리자 계정\n아이디: ${adminName}\n비밀번호: ${password}\n\n로그인 후 이 파일을 지우고 비밀번호를 바꿔 주세요.\n`)
    console.log(`최고 관리자 계정을 만들었어요. 아이디와 비밀번호는 server/${file} 에 저장했어요.`)
  }

  if ((await prisma.notice.count()) === 0) {
    await prisma.notice.create({
      data: { title: '컬러워즈 오픈!', body: '직접 그린 무기로 친구와 대결해 보세요. 첫 무기를 만들면 튜토리얼 보상을 받아요.', pinned: true, createdById: admin.id },
    })
  }
  if ((await prisma.gameEvent.count()) === 0) {
    const now = new Date()
    await prisma.gameEvent.create({
      data: { title: '오픈 기념 코인 축제', description: '이벤트 기간 동안 전투 코인 보상이 1.5배!', startAt: now, endAt: new Date(now.getTime() + 14 * 86400_000), coinBonus: 1.5 },
    })
  }
  console.log('초기 데이터 준비 완료')
}

main().finally(() => prisma.$disconnect())
