import { Canvas } from '@react-three/fiber'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_INFO, type WeaponType } from '@shared/constants'
import { Button, cx, ErrorBox, Loading, Modal, Pill, Progress, ScreenHeader } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import type { WeaponList } from '@/lib/weapons'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { Character, GlowSword, lookFromAvatar } from '@/three/Character'
import type { Avatar } from '@shared/avatar'

interface Profile {
  id: number; nickname: string; level: number; xpInto: number; xpNeed: number; createdAt: string; isMe: boolean; coins?: number
  stats: { totalGames: number; wins: number; losses: number; draws: number; battleScore: number; weaponsCreated: number; friends: number }
  avatar?: Avatar
  look: { category: string; slot: string; itemId: string; name: string; effect: Record<string, unknown> }[]
  repWeapon: { id: number; name: string; type: WeaponType; previewPng: string } | null
}

export default function ProfilePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const me = useAuth((s) => s.user)!
  const pid = id ?? String(me.id)
  const q = useQuery({ queryKey: ['profile', pid], queryFn: () => api.get<Profile>(`/profile/${pid}`) })
  const [picking, setPicking] = useState(false)

  if (q.isLoading) return <Loading />
  if (q.isError) return <div className="p-4"><ErrorBox error={q.error} onRetry={() => void q.refetch()} /></div>
  const p = q.data!
  const prof = (slot: string) => p.look.find((l) => l.category === 'PROFILE' && l.slot === slot)
  const frame = prof('frame')?.effect.color as string | undefined
  const bg = prof('background')?.effect.gradient as string[] | undefined
  const title = prof('title')?.effect.text as string | undefined
  const deco = prof('decoration')?.effect.emoji as string | undefined
  const winRate = p.stats.totalGames ? Math.round((p.stats.wins / p.stats.totalGames) * 100) : 0

  return (
    <div>
      <ScreenHeader
        title={p.isMe ? '내 프로필' : `${p.nickname}의 프로필`}
        sub="PROFILE"
        back={!p.isMe || Boolean(id)}
        right={p.isMe && <Button size="sm" variant="secondary" onClick={() => nav('/settings')}>⚙️ 설정</Button>}
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <div
          className="relative overflow-hidden rounded-3xl p-1"
          style={{ background: frame === 'rainbow' ? 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)' : frame ?? 'rgba(255,255,255,0.15)', boxShadow: prof('frame')?.effect.glow ? `0 0 24px ${frame}` : undefined }}
        >
          <div className="flex flex-col items-center gap-4 rounded-[1.3rem] p-4 sm:flex-row" style={{ background: bg ? `linear-gradient(135deg, ${bg[0]}, ${bg[1]})` : 'linear-gradient(180deg, #252c73, #161b4f)' }}>
            <div className="h-56 w-44 shrink-0">
              <Canvas camera={{ position: [0, 1.3, 3.4], fov: 38 }} onCreated={({ camera }) => camera.lookAt(0, 1.1, 0)}>
                <ambientLight intensity={0.9} />
                <directionalLight position={[2, 4, 3]} intensity={1.8} />
                <Character look={lookFromAvatar(p.avatar, p.look.filter((l) => l.category === 'COSMETIC'))} rotation={[0, 0.4, 0]} rightHand={<GlowSword />} />
              </Canvas>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              {title && <Pill className="mb-1 bg-violet text-white">🏷️ {title}</Pill>}
              <p className="text-outline font-display text-4xl">{p.nickname} {deco}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-display text-xl text-accent-2">Lv. {p.level}</span>
                <Progress value={p.xpInto} max={p.xpNeed} className="h-2.5 flex-1 rounded-full" />
                <span className="font-num text-xs">{p.xpInto}/{p.xpNeed}</span>
              </div>
              <p className="mt-1 text-xs text-white/70">{new Date(p.createdAt).toLocaleDateString('ko-KR')} 가입</p>
              {p.isMe && (
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Button size="sm" onClick={() => nav('/customize')}>👕 캐릭터 꾸미기</Button>
                  <Button size="sm" variant="secondary" onClick={() => nav('/shop?tab=profile')}>🖼️ 프로필 꾸미기</Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[
            ['총 경기', p.stats.totalGames], ['승리', p.stats.wins], ['패배', p.stats.losses], ['승률', `${winRate}%`],
            ['제작 무기', p.stats.weaponsCreated], ['친구', p.stats.friends],
          ].map(([l, v]) => (
            <div key={l} className="panel cut-md p-2 text-center">
              <p className="font-num text-2xl font-bold">{v}</p>
              <p className="text-xs text-dim">{l}</p>
            </div>
          ))}
        </div>
        <div className="panel cut-md flex items-center justify-between p-3">
          <span className="text-dim">⚔️ 전투 점수</span>
          <span className="font-num text-2xl font-bold text-accent-2">{p.stats.battleScore.toLocaleString()}</span>
          {p.isMe && <span className="text-dim">🪙 {p.coins?.toLocaleString()}</span>}
        </div>

        <div className="panel cut-lg p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">⭐ 대표 무기</h3>
            {p.isMe && <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>바꾸기</Button>}
          </div>
          {p.repWeapon ? (
            <button onClick={() => p.isMe && nav(`/weapons/${p.repWeapon!.id}`)} className="flex w-full items-center gap-3 text-left">
              {p.repWeapon.previewPng ? <img src={p.repWeapon.previewPng} alt="" className="size-20 rounded-xl bg-white object-contain" /> : <span className="text-5xl">{WEAPON_INFO[p.repWeapon.type].emoji}</span>}
              <span>
                <span className="block font-display text-xl">{p.repWeapon.name}</span>
                <span className="text-sm text-dim">{WEAPON_INFO[p.repWeapon.type].emoji} {WEAPON_INFO[p.repWeapon.type].name}</span>
              </span>
            </button>
          ) : (
            <p className="text-sm text-dim">{p.isMe ? '보관함의 무기 중 하나를 대표 무기로 골라 보세요.' : '아직 대표 무기가 없어요.'}</p>
          )}
        </div>
      </div>

      {p.isMe && (
        <RepPicker
          open={picking}
          currentId={p.repWeapon?.id ?? null}
          onClose={() => setPicking(false)}
          onPick={async (wid) => {
            try {
              await api.put('/me/profile', { repWeaponId: wid })
              toast.success(wid ? '대표 무기를 바꿨어요.' : '대표 무기를 해제했어요.')
              setPicking(false)
              await qc.invalidateQueries({ queryKey: ['profile', pid] })
            } catch (e) {
              toast.error(errorMessage(e))
            }
          }}
        />
      )}
    </div>
  )
}

function RepPicker({ open, currentId, onClose, onPick }: { open: boolean; currentId: number | null; onClose: () => void; onPick: (id: number | null) => void }) {
  const q = useQuery({ queryKey: ['weapons', 'rep'], queryFn: () => api.get<WeaponList>('/weapons?sort=recent'), enabled: open })
  return (
    <Modal open={open} onClose={onClose} title="대표 무기 고르기" wide>
      {!q.data ? <Loading /> : !q.data.weapons.length ? <p className="py-6 text-center text-dim">보관함에 무기가 없어요.</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {q.data.weapons.map((w) => (
            <button key={w.id} onClick={() => onPick(w.id)} className={cx('overflow-hidden rounded-xl border-2', currentId === w.id ? 'border-accent' : 'border-white/10')}>
              <img src={w.previewPng} alt="" className="aspect-square w-full bg-white object-contain" />
              <span className="block truncate p-1 text-xs font-bold">{w.name}</span>
            </button>
          ))}
        </div>
      )}
      {currentId && <Button variant="ghost" className="mt-3 w-full" onClick={() => onPick(null)}>대표 무기 해제</Button>}
    </Modal>
  )
}
