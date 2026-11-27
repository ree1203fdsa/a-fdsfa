import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { COSMETIC_SLOT_NAMES, PAPER_BY_ID, PROFILE_SLOT_NAMES, type CosmeticSlot, type ProfileSlot } from '@shared/constants'
import { Button, Confirm, cx, ErrorBox, Loading, Pill, ScreenHeader, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface ShopItem {
  id: string; category: 'TOOL' | 'COSMETIC' | 'PROFILE' | 'SLOT'; slot: string | null; name: string; description: string
  price: number; effect: Record<string, unknown>; limited: boolean; stock: number | null; available: boolean; owned: boolean; equipped: boolean
}
interface ShopData {
  coins: number; level: number; slots: number; maxSlots: number; items: ShopItem[]
  papers: { id: string; name: string; unlockLevel: number; unlocked: boolean }[]
}

type Tab = 'tools' | 'papers' | 'character' | 'profile' | 'slots'

const TOOL_ICON: Record<string, string> = {
  tool_ballpoint: '🖊️', tool_eraser: '🧽', tool_pencil: '✏️', tool_marker: '🖍️', tool_highlighter: '🖌️', tool_brush: '🖌️',
  tool_rainbow: '🌈', tool_neon: '💡', tool_gold: '✨', tool_legendary: '🌟',
}
const SLOT_ICON: Record<string, string> = {
  hair: '💇', face: '😊', top: '👕', bottom: '👖', shoes: '👟', gloves: '🧤', hat: '🎩', glasses: '👓', accessory: '🧣',
  color: '🎨', back: '🦸', victory: '🎉', frame: '🖼️', background: '🌅', title: '🏷️', decoration: '💖',
}

export default function ShopPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'tools'
  const user = useAuth((s) => s.user)!
  const refresh = useAuth((s) => s.refresh)
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api.get<ShopData>('/shop') })
  const [buying, setBuying] = useState<ShopItem | null>(null)
  const [busy, setBusy] = useState(false)

  async function buy() {
    if (!buying) return
    setBusy(true)
    try {
      await api.post('/shop/buy', { itemId: buying.id })
      sfx.coin()
      toast.coin(`${buying.name} 구매 완료!`)
      setBuying(null)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['shop'] }), qc.invalidateQueries({ queryKey: ['owned'] })])
    } catch (e) {
      sfx.error()
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function equip(item: ShopItem, on: boolean) {
    try {
      await api.post('/items/equip', { itemId: item.id, equip: on })
      sfx.click()
      toast.success(on ? `${item.name} 장착!` : `${item.name} 해제`)
      await qc.invalidateQueries({ queryKey: ['shop'] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const items = shop.data?.items ?? []
  const coins = user.coins

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader
        title="상점"
        sub="SHOP"
        right={
          <span className="panel cut-lg flex h-11 items-center gap-2 px-3 font-num text-lg font-bold">🪙 {coins.toLocaleString()}</span>
        }
      />
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          items={[
            { value: 'tools', label: '🖌️ 그림 도구' },
            { value: 'papers', label: '📄 종이' },
            { value: 'character', label: '👕 캐릭터' },
            { value: 'profile', label: '🖼️ 프로필' },
            { value: 'slots', label: '🎒 보관함 확장' },
          ]}
        />
        {shop.isLoading ? (
          <Loading />
        ) : shop.isError ? (
          <ErrorBox error={shop.error} onRetry={() => void shop.refetch()} />
        ) : tab === 'papers' ? (
          <div>
            <p className="mb-3 text-sm text-dim">종이는 코인으로 사는 게 아니라 <b className="text-text">레벨이 오르면 자동으로 열려요.</b> 종이는 겉모습만 바꾸고 능력치에는 영향이 없어요.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {shop.data!.papers.map((p) => (
                <div key={p.id} className={cx('panel cut-lg overflow-hidden', !p.unlocked && 'opacity-70')}>
                  <div className="relative h-24" style={{ background: PAPER_BY_ID[p.id]?.bg }}>
                    {!p.unlocked && <div className="absolute inset-0 grid place-items-center bg-black/50 text-2xl">🔒</div>}
                  </div>
                  <div className="p-2.5">
                    <p className="font-bold">{p.name}</p>
                    <p className={cx('text-xs', p.unlocked ? 'text-ok' : 'text-dim')}>{p.unlocked ? '✓ 사용 가능' : `레벨 ${p.unlockLevel}에 열려요`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : tab === 'slots' ? (
          <SlotsTab data={shop.data!} coins={coins} onBuy={setBuying} />
        ) : (
          <ItemGrid
            items={items.filter((i) => (tab === 'tools' ? i.category === 'TOOL' : tab === 'character' ? i.category === 'COSMETIC' : i.category === 'PROFILE'))}
            grouped={tab !== 'tools'}
            coins={coins}
            onBuy={setBuying}
            onEquip={equip}
            onOpenWorkshop={() => nav('/workshop')}
          />
        )}
      </div>

      <Confirm
        open={buying !== null}
        title="구매할까요?"
        confirmText={`🪙 ${buying?.price.toLocaleString()} 구매`}
        loading={busy}
        message={buying && (
          <div className="space-y-2">
            <p><b className="font-display text-lg text-text">{buying.name}</b></p>
            <p>{buying.description}</p>
            <div className="rounded-xl bg-white/5 p-3 font-num">
              <p className="flex justify-between"><span>보유 코인</span><b className="text-text">{coins.toLocaleString()}</b></p>
              <p className="flex justify-between"><span>가격</span><b className="text-bad">- {buying.price.toLocaleString()}</b></p>
              <p className="mt-1 flex justify-between border-t border-white/10 pt-1"><span>구매 후</span><b className="text-accent">{(coins - buying.price).toLocaleString()}</b></p>
            </div>
          </div>
        )}
        onCancel={() => setBuying(null)}
        onConfirm={buy}
      />
    </div>
  )
}

function BuyButton({ item, coins, onBuy }: { item: ShopItem; coins: number; onBuy: (i: ShopItem) => void }) {
  if (!item.available) return <Button size="sm" variant="secondary" disabled className="w-full">판매 종료</Button>
  const short = coins < item.price
  return (
    <Button size="sm" variant={short ? 'secondary' : 'primary'} disabled={short} className="w-full" onClick={() => onBuy(item)}>
      🪙 {item.price.toLocaleString()}{short && <span className="text-[11px] opacity-80">· 부족</span>}
    </Button>
  )
}

function ItemGrid({ items, grouped, coins, onBuy, onEquip, onOpenWorkshop }: {
  items: ShopItem[]; grouped: boolean; coins: number; onBuy: (i: ShopItem) => void; onEquip: (i: ShopItem, on: boolean) => void; onOpenWorkshop: () => void
}) {
  const groups = grouped
    ? [...new Set(items.map((i) => i.slot ?? ''))].map((slot) => ({ slot, list: items.filter((i) => (i.slot ?? '') === slot) }))
    : [{ slot: '', list: items }]
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.slot}>
          {g.slot && (
            <h3 className="mb-2 font-display text-lg">
              {SLOT_ICON[g.slot]} {COSMETIC_SLOT_NAMES[g.slot as CosmeticSlot] ?? PROFILE_SLOT_NAMES[g.slot as ProfileSlot] ?? g.slot}
            </h3>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {g.list.map((item) => {
              const color = typeof item.effect.color === 'string' ? item.effect.color : null
              return (
                <div key={item.id} className={cx('panel cut-lg flex flex-col p-3', item.equipped && '!border-accent')}>
                  <div className="relative mb-2 grid h-20 place-items-center rounded-xl bg-white/5 text-4xl">
                    {item.category === 'TOOL' ? TOOL_ICON[item.id] : SLOT_ICON[item.slot ?? ''] ?? '🎁'}
                    {color && (
                      <span
                        className="absolute bottom-2 right-2 size-5 rounded-full border-2 border-white/60"
                        style={{ background: color === 'rainbow' ? 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)' : color }}
                      />
                    )}
                    {item.limited && <Pill className="absolute left-1.5 top-1.5 bg-red text-white">한정</Pill>}
                  </div>
                  <p className="font-display leading-tight">{item.name}</p>
                  <p className="mb-2 line-clamp-2 flex-1 text-xs text-dim">{item.description || (typeof item.effect.text === 'string' ? `칭호 "${item.effect.text}"` : '')}</p>
                  {item.owned ? (
                    item.category === 'TOOL' ? (
                      <Button size="sm" variant="ok" className="w-full" onClick={onOpenWorkshop}>✓ 보유 중 · 쓰러 가기</Button>
                    ) : (
                      <Button size="sm" variant={item.equipped ? 'secondary' : 'ok'} className="w-full" onClick={() => onEquip(item, !item.equipped)}>
                        {item.equipped ? '해제하기' : '장착하기'}
                      </Button>
                    )
                  ) : item.price === 0 ? (
                    <Button size="sm" variant="secondary" disabled className="w-full">기본 지급</Button>
                  ) : (
                    <BuyButton item={item} coins={coins} onBuy={onBuy} />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function SlotsTab({ data, coins, onBuy }: { data: ShopData; coins: number; onBuy: (i: ShopItem) => void }) {
  const item = data.items.find((i) => i.category === 'SLOT')
  const full = data.slots >= data.maxSlots
  return (
    <div className="panel cut-lg mx-auto max-w-md space-y-3 p-5 text-center">
      <p className="text-6xl">🎒</p>
      <p className="font-display text-2xl">보관함 확장</p>
      <p className="text-dim">지금 보관함: <b className="font-num text-lg text-text">{data.slots}칸</b> (최대 {data.maxSlots}칸)</p>
      {item ? (
        <>
          <p className="text-sm text-dim">{item.description}</p>
          {full ? <Button disabled variant="secondary" className="w-full">이미 최대 크기예요</Button> : <BuyButton item={item} coins={coins} onBuy={onBuy} />}
        </>
      ) : (
        <p className="text-dim">지금은 판매하지 않아요.</p>
      )}
    </div>
  )
}
