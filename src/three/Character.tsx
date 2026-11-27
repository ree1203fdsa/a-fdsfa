import { RoundedBox } from '@react-three/drei'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Group } from 'three'

export interface CharacterLook {
  skin?: string
  shirt?: string
  pants?: string
  shoes?: string
  hair?: string
  cape?: string | null
  accent?: string
}

const DEFAULT: Required<CharacterLook> = {
  skin: '#ffd8b5', shirt: '#1c1c24', pants: '#14141b', shoes: '#0d0d12', hair: '#121218', cape: '#15151d', accent: '#ffc21a',
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
export function Character({
  look, rightHand, idle = true, ...props
}: { look?: CharacterLook; rightHand?: ReactNode; idle?: boolean } & ThreeElements['group']) {
  const c = { ...DEFAULT, ...look }
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const cape = useRef<Group>(null)
  const emblem = useMemo(() => crownTexture('#e8e8f0'), [])

  useFrame(({ clock }) => {
    if (!idle) return
    const t = clock.elapsedTime
    if (body.current) body.current.position.y = Math.sin(t * 1.8) * 0.015
    if (head.current) head.current.rotation.y = Math.sin(t * 0.45) * 0.15
    if (armL.current) armL.current.rotation.x = Math.sin(t * 1.8) * 0.04
    if (armR.current) armR.current.rotation.x = -0.55 + Math.sin(t * 1.8 + 0.6) * 0.04
    if (cape.current) cape.current.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.04
  })

  const mat = (color: string, rough = 0.7) => <meshStandardMaterial color={color} roughness={rough} />

  return (
    <group {...props}>
      {[-0.17, 0.17].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <RoundedBox args={[0.3, 0.72, 0.32]} radius={0.04} position={[0, 0.48, 0]} castShadow>{mat(c.pants)}</RoundedBox>
          <RoundedBox args={[0.32, 0.14, 0.38]} radius={0.04} position={[0, 0.07, 0.03]} castShadow>{mat(c.shoes, 0.5)}</RoundedBox>
        </group>
      ))}

      <group ref={body}>
        <RoundedBox args={[0.72, 0.78, 0.38]} radius={0.06} position={[0, 1.22, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
        <mesh position={[0, 0.86, 0]}>
          <boxGeometry args={[0.74, 0.08, 0.4]} />
          <meshStandardMaterial color="#2b2b36" roughness={0.4} metalness={0.3} />
        </mesh>

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

        <group ref={armL} position={[-0.5, 1.56, 0]}>
          <RoundedBox args={[0.26, 0.7, 0.3]} radius={0.04} position={[0, -0.32, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
          <RoundedBox args={[0.24, 0.18, 0.28]} radius={0.04} position={[0, -0.72, 0]} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
        </group>
        <group ref={armR} position={[0.5, 1.56, 0]} rotation={[-0.55, 0, 0]}>
          <RoundedBox args={[0.26, 0.7, 0.3]} radius={0.04} position={[0, -0.32, 0]} castShadow>{mat(c.shirt)}</RoundedBox>
          <group position={[0, -0.72, 0]}>
            <RoundedBox args={[0.24, 0.18, 0.28]} radius={0.04} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
            <group rotation={[Math.PI / 2 + 0.55, 0, -0.5]}>{rightHand}</group>
          </group>
        </group>

        {/* head */}
        <group ref={head} position={[0, 1.95, 0]}>
          <RoundedBox args={[0.56, 0.56, 0.52]} radius={0.12} castShadow>{mat(c.skin, 0.6)}</RoundedBox>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0.02, 0.265]}>
              <boxGeometry args={[0.07, 0.11, 0.01]} />
              <meshBasicMaterial color="#111" />
            </mesh>
          ))}
          <mesh position={[0, -0.12, 0.265]}>
            <boxGeometry args={[0.14, 0.03, 0.01]} />
            <meshBasicMaterial color="#5a2a2a" />
          </mesh>
          {/* spiky hair */}
          <RoundedBox args={[0.62, 0.22, 0.6]} radius={0.08} position={[0, 0.24, -0.02]}>{mat(c.hair, 0.9)}</RoundedBox>
          <RoundedBox args={[0.6, 0.42, 0.16]} radius={0.06} position={[0, 0.06, -0.24]}>{mat(c.hair, 0.9)}</RoundedBox>
          {[[-0.2, 0.36, 0.05, 0.4], [0, 0.4, -0.05, -0.2], [0.2, 0.36, 0.02, -0.5], [-0.08, 0.34, 0.2, 0.9], [0.14, 0.32, 0.22, 0.6], [0, 0.3, -0.28, 0]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[r * 0.6, 0, r]}>
              <coneGeometry args={[0.1, 0.24, 4]} />
              {mat(c.hair, 0.9)}
            </mesh>
          ))}
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
