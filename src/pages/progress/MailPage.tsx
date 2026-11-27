import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Confirm, cx, Empty, ErrorBox, Loading, Modal, Pill, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { timeAgo } from './NotificationsPage'

interface Mail {
  id: number; type: 'REWARD' | 'EVENT' | 'ADMIN' | 'GIFT'; title: string; body: string; coins: number; xp: number; itemId: string | null; itemName: string | null
  readAt: string | null; claimedAt: string | null; expiresAt: string | null; createdAt: string; hasReward: boolean; expired: boolean
}
const TYPE: Record<Mail['type'], [string, string]> = { REWARD: ['🎁', '보상'], EVENT: ['🎊', '이벤트'], ADMIN: ['📢', '운영팀'], GIFT: ['💝', '선물'] }

export default function MailPage() {
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const q = useQuery({ queryKey: ['mail'], queryFn: () => api.get<Mail[]>('/mail') })
  const [open, setOpen] = useState<Mail | null>(null)
  const [del, setDel] = useState<Mail | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = () => Promise.all([q.refetch(), refresh(), qc.invalidateQueries({ queryKey: ['home'] })])

  async function claim(m: Mail) {
    setBusy(true)
    try {
      const r = await api.post<{ coins: number; xp: number }>(`/mail/${m.id}/claim`)
      sfx.coin()
      toast.coin(`받았어요! ${r.coins ? `🪙 +${r.coins} ` : ''}${r.xp ? `XP +${r.xp} ` : ''}${m.itemName ? `· ${m.itemName}` : ''}`)
      setOpen(null)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const claimable = (q.data ?? []).filter((m) => m.hasReward && !m.claimedAt && !m.expired)

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader
        title="우편함"
        sub="MAILBOX"
        right={
          <Button
            size="sm" disabled={!claimable.length} loading={busy && !open}
            onClick={async () => {
              setBusy(true)
              try {
                const r = await api.post<{ count: number; coins: number; xp: number }>('/mail/claim-all')
                sfx.coin()
                toast.coin(`${r.count}개 받음! 🪙 +${r.coins} · XP +${r.xp}`)
                await reload()
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            전체 받기 {claimable.length ? `(${claimable.length})` : ''}
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-2 p-4">
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : !q.data!.length ? (
          <Empty icon="📮" title="우편이 없어요">보상이나 선물이 오면 여기에 도착해요.</Empty>
        ) : (
          q.data!.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setOpen(m)
                if (!m.readAt) void api.post(`/mail/${m.id}/read`).then(() => q.refetch())
              }}
              className={cx('panel cut-lg flex w-full items-center gap-3 p-3 text-left', !m.readAt && '!border-accent/60', (m.claimedAt || m.expired) && 'opacity-60')}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">{TYPE[m.type]?.[0] ?? '✉️'}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><Pill className="bg-white/10 text-dim">{TYPE[m.type]?.[1]}</Pill><b className="truncate">{m.title}</b></span>
                <span className="block text-xs text-faint">{timeAgo(m.createdAt)}{m.expiresAt && !m.claimedAt && ` · ${new Date(m.expiresAt).toLocaleDateString('ko-KR')}까지`}</span>
              </span>
              {m.hasReward && <span className="text-sm font-bold">{m.claimedAt ? '✓ 받음' : m.expired ? '기간 만료' : '🎁'}</span>}
            </button>
          ))
        )}
      </div>

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.title}>
        <p className="mb-4 whitespace-pre-wrap text-dim">{open?.body || '내용이 없어요.'}</p>
        {open?.hasReward && (
          <div className="mb-4 rounded-xl bg-white/5 p-3">
            <p className="mb-1 text-xs font-bold text-dim">첨부된 보상</p>
            {open.coins > 0 && <p>🪙 {open.coins.toLocaleString()} 코인</p>}
            {open.xp > 0 && <p>✨ 경험치 {open.xp}</p>}
            {open.itemName && <p>🎁 {open.itemName}</p>}
          </div>
        )}
        <div className="flex gap-2">
          {open && (open.claimedAt || !open.hasReward || open.expired) && <Button variant="danger" className="flex-1" onClick={() => setDel(open)}>삭제</Button>}
          {open?.hasReward && !open.claimedAt && !open.expired ? (
            <Button className="flex-1" loading={busy} onClick={() => claim(open)}>보상 받기</Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={() => setOpen(null)}>닫기</Button>
          )}
        </div>
      </Modal>
      <Confirm
        open={del !== null} danger title="우편을 삭제할까요?" confirmText="삭제" message="삭제한 우편은 다시 볼 수 없어요."
        onCancel={() => setDel(null)}
        onConfirm={async () => {
          try {
            await api.del(`/mail/${del!.id}`)
            setDel(null)
            setOpen(null)
            void q.refetch()
          } catch (e) {
            toast.error(errorMessage(e))
          }
        }}
      />
    </div>
  )
}
