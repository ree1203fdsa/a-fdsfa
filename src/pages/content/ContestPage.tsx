import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { WEAPON_INFO, type WeaponType } from '@shared/constants'
import type { ModelParams, Stroke } from '@shared/weapon'
import { ReportButton } from '@/components/ReportButton'
import { Button, cx, Empty, ErrorBox, Loading, Modal, Pill, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useCountdown } from '@/lib/hooks'
import type { WeaponList } from '@/lib/weapons'
import { toast } from '@/stores/toast'
import WeaponView from '@/three/WeaponView'

type Status = 'UPCOMING' | 'SUBMISSION' | 'VOTING' | 'ENDED'
interface ContestSummary { id: number; title: string; categoryName: string; description: string; status: Status; entries: number; rewards: number[]; submitEndAt: string; voteEndAt: string }
interface Snapshot { name: string; type: WeaponType; previewPng: string; strokes: Stroke[]; paperId: string; modelParams: ModelParams }
interface DetailData extends Omit<ContestSummary, 'entries'> {
  votesLeft: number
  entries: { id: number; userId: number; nickname: string; snapshot: Snapshot; mine: boolean; voted: boolean; votes: number | null; rank: number | null }[]
}

const STATUS: Record<Status, [string, string]> = {
  UPCOMING: ['곧 시작', 'bg-white/15 text-text'], SUBMISSION: ['작품 제출 중', 'bg-ok text-white'], VOTING: ['투표 중', 'bg-accent text-ink'], ENDED: ['결과 발표', 'bg-violet text-white'],
}

export default function ContestPage() {
  const [openId, setOpenId] = useState<number | null>(null)
  const list = useQuery({ queryKey: ['contests'], queryFn: () => api.get<ContestSummary[]>('/contests') })
  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="무기 대회" sub="CONTEST" onBack={openId ? () => setOpenId(null) : undefined} />
      <div className="mx-auto max-w-4xl space-y-3 p-4">
        {openId ? <ContestDetail id={openId} /> : list.isLoading ? <Loading /> : list.isError ? <ErrorBox error={list.error} /> : !list.data!.length ? <Empty icon="🎖️" title="열린 대회가 없어요" /> : (
          list.data!.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="panel cut-lg flex w-full items-center gap-4 p-4 text-left">
              <span className="text-5xl">🎖️</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><b className="font-display text-xl">{c.title}</b><Pill className={STATUS[c.status][1]}>{STATUS[c.status][0]}</Pill></span>
                <span className="block text-sm text-dim">{c.categoryName} · 참가작 {c.entries}개 · 상금 🪙 {c.rewards.join(' / ')}</span>
              </span>
              <span className="text-2xl">›</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function ContestDetail({ id }: { id: number }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['contest', id], queryFn: () => api.get<DetailData>(`/contests/${id}`) })
  const [submit, setSubmit] = useState(false)
  const [view, setView] = useState<DetailData['entries'][number] | null>(null)
  const left = useCountdown(q.data ? (q.data.status === 'SUBMISSION' ? q.data.submitEndAt : q.data.voteEndAt) : null)
  if (q.isLoading) return <Loading />
  if (q.isError) return <ErrorBox error={q.error} />
  const c = q.data!
  const mine = c.entries.find((e) => e.mine)

  async function vote(entryId: number) {
    try {
      await api.post(`/contests/${id}/vote`, { entryId })
      toast.success('투표했어요!')
      await qc.invalidateQueries({ queryKey: ['contest', id] })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <div className="panel cut-lg space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-2xl">{c.title}</h2><Pill className={STATUS[c.status][1]}>{STATUS[c.status][0]}</Pill></div>
        <p className="text-dim">{c.description}</p>
        <p className="text-sm">🏆 상금: 1위 🪙{c.rewards[0]} · 2위 🪙{c.rewards[1]} · 3위 🪙{c.rewards[2]} <span className="text-dim">(우편함으로 지급)</span></p>
        {(c.status === 'SUBMISSION' || c.status === 'VOTING') && <p className="font-num text-sm text-accent">⏰ {c.status === 'SUBMISSION' ? '제출 마감까지' : '투표 마감까지'} {left}</p>}
        {c.status === 'SUBMISSION' && <Button onClick={() => setSubmit(true)}>{mine ? '🔄 출품작 바꾸기' : '📤 내 무기 출품하기'}</Button>}
        {c.status === 'VOTING' && <p className="text-sm">🗳️ 남은 투표권: <b>{c.votesLeft}</b>표 (내 작품에는 투표할 수 없어요)</p>}
        <p className="text-xs text-faint">대회는 전투 능력치가 아니라 그림의 창의성과 디자인으로 뽑아요. 투표 수는 결과 발표 때 공개돼요.</p>
      </div>
      {!c.entries.length ? <Empty icon="🖼️" title="아직 출품작이 없어요" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {c.entries.map((e) => (
            <div key={e.id} className={cx('panel cut-lg overflow-hidden', e.mine && '!border-accent', e.rank === 1 && '!border-[#ffd23f]')}>
              <button onClick={() => setView(e)} className="relative block w-full bg-white">
                <img src={e.snapshot.previewPng} alt="" className="aspect-square w-full object-contain" />
                {e.rank && e.rank <= 3 && <span className="absolute left-2 top-2 text-3xl">{['🥇', '🥈', '🥉'][e.rank - 1]}</span>}
              </button>
              <div className="space-y-1 p-2.5">
                <p className="truncate font-display">{e.snapshot.name}</p>
                <p className="truncate text-xs text-dim">{WEAPON_INFO[e.snapshot.type]?.emoji} by {e.nickname}{e.mine && ' (나)'}</p>
                {e.votes !== null && <p className="font-num text-sm font-bold">❤️ {e.votes}표</p>}
                {c.status === 'VOTING' && !e.mine && (
                  <Button size="sm" className="w-full" variant={e.voted ? 'secondary' : 'violet'} disabled={e.voted || c.votesLeft <= 0} onClick={() => vote(e.id)}>
                    {e.voted ? '✓ 투표함' : '❤️ 투표'}
                  </Button>
                )}
                {!e.mine && <ReportButton targetType="WEAPON" targetId={e.snapshot.name + '#' + e.id} targetUserId={e.userId} />}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={view !== null} onClose={() => setView(null)} title={view?.snapshot.name} wide>
        {view && <WeaponView strokes={view.snapshot.strokes} paperId={view.snapshot.paperId} type={view.snapshot.type} params={view.snapshot.modelParams} className="h-80 overflow-hidden rounded-2xl" />}
        <p className="mt-2 text-sm text-dim">by {view?.nickname}</p>
      </Modal>
      <SubmitModal open={submit} onClose={() => setSubmit(false)} contestId={id} onDone={() => void qc.invalidateQueries({ queryKey: ['contest', id] })} />
    </>
  )
}

function SubmitModal({ open, onClose, contestId, onDone }: { open: boolean; onClose: () => void; contestId: number; onDone: () => void }) {
  const q = useQuery({ queryKey: ['weapons', 'contest'], queryFn: () => api.get<WeaponList>('/weapons'), enabled: open })
  return (
    <Modal open={open} onClose={onClose} title="출품할 무기 고르기" wide>
      {!q.data ? <Loading /> : !q.data.weapons.length ? <p className="text-dim">보관함에 무기가 없어요. 먼저 무기를 그려 주세요.</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {q.data.weapons.map((w) => (
            <button
              key={w.id}
              className="overflow-hidden rounded-xl border-2 border-white/10 hover:border-accent"
              onClick={async () => {
                try {
                  await api.post(`/contests/${contestId}/enter`, { weaponId: w.id })
                  toast.success(`"${w.name}"을(를) 출품했어요!`)
                  onDone()
                  onClose()
                } catch (e) {
                  toast.error(errorMessage(e))
                }
              }}
            >
              <img src={w.previewPng} alt="" className="aspect-square w-full bg-white object-contain" />
              <span className="block truncate p-1 text-xs font-bold">{w.name}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
