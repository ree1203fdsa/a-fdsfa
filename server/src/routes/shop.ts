import { Router } from 'express'
import { z } from 'zod'
import { MAX_INVENTORY_SLOTS } from '../../../shared/constants.ts'
import { prisma, parseJson } from '../db.ts'
import { bad, conflict, notFound, parse, rateLimit } from '../http.ts'
import { changeCoins, notify } from '../services/economy.ts'
import { adminPlay } from '../auth.ts'

export const shopRouter = Router()
export const itemsRouter = Router()

shopRouter.get('/', async (req, res) => {
  const now = new Date()
  const [items, owned, papers] = await Promise.all([
    prisma.item.findMany({ where: { deletedAt: null }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.userItem.findMany({ where: { userId: req.user!.id } }),
    prisma.paper.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])
  const admin = adminPlay(req.user!)
  // quantity 0 = borrowed in admin mode; only counts as owned while in admin mode.
  const ownedMap = new Map(owned.filter((o) => admin || o.quantity > 0).map((o) => [o.itemId, o]))
  const isOwned = (id: string, category: string) => ownedMap.has(id) || (admin && category !== 'SLOT')
  res.json({
    coins: req.user!.coins,
    level: req.user!.level,
    adminPlay: admin,
    slots: req.user!.inventorySlots,
    maxSlots: MAX_INVENTORY_SLOTS,
    items: items
      .filter((i) => i.onSale || ownedMap.has(i.id))
      .map((i) => ({
        id: i.id, category: i.category, slot: i.slot, name: i.name, description: i.description, price: i.price,
        effect: parseJson(i.effect, {}), limited: i.limited, stock: i.stock,
        available: i.onSale && (!i.saleEndAt || i.saleEndAt > now) && (i.stock === null || i.stock > 0),
        owned: isOwned(i.id, i.category), equipped: ownedMap.get(i.id)?.equipped ?? false,
      })),
    papers: papers.map((p) => ({ id: p.id, name: p.name, unlockLevel: p.unlockLevel, unlocked: admin || p.unlockLevel <= req.user!.level })),
  })
})

shopRouter.post('/buy', rateLimit('buy', 30, 60_000), async (req, res) => {
  const { itemId } = parse(z.object({ itemId: z.string().max(60) }), req.body)
  const userId = req.user!.id
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findFirst({ where: { id: itemId, deletedAt: null } })
    if (!item) throw notFound('판매하지 않는 상품이에요.')
    if (!item.onSale || (item.saleEndAt && item.saleEndAt < new Date())) throw bad('지금은 판매하지 않는 상품이에요.', 'NOT_ON_SALE')
    if (item.stock !== null && item.stock <= 0) throw bad('품절된 상품이에요.', 'SOLD_OUT')

    if (item.category === 'SLOT') {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      const add = parseJson<{ slots?: number }>(item.effect, {}).slots ?? 5
      if (u.inventorySlots >= MAX_INVENTORY_SLOTS) throw bad(`보관함은 최대 ${MAX_INVENTORY_SLOTS}칸까지 늘릴 수 있어요.`, 'MAX_SLOTS')
      await changeCoins(tx, userId, -item.price, `구매: ${item.name}`, 'item', item.id)
      await tx.user.update({ where: { id: userId }, data: { inventorySlots: Math.min(MAX_INVENTORY_SLOTS, u.inventorySlots + add) } })
    } else {
      const has = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } } })
      if (has && has.quantity > 0) throw conflict('이미 가지고 있는 아이템이에요.', 'ALREADY_OWNED')
      await changeCoins(tx, userId, -item.price, `구매: ${item.name}`, 'item', item.id)
      if (has) await tx.userItem.update({ where: { id: has.id }, data: { quantity: 1 } })
      else await tx.userItem.create({ data: { userId, itemId } })
    }
    if (item.stock !== null) await tx.item.update({ where: { id: item.id }, data: { stock: { decrement: 1 } } })
    await tx.purchase.create({ data: { userId, itemId: item.id, price: item.price } })
    await notify(tx, userId, 'PURCHASE', `${item.name} 구매 완료!`, `${item.price.toLocaleString()}코인을 사용했어요.`, { itemId: item.id })
    return item
  })
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true, inventorySlots: true } })
  res.json({ ok: true, item: { id: result.id, name: result.name }, coins: u.coins, slots: u.inventorySlots })
})

shopRouter.get('/history', async (req, res) => {
  const rows = await prisma.purchase.findMany({
    where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { item: { select: { name: true } } },
  })
  res.json(rows.map((r) => ({ id: r.id, name: r.item.name, price: r.price, createdAt: r.createdAt, refunded: Boolean(r.refundedAt) })))
})

/** Equip/unequip a cosmetic, profile item or drawing tool; one item per slot. */
itemsRouter.post('/equip', async (req, res) => {
  const { itemId, equip } = parse(z.object({ itemId: z.string().max(60), equip: z.boolean() }), req.body)
  const userId = req.user!.id
  const admin = adminPlay(req.user!)
  await prisma.$transaction(async (tx) => {
    let ui = await tx.userItem.findUnique({ where: { userId_itemId: { userId, itemId } }, include: { item: true } })
    if (ui && ui.quantity === 0 && !admin) ui = null
    // Admin mode lends any item (quantity 0) so staff can try it on without buying.
    if (!ui && admin && (await tx.item.findFirst({ where: { id: itemId, deletedAt: null } }))) {
      ui = await tx.userItem.create({ data: { userId, itemId, quantity: 0 }, include: { item: true } })
    }
    if (!ui) throw notFound('가지고 있지 않은 아이템이에요.')
    if (ui.item.category === 'SLOT') throw bad('장착할 수 없는 아이템이에요.')
    if (equip && ui.item.slot) {
      const sameSlot = await tx.item.findMany({ where: { slot: ui.item.slot, category: ui.item.category }, select: { id: true } })
      await tx.userItem.updateMany({ where: { userId, itemId: { in: sameSlot.map((s) => s.id) } }, data: { equipped: false } })
    }
    await tx.userItem.update({ where: { id: ui.id }, data: { equipped: equip } })
  })
  res.json({ ok: true })
})

itemsRouter.post('/reset-look', async (req, res) => {
  const ids = (await prisma.item.findMany({ where: { category: { in: ['COSMETIC'] } }, select: { id: true } })).map((i) => i.id)
  await prisma.userItem.updateMany({ where: { userId: req.user!.id, itemId: { in: ids } }, data: { equipped: false } })
  res.json({ ok: true })
})

itemsRouter.get('/equipped', async (req, res) => {
  const rows = await prisma.userItem.findMany({ where: { userId: req.user!.id, equipped: true }, include: { item: true } })
  res.json(rows.filter((r) => r.item.slot).map((r) => ({ itemId: r.itemId, category: r.item.category, slot: r.item.slot, name: r.item.name, effect: parseJson(r.item.effect, {}) })))
})
