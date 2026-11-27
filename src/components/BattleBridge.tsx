import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BattleEvent, BattleInit, BattleResult, BattleSnapshot } from '@shared/battle'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'
import { battleEvents, useBattle } from '@/stores/battle'

/** Routes battle socket traffic into the battle store and opens the battle screen when a match starts. */
export function BattleBridge() {
  const userId = useAuth((s) => s.user?.id)
  const nav = useNavigate()

  useEffect(() => {
    if (!userId) return
    const s = getSocket()
    const onInit = (init: BattleInit) => {
      useBattle.getState().setInit(init)
      nav('/battle')
    }
    const onState = (snap: BattleSnapshot) => useBattle.getState().pushSnapshot(snap)
    const onEvents = (ev: BattleEvent[]) => battleEvents.emit(ev)
    const onCountdown = (n: number) => useBattle.getState().setCountdown(n)
    const onEnd = (r: BattleResult) => {
      useBattle.getState().setResult(r)
      void useAuth.getState().refresh()
    }
    s.on('battle:init', onInit)
    s.on('battle:state', onState)
    s.on('battle:events', onEvents)
    s.on('battle:countdown', onCountdown)
    s.on('battle:end', onEnd)
    return () => {
      s.off('battle:init', onInit)
      s.off('battle:state', onState)
      s.off('battle:events', onEvents)
      s.off('battle:countdown', onCountdown)
      s.off('battle:end', onEnd)
    }
  }, [userId, nav])

  return null
}
