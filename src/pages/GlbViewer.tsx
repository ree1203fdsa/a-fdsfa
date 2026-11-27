import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Button, ScreenHeader } from '@/components/ui'

function Fit({ object }: { object: Object3D }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    object.position.sub(center)
    camera.position.set(0, size.y * 0.15, Math.max(size.x, size.y, size.z) * 2 + 0.5)
    camera.lookAt(0, 0, 0)
  }, [object, camera])
  return null
}

/** Opens a .glb file from the device (e.g. S22 Download/ColorWars) and shows it in 3D. */
export default function GlbViewer() {
  const input = useRef<HTMLInputElement>(null)
  const [model, setModel] = useState<{ name: string; object: Object3D; kb: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function open(file: File) {
    setError(null)
    try {
      const buf = await file.arrayBuffer()
      const gltf = await new GLTFLoader().parseAsync(buf, '')
      setModel({ name: file.name.replace(/\.glb$/i, ''), object: gltf.scene, kb: Math.round(file.size / 1024) })
    } catch {
      setError('이 파일은 3D 모델(.glb)로 열 수 없어요.')
    }
  }

  return (
    <div className="bg-arena flex h-[100dvh] flex-col">
      <ScreenHeader title="3D 무기 뷰어" sub="GLB VIEWER" right={<Button size="sm" onClick={() => input.current?.click()}>📂 파일 열기</Button>} />
      <input ref={input} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => e.target.files?.[0] && void open(e.target.files[0])} />
      {model ? (
        <div className="relative flex-1">
          <Canvas camera={{ fov: 40, position: [0, 0.3, 3] }}>
            <color attach="background" args={['#1b2160']} />
            <ambientLight intensity={0.6} />
            <hemisphereLight args={['#dfe6ff', '#2a2060', 0.8]} />
            <directionalLight position={[3, 4, 3]} intensity={2.2} />
            <pointLight position={[-3, 1, -2]} color="#ff3048" intensity={12} />
            <pointLight position={[3, 1, -2]} color="#1e90ff" intensity={12} />
            <primitive object={model.object} />
            <Fit object={model.object} />
            <ContactShadows position={[0, -1, 0]} opacity={0.5} scale={4} blur={2.5} />
            <OrbitControls autoRotate autoRotateSpeed={2} enablePan={false} />
          </Canvas>
          <div className="pointer-events-none absolute inset-x-0 top-3 text-center">
            <p className="text-outline font-display text-3xl">{model.name}</p>
            <p className="font-num text-xs text-dim">{model.kb}KB · 손가락으로 돌리고, 두 손가락으로 확대해 보세요</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="text-7xl">📦</span>
          <p className="font-display text-2xl">저장한 3D 무기 보기</p>
          <p className="text-sm text-dim">
            "파일 열기"를 누르고<br /><b className="text-text">내 파일 → 다운로드 → ColorWars</b><br />에서 .glb 파일을 골라 주세요.
          </p>
          {error && <p className="rounded-xl bg-bad/20 px-4 py-2 text-bad">{error}</p>}
          <Button size="lg" onClick={() => input.current?.click()}>📂 파일 열기</Button>
        </div>
      )}
    </div>
  )
}
