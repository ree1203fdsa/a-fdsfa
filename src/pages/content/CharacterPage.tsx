import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BUILDS, CLOTH_COLORS, DEFAULT_AVATAR, EYES, HAIR_COLORS, HAIR_STYLES, MOUTHS, SKIN_TONES, randomAvatar, sanitizeAvatar, type Avatar,
} from '@shared/avatar'
import { cx } from '@/components/ui'
import { api, errorMessage } from '@/lib/api'
import { sfx } from '@/lib/sound'
import type { Me } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { toast } from '@/stores/toast'
import { Character, GlowSword, lookFromAvatar } from '@/three/Character'

type Tab = 'body' | 'hair' | 'face' | 'clothes'
const TABS: [Tab, string, string][] = [['body', '🧍', '몸'], ['hair', '💇', '머리'], ['face', '😊', '얼굴'], ['clothes', '👕', '옷']]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-display text-base text-white/90">{title}</p>
      {children}
    </div>
  )
}

function Swatches({ colors, value, onPick, label }: { colors: readonly string[]; value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => { sfx.click(); onPick(c) }}
          className={cx('size-10 rounded-xl border-[3px] shadow-[0_3px_0_rgba(0,0,0,.35)] transition active:scale-90', value === c ? 'scale-110 border-[#ffd23f]' : 'border-white/25 hover:border-white/60')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

function Choices<T extends string>({ options, value, onPick, label }: { options: readonly { id: T; name: string }[]; value: T; onPick: (v: T) => void; label: string }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => { sfx.click(); onPick(o.id) }}
          className={cx(
            'rounded-xl border-2 px-2 py-2.5 font-display text-sm transition active:scale-95',
            value === o.id ? 'border-[#ffd23f] bg-gradient-to-b from-[#ffd23f] to-[#f5a400] text-[#2a1a00] shadow-[0_3px_0_#9a5a00]' : 'border-white/15 bg-white/5 text-white hover:bg-white/10',
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  )
}

export default function CharacterPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const first = params.get('first') === '1'
  const user = useAuth((s) => s.user)!
  const saved = useMemo(() => sanitizeAvatar(user.avatar), [user.avatar])
  const [a, setA] = useState<Avatar>(saved)
  const [tab, setTab] = useState<Tab>('body')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Avatar>(k: K, v: Avatar[K]) => setA((x) => ({ ...x, [k]: v }))
  const changed = JSON.stringify({ ...a, created: false }) !== JSON.stringify({ ...saved, created: false })
  const look = useMemo(() => lookFromAvatar(a), [a])

  async function save(avatar: Avatar = a) {
    setSaving(true)
    try {
      const r = await api.put<{ user: Me }>('/me/avatar', { avatar })
      useAuth.getState().setUser(r.user)
      void qc.invalidateQueries({ queryKey: ['profile'] })
      sfx.success()
      toast.success(first ? '멋진 캐릭터가 완성됐어요!' : '캐릭터를 저장했어요.')
      if (first) nav('/', { replace: true })
    } catch (e) {
      sfx.error()
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[linear-gradient(#2f6bff,#6fa8ff_50%,#bcd6ff)] text-white">
      {/* header */}
      <header className="flex items-center gap-3 p-3 sm:p-4">
        {!first && (
          <button onClick={() => nav(-1)} className="grid size-12 place-items-center rounded-2xl border border-white/15 bg-[#141a3a]/85 text-2xl shadow-lg" aria-label="뒤로">‹</button>
        )}
        <div className="rounded-2xl border border-white/10 bg-[#141a3a]/85 px-4 py-2 shadow-lg">
          <h1 className="font-display text-xl sm:text-2xl">{first ? '나만의 캐릭터를 만들어요!' : '캐릭터 만들기'}</h1>
          {first && <p className="text-xs text-white/80 sm:text-sm">언제든지 메뉴의 ‘캐릭터 만들기’에서 다시 바꿀 수 있어요.</p>}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-3 pb-3 sm:px-4 sm:pb-4 lg:flex-row">
        {/* preview */}
        <div className="relative h-[44vh] min-h-72 overflow-hidden rounded-[1.75rem] border-2 border-white/30 bg-[radial-gradient(ellipse_at_50%_35%,#ffffff55,transparent_60%)] lg:h-auto lg:flex-1">
          <Canvas camera={{ position: [0, 1.6, 5.6], fov: 34 }}>
            <hemisphereLight args={['#eef4ff', '#6a60b0', 2]} />
            <directionalLight position={[2, 4, 4]} intensity={2.2} />
            <pointLight position={[-3, 2, -2]} color="#ff3048" intensity={10} />
            <pointLight position={[3, 2, -2]} color="#1e90ff" intensity={10} />
            <Character look={{ ...look, cape: null }} rightHand={<GlowSword />} />
            <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.3, 48]} /><meshStandardMaterial color="#ffd23f" /></mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><ringGeometry args={[1.3, 1.45, 48]} /><meshStandardMaterial color="#12131c" /></mesh>
            <OrbitControls enablePan={false} minDistance={2.4} maxDistance={6} target={[0, 1.15, 0]} autoRotate autoRotateSpeed={1.2} />
          </Canvas>
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-bold text-white/90 drop-shadow">드래그해서 돌려 보세요 · 상점 꾸미기 아이템은 이 위에 입혀져요</p>
          <button
            onClick={() => { sfx.click(); setA((x) => ({ ...randomAvatar(), created: x.created })) }}
            className="absolute right-3 top-3 flex items-center gap-1.5 rounded-2xl border-2 border-[#c9a6ff] bg-gradient-to-b from-[#a46bff] to-[#6a2ee0] px-3 py-2 font-display text-white shadow-[0_4px_0_#3c1680] active:translate-y-0.5"
          >
            🎲 랜덤
          </button>
        </div>

        {/* options */}
        <aside className="flex w-full flex-col rounded-[1.75rem] border-2 border-[#4fb8ff]/70 bg-[#121a3d]/90 p-4 shadow-[0_0_24px_rgba(79,184,255,.35)] backdrop-blur lg:w-[28rem]">
          <div className="mb-4 grid grid-cols-4 gap-1.5 rounded-2xl bg-black/30 p-1.5">
            {TABS.map(([t, icon, name]) => (
              <button
                key={t}
                onClick={() => { sfx.click(); setTab(t) }}
                className={cx('flex flex-col items-center rounded-xl py-1.5 font-display text-sm transition', tab === t ? 'bg-gradient-to-b from-[#4fb8ff] to-[#1565e0] text-white shadow' : 'text-white/70 hover:bg-white/10')}
              >
                <span className="text-xl">{icon}</span>{name}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto pr-1 scrollbar-thin">
            {tab === 'body' && (
              <>
                <Section title="피부색"><Swatches label="피부색" colors={SKIN_TONES} value={a.skin} onPick={(c) => set('skin', c)} /></Section>
                <Section title="체형"><Choices label="체형" options={BUILDS} value={a.build} onPick={(v) => set('build', v)} /></Section>
              </>
            )}
            {tab === 'hair' && (
              <>
                <Section title="머리 모양"><Choices label="머리 모양" options={HAIR_STYLES} value={a.hairStyle} onPick={(v) => set('hairStyle', v)} /></Section>
                <Section title="머리 색"><Swatches label="머리 색" colors={HAIR_COLORS} value={a.hairColor} onPick={(c) => set('hairColor', c)} /></Section>
              </>
            )}
            {tab === 'face' && (
              <>
                <Section title="눈"><Choices label="눈" options={EYES} value={a.eyes} onPick={(v) => set('eyes', v)} /></Section>
                <Section title="입"><Choices label="입" options={MOUTHS} value={a.mouth} onPick={(v) => set('mouth', v)} /></Section>
              </>
            )}
            {tab === 'clothes' && (
              <>
                <Section title="상의"><Swatches label="상의 색" colors={CLOTH_COLORS} value={a.shirt} onPick={(c) => set('shirt', c)} /></Section>
                <Section title="하의"><Swatches label="하의 색" colors={CLOTH_COLORS} value={a.pants} onPick={(c) => set('pants', c)} /></Section>
                <Section title="신발"><Swatches label="신발 색" colors={CLOTH_COLORS} value={a.shoes} onPick={(c) => set('shoes', c)} /></Section>
                <Section title="가슴 왕관 문양"><Swatches label="문양 색" colors={CLOTH_COLORS} value={a.emblem} onPick={(c) => set('emblem', c)} /></Section>
              </>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            {first ? (
              <button onClick={() => void save({ ...DEFAULT_AVATAR })} disabled={saving} className="h-14 flex-1 rounded-2xl border border-white/20 bg-white/5 font-display text-lg hover:bg-white/10 disabled:opacity-60">
                기본으로 시작
              </button>
            ) : (
              <button onClick={() => { sfx.click(); setA(saved) }} disabled={!changed || saving} className="h-14 flex-1 rounded-2xl border border-white/20 bg-white/5 font-display text-lg hover:bg-white/10 disabled:opacity-40">
                되돌리기
              </button>
            )}
            <button
              onClick={() => void save()}
              disabled={saving || (!first && !changed)}
              className="h-14 flex-[2] rounded-2xl border-2 border-[#8fd3ff] bg-gradient-to-b from-[#4fb8ff] to-[#1565e0] font-display text-xl text-white shadow-[0_5px_0_#0b3c8c] transition active:translate-y-0.5 disabled:opacity-50"
            >
              {saving ? '저장 중...' : first ? '이 캐릭터로 시작!' : '저장하기'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
