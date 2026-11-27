import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AI_DIFFICULTIES, AI_DIFFICULTY_NAMES, WEAPON_INFO, type AiDifficulty } from '@shared/constants'
import { MAPS, MAP_IDS } from '@shared/maps'
import { Button, cx, Pill, ScreenHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import type { WeaponList } from '@/lib/weapons'
import { toast } from '@/stores/toast'

const DIFF_DESC: Record<AiDifficulty, string> = {
  easy: '느리게 반응하고 단순하게 공격해요.', normal: '기본 공격과 방어를 해요.', hard: '피하고 거리를 조절해요.',
  expert: '공격을 읽고 반격해요.', legend: '팀으로 움직이고 약한 적을 노려요.',
}

export default function PlayPage() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'pick' | 'ai'>('pick')
  const [difficulty, setDifficulty] = useState<AiDifficulty>('normal')
  const [mapId, setMapId] = useState('random')
  const [teamSize, setTeamSize] = useState<1 | 2>(2)
  const [starting, setStarting] = useState(false)
  const weapons = useQuery({ queryKey: ['weapons', 'play'], queryFn: () => api.get<WeaponList>('/weapons') })
  const equipped = weapons.data?.weapons.find((w) => w.id === weapons.data?.equippedWeaponId)

  function start() {
    setStarting(true)
    const s = getSocket()
    const timeout = setTimeout(() => {
      setStarting(false)
      toast.error('서버 응답이 없어요. 잠시 후 다시 시도해 주세요.')
    }, 10_000)
    s.emit('battle:start-ai', { difficulty, mapId, teamSize }, (r: { ok: boolean; error?: string }) => {
      clearTimeout(timeout)
      if (!r.ok) {
        setStarting(false)
        toast.error(r.error ?? '전투를 시작하지 못했어요.')
      }
      // On success the server sends battle:init and the battle screen opens by itself.
    })
  }

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="플레이" sub="SELECT MODE" onBack={mode === 'ai' ? () => setMode('pick') : undefined} />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {mode === 'pick' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <button onClick={() => nav('/play/friends')} className="gloss relative flex flex-col items-start gap-2 overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff6b7c] to-[#c81e3a] p-6 text-left">
              <span className="text-6xl">👫</span>
              <span className="text-outline font-display text-3xl">친구와 플레이</span>
              <span className="text-sm font-bold">방을 만들고 6자리 코드로 친구를 불러요. 최대 4명, 2대2 팀전!</span>
              <Pill className="bg-white/25 text-white">최대 4명</Pill>
            </button>
            <button onClick={() => setMode('ai')} className="gloss relative flex flex-col items-start gap-2 overflow-hidden rounded-3xl bg-gradient-to-br from-[#5cb6ff] to-[#1a5fd6] p-6 text-left">
              <span className="text-6xl">🤖</span>
              <span className="text-outline font-display text-3xl">AI와 플레이</span>
              <span className="text-sm font-bold">혼자서 AI와 대결해요. 쉬움부터 전설까지 5단계!</span>
              <Pill className="bg-white/25 text-white">1명 + AI</Pill>
            </button>
          </div>
        ) : (
          <>
            <section className="panel cut-lg p-4">
              <h3 className="mb-2 font-display text-lg">⚔️ 내 무기</h3>
              {equipped ? (
                <div className="flex items-center gap-3">
                  <img src={equipped.previewPng} alt="" className="size-14 rounded-lg bg-white object-contain" />
                  <div className="flex-1">
                    <p className="font-display text-lg">{equipped.name}</p>
                    <p className="text-xs text-dim">{WEAPON_INFO[equipped.type].emoji} {WEAPON_INFO[equipped.type].name} · 특수: {WEAPON_INFO[equipped.type].specialName}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => nav('/inventory')}>바꾸기</Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 text-sm text-dim">
                  장착한 무기가 없어서 연습용 검으로 싸워요.
                  <Button size="sm" variant="secondary" onClick={() => nav('/workshop')}>무기 만들기</Button>
                </div>
              )}
            </section>
            <section className="panel cut-lg space-y-2 p-4">
              <h3 className="font-display text-lg">🎚️ AI 난이도</h3>
              <div className="grid grid-cols-5 gap-1.5">
                {AI_DIFFICULTIES.map((d, i) => (
                  <button key={d} onClick={() => setDifficulty(d)} className={cx('rounded-xl border-2 py-2 text-sm font-bold', difficulty === d ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5')}>
                    <span className="text-[10px] tracking-tighter">{'⭐'.repeat(i + 1)}</span><br />{AI_DIFFICULTY_NAMES[d]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-dim">{DIFF_DESC[difficulty]} 어려울수록 보상이 많아요.</p>
            </section>
            <section className="panel cut-lg space-y-2 p-4">
              <h3 className="font-display text-lg">🗺️ 맵</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {['random', ...MAP_IDS].map((m) => (
                  <button key={m} onClick={() => setMapId(m)} className={cx('rounded-xl border-2 py-2 text-sm font-bold', mapId === m ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5')}>
                    <span className="text-2xl">{m === 'random' ? '🎲' : MAPS[m].emoji}</span><br />{m === 'random' ? '무작위' : MAPS[m].name}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel cut-lg space-y-2 p-4">
              <h3 className="font-display text-lg">👥 팀 구성</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {([[2, '2대2 (나 + AI 팀원 vs AI 2명)'], [1, '1대1 (나 vs AI 1명)']] as const).map(([n, l]) => (
                  <button key={n} onClick={() => setTeamSize(n)} className={cx('rounded-xl border-2 py-2.5 text-sm font-bold', teamSize === n ? 'border-accent bg-accent/20' : 'border-white/10 bg-white/5')}>{l}</button>
                ))}
              </div>
            </section>
            <Button size="xl" className="w-full" loading={starting} onClick={start}>⚔️ 전투 시작!</Button>
          </>
        )}
      </div>
    </div>
  )
}
