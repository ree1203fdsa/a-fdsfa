import { CANVAS_SIZE, PAPER_BY_ID, TOOL_BY_ID, type PaperInfo } from '@shared/constants'
import type { Stroke } from '@shared/weapon'

/** Small deterministic PRNG so textured strokes look identical every redraw. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

export function drawPaper(g: CanvasRenderingContext2D, paperId: string, size: number) {
  const p: PaperInfo = PAPER_BY_ID[paperId] ?? PAPER_BY_ID.white
  const k = size / CANVAS_SIZE
  g.save()
  g.fillStyle = p.bg
  g.fillRect(0, 0, size, size)
  g.strokeStyle = p.patternColor
  g.fillStyle = p.patternColor
  const r = rng(7)
  switch (p.pattern) {
    case 'lines':
      g.lineWidth = 2 * k
      for (let y = 60; y < CANVAS_SIZE; y += 40) {
        g.beginPath(); g.moveTo(0, y * k); g.lineTo(size, y * k); g.stroke()
      }
      g.strokeStyle = '#ff9b9b'
      g.beginPath(); g.moveTo(90 * k, 0); g.lineTo(90 * k, size); g.stroke()
      break
    case 'grid':
      g.lineWidth = 1.5 * k
      for (let i = 0; i <= CANVAS_SIZE; i += 25) {
        g.globalAlpha = i % 100 === 0 ? 0.9 : 0.45
        g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, size); g.stroke()
        g.beginPath(); g.moveTo(0, i * k); g.lineTo(size, i * k); g.stroke()
      }
      break
    case 'texture':
      for (let i = 0; i < 2500; i++) {
        g.globalAlpha = 0.25 + r() * 0.3
        g.fillRect(r() * size, r() * size, 2 * k, 2 * k)
      }
      break
    case 'sparkle':
      for (let i = 0; i < 160; i++) {
        g.globalAlpha = 0.4 + r() * 0.6
        const x = r() * size, y = r() * size, s = (2 + r() * 5) * k
        g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s)
        g.lineWidth = 1.5 * k
        g.stroke()
      }
      break
    case 'glow': {
      const grad = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75)
      grad.addColorStop(0, '#3a1670')
      grad.addColorStop(1, p.bg)
      g.fillStyle = grad
      g.fillRect(0, 0, size, size)
      g.globalAlpha = 0.35
      g.strokeStyle = p.patternColor
      g.lineWidth = 2 * k
      for (let i = 0; i <= CANVAS_SIZE; i += 50) {
        g.beginPath(); g.moveTo(i * k, 0); g.lineTo(i * k, size); g.stroke()
        g.beginPath(); g.moveTo(0, i * k); g.lineTo(size, i * k); g.stroke()
      }
      break
    }
    case 'stars':
      for (let i = 0; i < 220; i++) {
        g.globalAlpha = 0.3 + r() * 0.7
        g.beginPath()
        g.arc(r() * size, r() * size, (0.8 + r() * 2.2) * k, 0, Math.PI * 2)
        g.fill()
      }
      break
  }
  g.restore()
}

function width(s: Stroke, i: number, k: number) {
  const pressure = (s.p[i * 3 + 2] ?? 50) / 100
  const tool = TOOL_BY_ID[s.t]?.render
  const pf = tool === 'brush' ? 0.25 + pressure * 1.3 : tool === 'pencil' ? 0.7 + pressure * 0.5 : tool === 'ballpoint' ? 0.75 + pressure * 0.4 : 1
  return Math.max(0.5, s.w * pf * k)
}

function eachSegment(s: Stroke, fn: (x0: number, y0: number, x1: number, y1: number, i: number, dist: number) => void) {
  const p = s.p
  let dist = 0
  const n = p.length / 3
  if (n === 1) fn(p[0], p[1], p[0] + 0.01, p[1], 0, 0)
  for (let i = 1; i < n; i++) {
    const x0 = p[(i - 1) * 3], y0 = p[(i - 1) * 3 + 1], x1 = p[i * 3], y1 = p[i * 3 + 1]
    fn(x0, y0, x1, y1, i, dist)
    dist += Math.hypot(x1 - x0, y1 - y0)
  }
}

function path(g: CanvasRenderingContext2D, s: Stroke, k: number) {
  const p = s.p
  g.beginPath()
  g.moveTo(p[0] * k, p[1] * k)
  if (p.length === 3) g.lineTo(p[0] * k + 0.01, p[1] * k)
  for (let i = 3; i < p.length; i += 3) g.lineTo(p[i] * k, p[i + 1] * k)
}

/** Draws one stroke onto a transparent ink layer of `size` pixels. */
export function drawStroke(g: CanvasRenderingContext2D, s: Stroke, size: number, index = 0) {
  const k = size / CANVAS_SIZE
  const tool = TOOL_BY_ID[s.t]?.render ?? 'ballpoint'
  g.save()
  g.lineCap = 'round'
  g.lineJoin = 'round'
  switch (tool) {
    case 'eraser':
      g.globalCompositeOperation = 'destination-out'
      g.strokeStyle = '#000'
      g.lineWidth = s.w * k
      path(g, s, k)
      g.stroke()
      break
    case 'marker':
      g.strokeStyle = s.c
      g.lineWidth = s.w * k
      g.lineCap = 'square'
      path(g, s, k)
      g.stroke()
      break
    case 'highlighter':
      g.globalAlpha = 0.42
      g.strokeStyle = s.c
      g.lineWidth = s.w * k
      g.lineCap = 'butt'
      path(g, s, k)
      g.stroke()
      break
    case 'pencil': {
      const r = rng(index * 977 + 13)
      g.strokeStyle = s.c
      for (let pass = 0; pass < 3; pass++) {
        g.globalAlpha = 0.45
        eachSegment(s, (x0, y0, x1, y1, i) => {
          const j = (r() - 0.5) * s.w * 0.5 * k
          g.lineWidth = width(s, i, k) * 0.55
          g.beginPath(); g.moveTo(x0 * k + j, y0 * k + j); g.lineTo(x1 * k + j, y1 * k - j); g.stroke()
        })
      }
      break
    }
    case 'brush':
      g.strokeStyle = s.c
      g.globalAlpha = 0.92
      eachSegment(s, (x0, y0, x1, y1, i) => {
        g.lineWidth = width(s, i, k)
        g.beginPath(); g.moveTo(x0 * k, y0 * k); g.lineTo(x1 * k, y1 * k); g.stroke()
      })
      break
    case 'rainbow':
      g.lineWidth = s.w * k
      eachSegment(s, (x0, y0, x1, y1, _i, dist) => {
        g.strokeStyle = `hsl(${(dist * 0.6) % 360} 95% 58%)`
        g.beginPath(); g.moveTo(x0 * k, y0 * k); g.lineTo(x1 * k, y1 * k); g.stroke()
      })
      break
    case 'neon':
      g.shadowColor = s.c
      g.shadowBlur = s.w * 2.2 * k
      g.strokeStyle = s.c
      g.lineWidth = s.w * k
      path(g, s, k)
      g.stroke()
      g.shadowBlur = 0
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = Math.max(1, s.w * 0.35 * k)
      path(g, s, k)
      g.stroke()
      break
    case 'gold': {
      g.lineWidth = s.w * k
      eachSegment(s, (x0, y0, x1, y1, _i, dist) => {
        const t = (Math.sin(dist * 0.05) + 1) / 2
        g.strokeStyle = `rgb(${200 + t * 55},${150 + t * 80},${30 + t * 110})`
        g.beginPath(); g.moveTo(x0 * k, y0 * k); g.lineTo(x1 * k, y1 * k); g.stroke()
      })
      g.fillStyle = '#fffbe0'
      const r = rng(index * 31 + 5)
      eachSegment(s, (x0, y0, _x1, _y1, i) => {
        if (i % 6 === 0 && r() > 0.4) {
          g.beginPath(); g.arc(x0 * k + (r() - 0.5) * s.w * k, y0 * k + (r() - 0.5) * s.w * k, Math.max(0.8, s.w * 0.12 * k), 0, Math.PI * 2); g.fill()
        }
      })
      break
    }
    case 'legendary': {
      g.shadowBlur = s.w * 2.5 * k
      g.lineWidth = s.w * k
      eachSegment(s, (x0, y0, x1, y1, _i, dist) => {
        const hue = (dist * 0.8 + 200) % 360
        g.shadowColor = `hsl(${hue} 100% 60%)`
        g.strokeStyle = `hsl(${hue} 100% 62%)`
        g.beginPath(); g.moveTo(x0 * k, y0 * k); g.lineTo(x1 * k, y1 * k); g.stroke()
      })
      g.shadowBlur = 0
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.lineWidth = Math.max(1, s.w * 0.3 * k)
      path(g, s, k)
      g.stroke()
      break
    }
    default:
      g.strokeStyle = s.c
      eachSegment(s, (x0, y0, x1, y1, i) => {
        g.lineWidth = width(s, i, k)
        g.beginPath(); g.moveTo(x0 * k, y0 * k); g.lineTo(x1 * k, y1 * k); g.stroke()
      })
  }
  g.restore()
}

export function drawStrokes(g: CanvasRenderingContext2D, strokes: Stroke[], size: number) {
  strokes.forEach((s, i) => drawStroke(g, s, size, i))
}

/** Paper + ink composited into a PNG data URL. */
export function renderPng(strokes: Stroke[], paperId: string | null, size: number): string {
  const ink = document.createElement('canvas')
  ink.width = ink.height = size
  drawStrokes(ink.getContext('2d')!, strokes, size)
  const out = document.createElement('canvas')
  out.width = out.height = size
  const g = out.getContext('2d')!
  if (paperId) drawPaper(g, paperId, size)
  else {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, size, size)
  }
  g.drawImage(ink, 0, 0)
  return out.toDataURL('image/png')
}

/** Ink only, on transparent background, for 3D textures. */
export function renderInkCanvas(strokes: Stroke[], size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  drawStrokes(c.getContext('2d')!, strokes, size)
  return c
}
