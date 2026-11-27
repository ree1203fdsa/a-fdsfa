import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COSMETIC_SLOT_NAMES, COSMETIC_SLOTS, type CosmeticSlot } from '@shared/constants'
import { Button, Confirm, cx, Loading, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { toast } from '@/stores/toast'
import { Character, GlowSword, lookFromItems } from '@/three/Character'

interface ShopItem { id: string; category: string; slot: string | null; name: string; price: number; effect: Record<string, unknown>; owned: boolean; equipped: boolean }

export default function CustomizePage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const shop = useQuery({ queryKey: ['shop'], queryFn: () => api.get<{ items: ShopItem[] }>('/shop') })
  const [slot, setSlot] = useState<CosmeticSlot>('hair')
  const [preview, setPreview] = useState<ShopItem | null>(null)
  const [reset, setReset] = useState(false)

  const cosmetics = (shop.data?.items ?? []).filter((i) => i.category === 'COSMETIC')
  const equipped = cosmetics.filter((i) => i.equipped)
  // Preview swaps the item in this slot without saving.
  const shown = preview ? [...equipped.filter((i) => i.slot !== preview.slot), preview] : equipped
  const list = cosmetics.filter((i) => i.slot === slot)

  async function equip(item: ShopItem, on: boolean) {
    try {
      await api.post('/items/equip', { itemId: item.id, equip: on })
      setPreview(null)
      await qc.invalidateQueries({ queryKey: ['shop'] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="bg-arena flex min-h-[100dvh] flex-col">
      <ScreenHeader title="캐릭터 꾸미기" sub="CUSTOMIZE" right={<Button size="sm" variant="secondary" onClick={() => setReset(true)}>기본 외형으로</Button>} />
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="relative h-[42vh] lg:h-auto lg:flex-1">
          <Canvas camera={{ position: [0, 1.4, 4], fov: 38 }}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 4, 3]} intensity={1.8} />
            <pointLight position={[-3, 2, -2]} color="#ff3048" intensity={8} />
            <pointLight position={[3, 2, -2]} color="#1e90ff" intensity={8} />
            <Character look={lookFromItems(shown)} rightHand={<GlowSword />} />
            <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.2, 40]} /><meshStandardMaterial color="#252c73" /></mesh>
            <OrbitControls enablePan={false} minDistance={2.5} maxDistance={6} target={[0, 1.1, 0]} />
          </Canvas>
          {preview && <p className="absolute inset-x-0 top-3 text-center text-sm font-bold">👀 {preview.name} 미리보기 중</p>}
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-dim">드래그해서 돌려 보세요 · 옷, 신발, 머리색, 피부색, 망토가 캐릭터에 보여요</p>
        </div>
        <aside className="w-full space-y-3 border-white/10 bg-ink/30 p-4 lg:w-[26rem] lg:border-l">
          <div className="flex flex-wrap gap-1.5">
            {COSMETIC_SLOTS.map((s) => (
              <button key={s} onClick={() => { setSlot(s); setPreview(null) }} className={cx('rounded-xl border-2 px-2.5 py-1 text-sm font-bold', slot === s ? 'border-accent bg-accent/20' : 'border-white/10')}>{COSMETIC_SLOT_NAMES[s]}</button>
            ))}
          </div>
          {shop.isLoading ? <Loading /> : !list.length ? <p className="text-sm text-dim">이 부위의 아이템이 아직 없어요.</p> : (
            <div className="grid grid-cols-2 gap-2">
              {list.map((it) => {
                const color = typeof it.effect.color === 'string' ? it.effect.color : null
                return (
                  <div key={it.id} className={cx('panel cut-md space-y-1.5 p-2.5', it.equipped && '!border-accent', preview?.id === it.id && '!border-violet')}>
                    <div className="flex items-center gap-2">
                      {color && <span className="size-5 rounded-full border-2 border-white/60" style={{ background: color === 'rainbow' ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : color }} />}
                      <b className="text-sm">{it.name}</b>
                    </div>
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => setPreview(preview?.id === it.id ? null : it)}>👀 미리보기</Button>
                    {it.owned ? (
                      <Button size="sm" variant={it.equipped ? 'secondary' : 'ok'} className="w-full" onClick={() => equip(it, !it.equipped)}>{it.equipped ? '해제' : '장착'}</Button>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => nav('/shop?tab=character')}>🪙 {it.price} 상점에서 사기</Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-xs text-faint">꾸미기 아이템은 겉모습만 바꾸고 능력치에는 영향이 없어요. 모자·안경·액세서리·승리 효과는 프로필과 결과 화면에 표시될 예정이에요.</p>
        </aside>
      </div>
      <Confirm
        open={reset} title="기본 외형으로 되돌릴까요?" confirmText="되돌리기" message="장착한 꾸미기 아이템을 모두 해제해요. 아이템은 그대로 가지고 있어요."
        onCancel={() => setReset(false)}
        onConfirm={async () => {
          await api.post('/items/reset-look')
          setReset(false)
          void qc.invalidateQueries({ queryKey: ['shop'] })
          toast.success('기본 외형으로 되돌렸어요.')
        }}
      />
    </div>
  )
}
