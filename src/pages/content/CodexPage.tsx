import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, cx, ErrorBox, Loading, Modal, Progress, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'

interface Entry { key: string; group: 'type' | 'style'; name: string; icon: string; desc: string; discovered: boolean; source: string | null; at: string | null }
interface Data { entries: Entry[]; pct: number; total: number; found: number; rewards: { pct: number; coins: number; reached: boolean; claimed: boolean }[] }

export default function CodexPage() {
  const qc = useQueryClient()
  const refresh = useAuth((s) => s.refresh)
  const q = useQuery({ queryKey: ['codex'], queryFn: () => api.get<Data>('/codex') })
  const [open, setOpen] = useState<Entry | null>(null)

  async function claim(pct: number) {
    try {
      const r = await api.post<{ coins: number }>('/codex/claim', { pct })
      sfx.coin()
      toast.coin(`도감 ${pct}% 보상! 🪙 +${r.coins}`)
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['codex'] })])
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="bg-arena min-h-[100dvh]">
      <ScreenHeader title="무기 도감" sub="CODEX" />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {q.isLoading ? <Loading /> : q.isError ? <ErrorBox error={q.error} /> : (
          <>
            <div className="panel cut-lg p-4">
              <div className="mb-2 flex items-end justify-between">
                <p className="font-display text-xl">완성률</p>
                <p className="font-num text-3xl font-bold text-accent-2">{q.data!.pct}% <span className="text-sm text-dim">({q.data!.found}/{q.data!.total})</span></p>
              </div>
              <Progress value={q.data!.found} max={q.data!.total} className="h-3 rounded-full" />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {q.data!.rewards.map((r) => (
                  <div key={r.pct} className="rounded-xl bg-white/5 p-2 text-center">
                    <p className="font-num font-bold">{r.pct}%</p>
                    <p className="text-xs">🪙 {r.coins}</p>
                    {r.claimed ? <p className="text-xs font-bold text-ok">✓ 받음</p> : r.reached ? <Button size="sm" className="mt-1 w-full" onClick={() => claim(r.pct)}>받기</Button> : <p className="text-xs text-faint">🔒</p>}
                  </div>
                ))}
              </div>
            </div>
            {(['type', 'style'] as const).map((g) => (
              <section key={g}>
                <h3 className="mb-2 font-display text-lg">{g === 'type' ? '⚔️ 무기 종류' : '🖌️ 특별한 펜 무기'}</h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {q.data!.entries.filter((e) => e.group === g).map((e) => (
                    <button key={e.key} onClick={() => setOpen(e)} className={cx('panel cut-md flex flex-col items-center gap-1 p-3', !e.discovered && 'opacity-50')}>
                      <span className={cx('text-4xl', !e.discovered && 'grayscale brightness-0 invert-[0.3]')}>{e.icon}</span>
                      <span className="text-sm font-bold">{e.discovered ? e.name : '???'}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.discovered ? `${open.icon} ${open.name}` : '❓ 아직 발견하지 못한 무기'}>
        <p className="mb-2 text-dim">{open?.discovered ? open.desc : open?.group === 'type' ? '이 종류의 무기를 만들거나, 전투에서 이 무기를 든 상대를 만나면 발견돼요.' : '상점에서 이 펜을 사서 무기를 그리면 발견돼요.'}</p>
        {open?.discovered && <p className="text-xs text-faint">{open.source === 'BATTLE' ? '전투에서 발견' : '직접 제작'} · {open.at && new Date(open.at).toLocaleDateString('ko-KR')}</p>}
        <Button className="mt-4 w-full" onClick={() => setOpen(null)}>닫기</Button>
      </Modal>
    </div>
  )
}
