import { Sparkles, Stars } from '@react-three/drei'
import { useMemo } from 'react'
import { BackSide, CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from 'three'
import type { MapDef, Obstacle } from '@shared/maps'

function checker(a: string, b: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = a
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = b
  g.fillRect(0, 0, 64, 64)
  g.fillRect(64, 64, 64, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

function SkyDome({ top, bottom }: { top: string; bottom: string }) {
  const uniforms = useMemo(() => ({ top: { value: new Color(top) }, bottom: { value: new Color(bottom) } }), [top, bottom])
  return (
    <mesh scale={90}>
      <sphereGeometry args={[1, 24, 12]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader="varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
        fragmentShader="uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, vP.y)), 1.0); }"
      />
    </mesh>
  )
}

function ObstacleMesh({ o, wall }: { o: Obstacle; wall: string }) {
  const mat = (color: string, extra: Record<string, unknown> = {}) => <meshStandardMaterial color={color} roughness={0.8} {...extra} />
  if (o.kind === 'box') {
    const color = { stone: '#7a82b8', log: '#8b5a2b', house: '#e8c99a', iceblock: '#bfe8ff', panel: '#3a3f7a', crate: '#5a5f99' }[o.style] ?? wall
    return (
      <group position={[o.x, 0, o.z]}>
        <mesh position={[0, o.h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[o.w, o.h, o.d]} />
          {mat(color, o.style === 'iceblock' ? { transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.1 } : o.style === 'panel' ? { emissive: '#4a5aff', emissiveIntensity: 0.25 } : {})}
        </mesh>
        {o.style === 'house' && (
          <mesh position={[0, o.h + 0.15, 0]} castShadow>
            <boxGeometry args={[o.w + 0.3, 0.3, o.d + 0.3]} />
            {mat('#c48f4d')}
          </mesh>
        )}
        {o.style === 'panel' && (
          <mesh position={[0, o.h + 0.03, 0]}>
            <boxGeometry args={[o.w * 0.8, 0.05, o.d * 0.9]} />
            <meshBasicMaterial color="#7af0ff" />
          </mesh>
        )}
      </group>
    )
  }
  switch (o.style) {
    case 'tree':
    case 'bigtree':
      return (
        <group position={[o.x, 0, o.z]}>
          <mesh position={[0, o.h * 0.25, 0]} castShadow>
            <cylinderGeometry args={[o.r * 0.45, o.r * 0.55, o.h * 0.5, 8]} />
            {mat('#7a4a25')}
          </mesh>
          <mesh position={[0, o.h * 0.65, 0]} castShadow>
            <coneGeometry args={[o.r * 2.2, o.h * 0.7, 8]} />
            {mat('#2f8a3f')}
          </mesh>
          <mesh position={[0, o.h * 0.92, 0]} castShadow>
            <coneGeometry args={[o.r * 1.5, o.h * 0.45, 8]} />
            {mat('#3aa64c')}
          </mesh>
        </group>
      )
    case 'rock':
      return (
        <mesh position={[o.x, o.h * 0.4, o.z]} scale={[1, o.h / o.r / 1.6, 1]} castShadow receiveShadow>
          <dodecahedronGeometry args={[o.r, 0]} />
          {mat('#8a8f9e')}
        </mesh>
      )
    case 'cactus':
      return (
        <group position={[o.x, 0, o.z]}>
          <mesh position={[0, o.h / 2, 0]} castShadow>
            <capsuleGeometry args={[o.r, o.h - o.r * 2, 4, 8]} />
            {mat('#3d9a4a')}
          </mesh>
          <mesh position={[o.r * 1.2, o.h * 0.6, 0]} rotation={[0, 0, -0.4]} castShadow>
            <capsuleGeometry args={[o.r * 0.6, o.h * 0.3, 4, 8]} />
            {mat('#3d9a4a')}
          </mesh>
        </group>
      )
    case 'crystal':
      return (
        <mesh position={[o.x, o.h / 2, o.z]} castShadow>
          <octahedronGeometry args={[o.r * 1.3, 0]} />
          <meshStandardMaterial color="#9fe0ff" emissive="#4fc3ff" emissiveIntensity={0.5} transparent opacity={0.85} roughness={0.1} />
        </mesh>
      )
    case 'reactor':
    case 'beacon':
      return (
        <group position={[o.x, 0, o.z]}>
          <mesh position={[0, o.h / 2, 0]} castShadow>
            <cylinderGeometry args={[o.r, o.r * 1.1, o.h, 16]} />
            {mat('#3a3f7a', { metalness: 0.6, roughness: 0.3 })}
          </mesh>
          <mesh position={[0, o.h + 0.2, 0]}>
            <sphereGeometry args={[o.r * 0.6, 16, 16]} />
            <meshBasicMaterial color={o.style === 'reactor' ? '#7af0ff' : '#ff5ad1'} />
          </mesh>
          <pointLight position={[0, o.h + 0.5, 0]} color={o.style === 'reactor' ? '#7af0ff' : '#ff5ad1'} intensity={6} distance={8} />
        </group>
      )
    default:
      return (
        <mesh position={[o.x, o.h / 2, o.z]} castShadow receiveShadow>
          <cylinderGeometry args={[o.r, o.r * 1.1, o.h, 12]} />
          {mat('#7a82b8')}
        </mesh>
      )
  }
}

export function MapView({ map, quality }: { map: MapDef; quality: 'low' | 'medium' | 'high' }) {
  const tex = useMemo(() => {
    const t = checker(map.theme.ground, map.theme.ground2)
    t.repeat.set(map.half / 2, map.half / 2)
    return t
  }, [map])
  const H = map.half
  const wallH = 2.2
  return (
    <group>
      <SkyDome top={map.theme.sky[0]} bottom={map.theme.sky[1]} />
      {map.id === 'space' && <Stars radius={60} depth={20} count={2000} factor={3} fade />}
      <fog attach="fog" args={[map.theme.fog, H * 1.2, H * 4]} />
      <hemisphereLight args={[map.theme.light, map.theme.ground2, map.id === 'space' ? 0.6 : 1.1]} />
      <directionalLight position={[10, 18, 8]} intensity={map.id === 'space' ? 1.2 : 2} color={map.theme.light} castShadow={quality !== 'low'} shadow-mapSize={[1024, 1024]} shadow-camera-left={-H} shadow-camera-right={H} shadow-camera-top={H} shadow-camera-bottom={-H} />
      <pointLight position={[0, 4, H - 2]} color="#ff3048" intensity={10} distance={14} />
      <pointLight position={[0, 4, -H + 2]} color="#1e90ff" intensity={10} distance={14} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[H * 2, H * 2]} />
        <meshStandardMaterial map={tex} roughness={map.id === 'ice' ? 0.15 : 0.9} metalness={map.id === 'ice' ? 0.2 : 0} />
      </mesh>
      {map.iceZones.map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[z.x, 0.01, z.z]}>
          <circleGeometry args={[z.r, 32]} />
          <meshStandardMaterial color="#a9dcff" transparent opacity={0.6} roughness={0.05} metalness={0.3} />
        </mesh>
      ))}
      {/* team bases */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, H - 4]}>
        <ringGeometry args={[2.6, 3, 40]} />
        <meshBasicMaterial color="#ff3048" transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -H + 4]}>
        <ringGeometry args={[2.6, 3, 40]} />
        <meshBasicMaterial color="#1e90ff" transparent opacity={0.7} />
      </mesh>
      {/* boundary walls */}
      {[[0, -H, H * 2, 0.6], [0, H, H * 2, 0.6], [-H, 0, 0.6, H * 2], [H, 0, 0.6, H * 2]].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, wallH / 2, z]} receiveShadow>
          <boxGeometry args={[w, wallH, d]} />
          <meshStandardMaterial color={map.theme.wall} roughness={0.9} transparent opacity={map.id === 'space' ? 0.5 : 1} emissive={map.id === 'space' ? '#3a2aff' : '#000'} emissiveIntensity={0.4} />
        </mesh>
      ))}
      {map.obstacles.map((o, i) => <ObstacleMesh key={i} o={o} wall={map.theme.wall} />)}
      {quality !== 'low' && map.id === 'forest' && <Sparkles count={40} scale={[H * 2, 4, H * 2]} position={[0, 2, 0]} size={3} speed={0.3} color="#fff7a0" />}
      {quality !== 'low' && map.id === 'ice' && <Sparkles count={80} scale={[H * 2, 8, H * 2]} position={[0, 4, 0]} size={2} speed={0.4} color="#ffffff" />}
    </group>
  )
}
