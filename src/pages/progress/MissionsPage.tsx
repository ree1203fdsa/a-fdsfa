import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, cx, Empty, ErrorBox, Loading, Progress, ScreenHeader, Tabs } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { useCountdown } from '@/lib/hooks'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface Mission {
  id: number; title: string; description: string; period: 'DAILY' | 'WEEKLY' | 'EVENT'; goalType: string; goalCount: number
  rewardCoins: number; rewardXp: number; eventTitle: string | null; progress: number; completed: boolean; claimed: boolean; resetAt: string | null
}

const GOAL_ICON: Record<string, string> = { PLAY_GAMES: '⚔️', WIN_GAMES: '⭐', CREATE_WEAPONS: '🖌️', PLAY_WITH_FRIENDS: '👫', AI_GAMES: '🤖', ATTEND: '📅' }
const GOAL_LINK: Record<string, string> = { PLAY_GAMES: '/play', WIN_GAMES: '/play', CREATE_WEAPONS: '/workshop', PLAY_WITH_FRIENDS: '/play', AI_GAMES: '/play', ATTEND: '/attendance' }

export default function MissionsPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const [tab, setTab] = useState<'DAILY' | 'WEEKLY' | 'EVENT'>('DAILY')
  const q = useQuery({ queryKey: ['missions'], queryFn: () => api.get<{ missions: Mission[]; dailyResetAt: string; weeklyResetAt: string }>('/missions') })
  const [claiming, setClaiming] = useState<number | null>(null)
  const dailyLeft = useCountdown(q.data?.dailyResetAt)
  const weeklyLeft = useCountdown(q.data?.weeklyResetAt)

  async function claim(m: Mission) {
    setClaiming(m.id)
    try {
      const r = await api.post<{ coins: number; xp: number; levelUps: number[] }>(`/missions/${m.id}/claim`)
      sfx.coin()
      toast.coin(`보상 획득! 🪙 +${r.coins} · XP +${r.xp}`)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['missions'] }), qc.invalidateQueries({ queryKey: ['home'] })])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setClaiming(null)
    }
  }

  const list = (q.data?.missions ?? []).filter((m) => m.period === tab).sort((a, b) => Number(a.claimed) - Number(b.claimed) || Number(b.completed) - Number(a.completed))
  const hasEvent = q.data?.missions.some((m) => m.period === 'EVENT')
  const readyCount = (p: string) => q.data?.missions.filter((m) => m.period === p && m.completed && !m.claimed).length ?? 0

  return (
    <div>
      <ScreenHeader title="미션" sub="MISSIONS" back={false} right={<Button size="sm" variant="secondary" onClick={() => nav('/attendance')}>📅 출석 체크</Button>} />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'DAILY', label: `일일 미션${readyCount('DAILY') ? ` 🔴${readyCount('DAILY')}` : ''}` },
            { value: 'WEEKLY', label: `주간 미션${readyCount('WEEKLY') ? ` 🔴${readyCount('WEEKLY')}` : ''}` },
            ...(hasEvent ? [{ value: 'EVENT' as const, label: '이벤트 미션' }] : []),
          ]}
        />
        {tab !== 'EVENT' && (
          <p className="text-right font-num text-sm text-dim">⏰ 초기화까지 {tab === 'DAILY' ? dailyLeft : weeklyLeft} <span className="text-faint">(매일·매주 월요일 0시, 한국 시간)</span></p>
        )}
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : !list.length ? (
          <Empty icon="🎯" title="지금은 진행 중인 미션이 없어요" />
        ) : (
          <ul className="space-y-2.5">
            {list.map((m) => (
              <li key={m.id} className={cx('panel cut-lg flex items-center gap-3 p-3', m.claimed && 'opacity-55', m.completed && !m.claimed && '!border-accent')}>
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-2xl">{GOAL_ICON[m.goalType] ?? '🎯'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight">{m.title}</p>
                  {m.eventTitle && <p className="text-xs text-accent">{m.eventTitle}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={m.progress} max={m.goalCount} className="h-2 flex-1 rounded-full" color={m.completed ? 'bg-ok' : 'bg-accent'} />
                    <span className="font-num text-sm">{m.progress}/{m.goalCount}</span>
                  </div>
                  <p className="mt-1 text-xs text-dim">보상: 🪙 {m.rewardCoins} · XP {m.rewardXp}</p>
                </div>
                {m.claimed ? (
                  <span className="text-sm font-bold text-ok">✓ 받음</span>
                ) : m.completed ? (
                  <Button size="sm" loading={claiming === m.id} onClick={() => claim(m)}>보상 받기</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => nav(GOAL_LINK[m.goalType] ?? '/')}>하러 가기</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
