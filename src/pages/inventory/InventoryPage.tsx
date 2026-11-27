import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WEAPON_INFO, WEAPON_TYPES } from '@shared/constants'
import { Button, cx, Empty, ErrorBox, Loading, Pill, Progress, ScreenHeader } from '@/components/ui'
import { api } from '@/lib/api'
import type { WeaponList } from '@/lib/weapons'

const SORTS = [
  ['recent', '최근 제작순'], ['attack', '공격력순'], ['speed', '공격 속도순'], ['range', '사거리순'], ['defense', '방어력순'], ['name', '이름순'],
] as const

export default function InventoryPage() {
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('recent')
  const [favOnly, setFavOnly] = useState(false)
  const qs = new URLSearchParams({ sort, ...(search.trim() ? { search: search.trim() } : {}), ...(type ? { type } : {}), ...(favOnly ? { favorite: 'true' } : {}) })
  const q = useQuery({ queryKey: ['weapons', qs.toString()], queryFn: () => api.get<WeaponList>('/weapons?' + qs) })

  return (
    <div>
      <ScreenHeader
        title="무기 보관함"
        sub="ARSENAL"
        back={false}
        right={<Button size="sm" onClick={() => nav('/workshop')}>🖌️ 새 무기</Button>}
      />
      <div className="mx-auto max-w-5xl space-y-3 p-4">
        {q.data && (
          <div className="panel cut-lg flex flex-wrap items-center gap-3 p-3">
            <span className="font-bold">보관 칸</span>
            <Progress value={q.data.used} max={q.data.slots} className="h-3 min-w-32 flex-1 rounded-full" />
            <span className="font-num text-lg font-bold">{q.data.used} / {q.data.slots}</span>
            <Button size="sm" variant="secondary" onClick={() => nav('/shop?tab=slots')}>➕ 칸 늘리기</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 무기 이름 검색" maxLength={30}
            className="h-11 min-w-0 flex-1 rounded-xl border-2 border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-accent"
          />
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-11 rounded-xl border-2 border-white/15 bg-black/30 px-2 text-sm">
            <option value="" className="bg-panel">모든 종류</option>
            {WEAPON_TYPES.map((t) => <option key={t} value={t} className="bg-panel">{WEAPON_INFO[t].emoji} {WEAPON_INFO[t].name}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 rounded-xl border-2 border-white/15 bg-black/30 px-2 text-sm">
            {SORTS.map(([v, l]) => <option key={v} value={v} className="bg-panel">{l}</option>)}
          </select>
          <button
            onClick={() => setFavOnly(!favOnly)}
            className={cx('h-11 rounded-xl border-2 px-3 text-sm font-bold', favOnly ? 'border-accent bg-accent/20' : 'border-white/15 bg-black/30')}
          >
            ⭐ 즐겨찾기
          </button>
        </div>

        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data!.weapons.length ? (
          <Empty icon="🎒" title={search || type || favOnly ? '조건에 맞는 무기가 없어요' : '아직 만든 무기가 없어요'}>
            {!search && !type && !favOnly && <Button className="mt-2" onClick={() => nav('/workshop')}>첫 무기 그리러 가기</Button>}
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {q.data!.weapons.map((w) => {
              const equipped = q.data!.equippedWeaponId === w.id
              return (
                <button
                  key={w.id}
                  onClick={() => nav(`/weapons/${w.id}`)}
                  className={cx('panel cut-lg group overflow-hidden text-left transition hover:-translate-y-0.5', equipped && '!border-accent')}
                >
                  <div className="relative aspect-square bg-white">
                    {w.previewPng ? <img src={w.previewPng} alt="" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-5xl">{WEAPON_INFO[w.type].emoji}</div>}
                    <div className="absolute left-2 top-2 flex gap-1">
                      {equipped && <Pill>장착 중</Pill>}
                      {w.favorite && <Pill className="bg-ink/80 text-accent-2">⭐</Pill>}
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate font-display text-lg">{w.name}</p>
                    <p className="text-xs text-dim">{WEAPON_INFO[w.type].emoji} {WEAPON_INFO[w.type].name}</p>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-center font-num text-xs">
                      <span className="rounded bg-red/20 py-0.5">⚔ {w.stats.attack}</span>
                      <span className="rounded bg-accent/20 py-0.5">⚡ {w.stats.speed}</span>
                      <span className="rounded bg-ok/20 py-0.5">🛡 {w.stats.defense}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
