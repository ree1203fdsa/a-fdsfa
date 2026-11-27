import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cx, Empty, ErrorBox, Loading, ScreenHeader, Tabs } from '@/components/ui'
import { api } from '@/lib/api'

type Board = 'level' | 'wins' | 'score' | 'weapons' | 'friends' | 'weekly' | 'monthly'
interface Row { rank: number; id: number; nickname: string; level: number; score: number; change: number | null }

const BOARDS: [Board, string, string][] = [
  ['level', '레벨', 'XP'], ['wins', '승리', '승'], ['score', '전투 점수', '점'], ['weapons', '무기 제작', '개'],
  ['weekly', '주간', '점'], ['monthly', '월간(시즌)', '점'], ['friends', '친구', '점'],
]

export default function RankingPage() {
  const nav = useNavigate()
  const [board, setBoard] = useState<Board>('level')
  const q = useQuery({ queryKey: ['ranking', board], queryFn: () => api.get<{ rows: Row[]; me: Row | null }>(`/ranking?board=${board}`) })
  const unit = BOARDS.find((b) => b[0] === board)![2]
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null)

  return (
    <div>
      <ScreenHeader title="랭킹" sub="RANKING" back={false} />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <Tabs value={board} onChange={setBoard} items={BOARDS.map(([v, l]) => ({ value: v, label: l }))} />
        {q.data?.me && (
          <div className="panel cut-lg flex items-center gap-3 !border-accent p-3">
            <span className="w-12 text-center font-num text-2xl font-bold text-accent-2">{q.data.me.rank}위</span>
            <span className="flex-1 font-bold">내 순위</span>
            <span className="font-num text-lg font-bold">{q.data.me.score.toLocaleString()} {unit}</span>
          </div>
        )}
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} onRetry={() => void q.refetch()} /> : !q.data!.rows.length ? (
          <Empty icon="🏆" title="아직 기록이 없어요">게임을 플레이하면 순위에 올라가요!</Empty>
        ) : (
          <ol className="space-y-1.5">
            {q.data!.rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => nav(`/players/${r.id}`)} className={cx('panel cut-lg flex w-full items-center gap-3 p-2.5 text-left', r.id === q.data!.me?.id && '!border-accent', r.rank <= 3 && 'bg-gradient-to-r from-accent/15 to-transparent')}>
                  <span className="w-10 text-center font-num text-xl font-bold">{medal(r.rank) ?? r.rank}</span>
                  <span className="grid size-10 place-items-center rounded-full bg-gradient-to-b from-[#ffe0c2] to-[#f5b98a] text-xl">😎</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.nickname}</span>
                    <span className="font-num text-xs text-accent">Lv.{r.level}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-num text-lg font-bold">{r.score.toLocaleString()} <span className="text-xs text-dim">{unit}</span></span>
                    {r.change !== null && <span className={cx('font-num text-xs', r.change > 0 ? 'text-ok' : r.change < 0 ? 'text-bad' : 'text-dim')}>{r.change > 0 ? `▲${r.change}` : r.change < 0 ? `▼${-r.change}` : '-'}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
