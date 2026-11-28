import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'
import { WEAPON_INFO } from '@shared/constants'
import type { BattleEvent, BattleInit, BattlePlayerInfo } from '@shared/battle'
import { MAPS } from '@shared/maps'
import { sfx } from '@/lib/sound'
import { battleEvents, interpolatedPlayers, interpolatedProjectiles } from '@/stores/battle'
import { Character, lookFromItems, type Pose } from '@/three/Character'
import { MapView } from '@/three/battle/MapView'
import { buildWeapon } from '@/three/weaponMesh'
import type { CameraState } from './useBattleInput'

const TEAM_COLOR = { RED: '#ff3048', BLUE: '#1e90ff' } as const

function Fighter({ info, isMe }: { info: BattlePlayerInfo; isMe: boolean }) {
  const group = useRef<Group>(null)
  const hpBar = useRef<HTMLDivElement>(null)
  const pose = useRef<Pose>({ act: 'idle', at: 0, speed: 0, ranged: WEAPON_INFO[info.weapon.type].style !== 'melee' })
  const last = useRef(new Vector3())
  const weapon = useMemo(() => buildWeapon(info.weapon.strokes, info.weapon.paperId, info.weapon.type, info.weapon.params), [info])
  useEffect(() => () => weapon?.dispose(), [weapon])
  const look = useMemo(() => lookFromItems(info.look, TEAM_COLOR[info.team]), [info])

  useFrame((_, dt) => {
    const p = interpolatedPlayers().get(info.id)
    if (!p || !group.current) return
    group.current.position.set(p.x, p.y, p.z)
    group.current.rotation.y = p.yaw + Math.PI
    const speed = last.current.distanceTo(group.current.position) / Math.max(dt, 0.001)
    last.current.copy(group.current.position)
    pose.current.act = p.act
    pose.current.at = p.at
    pose.current.speed = speed
    if (hpBar.current) {
      hpBar.current.style.width = `${p.hp}%`
      hpBar.current.parentElement!.parentElement!.style.opacity = p.alive ? '1' : '0'
    }
  })

  const ranged = pose.current.ranged
  return (
    <group ref={group}>
      <Character look={look} poseRef={pose} rightHand={weapon && <primitive object={weapon.group} rotation={ranged ? [Math.PI, 0, 0] : [Math.PI / 2 + 0.55, 0, -0.5]} />} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.5, 0.62, 24]} />
        <meshBasicMaterial color={TEAM_COLOR[info.team]} transparent opacity={isMe ? 1 : 0.7} />
      </mesh>
      <Html position={[0, 2.75, 0]} center distanceFactor={9} zIndexRange={[10, 0]}>
        <div className="pointer-events-none w-24 select-none text-center">
          <p className="truncate text-xs font-bold text-white" style={{ textShadow: '0 1px 2px #000' }}>{info.staff && '🛡️'}{isMe ? '나' : info.name}</p>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/60">
            <div ref={hpBar} className="h-full rounded-full transition-[width]" style={{ width: '100%', background: TEAM_COLOR[info.team] }} />
          </div>
        </div>
      </Html>
    </group>
  )
}

const PROJ_COLORS = { bullet: '#ffe066', arrow: '#c99a5b', orb: '#b98cff', bomb: '#ff5fa2' } as const

function Projectiles() {
  const pool = useRef<Mesh[]>([])
  const root = useRef<Group>(null)
  const geo = useMemo(() => new SphereGeometry(1, 10, 10), [])
  useFrame(() => {
    const list = interpolatedProjectiles()
    while (pool.current.length < list.length && root.current) {
      const m = new Mesh(geo, new MeshBasicMaterial())
      root.current.add(m)
      pool.current.push(m)
    }
    pool.current.forEach((m, i) => {
      const p = list[i]
      m.visible = Boolean(p)
      if (!p) return
      m.position.set(p.x, p.y, p.z)
      m.scale.setScalar(p.kind === 'bomb' ? 0.3 : p.kind === 'orb' ? 0.22 : 0.11)
      ;(m.material as MeshBasicMaterial).color.set(PROJ_COLORS[p.kind])
    })
  })
  return <group ref={root} />
}

interface Fx { id: number; kind: 'hit' | 'ring' | 'text'; x: number; y: number; z: number; r: number; color: string; text?: string; born: number }

function Effects({ me }: { me: string }) {
  const fx = useRef<Fx[]>([])
  const root = useRef<Group>(null)
  const seq = useRef(0)
  const { clock } = useThree()

  useEffect(() => battleEvents.on((events: BattleEvent[]) => {
    const now = clock.elapsedTime
    for (const e of events) {
      if (e.e === 'hit') {
        fx.current.push({ id: ++seq.current, kind: 'hit', x: e.x, y: e.y, z: e.z, r: 0.4, color: e.blocked ? '#9fd2ff' : e.crit ? '#ffd23f' : '#ffffff', born: now })
        if (e.to === me || e.from === me) sfx.hit()
      } else if (e.e === 'special') {
        fx.current.push({ id: ++seq.current, kind: 'ring', x: e.x, y: 0.1, z: e.z, r: e.r, color: '#b98cff', born: now })
      } else if (e.e === 'swing' && e.who === me) sfx.swing()
      else if (e.e === 'shot' && e.who === me) sfx.shoot()
    }
    fx.current = fx.current.slice(-40)
  }), [clock, me])

  useFrame(() => {
    const g = root.current
    if (!g) return
    const now = clock.elapsedTime
    fx.current = fx.current.filter((f) => now - f.born < 0.6)
    while (g.children.length < fx.current.length) {
      const m = new Mesh(new SphereGeometry(1, 12, 8), new MeshBasicMaterial({ transparent: true }))
      g.add(m)
    }
    g.children.forEach((child, i) => {
      const m = child as Mesh
      const f = fx.current[i]
      m.visible = Boolean(f)
      if (!f) return
      const k = (now - f.born) / 0.6
      m.position.set(f.x, f.y, f.z)
      const s = f.kind === 'ring' ? f.r * (0.3 + k * 0.7) : f.r * (0.5 + k)
      m.scale.set(s, f.kind === 'ring' ? 0.05 : s, s)
      const mat = m.material as MeshBasicMaterial
      mat.color.set(f.color)
      mat.opacity = 1 - k
    })
  })
  return <group ref={root} />
}

function CameraRig({ cam, me }: { cam: React.RefObject<CameraState>; me: string }) {
  const { camera } = useThree()
  const target = useRef(new Vector3())
  useFrame(() => {
    const players = interpolatedPlayers()
    let p = players.get(me)
    // Spectate a living teammate (or anyone) after dying.
    if (p && !p.alive) p = [...players.values()].find((o) => o.alive && o.id !== me) ?? p
    if (!p || !cam.current) return
    const { yaw, pitch } = cam.current
    target.current.lerp(new Vector3(p.x, p.y + 1.6, p.z), 0.35)
    const dist = 5.2
    const desired = new Vector3(
      target.current.x + Math.sin(yaw) * dist * Math.cos(pitch),
      target.current.y + Math.sin(pitch) * dist + 0.6,
      target.current.z + Math.cos(yaw) * dist * Math.cos(pitch),
    )
    camera.position.lerp(desired, 0.5)
    camera.lookAt(target.current.x - Math.sin(yaw) * 2, target.current.y, target.current.z - Math.cos(yaw) * 2)
  })
  return null
}

export function BattleScene({ init, cam, quality }: { init: BattleInit; cam: React.RefObject<CameraState>; quality: 'low' | 'medium' | 'high' }) {
  const map = MAPS[init.mapId] ?? MAPS.arena
  return (
    <>
      <MapView map={map} quality={quality} />
      {init.players.map((p) => <Fighter key={p.id} info={p} isMe={p.id === init.you} />)}
      <Projectiles />
      <Effects me={init.you} />
      <CameraRig cam={cam} me={init.you} />
    </>
  )
}
