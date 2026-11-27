import { useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import { toast } from '@/stores/toast'
import { Button, cx, Modal } from './ui'

const REASONS: Record<string, string[]> = {
  USER: ['욕설·비하', '괴롭힘', '고의로 게임 방해', '부정 행위(핵·버그 악용)', '기타'],
  CHAT: ['욕설·비하', '도배', '개인정보 노출', '광고', '기타'],
  WEAPON: ['부적절한 그림', '다른 사람 작품 도용', '기타'],
  NICKNAME: ['욕설·비하', '운영자 사칭', '기타'],
}

export function ReportButton({ targetType, targetId, targetUserId, context, label = '🚨 신고', className }: {
  targetType: 'USER' | 'CHAT' | 'WEAPON' | 'NICKNAME'; targetId: string | number; targetUserId?: number; context?: string; label?: string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className={cx('text-xs text-dim hover:text-bad', className)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="신고하기">
        <p className="mb-2 text-sm text-dim">어떤 문제가 있었나요? 운영팀이 확인하고 처리해요.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {REASONS[targetType].map((r) => (
            <button key={r} onClick={() => setReason(r)} className={cx('rounded-xl border-2 px-3 py-1.5 text-sm font-bold', reason === r ? 'border-bad bg-bad/20' : 'border-white/15')}>{r}</button>
          ))}
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={3} placeholder="자세한 내용 (선택)" className="mb-4 w-full rounded-xl border-2 border-white/15 bg-black/30 p-3 text-sm outline-none focus:border-accent" />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>취소</Button>
          <Button
            variant="danger" className="flex-1" disabled={!reason} loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await api.post('/reports', { targetType, targetId: String(targetId), targetUserId, reason, detail, context: context?.slice(0, 300) ?? '' })
                toast.success('신고가 접수됐어요. 고마워요!')
                setOpen(false)
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            신고하기
          </Button>
        </div>
      </Modal>
    </>
  )
}
