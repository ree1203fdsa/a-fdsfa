import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { disconnectSocket, getSocket } from '@/lib/socket'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

/** Keeps one socket per logged-in session and routes server pushes into the stores. */
export function RealtimeBridge() {
  const userId = useAuth((s) => s.user?.id)
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) {
      disconnectSocket()
      return
    }
    const s = getSocket()
    const onWallet = (w: { coins: number }) => useAuth.getState().patch({ coins: w.coins })
    const onNotification = (n: { type: string; title: string; body: string }) => {
      if (n.type === 'LEVEL_UP') {
        sfx.levelUp()
        toast.level(n.title)
        void useAuth.getState().refresh()
      } else if (n.type === 'REWARD' || n.type === 'MISSION_DONE') {
        sfx.coin()
        toast.coin(n.title)
      } else {
        toast.info(n.title)
      }
      void qc.invalidateQueries({ queryKey: ['home'] })
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    }
    const onSuspended = (d: { days: number; reason: string }) => {
      toast.error(`운영진이 계정을 ${d.days}일 정지했어요. (${d.reason})`)
      useAuth.getState().setUser(null)
    }
    s.on('wallet', onWallet)
    s.on('notification', onNotification)
    s.on('account:suspended', onSuspended)
    return () => {
      s.off('wallet', onWallet)
      s.off('notification', onNotification)
      s.off('account:suspended', onSuspended)
    }
  }, [userId, qc])

  return null
}
