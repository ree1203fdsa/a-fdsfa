import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CANVAS_SIZE, type ToolInfo } from '@shared/constants'
import type { Stroke } from '@shared/weapon'
import { drawPaper, drawStroke, drawStrokes } from './render'

export interface View {
  zoom: number
  x: number
  y: number
}

interface Props {
  strokes: Stroke[]
  paperId: string
  tool: ToolInfo
  color: string
  width: number
  panMode: boolean
  view: View
  onView: (v: View) => void
  onStroke: (s: Stroke) => void
  onBlocked?: (reason: string) => void
  disabled?: boolean
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

export function DrawingCanvas({ strokes, paperId, tool, color, width, panMode, view, onView, onStroke, disabled }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [px, setPx] = useState(1000)
  const [display, setDisplay] = useState(400)
  const rendered = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; view: View } | null>(null)
  const panning = useRef<{ x: number; y: number; view: View } | null>(null)
  const spaceDown = useRef(false)
  const viewRef = useRef(view)
  viewRef.current = view

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const s = Math.floor(Math.min(el.clientWidth, el.clientHeight) - 8)
      setDisplay(Math.max(200, s))
    })
    ro.observe(el)
    setPx(Math.min(1600, Math.round(CANVAS_SIZE * Math.min(2, window.devicePixelRatio || 1) * 0.8)))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = paperRef.current
    if (c) drawPaper(c.getContext('2d')!, paperId, px)
  }, [paperId, px])

  // Incremental ink redraw: append-only changes draw one stroke, anything else redraws everything.
  useEffect(() => {
    const c = inkRef.current
    if (!c) return
    const g = c.getContext('2d')!
    const prev = rendered.current
    const appended = strokes.length === prev.length + 1 && prev.every((s, i) => strokes[i] === s)
    if (appended) {
      const s = strokes[strokes.length - 1]
      if (s.t !== 'eraser' || current.current === null) drawStroke(g, s, px, strokes.length - 1)
    } else if (!(strokes.length === prev.length && prev.every((s, i) => strokes[i] === s))) {
      g.clearRect(0, 0, px, px)
      drawStrokes(g, strokes, px)
    }
    rendered.current = strokes
  }, [strokes, px])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        spaceDown.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const toLogical = useCallback((clientX: number, clientY: number) => {
    const r = liveRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(CANVAS_SIZE, ((clientX - r.left) / r.width) * CANVAS_SIZE)),
      y: Math.max(0, Math.min(CANVAS_SIZE, ((clientY - r.top) / r.height) * CANVAS_SIZE)),
    }
  }, [])

  const redrawLive = () => {
    const c = liveRef.current
    if (!c) return
    const g = c.getContext('2d')!
    g.clearRect(0, 0, px, px)
    const s = current.current
    if (s && s.t !== 'eraser') drawStroke(g, s, px, strokes.length)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      current.current = null
      redrawLive()
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: viewRef.current }
      return
    }
    if (panMode || spaceDown.current || e.button === 1) {
      panning.current = { x: e.clientX, y: e.clientY, view: viewRef.current }
      return
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const p = toLogical(e.clientX, e.clientY)
    const pressure = e.pointerType === 'pen' ? Math.round(Math.max(0.05, e.pressure) * 100) : 50
    current.current = { t: tool.id, c: color, w: width, p: [Math.round(p.x), Math.round(p.y), pressure] }
    redrawLive()
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const p = pinch.current
      onView({ zoom: clampZoom(p.view.zoom * (dist / Math.max(1, p.dist))), x: p.view.x + mid.x - p.mid.x, y: p.view.y + mid.y - p.mid.y })
      return
    }
    if (panning.current) {
      const p = panning.current
      onView({ ...p.view, x: p.view.x + e.clientX - p.x, y: p.view.y + e.clientY - p.y })
      return
    }
    const s = current.current
    if (!s) return
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events) {
      const p = toLogical(ev.clientX, ev.clientY)
      const lx = s.p[s.p.length - 3], ly = s.p[s.p.length - 2]
      if (Math.hypot(p.x - lx, p.y - ly) < 1.5) continue
      if (s.p.length >= 3 * 3000) break
      const pressure = ev.pointerType === 'pen' ? Math.round(Math.max(0.05, ev.pressure) * 100) : 50
      s.p.push(Math.round(p.x), Math.round(p.y), pressure)
      if (s.t === 'eraser') {
        drawStroke(inkRef.current!.getContext('2d')!, { ...s, p: s.p.slice(-6) }, px)
      }
    }
    redrawLive()
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (panning.current) {
      panning.current = null
      return
    }
    const s = current.current
    current.current = null
    redrawLive()
    if (s && e.type !== 'pointercancel') {
      if (s.t === 'eraser') {
        // Live erasing already touched the ink layer; let the effect re-render cleanly from the list.
        rendered.current = []
      }
      onStroke(s)
    } else if (s && s.t === 'eraser') {
      const g = inkRef.current!.getContext('2d')!
      g.clearRect(0, 0, px, px)
      drawStrokes(g, strokes, px)
    }
  }

  function onWheel(e: React.WheelEvent) {
    const v = viewRef.current
    const factor = Math.exp(-e.deltaY * 0.0015)
    const zoom = clampZoom(v.zoom * factor)
    const r = wrap.current!.getBoundingClientRect()
    const cx = e.clientX - r.left - r.width / 2 - v.x
    const cy = e.clientY - r.top - r.height / 2 - v.y
    const k = zoom / v.zoom
    onView({ zoom, x: v.x - cx * (k - 1), y: v.y - cy * (k - 1) })
  }

  const cursor = panMode ? 'grab' : tool.id === 'eraser' ? 'cell' : 'crosshair'
  const layer = 'absolute inset-0 h-full w-full'
  return (
    <div ref={wrap} className="relative h-full w-full touch-none select-none overflow-hidden" onWheel={onWheel}>
      <div
        className="absolute left-1/2 top-1/2 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.6)]"
        style={{
          width: display, height: display,
          transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          transformOrigin: 'center',
        }}
      >
        <canvas ref={paperRef} width={px} height={px} className={layer} />
        <canvas ref={inkRef} width={px} height={px} className={layer} />
        <canvas
          ref={liveRef}
          width={px}
          height={px}
          className={layer}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="pointer-events-none absolute inset-0 ring-2 ring-white/30" />
      </div>
    </div>
  )
}
