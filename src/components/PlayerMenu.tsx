import { useNavigate } from 'react-router-dom'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { ReportButton } from './ReportButton'
import { Button, Modal } from './ui'

/** Tap a player (chat, waiting room) → profile / report, plus moderation when playing in admin mode. */
export function PlayerMenu({ player, context, onClose }: { player: { userId: number; nickname: string } | null; context?: string; onClose: () => void }) {
  const nav = useNavigate()
  const me = useAuth((s) => s.user)!
  if (!player) return null
  const mod = (event: string, data: Record<string, unknown>, ok: string) =>
    getSocket().emit(event, { userId: player.userId, ...data }, (r: { ok: boolean; error?: string }) => {
      if (r.ok) {
        toast.success(ok)
        onClose()
      } else toast.error(r.error ?? '처리하지 못했어요.')
    })

  return (
    <Modal open onClose={onClose} title={player.nickname}>
      <div className="space-y-2">
        <Button variant="secondary" className="w-full" onClick={() => nav(`/players/${player.userId}`)}>😊 프로필 보기</Button>
        <div className="text-center"><ReportButton targetType={context ? 'CHAT' : 'USER'} targetId={player.userId} targetUserId={player.userId} context={context} label="🚨 이 플레이어 신고하기" className="text-sm" /></div>
        {me.adminPlay && player.userId !== me.id && (
          <div className="space-y-2 rounded-2xl border-2 border-red/50 bg-red/10 p-3">
            <p className="text-sm font-bold text-red">🛡️ 관리자 기능</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => mod('mod:mute', { minutes: 10 }, '10분 동안 채팅을 막았어요.')}>채팅 금지 10분</Button>
              <Button size="sm" variant="secondary" onClick={() => mod('mod:mute', { minutes: 60 }, '1시간 동안 채팅을 막았어요.')}>채팅 금지 1시간</Button>
              <Button size="sm" variant="secondary" onClick={() => mod('mod:kick-room', {}, '방에서 내보냈어요.')}>방에서 내보내기</Button>
              <Button size="sm" variant="danger" onClick={() => {
                const reason = prompt('정지 사유를 적어 주세요 (1일 정지)')
                if (reason !== null) mod('mod:suspend', { days: 1, reason }, '1일 정지했어요.')
              }}>1일 정지</Button>
              <Button size="sm" variant="danger" className="col-span-2" onClick={() => {
                const reason = prompt('정지 사유를 적어 주세요 (7일 정지)')
                if (reason !== null) mod('mod:suspend', { days: 7, reason }, '7일 정지했어요.')
              }}>7일 정지</Button>
            </div>
            <p className="text-[11px] text-dim">처리한 내용은 관리자 활동 기록에 남아요. 같거나 높은 등급의 운영진에게는 쓸 수 없어요.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function StaffBadge({ show }: { show?: boolean }) {
  if (!show) return null
  return <span className="ml-1 rounded bg-red px-1 py-px align-middle text-[10px] font-bold text-white">🛡️관리자</span>
}
