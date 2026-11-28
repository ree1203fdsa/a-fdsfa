import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group } from 'three'
import type { Avatar } from '@shared/avatar'

export interface CharacterLook {
  skin?: string
  shirt?: string
  pants?: string
  shoes?: string
  hair?: string
  cape?: string | null
  accent?: string
  hairStyle?: string
  eyes?: string
  mouth?: string
  build?: string
  emblem?: string
}

const DEFAULT: Required<CharacterLook> = {
  skin: '#ffd8b5', shirt: '#1c1c24', pants: '#14141b', shoes: '#0d0d12', hair: '#121218', cape: '#15151d', accent: '#ffc21a',
  hairStyle: 'spiky', eyes: 'normal', mouth: 'smile', build: 'normal', emblem: '',
}

/** Base look from 캐릭터 만들기, with bought cosmetics layered on top. */
export function lookFromAvatar(avatar: Partial<Avatar> | undefined, items: EquippedLook[] = [], accent?: string): CharacterLook {
  const a = avatar ?? {}
  const base: CharacterLook = {
    skin: a.skin, hair: a.hairColor, shirt: a.shirt, pants: a.pants, shoes: a.shoes,
    hairStyle: a.hairStyle, eyes: a.eyes, mouth: a.mouth, build: a.build, emblem: a.emblem,
  }
  const over = lookFromItems(items, accent)
  const merged: CharacterLook = { ...base }
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (merged as Record<string, unknown>)[k] = v
  return merged
}

export interface EquippedLook {
  slot: string | null
  effect: Record<string, unknown>
}

/** Turns equipped cosmetic items into colours for the blocky character. */
export function lookFromItems(items: EquippedLook[], accent?: string): CharacterLook {
  const look: CharacterLook = { accent }
  const col = (e: Record<string, unknown>) => {
    const c = e.color
    return typeof c === 'string' ? (c === 'rainbow' ? '#ff5fa2' : c) : undefined
  }
  for (const it of items) {
    switch (it.slot) {
      case 'color': look.skin = col(it.effect) ?? look.skin; break
      case 'top': look.shirt = col(it.effect); break
      case 'bottom': look.pants = col(it.effect); break
      case 'shoes': look.shoes = col(it.effect); break
      case 'hair': look.hair = col(it.effect); break
      case 'back': if (it.effect.shape === 'cape') look.cape = col(it.effect); break
    }
  }
  return look
}

function crownTexture(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.beginPath()
  g.moveTo(24, 92); g.lineTo(18, 40); g.lineTo(44, 62); g.lineTo(64, 28); g.lineTo(84, 62); g.lineTo(110, 40); g.lineTo(104, 92)
  g.closePath()
  g.fill()
  g.fillRect(24, 96, 80, 10)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/**
 * Blocky hero. Faces +Z. `rightHand` children sit in the right fist, +Y along the held item.
 */
/** Live animation input for battle characters, read every frame (no React re-renders). */
export interface Pose {
  act: string
  at: number
  speed: number
  ranged: boolean
}

export function Character({
  look, rightHand, idle = true, poseRef, chestEmblem, armRaise = 0.55, ...props
}: { look?: CharacterLook; rightHand?: ReactNode; idle?: boolean; poseRef?: { current: Pose }; chestEmblem?: string; armRaise?: number } & ThreeElements['group']) {
  const c = { ...DEFAULT, ...look }
  const root = useRef<Group>(null)
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const cape = useRef<Group>(null)
  const emblem = useMemo(() => crownTexture('#e8e8f0'), [])
  const chest = useMemo(() => {
    const col = chestEmblem ?? look?.emblem
    return col ? crownTexture(col) : null
  }, [chestEmblem, look?.emblem])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pose = poseRef?.current
    if (!pose) {
      if (!idle) return
      if (body.current) body.current.position.y = Math.sin(t * 1.8) * 0.015
      if (head.current) head.current.rotation.y = Math.sin(t * 0.45) * 0.15
      if (armL.current) armL.current.rotation.x = Math.sin(t * 1.8) * 0.04
      if (armR.current) armR.current.rotation.x = -armRaise + Math.sin(t * 1.8 + 0.6) * 0.04
      if (cape.current) cape.current.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.04
      return
    }
    // Battle animation driven by the server's action state.
    const moving = Math.min(1, pose.speed / 4)
    const stride = Math.sin(t * (pose.act === 'run' ? 14 : 10)) * 0.7 * moving
    if (legL.current) legL.current.rotation.x = stride
    if (legR.current) legR.current.rotation.x = -stride
    if (armL.current) armL.current.rotation.x = -stride * 0.6
    if (cape.current) cape.current.rotation.x = 0.12 + moving * 0.5 + Math.sin(t * 6) * 0.05
    let arm = pose.ranged ? -1.4 : -0.55 + stride * 0.3
    let armZ = 0
    const a = pose.at
    if (pose.act === 'attack' || pose.act === 'strong') {
      const dur = pose.act === 'strong' ? 0.4 : 0.28
      const k = Math.min(1, a / dur)
      arm = pose.ranged ? -1.4 - Math.sin(k * Math.PI) * 0.25 : -2.8 + k * 3.3
      armZ = pose.ranged ? 0 : Math.sin(k * Math.PI) * -0.6
    } else if (pose.act === 'special') {
      const k = Math.min(1, a / 0.5)
      arm = -3 + k * 3.2
      armZ = -0.8 * Math.sin(k * Math.PI)
    } else if (pose.act === 'block') {
      arm = pose.ranged ? -1.5 : -1.3
      armZ = pose.ranged ? 0 : 0.5
    }
    if (armR.current) {
      armR.current.rotation.x += (arm - armR.current.rotation.x) * 0.45
      armR.current.rotation.z = armZ
    }
    if (root.current) {
      const dead = pose.act === 'dead'
      const spin = pose.act === 'special' && !pose.ranged ? Math.min(1, a / 0.5) * Math.PI * 2 : 0
      root.current.rotation.x += ((dead ? -Math.PI / 2 : pose.act === 'dodge' ? -0.5 : 0) - root.current.rotation.x) * 0.25
      root.current.rotation.y = spin
      root.current.position.y = dead ? 0.25 : 0
    }
    if (body.current) body.current.position.y = pose.act === 'stun' ? Math.sin(t * 20) * 0.03 : 0
  })

  const mat = (color: string, rough = 0.7) => <meshStandardMaterial color={color} roughness={rough} />
  const bw = c.build === 'slim' ? 0.86 : c.build === 'strong' ? 1.18 : 1
  const emblemColor = chestEmblem ?? (c.emblem || undefined)

  return (
    <group {...props}>
     <group ref={root}>
      {[-0.17, 0.17].map((x) => (
        <group key={x} ref={x < 0 ? legL : legR} position={[x * bw, 0.84, 0]}>
          <RoundedBox args={[0.3 * (bw > 1 ? 1.08 : bw < 1 ? 0.92 : 1), 0.72, 0.32]} radius={0.04} position={[0, -0.36, 0]} castShadow>{mat(c.pants)}</RoundedBox>
          <RoundedBox args={[0.32, 0.14, 0.38]} radius={0.04} position={[0, -0.77, 0.03]} castShadow>{mat(c.shoes, 0.5)}</RoundedBox>
        </group>
      ))}

      <group ref={body}>
        <RoundedBox args={[0.72 * bw, 0.78, 0.38]} radius={0.06} position={[0, 1.22, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[0.74 * bw, 0.08, 0.4]} />
          <meshStandardMaterial color="#2b2b36" roughness={0.4} metalness={0.3} />
        </mesh>

        {chest && (
          <mesh position={[0, 1.3, 0.195]}>
            <planeGeometry args={[0.36, 0.36]} />
            <meshStandardMaterial map={chest} transparent roughness={0.5} emissive={emblemColor} emissiveIntensity={0.25} />
          </mesh>
        )}

        {/* cape with crown emblem */}
        {c.cape && (
          <group ref={cape} position={[0, 1.58, -0.2]} rotation={[0.12, 0, 0]}>
            <mesh position={[0, -0.62, 0]} castShadow>
              <planeGeometry args={[0.9, 1.25, 1, 4]} />
              <meshStandardMaterial color={c.cape} roughness={0.85} side={DoubleSide} />
            </mesh>
            <mesh position={[0, -0.45, -0.005]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.38, 0.38]} />
              <meshStandardMaterial map={emblem} transparent roughness={0.6} />
            </mesh>
          </group>
        )}

        <group ref={armL} position={[-0.5 * bw, 1.56, 0]}>
          <RoundedBox args={[0.26, 0.7, 0.3]} radius={0.04} position={[0, -0.32, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
          <RoundedBox args={[0.24, 0.18, 0.28]} radius={0.04} position={[0, -0.72, 0]} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
        </group>
        <group ref={armR} position={[0.5 * bw, 1.56, 0]} rotation={[-0.55, 0, 0]}>
          <RoundedBox args={[0.26, 0.7, 0.3]} radius={0.04} position={[0, -0.32, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
          <group position={[0, -0.72, 0]}>
            <RoundedBox args={[0.24, 0.18, 0.28]} radius={0.04} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
            <group rotation={[Math.PI / 2 + 0.55, 0, -0.5]}>{rightHand}</group>
          </group>
        </group>

        {/* head */}
        <group ref={head} position={[0, 1.95, 0]}>
          <RoundedBox args={[0.56, 0.56, 0.52]} radius={0.12} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
          <Face eyes={c.eyes} mouth={c.mouth} />
          <Hair style={c.hairStyle} color={c.hair} />
        </group>
      </group>
     </group>
    </group>
  )
}

/** Default glowing pixel sword shown until the player equips a drawn weapon. */
export function GlowSword({ color = '#4fb8ff', glow = '#a45bff' }: { color?: string; glow?: string }) {
  const blade = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (blade.current) blade.current.children.forEach((m, i) => {
      const mm = (m as unknown as { material?: { emissiveIntensity: number } }).material
      if (mm) mm.emissiveIntensity = 1.2 + Math.sin(clock.elapsedTime * 3 + i) * 0.4
    })
  })
  return (
    <group>
      <mesh position={[0, -0.12, 0]}>
        <boxGeometry args={[0.09, 0.32, 0.09]} />
        <meshStandardMaterial color="#2a1a40" />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.42, 0.08, 0.12]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.8} />
      </mesh>
      <group ref={blade}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0, 0.2 + i * 0.16, 0]}>
            <boxGeometry args={[0.2 - i * 0.012, 0.16, 0.05]} />
            <meshStandardMaterial color={color} emissive={i % 2 ? color : glow} emissiveIntensity={1.4} roughness={0.2} />
          </mesh>
        ))}
        <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.1, 0.1, 0.05]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
        </mesh>
      </group>
      <pointLight position={[0, 0.9, 0.2]} color={glow} intensity={3} distance={2.5} />
    </group>
  )
}

// ───────────────────────── face & hair ─────────────────────────

const Z = 0.265
function Bit({ x, y, w, h, color = '#111', rot = 0, z = Z }: { x: number; y: number; w: number; h: number; color?: string; rot?: number; z?: number }) {
  return (
    <mesh position={[x, y, z]} rotation={[0, 0, rot]}>
      <boxGeometry args={[w, h, 0.01]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function Eye({ kind, x }: { kind: string; x: number }) {
  const side = Math.sign(x)
  switch (kind) {
    case 'happy':
      return <><Bit x={x - 0.025} y={0.03} w={0.06} h={0.025} rot={0.6} /><Bit x={x + 0.025} y={0.03} w={0.06} h={0.025} rot={-0.6} /></>
    case 'angry':
      return <><Bit x={x} y={0.01} w={0.07} h={0.09} /><Bit x={x} y={0.1} w={0.12} h={0.03} rot={side * 0.45} /></>
    case 'cool':
      return <><Bit x={x} y={0.02} w={0.12} h={0.035} /><Bit x={x} y={0.09} w={0.11} h={0.025} rot={side * -0.1} /></>
    case 'big':
      return (
        <>
          <Bit x={x} y={0.02} w={0.13} h={0.15} color="#ffffff" />
          <Bit x={x - side * 0.015} y={0.01} w={0.075} h={0.1} z={Z + 0.002} />
          <Bit x={x - side * 0.03} y={0.045} w={0.025} h={0.025} color="#ffffff" z={Z + 0.004} />
        </>
      )
    default:
      return <Bit x={x} y={0.02} w={0.07} h={0.11} />
  }
}

function Mouth({ kind }: { kind: string }) {
  switch (kind) {
    case 'grin':
      return <><Bit x={0} y={-0.13} w={0.2} h={0.085} color="#3a1414" /><Bit x={0} y={-0.115} w={0.17} h={0.035} color="#ffffff" z={Z + 0.002} /></>
    case 'flat':
      return <Bit x={0} y={-0.13} w={0.12} h={0.025} color="#5a2a2a" />
    case 'open':
      return <><Bit x={0} y={-0.14} w={0.11} h={0.11} color="#3a1414" /><Bit x={0} y={-0.17} w={0.08} h={0.04} color="#ff6b7c" z={Z + 0.002} /></>
    case 'smirk':
      return <><Bit x={0.01} y={-0.13} w={0.12} h={0.03} color="#5a2a2a" /><Bit x={0.075} y={-0.11} w={0.035} h={0.03} color="#5a2a2a" rot={0.6} /></>
    default:
      return <><Bit x={0} y={-0.14} w={0.1} h={0.03} color="#5a2a2a" /><Bit x={-0.06} y={-0.12} w={0.03} h={0.03} color="#5a2a2a" /><Bit x={0.06} y={-0.12} w={0.03} h={0.03} color="#5a2a2a" /></>
  }
}

function Face({ eyes, mouth }: { eyes: string; mouth: string }) {
  return (
    <group>
      <Eye kind={eyes === 'wink' ? 'normal' : eyes} x={-0.12} />
      <Eye kind={eyes === 'wink' ? 'happy' : eyes} x={0.12} />
      <Mouth kind={mouth} />
    </group>
  )
}

const SPIKES: [number, number, number, number][] = [[-0.2, 0.36, 0.05, 0.4], [0, 0.4, -0.05, -0.2], [0.2, 0.36, 0.02, -0.5], [-0.08, 0.34, 0.2, 0.9], [0.14, 0.32, 0.22, 0.6], [0, 0.3, -0.28, 0]]
const CURLS: [number, number, number][] = [[-0.2, 0.34, 0.12], [0, 0.38, 0.14], [0.2, 0.34, 0.12], [-0.22, 0.36, -0.1], [0.02, 0.4, -0.08], [0.22, 0.36, -0.1], [-0.28, 0.18, 0.15], [0.28, 0.18, 0.15], [0, 0.3, -0.28]]

function Hair({ style, color }: { style: string; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.9} />
  const cap = (h = 0.22, y = 0.24) => <RoundedBox args={[0.62, h, 0.6]} radius={0.08} position={[0, y, -0.02]}>{mat}</RoundedBox>
  const back = (h = 0.42, y = 0.06) => <RoundedBox args={[0.6, h, 0.16]} radius={0.06} position={[0, y, -0.24]}>{mat}</RoundedBox>
  const fringe = <RoundedBox args={[0.6, 0.1, 0.1]} radius={0.04} position={[0, 0.2, 0.25]}>{mat}</RoundedBox>
  switch (style) {
    case 'short':
      return <>{cap()}{back(0.36, 0.09)}{fringe}</>
    case 'long':
      return (
        <>
          {cap()}{fringe}
          <RoundedBox args={[0.64, 0.82, 0.18]} radius={0.07} position={[0, -0.1, -0.24]}>{mat}</RoundedBox>
          {[-0.31, 0.31].map((x) => <RoundedBox key={x} args={[0.08, 0.62, 0.42]} radius={0.03} position={[x, -0.04, -0.04]}>{mat}</RoundedBox>)}
        </>
      )
    case 'ponytail':
      return (
        <>
          {cap()}{back(0.36, 0.09)}{fringe}
          <mesh position={[0, 0.12, -0.34]}><boxGeometry args={[0.12, 0.08, 0.08]} /><meshStandardMaterial color="#ff3b4e" /></mesh>
          <RoundedBox args={[0.16, 0.48, 0.16]} radius={0.06} position={[0, -0.12, -0.4]} rotation={[0.35, 0, 0]}>{mat}</RoundedBox>
        </>
      )
    case 'mohawk':
      return (
        <>
          <RoundedBox args={[0.58, 0.06, 0.56]} radius={0.02} position={[0, 0.28, -0.01]}>{mat}</RoundedBox>
          {[0.2, 0.05, -0.1, -0.25].map((z, i) => (
            <mesh key={z} position={[0, 0.42 + (i === 1 ? 0.04 : 0), z]} rotation={[-0.2 + i * 0.12, 0, 0]}><coneGeometry args={[0.09, 0.3, 4]} />{mat}</mesh>
          ))}
        </>
      )
    case 'curly':
      return (
        <>
          {cap(0.16, 0.24)}{back(0.34, 0.1)}
          {CURLS.map(([x, y, z], i) => <mesh key={i} position={[x, y, z]}><sphereGeometry args={[0.13, 10, 8]} />{mat}</mesh>)}
        </>
      )
    case 'buzz':
      return <><RoundedBox args={[0.585, 0.1, 0.565]} radius={0.04} position={[0, 0.25, -0.005]}>{mat}</RoundedBox>{back(0.26, 0.12)}</>
    default: // spiky
      return (
        <>
          {cap()}{back()}
          {SPIKES.map(([x, y, z, r], i) => <mesh key={i} position={[x, y, z]} rotation={[r * 0.6, 0, r]}><coneGeometry args={[0.1, 0.24, 4]} />{mat}</mesh>)}
        </>
      )
  }
}
