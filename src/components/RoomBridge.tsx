import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'
import { useRoom, type RoomView } from '@/stores/room'
import { toast } from '@/stores/toast'
import { Button, Modal } from './ui'

/** Room updates, invites, friend presence and idle ("away") detection. */
export function RoomBridge() {
  const userId = useAuth((s) => s.user?.id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const invite = useRoom((s) => s.invite)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!userId) return
    const s = getSocket()
    const onUpdate = (r: RoomView) => useRoom.getState().set(r)
    const onClosed = () => useRoom.getState().set(null)
    const onKicked = () => {
      useRoom.getState().set(null)
      toast.error('방장이 방에서 내보냈어요.')
      nav('/play/friends')
    }
    const onInvited = (i: { code: string; from: string }) => useRoom.getState().setInvite(i)
    const onFriend = () => void qc.invalidateQueries({ queryKey: ['friends'] })
    const recover = () => s.emit('room:current', (r: { ok: boolean; room?: RoomView }) => useRoom.getState().set(r.ok ? r.room! : null))
    s.on('room:update', onUpdate)
    s.on('room:closed', onClosed)
    s.on('room:kicked', onKicked)
    s.on('room:invited', onInvited)
    s.on('friend:status', onFriend)
    s.on('connect', recover)
    if (s.connected) recover()

    // Away after 5 minutes without input.
    let last = Date.now()
    let away = false
    const active = () => {
      last = Date.now()
      if (away) {
        away = false
        s.emit('presence:active')
      }
    }
    const idle = setInterval(() => {
      if (!away && Date.now() - last > 5 * 60_000) {
        away = true
        s.emit('presence:away')
      }
    }, 30_000)
    window.addEventListener('pointerdown', active)
    window.addEventListener('keydown', active)
    return () => {
      s.off('room:update', onUpdate)
      s.off('room:closed', onClosed)
      s.off('room:kicked', onKicked)
      s.off('room:invited', onInvited)
      s.off('friend:status', onFriend)
      s.off('connect', recover)
      clearInterval(idle)
      window.removeEventListener('pointerdown', active)
      window.removeEventListener('keydown', active)
    }
  }, [userId, nav, qc])

  return (
    <Modal open={invite !== null} onClose={() => useRoom.getState().setInvite(null)} title="📨 게임 초대">
      <p className="mb-5 text-dim"><b className="text-text">{invite?.from}</b>님이 같이 하자고 초대했어요! (방 코드 {invite?.code})</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => useRoom.getState().setInvite(null)}>거절</Button>
        <Button
          className="flex-1" loading={joining}
          onClick={() => {
            setJoining(true)
            getSocket().emit('room:join', { code: invite!.code }, (r: { ok: boolean; error?: string; room?: RoomView }) => {
              setJoining(false)
              useRoom.getState().setInvite(null)
              if (!r.ok) return toast.error(r.error ?? '방에 들어가지 못했어요.')
              useRoom.getState().set(r.room!)
              nav('/room')
            })
          }}
        >
          참가하기
        </Button>
      </div>
    </Modal>
  )
}
