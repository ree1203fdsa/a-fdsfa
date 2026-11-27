import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import type { Group } from 'three'
import type { WeaponType } from '@shared/constants'
import type { ModelParams, Stroke } from '@shared/weapon'
import { buildWeapon, TARGET_LENGTH } from './weaponMesh'

export function WeaponModel({ strokes, paperId, type, params, onBuilt }: {
  strokes: Stroke[]; paperId: string; type: WeaponType; params: ModelParams; onBuilt?: (g: Group | null) => void
}) {
  const built = useMemo(() => buildWeapon(strokes, paperId, type, params), [strokes, paperId, type, params])
  useEffect(() => {
    onBuilt?.(built?.group ?? null)
    return () => built?.dispose()
  }, [built, onBuilt])
  if (!built) return null
  return <primitive object={built.group} />
}

function FitCamera({ length }: { length: number }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.setLength(Math.max(2.4, length * 1.9))
  }, [camera, length])
  return null
}

/** Rotatable/zoomable 3D preview of a drawn weapon, centred on its middle. */
export default function WeaponView({ strokes, paperId, type, params, autoRotate = true, onBuilt, className }: {
  strokes: Stroke[]; paperId: string; type: WeaponType; params: ModelParams; autoRotate?: boolean
  onBuilt?: (g: Group | null) => void; className?: string
}) {
  const length = TARGET_LENGTH[type] * params.scale
  return (
    <div className={className}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0.4, 3], fov: 40 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#1b2160']} />
        <ambientLight intensity={0.5} />
        <hemisphereLight args={['#dfe6ff', '#2a2060', 0.8]} />
        <directionalLight position={[3, 4, 3]} intensity={2.2} castShadow />
        <pointLight position={[-3, 1, -2]} color="#ff3048" intensity={12} />
        <pointLight position={[3, 1, -2]} color="#1e90ff" intensity={12} />
        <group position={[0, -length * 0.38, 0]}>
          <WeaponModel strokes={strokes} paperId={paperId} type={type} params={params} onBuilt={onBuilt} />
        </group>
        <ContactShadows position={[0, -length * 0.55, 0]} opacity={0.5} scale={4} blur={2.5} />
        <FitCamera length={length} />
        <OrbitControls autoRotate={autoRotate} autoRotateSpeed={2.5} enablePan={false} minDistance={1} maxDistance={8} target={[0, 0, 0]} />
      </Canvas>
    </div>
  )
}
