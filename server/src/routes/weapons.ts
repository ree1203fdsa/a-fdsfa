import { Router } from 'express'
import { z } from 'zod'
import { MAX_PREVIEW_BYTES, TOOL_BY_ID, WEAPON_TYPES, type WeaponType } from '../../../shared/constants.ts'
import { checkWeaponName } from '../../../shared/text.ts'
import {
  analyzeStrokes, autoModelParams, classify, computeStats, sanitizeModelParams, toolsUsed, validateStrokes, type Stroke,
} from '../../../shared/weapon.ts'
import { prisma, parseJson, type Tx } from '../db.ts'
import { bad, conflict, idParam, notFound, parse, rateLimit } from '../http.ts'
import { aiAvailable, analyzeWithAi, VISION_MODEL } from '../services/ai.ts'
import { grant, notify } from '../services/economy.ts'
import { progress } from '../services/missions.ts'
import { getRewards } from '../services/config.ts'
import type { User, Weapon } from '../generated/prisma/client.ts'

export const weaponsRouter = Router()
export const draftsRouter = Router()

const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const MAX_DRAFTS = 10

const pngSchema = z.string().max(Math.ceil(MAX_PREVIEW_BYTES * 1.4)).refine((s) => s === '' || PNG_RE.test(s), '미리보기 이미지 형식이 올바르지 않아요.')
const typeSchema = z.enum(WEAPON_TYPES as unknown as [WeaponType, ...WeaponType[]])

export function weaponView(w: Weapon, withStrokes = false) {
  return {
    id: w.id, userId: w.userId, name: w.name, type: w.type, paperId: w.paperId, previewPng: w.previewPng,
    modelParams: parseJson(w.modelParams, {}), toolsUsed: parseJson<string[]>(w.toolsUsed, []),
    stats: { attack: w.attack, speed: w.speed, area: w.area, range: w.range, weight: w.weight, defense: w.defense },
    special: w.special, favorite: w.favorite, hidden: w.hidden, createdAt: w.createdAt, updatedAt: w.updatedAt,
    ...(withStrokes ? { strokes: parseJson<Stroke[]>(w.strokes, []) } : {}),
  }
}

/** Checks every tool in the drawing is owned and the paper is unlocked for this user. */
async function checkDrawing(db: Tx | typeof prisma, user: User, strokes: unknown, paperId: string) {
  const v = validateStrokes(strokes)
  if (!v.ok) throw bad(v.error, 'BAD_DRAWING')
  const used = toolsUsed(v.strokes)
  const owned = new Set((await db.userItem.findMany({ where: { userId: user.id }, select: { itemId: true } })).map((i) => i.itemId))
  for (const t of used) {
    if (!owned.has(TOOL_BY_ID[t].itemId)) throw bad(`'${TOOL_BY_ID[t].name}'은(는) 아직 가지고 있지 않은 도구예요.`, 'TOOL_NOT_OWNED')
  }
  const paper = await db.paper.findUnique({ where: { id: paperId } })
  if (!paper) throw bad('알 수 없는 종이예요.')
  if (paper.unlockLevel > user.level) throw bad(`'${paper.name}'은(는) 레벨 ${paper.unlockLevel}에 열려요.`, 'PAPER_LOCKED')
  return { strokes: v.strokes, used }
}

weaponsRouter.get('/owned', async (req, res) => {
  const items = await prisma.userItem.findMany({ where: { userId: req.user!.id }, select: { itemId: true, equipped: true, quantity: true } })
  const papers = await prisma.paper.findMany({ orderBy: { sortOrder: 'asc' } })
  res.json({
    items,
    papers: papers.map((p) => ({ id: p.id, name: p.name, unlockLevel: p.unlockLevel, unlocked: p.unlockLevel <= req.user!.level })),
    level: req.user!.level,
  })
})

weaponsRouter.get('/ai-status', async (_req, res) => {
  res.json({ available: await aiAvailable(), model: VISION_MODEL })
})

weaponsRouter.post('/analyze', rateLimit('analyze', 60, 60_000), async (req, res) => {
  const body = parse(z.object({ strokes: z.unknown(), paperId: z.string().default('white') }), req.body)
  const { strokes } = await checkDrawing(prisma, req.user!, body.strokes, body.paperId)
  const features = analyzeStrokes(strokes)
  if (!features.ok) throw bad(features.reason ?? '그림을 분석할 수 없어요.', 'ANALYZE_FAILED')
  const c = classify(features)
  res.json({ features, recommended: c.type, confidence: c.confidence, scores: c.scores, modelParams: autoModelParams(features) })
})

weaponsRouter.post('/ai', rateLimit('ai', 12, 60_000), async (req, res) => {
  const { image } = parse(z.object({ image: pngSchema }), req.body)
  if (!image) throw bad('그림 이미지가 필요해요.')
  try {
    const s = await analyzeWithAi(image.slice(image.indexOf(',') + 1))
    res.json({ suggestion: s, available: s !== null || (await aiAvailable()) })
  } catch (e) {
    res.status(503).json({ error: e instanceof Error && e.message.includes('AI') ? e.message : '로컬 AI가 응답하지 않아요. 규칙 분석 결과로 진행해 주세요.', code: 'AI_FAILED' })
  }
})

const saveSchema = z.object({
  name: z.string().trim(),
  type: typeSchema,
  strokes: z.unknown(),
  paperId: z.string().default('white'),
  previewPng: pngSchema.default(''),
  modelParams: z.unknown().optional(),
})

weaponsRouter.get('/', async (req, res) => {
  const q = parse(z.object({
    search: z.string().max(30).optional(), type: z.string().optional(), sort: z.enum(['recent', 'attack', 'speed', 'range', 'defense', 'name']).default('recent'),
    favorite: z.coerce.boolean().optional(),
  }), req.query)
  const orderBy = q.sort === 'recent' ? { createdAt: 'desc' as const } : q.sort === 'name' ? { name: 'asc' as const } : { [q.sort]: 'desc' as const }
  const list = await prisma.weapon.findMany({
    where: {
      userId: req.user!.id, deletedAt: null,
      ...(q.search ? { name: { contains: q.search } } : {}),
      ...(q.type && (WEAPON_TYPES as readonly string[]).includes(q.type) ? { type: q.type } : {}),
      ...(q.favorite ? { favorite: true } : {}),
    },
    orderBy: [{ favorite: 'desc' }, orderBy],
  })
  const u = req.user!
  const count = await prisma.weapon.count({ where: { userId: u.id, deletedAt: null } })
  res.json({ weapons: list.map((w) => weaponView(w)), slots: u.inventorySlots, used: count, equippedWeaponId: u.equippedWeaponId })
})

weaponsRouter.get('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const w = await prisma.weapon.findFirst({ where: { id, deletedAt: null } })
  if (!w || (w.userId !== req.user!.id && w.hidden)) throw notFound('무기를 찾을 수 없어요.')
  const own = w.userId === req.user!.id
  res.json({ weapon: weaponView(w, true), own })
})

weaponsRouter.post('/', rateLimit('weapon-save', 30, 60_000), async (req, res) => {
  const body = parse(saveSchema, req.body)
  const nameErr = checkWeaponName(body.name)
  if (nameErr) throw bad(nameErr)
  const user = req.user!
  const rewards = await getRewards()
  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } })
    const { strokes, used } = await checkDrawing(tx, fresh, body.strokes, body.paperId)
    const count = await tx.weapon.count({ where: { userId: user.id, deletedAt: null } })
    if (count >= fresh.inventorySlots) throw conflict(`보관함이 가득 찼어요. (${count}/${fresh.inventorySlots}칸) 무기를 정리하거나 보관함을 확장해 주세요.`, 'INVENTORY_FULL')
    const features = analyzeStrokes(strokes)
    if (!features.ok) throw bad(features.reason ?? '그림을 분석할 수 없어요.')
    const params = sanitizeModelParams(body.modelParams, autoModelParams(features))
    const stats = computeStats(body.type, features, params.thickness)
    const w = await tx.weapon.create({
      data: {
        userId: user.id, name: body.name.trim(), type: body.type, strokes: JSON.stringify(strokes), paperId: body.paperId,
        previewPng: body.previewPng, modelParams: JSON.stringify(params), analysis: JSON.stringify(features), toolsUsed: JSON.stringify(used),
        attack: stats.attack, speed: stats.speed, area: stats.area, range: stats.range, weight: stats.weight, defense: stats.defense, special: stats.special,
      },
    })
    await tx.user.update({ where: { id: user.id }, data: { weaponsCreated: { increment: 1 }, ...(fresh.equippedWeaponId ? {} : { equippedWeaponId: w.id }) } })
    await progress(tx, user.id, 'CREATE_WEAPONS', 1)
    const discovered: string[] = []
    for (const key of ['type:' + body.type, ...used.filter((t) => !['ballpoint', 'eraser'].includes(t)).map((t) => 'tool:' + t)]) {
      const exists = await tx.userCodex.findUnique({ where: { userId_entryKey: { userId: user.id, entryKey: key } } })
      if (!exists) {
        await tx.userCodex.create({ data: { userId: user.id, entryKey: key, source: 'CREATE' } })
        discovered.push(key)
      }
    }
    let tutorial = null
    if (!fresh.tutorialDone) {
      tutorial = await grant(tx, user.id, 'tutorial', rewards.tutorialCoins, 0, '튜토리얼 완료 보상')
      await tx.user.update({ where: { id: user.id }, data: { tutorialDone: true } })
      if (tutorial.granted) await notify(tx, user.id, 'REWARD', '첫 무기 완성!', `튜토리얼 보상으로 ${tutorial.coins}코인을 받았어요.`)
    }
    return { w, discovered, tutorialCoins: tutorial?.granted ? tutorial.coins : 0 }
  })
  res.json({ weapon: weaponView(result.w), discovered: result.discovered, tutorialCoins: result.tutorialCoins })
})

weaponsRouter.patch('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const body = parse(z.object({ name: z.string().trim().optional(), favorite: z.boolean().optional(), modelParams: z.unknown().optional() }), req.body)
  const w = await prisma.weapon.findFirst({ where: { id, userId: req.user!.id, deletedAt: null } })
  if (!w) throw notFound('무기를 찾을 수 없어요.')
  if (body.name !== undefined) {
    const e = checkWeaponName(body.name)
    if (e) throw bad(e)
  }
  let modelParams: string | undefined
  let statsUpdate = {}
  if (body.modelParams !== undefined) {
    const features = parseJson(w.analysis, analyzeStrokes(parseJson<Stroke[]>(w.strokes, [])))
    const p = sanitizeModelParams(body.modelParams, autoModelParams(features))
    modelParams = JSON.stringify(p)
    const s = computeStats(w.type as WeaponType, features, p.thickness)
    statsUpdate = { attack: s.attack, speed: s.speed, area: s.area, range: s.range, weight: s.weight, defense: s.defense }
  }
  const u = await prisma.weapon.update({ where: { id }, data: { name: body.name, favorite: body.favorite, modelParams, ...statsUpdate } })
  res.json({ weapon: weaponView(u) })
})

weaponsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const userId = req.user!.id
  const r = await prisma.weapon.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } })
  if (!r.count) throw notFound('무기를 찾을 수 없어요.')
  await prisma.user.updateMany({ where: { id: userId, equippedWeaponId: id }, data: { equippedWeaponId: null } })
  await prisma.user.updateMany({ where: { id: userId, repWeaponId: id }, data: { repWeaponId: null } })
  res.json({ ok: true })
})

weaponsRouter.post('/:id/duplicate', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const userId = req.user!.id
  const copy = await prisma.$transaction(async (tx) => {
    const w = await tx.weapon.findFirst({ where: { id, userId, deletedAt: null } })
    if (!w) throw notFound('무기를 찾을 수 없어요.')
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const count = await tx.weapon.count({ where: { userId, deletedAt: null } })
    if (count >= u.inventorySlots) throw conflict('보관함이 가득 차서 복제할 수 없어요.', 'INVENTORY_FULL')
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = w
    return tx.weapon.create({ data: { ...rest, name: (w.name + ' 복제').slice(0, 16), favorite: false } })
  })
  res.json({ weapon: weaponView(copy) })
})

weaponsRouter.post('/:id/equip', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const w = await prisma.weapon.findFirst({ where: { id, userId: req.user!.id, deletedAt: null } })
  if (!w) throw notFound('무기를 찾을 수 없어요.')
  await prisma.user.update({ where: { id: req.user!.id }, data: { equippedWeaponId: id } })
  res.json({ equippedWeaponId: id })
})

weaponsRouter.post('/unequip', async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { equippedWeaponId: null } })
  res.json({ equippedWeaponId: null })
})

// ── drafts: unfinished drawings the player can come back to ──

const draftSchema = z.object({
  name: z.string().trim().max(16).default(''),
  type: typeSchema.nullable().optional(),
  strokes: z.unknown(),
  paperId: z.string().default('white'),
  previewPng: pngSchema.default(''),
})

draftsRouter.get('/', async (req, res) => {
  const list = await prisma.weaponDraft.findMany({
    where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, type: true, paperId: true, previewPng: true, updatedAt: true },
  })
  res.json({ drafts: list, max: MAX_DRAFTS })
})

draftsRouter.get('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  const d = await prisma.weaponDraft.findFirst({ where: { id, userId: req.user!.id } })
  if (!d) throw notFound('저장한 그림을 찾을 수 없어요.')
  res.json({ draft: { ...d, strokes: parseJson<Stroke[]>(d.strokes, []) } })
})

draftsRouter.post('/', async (req, res) => {
  const body = parse(draftSchema.extend({ id: z.number().int().positive().optional() }), req.body)
  const { strokes } = await checkDrawing(prisma, req.user!, body.strokes, body.paperId)
  const data = { name: body.name, type: body.type ?? null, strokes: JSON.stringify(strokes), paperId: body.paperId, previewPng: body.previewPng }
  if (body.id) {
    const r = await prisma.weaponDraft.updateMany({ where: { id: body.id, userId: req.user!.id }, data })
    if (r.count) return void res.json({ id: body.id })
  }
  const count = await prisma.weaponDraft.count({ where: { userId: req.user!.id } })
  if (count >= MAX_DRAFTS) throw conflict(`그림은 최대 ${MAX_DRAFTS}개까지 저장할 수 있어요. 안 쓰는 그림을 지워 주세요.`, 'DRAFTS_FULL')
  const d = await prisma.weaponDraft.create({ data: { ...data, userId: req.user!.id } })
  res.json({ id: d.id })
})

draftsRouter.delete('/:id', async (req, res) => {
  const id = parse(idParam, req.params.id)
  await prisma.weaponDraft.deleteMany({ where: { id, userId: req.user!.id } })
  res.json({ ok: true })
})
