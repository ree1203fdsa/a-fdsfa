import { useEffect, useRef } from 'react'
import { TICK_HZ, type BattleInput } from '@shared/battle'
import { resolveKeys } from '@/lib/keys'
import { getSocket } from '@/lib/socket'
import { useAuth } from '@/stores/auth'

export interface CameraState { yaw: number; pitch: number }

/** Shared mutable control state; mobile buttons write into it directly. */
export interface ControlState {
  keys: Set<string>
  mouseAttack: boolean
  mouseBlock: boolean
  stick: { x: number; y: number }
  touch: { attack: boolean; block: boolean; jump: boolean; run: boolean; special: boolean; dodge: boolean }
}

export function useBattleInput(enabled: boolean, initialYaw: number, canvas: () => HTMLElement | null) {
  const cam = useRef<CameraState>({ yaw: initialYaw, pitch: 0.25 })
  const ctl = useRef<ControlState>({
    keys: new Set(), mouseAttack: false, mouseBlock: false, stick: { x: 0, y: 0 },
    touch: { attack: false, block: false, jump: false, run: false, special: false, dodge: false },
  })
  const seq = useRef(0)

  useEffect(() => {
    cam.current.yaw = initialYaw
  }, [initialYaw])

  useEffect(() => {
    if (!enabled) return
    const settings = useAuth.getState().user?.settings
    const keys = resolveKeys(settings?.keys)
    const sens = (settings?.sensitivity ?? 1) * 0.0024
    const c = ctl.current

    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      c.keys.add(e.code)
      if (Object.values(keys).includes(e.code)) e.preventDefault()
    }
    const up = (e: KeyboardEvent) => c.keys.delete(e.code)
    const blur = () => {
      c.keys.clear()
      c.mouseAttack = c.mouseBlock = false
    }
    const mouseDown = (e: PointerEvent) => {
      const el = canvas()
      if (e.pointerType === 'touch' || !el || !el.contains(e.target as Node)) return
      if (document.pointerLockElement !== el) {
        void el.requestPointerLock?.()
        return
      }
      if (e.button === 0) c.mouseAttack = true
      if (e.button === 2) c.mouseBlock = true
    }
    const mouseUp = (e: PointerEvent) => {
      if (e.button === 0) c.mouseAttack = false
      if (e.button === 2) c.mouseBlock = false
    }
    const mouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas()) return
      cam.current.yaw -= e.movementX * sens
      cam.current.pitch = Math.max(-0.35, Math.min(0.9, cam.current.pitch + e.movementY * sens))
    }
    const noMenu = (e: Event) => e.preventDefault()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    window.addEventListener('pointerdown', mouseDown)
    window.addEventListener('pointerup', mouseUp)
    window.addEventListener('mousemove', mouseMove)
    window.addEventListener('contextmenu', noMenu)

    const socket = getSocket()
    const timer = setInterval(() => {
      const k = (a: keyof typeof keys) => c.keys.has(keys[a])
      let fx = (k('forward') ? 1 : 0) - (k('back') ? 1 : 0) + -c.stick.y
      let rx = (k('right') ? 1 : 0) - (k('left') ? 1 : 0) + c.stick.x
      const len = Math.hypot(fx, rx)
      if (len > 1) { fx /= len; rx /= len }
      const yaw = cam.current.yaw
      // forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
      const mx = -Math.sin(yaw) * fx + Math.cos(yaw) * rx
      const mz = -Math.cos(yaw) * fx - Math.sin(yaw) * rx
      const input: BattleInput = {
        seq: ++seq.current, mx, mz, yaw,
        attack: c.mouseAttack || c.touch.attack,
        block: c.mouseBlock || c.touch.block,
        jump: k('jump') || c.touch.jump,
        run: k('run') || c.touch.run || Boolean(settings?.autoRun),
        special: k('special') || c.touch.special,
        dodge: k('dodge') || c.touch.dodge,
      }
      socket.emit('battle:input', input)
    }, 1000 / TICK_HZ)

    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      window.removeEventListener('pointerdown', mouseDown)
      window.removeEventListener('pointerup', mouseUp)
      window.removeEventListener('mousemove', mouseMove)
      window.removeEventListener('contextmenu', noMenu)
      if (document.pointerLockElement) document.exitPointerLock()
    }
  }, [enabled, canvas])

  return { cam, ctl }
}
