import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, cx } from '@/components/ui'
import { sfx } from '@/lib/sound'
import { useBattle } from '@/stores/battle'

export default function ResultPage() {
  const nav = useNavigate()
  const result = useBattle((s) => s.result)
  const init = useBattle((s) => s.init)

  useEffect(() => {
    if (!result) return
    if (result.reward?.result === 'WIN') sfx.success()
    if (result.reward?.levelUps.length) setTimeout(() => sfx.levelUp(), 600)
  }, [result])

  if (!result || !init) {
    return (
      <div className="bg-arena flex h-[100dvh] flex-col items-center justify-center gap-4">
        <p className="font-display text-2xl">결과가 없어요</p>
        <Button onClick={() => nav('/')}>로비로</Button>
      </div>
    )
  }
  const me = result.players.find((p) => p.id === init.you)
  const outcome = result.reward?.result ?? (result.winner === 'DRAW' ? 'DRAW' : result.winner === me?.team ? 'WIN' : 'LOSS')
  const title = outcome === 'WIN' ? '승리!' : outcome === 'LOSS' ? '패배' : '무승부'
  const sorted = [...result.players].sort((a, b) => b.score - a.score)

  return (
    <div className={cx('flex min-h-[100dvh] flex-col items-center gap-5 p-4 pt-10', outcome === 'WIN' ? 'bg-[radial-gradient(ellipse_at_top,#ffd23f55,transparent_60%),linear-gradient(#2a2f8f,#111540)]' : 'bg-arena')}>
      <div className="animate-pop-in text-center">
        <p className="text-7xl">{outcome === 'WIN' ? '🏆' : outcome === 'LOSS' ? '💧' : '🤝'}</p>
        <h1 className={cx('text-outline font-display text-6xl', outcome === 'WIN' ? 'text-accent-2' : outcome === 'LOSS' ? 'text-[#9fb6ff]' : 'text-white')}>{title}</h1>
        <p className="mt-1 text-dim">
          {result.reason === 'elimination' ? (outcome === 'LOSS' ? '우리 팀이 모두 쓰러졌어요' : outcome === 'WIN' ? '상대 팀을 모두 쓰러뜨렸어요' : '양 팀 모두 쓰러졌어요') : result.reason === 'time' ? '시간 종료 · 점수 비교' : '전투가 중단됐어요'} · {result.durationSec}초
        </p>
      </div>
      <div className="flex items-center gap-4 font-num text-4xl font-bold">
        <span className="text-red">{result.score.RED}</span><span className="text-xl text-dim">vs</span><span className="text-blue">{result.score.BLUE}</span>
      </div>

      {result.reward && (
        <div className="panel cut-lg w-full max-w-md p-4 text-center">
          {result.reward.valid ? (
            <>
              <p className="mb-2 font-display text-lg">획득한 보상</p>
              <div className="flex justify-center gap-6 font-num text-2xl font-bold">
                <span>🪙 +{result.reward.coins}</span>
                <span>✨ +{result.reward.xp} XP</span>
              </div>
              {result.reward.levelUps.length > 0 && <p className="mt-2 animate-pulse font-display text-xl text-accent-2">🎉 레벨 {result.reward.levelUps.at(-1)} 달성!</p>}
            </>
          ) : (
            <p className="text-sm text-dim">{init.players.find((x) => x.id === init.you)?.staff ? '🛡️ 관리자로 플레이한 판이라 보상과 기록이 남지 않아요.' : '전투에 충분히 참여하지 않았거나 중간에 나가서 보상이 없어요.'}</p>
          )}
        </div>
      )}

      <div className="panel cut-lg w-full max-w-md overflow-hidden">
        <div className="grid grid-cols-[1fr_3rem_3rem_4rem] gap-1 bg-white/5 px-3 py-2 text-xs font-bold text-dim">
          <span>플레이어</span><span className="text-center">처치</span><span className="text-center">피해</span><span className="text-right">점수</span>
        </div>
        {sorted.map((p) => (
          <div key={p.id} className={cx('grid grid-cols-[1fr_3rem_3rem_4rem] items-center gap-1 px-3 py-2 text-sm', p.id === init.you && 'bg-accent/15')}>
            <span className="flex items-center gap-1.5 truncate font-bold">
              <span className={cx('size-2.5 rounded-full', p.team === 'RED' ? 'bg-red' : 'bg-blue')} />{p.id === init.you ? '나' : p.name}
            </span>
            <span className="text-center font-num">{p.kills}</span>
            <span className="text-center font-num">{p.damage}</span>
            <span className="text-right font-num font-bold">{p.score}</span>
          </div>
        ))}
      </div>

      <div className="flex w-full max-w-md gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => { useBattle.getState().reset(); nav('/') }}>로비로</Button>
        <Button className="flex-1" onClick={() => { useBattle.getState().reset(); nav(init.mode === 'AI' ? '/play' : '/play/friends') }}>다시 하기</Button>
      </div>
    </div>
  )
}
