import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, cx, ErrorBox, Loading, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface Attendance { today: string; checkedToday: boolean; streak: number; todayDay: number; rewards: number[]; history: string[] }

export default function AttendancePage() {
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const q = useQuery({ queryKey: ['attendance'], queryFn: () => api.get<Attendance>('/attendance') })
  const [busy, setBusy] = useState(false)

  async function check() {
    setBusy(true)
    try {
      const r = await api.post<{ streak: number; cycleDay: number; reward: number }>('/attendance/check')
      sfx.coin()
      toast.coin(`${r.cycleDay}일차 출석 완료! 🪙 +${r.reward}`)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['attendance'] }), qc.invalidateQueries({ queryKey: ['home'] })])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const d = q.data
  // Calendar of the current month (KST date strings).
  const month = d?.today.slice(0, 7)
  const days = month ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 30
  const firstDow = month ? new Date(`${month}-01T00:00:00`).getDay() : 0
  const attended = new Set(d?.history)

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="출석 체크" sub="DAILY CHECK-IN" />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            <div className="panel cut-lg p-4 text-center">
              <p className="text-dim">연속 출석</p>
              <p className="font-display text-5xl text-accent-2">{d!.streak}일</p>
              <p className="mt-1 text-sm text-dim">7일 연속 출석하면 특별 보상 🪙 {d!.rewards[6]}!</p>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {d!.rewards.map((r, i) => {
                const day = i + 1
                const done = day < d!.todayDay || (day === d!.todayDay && d!.checkedToday)
                const isToday = day === d!.todayDay
                return (
                  <div
                    key={day}
                    className={cx(
                      'panel cut-md flex flex-col items-center gap-1 p-2 text-center',
                      isToday && !d!.checkedToday && '!border-accent animate-pulse',
                      day === 7 && 'col-span-2 sm:col-span-1 bg-gradient-to-b from-violet/40 to-panel',
                      done && 'opacity-60',
                    )}
                  >
                    <span className="text-xs font-bold text-dim">{day}일차</span>
                    <span className="text-2xl">{done ? '✅' : day === 7 ? '🎁' : '🪙'}</span>
                    <span className="font-num font-bold">{r}</span>
                  </div>
                )
              })}
            </div>
            <Button size="lg" className="w-full" disabled={d!.checkedToday} loading={busy} onClick={check}>
              {d!.checkedToday ? '✓ 오늘 출석 완료! 내일 또 만나요' : `📅 오늘 출석하기 (🪙 ${d!.rewards[d!.todayDay - 1]})`}
            </Button>
            <div className="panel cut-lg p-4">
              <h3 className="mb-3 font-display text-lg">📆 {month?.replace('-', '년 ')}월 출석 달력</h3>
              <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {['일', '월', '화', '수', '목', '금', '토'].map((w) => <span key={w} className="text-xs font-bold text-dim">{w}</span>)}
                {Array.from({ length: firstDow }, (_, i) => <span key={'b' + i} />)}
                {Array.from({ length: days }, (_, i) => {
                  const key = `${month}-${String(i + 1).padStart(2, '0')}`
                  return (
                    <span key={key} className={cx('grid aspect-square place-items-center rounded-lg font-num', attended.has(key) ? 'bg-accent font-bold text-ink' : key === d!.today ? 'border-2 border-accent' : 'bg-white/5')}>
                      {i + 1}
                    </span>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
