import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BattleEvent, BattleInit } from '@shared/battle'
import { WEAPON_INFO } from '@shared/constants'
import { MAPS } from '@shared/maps'
import { Button, Confirm, cx, Loading } from '@/components/ui'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'
import { battleEvents, useBattle } from '@/stores/battle'
import { BattleScene } from './BattleScene'
import { useBattleInput, type ControlState } from './useBattleInput'

const isTouch = () => window.matchMedia('(pointer: coarse)').matches

export default function BattlePage() {
  const nav = useNavigate()
  const init = useBattle((s) => s.init)
  const result = useBattle((s) => s.result)
  const [syncing, setSyncing] = useState(!init)

  // Recover the battle after a page refresh.
  useEffect(() => {
    if (init) return
    getSocket().emit('battle:sync', (i: BattleInit | null) => {
      if (i) useBattle.getState().setInit(i)
      setSyncing(false)
    })
  }, [init])

  useEffect(() => {
    if (result) nav('/battle/result', { replace: true })
  }, [result, nav])

  if (!init) {
    return syncing ? <div className="bg-arena h-[100dvh]"><Loading text="전투에 연결하는 중..." /></div> : (
      <div className="bg-arena flex h-[100dvh] flex-col items-center justify-center gap-4">
        <p className="font-display text-2xl">진행 중인 전투가 없어요</p>
        <Button onClick={() => nav('/play')}>플레이 화면으로</Button>
      </div>
    )
  }
  return <BattleView init={init} />
}

function BattleView({ init }: { init: BattleInit }) {
  const quality = useAuth((s) => s.user?.settings.quality ?? 'medium')
  const me = init.players.find((p) => p.id === init.you)!
  const wrap = useRef<HTMLDivElement>(null)
  const getCanvas = useCallback(() => wrap.current?.querySelector('canvas') ?? null, [])
  const { cam, ctl } = useBattleInput(true, me.team === 'RED' ? 0 : Math.PI, getCanvas)
  const touch = isTouch()

  useEffect(() => {
    getSocket().emit('battle:ready')
  }, [])

  return (
    <div ref={wrap} className="fixed inset-0 select-none overflow-hidden bg-black" style={{ touchAction: 'none' }}>
      <Canvas shadows={quality !== 'low'} dpr={quality === 'low' ? [0.6, 1] : quality === 'high' ? [1, 2] : [1, 1.4]} camera={{ fov: 62, position: [0, 4, 8] }}>
        <BattleScene init={init} cam={cam} quality={quality} />
      </Canvas>
      <Hud init={init} />
      {touch ? <TouchControls ctl={ctl} cam={cam} /> : <PcHint />}
      <PortraitWarning />
    </div>
  )
}

function Hud({ init }: { init: BattleInit }) {
  const snap = useBattle((s) => s.latest)
  const countdown = useBattle((s) => s.countdown)
  const [feed, setFeed] = useState<{ id: number; text: string }[]>([])
  const [hurt, setHurt] = useState(0)
  const [leave, setLeave] = useState(false)
  const seq = useRef(0)
  const name = (id: string) => (id === init.you ? '나' : init.players.find((p) => p.id === id)?.name ?? '?')

  useEffect(() => battleEvents.on((events: BattleEvent[]) => {
    for (const e of events) {
      if (e.e === 'kill') {
        const id = ++seq.current
        setFeed((f) => [...f.slice(-3), { id, text: `${name(e.from)} ⚔️ ${name(e.to)}` }])
        setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4000)
      }
      if (e.e === 'hit' && e.to === init.you) setHurt(Date.now())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [init])

  const meSnap = snap?.players.find((p) => p.id === init.you)
  const myInfo = init.players.find((p) => p.id === init.you)!
  const mm = Math.floor((snap?.remaining ?? init.durationSec) / 60)
  const ss = String((snap?.remaining ?? init.durationSec) % 60).padStart(2, '0')
  const ranged = WEAPON_INFO[myInfo.weapon.type].style !== 'melee'

  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      {Date.now() - hurt < 250 && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(255,0,40,0.45))]" />}
      {/* top: time + score */}
      <div className="absolute inset-x-0 top-2 flex justify-center">
        <div className="flex items-center gap-3 rounded-2xl bg-black/50 px-4 py-1.5 backdrop-blur">
          <span className="font-num text-2xl font-bold text-red">{snap?.score.RED ?? 0}</span>
          <span className="font-num text-2xl font-bold">{mm}:{ss}</span>
          <span className="font-num text-2xl font-bold text-blue">{snap?.score.BLUE ?? 0}</span>
        </div>
      </div>
      {/* left: team list */}
      <div className="absolute left-2 top-14 space-y-1.5">
        {init.players.map((p) => {
          const s = snap?.players.find((x) => x.id === p.id)
          return (
            <div key={p.id} className={cx('w-36 rounded-lg bg-black/45 px-2 py-1 backdrop-blur', s && !s.alive && 'opacity-40')}>
              <p className="flex items-center gap-1 truncate text-xs font-bold">
                <span className={cx('size-2 rounded-full', p.team === 'RED' ? 'bg-red' : 'bg-blue')} />
                {p.id === init.you ? '나' : p.name}
              </p>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className={cx('h-full', p.team === 'RED' ? 'bg-red' : 'bg-blue')} style={{ width: `${s?.hp ?? 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      {/* kill feed */}
      <div className="absolute right-2 top-14 space-y-1 text-right">
        {feed.map((f) => <p key={f.id} className="rounded-lg bg-black/50 px-2 py-1 text-sm font-bold">{f.text}</p>)}
      </div>
      {/* crosshair */}
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 text-xl font-bold opacity-80">+</div>
      {/* bottom: my status */}
      <div className="absolute bottom-3 left-1/2 w-[min(26rem,60vw)] -translate-x-1/2 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span>{WEAPON_INFO[myInfo.weapon.type].emoji} {myInfo.weapon.name}</span>
          {ranged && meSnap && meSnap.mag > 0 && <span className="font-num">{meSnap.reload > 0 ? `재장전 ${meSnap.reload.toFixed(1)}s` : `${meSnap.ammo}/${meSnap.mag}`}</span>}
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full bg-gradient-to-r from-[#ff6b7c] to-ok transition-[width]" style={{ width: `${meSnap?.hp ?? 100}%` }} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/60">
          <div className={cx('h-full rounded-full', (meSnap?.sp ?? 0) >= 100 ? 'animate-pulse bg-accent-2' : 'bg-violet')} style={{ width: `${meSnap?.sp ?? 0}%` }} />
        </div>
        <p className="text-center text-[11px] text-white/80">
          {(meSnap?.sp ?? 0) >= 100 ? `✨ ${WEAPON_INFO[myInfo.weapon.type].specialName} 준비 완료! (Q)` : `특수 기술 ${meSnap?.sp ?? 0}%`}
        </p>
      </div>
      {myInfo.staff && <div className="absolute left-1/2 top-12 -translate-x-1/2 rounded-lg bg-red/80 px-3 py-1 text-xs font-bold">🛡️ 관리자 시험 모드 · 무적 · 특수 기술 무한 · 보상·기록 없음</div>}
      {meSnap && !meSnap.alive && (
        <div className="absolute inset-x-0 top-1/3 text-center">
          <p className="text-outline font-display text-4xl">쓰러졌어요!</p>
          <p className="text-sm">팀원을 관전하는 중이에요</p>
        </div>
      )}
      {!snap && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div className="text-center">
            <p className="text-outline font-display text-5xl">{countdown ? '준비!' : '불러오는 중...'}</p>
            <p className="mt-2">{MAPS[init.mapId]?.emoji} {MAPS[init.mapId]?.name} · {init.mode === 'AI' ? `AI 대전` : '친구 대전'}</p>
          </div>
        </div>
      )}
      <button className="pointer-events-auto absolute right-2 top-2 rounded-xl bg-black/50 px-3 py-1.5 text-sm font-bold" onClick={() => setLeave(true)}>나가기</button>
      <Confirm
        open={leave} danger title="전투에서 나갈까요?" confirmText="나가기"
        message="지금 나가면 패배로 처리되고 보상을 받을 수 없어요."
        onCancel={() => setLeave(false)}
        onConfirm={() => {
          getSocket().emit('battle:leave')
          setLeave(false)
        }}
      />
    </div>
  )
}

function PcHint() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 9000)
    return () => clearTimeout(t)
  }, [])
  if (!show) return null
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-xl bg-black/55 px-4 py-2 text-center text-xs text-white">
      화면을 클릭하면 마우스로 시점 조작 · WASD 이동 · 클릭 공격(꾹 누르면 강공격) · 우클릭 방어/조준 · Space 점프 · Shift 달리기 · Q 특수 · E 회피 · Esc 마우스 풀기
    </div>
  )
}

function TouchControls({ ctl, cam }: { ctl: React.RefObject<ControlState>; cam: React.RefObject<{ yaw: number; pitch: number }> }) {
  const settings = useAuth((s) => s.user?.settings)
  const scale = settings?.mobileButtonScale ?? 1
  const left = settings?.mobileLayout === 'left'
  const stickBase = useRef<{ id: number; x: number; y: number } | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const sens = (settings?.sensitivity ?? 1) * 0.006

  const hold = (key: keyof ControlState['touch'], label: string, size = 56) => (
    <button
      className="pointer-events-auto grid place-items-center rounded-full border-2 border-white/50 bg-white/20 text-xs font-bold text-white active:bg-white/40"
      style={{ width: size * scale, height: size * scale }}
      onPointerDown={(e) => { e.stopPropagation(); ctl.current!.touch[key] = true }}
      onPointerUp={() => { ctl.current!.touch[key] = false }}
      onPointerCancel={() => { ctl.current!.touch[key] = false }}
      onPointerLeave={() => { ctl.current!.touch[key] = false }}
    >
      {label}
    </button>
  )

  return (
    <div className="absolute inset-0">
      {/* camera drag area */}
      <div
        className="absolute inset-0"
        onPointerDown={(e) => { look.current = { id: e.pointerId, x: e.clientX, y: e.clientY } }}
        onPointerMove={(e) => {
          const l = look.current
          if (!l || l.id !== e.pointerId) return
          cam.current!.yaw -= (e.clientX - l.x) * sens
          cam.current!.pitch = Math.max(-0.35, Math.min(0.9, cam.current!.pitch + (e.clientY - l.y) * sens))
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => { look.current = null }}
      />
      {/* joystick */}
      <div
        className={cx('absolute bottom-6 grid place-items-center rounded-full border-2 border-white/30 bg-white/10', left ? 'right-6' : 'left-6')}
        style={{ width: 130 * scale, height: 130 * scale }}
        onPointerDown={(e) => {
          e.stopPropagation()
          ;(e.target as Element).setPointerCapture(e.pointerId)
          const r = e.currentTarget.getBoundingClientRect()
          stickBase.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }}
        onPointerMove={(e) => {
          const b = stickBase.current
          if (!b || b.id !== e.pointerId) return
          const max = 50 * scale
          let dx = e.clientX - b.x, dy = e.clientY - b.y
          const d = Math.hypot(dx, dy)
          if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max }
          setKnob({ x: dx, y: dy })
          ctl.current!.stick = { x: dx / max, y: dy / max }
          ctl.current!.touch.run = d > max * 0.95
        }}
        onPointerUp={() => {
          stickBase.current = null
          setKnob({ x: 0, y: 0 })
          ctl.current!.stick = { x: 0, y: 0 }
          ctl.current!.touch.run = false
        }}
      >
        <span className="rounded-full bg-white/60" style={{ width: 50 * scale, height: 50 * scale, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      {/* buttons */}
      <div className={cx('absolute bottom-6 grid grid-cols-3 items-end gap-2', left ? 'left-6' : 'right-6')}>
        {hold('special', '특수')}{hold('jump', '점프')}{hold('dodge', '회피')}
        {hold('block', '방어')}{hold('attack', '공격', 80)}<span />
      </div>
    </div>
  )
}

function PortraitWarning() {
  const [portrait, setPortrait] = useState(false)
  useEffect(() => {
    const check = () => setPortrait(isTouch() && window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  if (!portrait) return null
  return (
    <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-black/70 p-4 text-center text-white">
      <p className="text-4xl">📱↻</p>
      <p className="font-display text-xl">휴대폰을 가로로 돌려 주세요</p>
      <p className="text-sm text-white/80">전투는 가로 화면에서 더 편해요</p>
    </div>
  )
}
