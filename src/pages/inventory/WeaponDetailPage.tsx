import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Group } from 'three'
import { TOOL_BY_ID, WEAPON_INFO } from '@shared/constants'
import { checkWeaponName } from '@shared/text'
import { SpecialBox, StatBars } from '@/components/StatBars'
import { Button, Confirm, ErrorBox, IconButton, Loading, Modal, Pill, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import type { WeaponDetail } from '@/lib/weapons'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { downloadGlb, sendGlbToPhone } from '@/three/exportGlb'
import WeaponView from '@/three/WeaponView'

export default function WeaponDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const user = useAuth((s) => s.user)!
  const refresh = useAuth((s) => s.refresh)
  const q = useQuery({ queryKey: ['weapon', id], queryFn: () => api.get<{ weapon: WeaponDetail; own: boolean }>(`/weapons/${id}`) })
  const group = useRef<Group | null>(null)
  const [built, setBuilt] = useState(false)
  const [rename, setRename] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const onBuilt = useCallback((g: Group | null) => {
    group.current = g
    setBuilt(Boolean(g))
  }, [])

  if (q.isLoading) return <div className="bg-arena h-[100dvh]"><Loading /></div>
  if (q.isError) return <div className="bg-arena h-[100dvh] p-6"><ErrorBox error={q.error} onRetry={() => void q.refetch()} /></div>
  const w = q.data!.weapon
  const own = q.data!.own
  const equipped = user.equippedWeaponId === w.id
  const info = WEAPON_INFO[w.type]

  async function act(name: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(name)
    try {
      await fn()
      sfx.success()
      toast.success(ok)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['weapons'] }), qc.invalidateQueries({ queryKey: ['weapon', id] })])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-arena flex h-[100dvh] flex-col">
      <ScreenHeader
        title={w.name}
        sub={`${info.nameEn} · #${w.id}`}
        right={own && (
          <IconButton label={w.favorite ? '즐겨찾기 해제' : '즐겨찾기'} onClick={() => act('fav', () => api.patch(`/weapons/${w.id}`, { favorite: !w.favorite }), w.favorite ? '즐겨찾기를 해제했어요.' : '즐겨찾기에 추가했어요.')}>
            {w.favorite ? '⭐' : '☆'}
          </IconButton>
        )}
      />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[42vh] flex-1">
          <WeaponView strokes={w.strokes} paperId={w.paperId} type={w.type} params={w.modelParams} onBuilt={onBuilt} className="absolute inset-0" />
          {equipped && <Pill className="absolute left-3 top-3 bg-accent text-ink">⚔️ 전투에 장착 중</Pill>}
        </div>
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-white/10 bg-ink/30 p-4 scrollbar-thin lg:w-[24rem] lg:border-l">
          <div className="flex items-center gap-3">
            {w.previewPng && <img src={w.previewPng} alt="원본 그림" className="size-16 rounded-lg bg-white object-contain" />}
            <div>
              <p className="font-display text-xl">{info.emoji} {info.name}</p>
              <p className="text-xs text-dim">{new Date(w.createdAt).toLocaleDateString('ko-KR')} 제작 · {w.toolsUsed.map((t) => TOOL_BY_ID[t]?.name).filter(Boolean).join(', ')}</p>
            </div>
          </div>
          <StatBars stats={w.stats} />
          <SpecialBox type={w.type} />
          {own && (
            <div className="mt-auto space-y-2 pt-2">
              {equipped ? (
                <Button variant="secondary" className="w-full" loading={busy === 'equip'} onClick={() => act('equip', () => api.post('/weapons/unequip'), '장착을 해제했어요.')}>장착 해제</Button>
              ) : (
                <Button size="lg" className="w-full" loading={busy === 'equip'} onClick={() => act('equip', () => api.post(`/weapons/${w.id}/equip`), `${w.name}을(를) 장착했어요!`)}>⚔️ 전투에 장착하기</Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setRename(w.name)}>✏️ 이름 바꾸기</Button>
                <Button variant="secondary" loading={busy === 'dup'} onClick={() => act('dup', () => api.post(`/weapons/${w.id}/duplicate`), '무기를 복제했어요.')}>📄 복제</Button>
                <Button
                  variant="blue" disabled={!built} loading={busy === 'phone'}
                  onClick={async () => {
                    if (!group.current) return
                    setBusy('phone')
                    try {
                      const r = await sendGlbToPhone(group.current, w.id)
                      if (!r.enabled) toast.info('휴대폰 자동 저장이 꺼져 있어요.')
                      else if (r.delivered) toast.success(`S22의 ${r.phonePath}에 저장했어요!`)
                      else toast.info('S22가 연결돼 있지 않아 컴퓨터에 보관했어요. 연결되면 자동으로 보내요.')
                    } catch (e) {
                      toast.error(errorMessage(e))
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  📲 S22로 보내기
                </Button>
                <Button
                  variant="secondary" disabled={!built}
                  onClick={async () => {
                    if (!group.current) return
                    const bytes = await downloadGlb(group.current, w.name)
                    toast.success(`3D 파일(.glb, ${(bytes / 1024).toFixed(0)}KB)을 이 기기에 저장했어요.`)
                  }}
                >
                  💾 이 기기에 저장
                </Button>
              </div>
              <Button variant="danger" className="w-full" onClick={() => setConfirmDel(true)}>🗑 무기 삭제</Button>
            </div>
          )}
        </aside>
      </div>

      <Modal open={rename !== null} onClose={() => setRename(null)} title="이름 바꾸기">
        <input
          value={rename ?? ''} onChange={(e) => setRename(e.target.value)} maxLength={16} autoFocus
          className="mb-1 h-12 w-full rounded-xl border-2 border-white/15 bg-black/30 px-3 font-display text-lg outline-none focus:border-accent"
        />
        <p className="mb-4 text-xs text-bad">{rename !== null && checkWeaponName(rename)}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setRename(null)}>취소</Button>
          <Button
            className="flex-1" disabled={rename === null || Boolean(checkWeaponName(rename))} loading={busy === 'rename'}
            onClick={async () => {
              await act('rename', () => api.patch(`/weapons/${w.id}`, { name: rename!.trim() }), '이름을 바꿨어요.')
              setRename(null)
            }}
          >
            바꾸기
          </Button>
        </div>
      </Modal>
      <Confirm
        open={confirmDel} danger title="무기를 삭제할까요?" confirmText="삭제" loading={busy === 'del'}
        message={<><b className="text-text">{w.name}</b>을(를) 보관함에서 지워요. 삭제한 무기는 되돌릴 수 없어요.{equipped && ' 지금 장착 중인 무기라 장착도 해제돼요.'}</>}
        onCancel={() => setConfirmDel(false)}
        onConfirm={async () => {
          setBusy('del')
          try {
            await api.del(`/weapons/${w.id}`)
            toast.success('무기를 삭제했어요.')
            await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['weapons'] })])
            nav('/inventory', { replace: true })
          } catch (e) {
            toast.error(errorMessage(e))
            setBusy(null)
          }
        }}
      />
    </div>
  )
}
