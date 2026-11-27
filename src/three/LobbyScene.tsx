import { Canvas, useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { BackSide, CanvasTexture, Color, DoubleSide, RepeatWrapping, SRGBColorSpace, type Mesh } from 'three'
import { Character, GlowSword } from './Character'

function makeCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

function crown(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color
  g.beginPath()
  g.moveTo(cx - s, cy + s * 0.5); g.lineTo(cx - s * 1.1, cy - s * 0.6); g.lineTo(cx - s * 0.45, cy - s * 0.05)
  g.lineTo(cx, cy - s * 0.85); g.lineTo(cx + s * 0.45, cy - s * 0.05); g.lineTo(cx + s * 1.1, cy - s * 0.6); g.lineTo(cx + s, cy + s * 0.5)
  g.closePath()
  g.fill()
  g.fillRect(cx - s, cy + s * 0.6, s * 2, s * 0.22)
}

function bannerTexture(color: string, dark: string) {
  return makeCanvas(128, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 128, 0)
    grad.addColorStop(0, dark)
    grad.addColorStop(0.5, color)
    grad.addColorStop(1, dark)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 220); g.lineTo(64, 256); g.lineTo(0, 220)
    g.closePath()
    g.fill()
    g.strokeStyle = '#ffd34d'
    g.lineWidth = 6
    g.strokeRect(10, 8, 108, 6)
    crown(g, 64, 120, 30, '#ffffff')
  })
}

function stoneTexture() {
  const t = makeCanvas(256, 256, (g) => {
    g.fillStyle = '#4a5286'
    g.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const off = y % 2 ? 32 : 0
        const shade = 70 + ((x * 37 + y * 53) % 30)
        g.fillStyle = `rgb(${shade - 10},${shade - 2},${shade + 50})`
        g.fillRect(x * 64 + off + 2, y * 32 + 2, 60, 28)
      }
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

function floorTexture() {
  const t = makeCanvas(256, 256, (g) => {
    g.fillStyle = '#5d6699'
    g.fillRect(0, 0, 256, 256)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const s = 88 + ((x * 29 + y * 41) % 22)
      g.fillStyle = `rgb(${s - 6},${s + 4},${s + 52})`
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60)
    }
  })
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(10, 10)
  return t
}

function Sky() {
  const uniforms = useMemo(() => ({ top: { value: new Color('#3b2fb8') }, mid: { value: new Color('#4f7cff') }, bottom: { value: new Color('#b9d4ff') } }), [])
  return (
    <mesh scale={80}>
      <sphereGeometry args={[1, 32, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'}
        fragmentShader={'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bottom, mid, smoothstep(-0.1, 0.15, h)); gl_FragColor = vec4(c,1.0); }'}
      />
    </mesh>
  )
}

function Clouds() {
  const tex = useMemo(() => makeCanvas(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62)
    r.addColorStop(0, 'rgba(255,255,255,0.95)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
  }), [])
  const puffs = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2
    return { pos: [Math.cos(a) * 40, 10 + (i % 4) * 3, Math.sin(a) * 40 - 10] as [number, number, number], s: 10 + (i % 5) * 3 }
  }), [])
  return (
    <>
      {puffs.map((p, i) => (
        <sprite key={i} position={p.pos} scale={[p.s * 1.8, p.s, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.85} depthWrite={false} />
        </sprite>
      ))}
    </>
  )
}

function Battlements({ y, length, depth = 1 }: { y: number; length: number; depth?: number }) {
  const n = Math.floor(length / 0.9)
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} position={[-length / 2 + 0.45 + i * 0.9, y, 0]} castShadow>
          <boxGeometry args={[0.5, 0.6, depth]} />
          <meshStandardMaterial color="#565f97" roughness={0.9} />
        </mesh>
      ))}
    </>
  )
}

function Castle() {
  const stone = useMemo(stoneTexture, [])
  const red = useMemo(() => bannerTexture('#ff3048', '#a0102a'), [])
  const blue = useMemo(() => bannerTexture('#1e90ff', '#0a3f9a'), [])
  const gold = '#ffc21a'
  const R = 15
  const segments = 14
  return (
    <group>
      {Array.from({ length: segments }, (_, i) => {
        const a0 = Math.PI * 0.08 + (i / segments) * Math.PI * 1.84 - Math.PI / 2 - Math.PI * 0.42
        const a = a0 + Math.PI
        const x = Math.cos(a) * R
        const z = Math.sin(a) * R
        const len = (2 * Math.PI * R) / segments * 0.92
        const isTower = i % 3 === 0
        const left = x < 0
        return (
          <group key={i} position={[x, 0, z]} rotation={[0, -a - Math.PI / 2, 0]}>
            <mesh position={[0, 2.6, 0]} castShadow receiveShadow>
              <boxGeometry args={[len, 5.2, 1.4]} />
              <meshStandardMaterial map={stone} color="#c8d0ff" roughness={0.95} />
            </mesh>
            <group position={[0, 5.5, 0]}><Battlements y={0} length={len} depth={1.4} /></group>
            {isTower && (
              <group position={[0, 0, 0.3]}>
                <mesh position={[0, 4.2, 0]} castShadow>
                  <cylinderGeometry args={[1.5, 1.7, 8.4, 12]} />
                  <meshStandardMaterial map={stone} color="#bcc5ff" roughness={0.95} />
                </mesh>
                {Array.from({ length: 8 }, (_, k) => (
                  <mesh key={k} position={[Math.cos((k / 8) * Math.PI * 2) * 1.4, 8.7, Math.sin((k / 8) * Math.PI * 2) * 1.4]}>
                    <boxGeometry args={[0.45, 0.6, 0.45]} />
                    <meshStandardMaterial color="#565f97" />
                  </mesh>
                ))}
              </group>
            )}
            {!isTower && (
              <mesh position={[0, 3.2, 0.72]}>
                <planeGeometry args={[1.5, 3]} />
                <meshStandardMaterial map={left ? red : blue} transparent side={DoubleSide} roughness={0.8} emissive={left ? '#ff3048' : '#1e90ff'} emissiveIntensity={0.15} />
              </mesh>
            )}
            {!isTower && (
              <pointLight position={[0, 2, 1.5]} color={left ? '#ff6a3d' : '#5cc8ff'} intensity={4} distance={5} />
            )}
          </group>
        )
      })}

      {/* main gate with golden crown */}
      <group position={[0, 0, -R - 0.5]}>
        <mesh position={[0, 4, 0]} castShadow>
          <boxGeometry args={[7, 8, 3]} />
          <meshStandardMaterial map={stone} color="#c3cbff" roughness={0.95} />
        </mesh>
        <mesh position={[0, 2, 1.52]}>
          <planeGeometry args={[2.6, 4]} />
          <meshStandardMaterial color="#141633" emissive="#3b1e7a" emissiveIntensity={0.6} />
        </mesh>
        <group position={[0, 8.3, 0]}><Battlements y={0} length={7} depth={3} /></group>
        <group position={[0, 9.8, 0]}>
          <mesh>
            <cylinderGeometry args={[0.9, 0.9, 0.5, 16, 1, true]} />
            <meshStandardMaterial color={gold} metalness={0.8} roughness={0.25} emissive={gold} emissiveIntensity={0.25} side={DoubleSide} />
          </mesh>
          {Array.from({ length: 5 }, (_, k) => (
            <mesh key={k} position={[Math.cos((k / 5) * Math.PI * 2) * 0.85, 0.5, Math.sin((k / 5) * Math.PI * 2) * 0.85]}>
              <coneGeometry args={[0.2, 0.6, 4]} />
              <meshStandardMaterial color={gold} metalness={0.8} roughness={0.25} emissive={gold} emissiveIntensity={0.25} />
            </mesh>
          ))}
          <pointLight color={gold} intensity={10} distance={8} />
        </group>
      </group>
    </group>
  )
}

function Floor() {
  const tex = useMemo(floorTexture, [])
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.3
  })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.05, 1.18, 48, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color="#9b5cff" transparent opacity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.35, 1.4, 64]} />
        <meshBasicMaterial color="#47b4ff" transparent opacity={0.7} />
      </mesh>
      {/* red and blue paint splats */}
      <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[-6, 0.008, -5]}>
        <circleGeometry args={[2.4, 9]} />
        <meshStandardMaterial color="#ff3048" roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, -0.3]} position={[6.5, 0.008, -4]}>
        <circleGeometry args={[2.6, 9]} />
        <meshStandardMaterial color="#1e90ff" roughness={0.3} />
      </mesh>
    </group>
  )
}

export default function LobbyScene({ quality = 'medium' }: { quality?: 'low' | 'medium' | 'high' }) {
  const dpr: [number, number] = quality === 'low' ? [0.7, 1] : quality === 'high' ? [1, 2] : [1, 1.5]
  return (
    <Canvas shadows={quality !== 'low'} dpr={dpr} camera={{ position: [0.9, 2.3, 4.4], fov: 45 }} gl={{ antialias: quality !== 'low' }} onCreated={({ camera }) => camera.lookAt(0, 2.4, -6)}>
      <fog attach="fog" args={['#8fb2ff', 22, 60]} />
      <Sky />
      <Clouds />
      <hemisphereLight args={['#cfe0ff', '#3a2f7a', 1.3]} />
      <directionalLight position={[6, 12, 8]} intensity={2.2} color="#fff3dc" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <pointLight position={[-6, 3, -2]} intensity={25} color="#ff3048" distance={14} />
      <pointLight position={[6, 3, -2]} intensity={25} color="#1e90ff" distance={14} />

      <Castle />
      <Floor />
      <Character position={[0, 0, 0]} rotation={[0, Math.PI - 0.35, 0]} rightHand={<GlowSword />} />
      {quality !== 'low' && <Sparkles count={60} scale={[14, 6, 10]} position={[0, 3, -4]} size={3} speed={0.3} color="#ffe28a" opacity={0.7} />}
    </Canvas>
  )
}
