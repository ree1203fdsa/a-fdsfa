import {
  CanvasTexture, Color, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape, SRGBColorSpace, Vector2,
} from 'three'
import { TOOL_BY_ID, type WeaponType } from '@shared/constants'
import { dilate, fillHoles, silhouette, type ModelParams, type Stroke } from '@shared/weapon'
import { drawPaper, drawStrokes } from '@/draw/render'

const GRID = 128

export const TARGET_LENGTH: Record<WeaponType, number> = {
  dagger: 0.8, sword: 1.4, longsword: 1.9, spear: 2.2, staff: 1.9, hammer: 1.5, axe: 1.5, scythe: 2.0,
  shield: 1.0, bow: 1.4, gun: 0.9, twinblades: 1.1, special: 1.3, freeform: 1.4,
}

/** Traces the outer boundary of a filled cell mask into a polygon (grid-corner coordinates). */
export function traceOutline(mask: Uint8Array, N: number): [number, number][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? mask[y * N + x] : 0)
  const edges = new Map<number, number[]>()
  const key = (x: number, y: number) => y * (N + 1) + x
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0)
    const list = edges.get(k)
    if (list) list.push(key(x1, y1))
    else edges.set(k, [key(x1, y1)])
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!at(x, y)) continue
      if (!at(x, y - 1)) add(x + 1, y, x, y)
      if (!at(x - 1, y)) add(x, y, x, y + 1)
      if (!at(x, y + 1)) add(x, y + 1, x + 1, y + 1)
      if (!at(x + 1, y)) add(x + 1, y + 1, x + 1, y)
    }
  }
  const W = N + 1
  const dir = (a: number, b: number) => [(b % W) - (a % W), Math.floor(b / W) - Math.floor(a / W)]
  let best: number[] = []
  while (edges.size) {
    const start = edges.keys().next().value as number
    const loop = [start]
    let prev = -1
    let cur = start
    for (let guard = 0; guard < 200000; guard++) {
      const outs = edges.get(cur)
      if (!outs || !outs.length) break
      // At pinch points (cells touching only diagonally) always turn toward the filled side,
      // otherwise one outline gets split into several loops.
      let pick = outs.length - 1
      if (outs.length > 1 && prev >= 0) {
        const [dx, dy] = dir(prev, cur)
        const rank = (o: number) => {
          const [ox, oy] = dir(cur, o)
          if (ox === dy && oy === -dx) return 0
          if (ox === dx && oy === dy) return 1
          return 2
        }
        let bestRank = 9
        outs.forEach((o, i) => {
          const r = rank(o)
          if (r < bestRank) { bestRank = r; pick = i }
        })
      }
      const next = outs.splice(pick, 1)[0]
      if (!outs.length) edges.delete(cur)
      if (next === start) break
      loop.push(next)
      prev = cur
      cur = next
    }
    if (loop.length > best.length) best = loop
  }
  return best.map((k) => [k % W, Math.floor(k / W)])
}

function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let maxD = 0, idx = -1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

function chaikin(pts: [number, number][], rounds: number): [number, number][] {
  let p = pts
  for (let r = 0; r < rounds; r++) {
    const out: [number, number][] = []
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]
      out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    p = out
  }
  return p
}

function dominantColor(strokes: Stroke[]): string {
  const len = new Map<string, number>()
  for (const s of strokes) {
    if (s.t === 'eraser') continue
    len.set(s.c, (len.get(s.c) ?? 0) + s.p.length * s.w)
  }
  let best = '#333344', max = 0
  for (const [c, l] of len) if (l > max) { max = l; best = c }
  return best
}

export interface BuiltWeapon {
  group: Group
  length: number
  dispose: () => void
}

/**
 * Builds a 3D weapon from the drawing: silhouette → extruded outline, drawing applied to
 * both faces. Origin is the grip point, +Y runs from handle to tip.
 */
export function buildWeapon(strokes: Stroke[], paperId: string, type: WeaponType, params: ModelParams): BuiltWeapon | null {
  const { mask } = silhouette(strokes, GRID)
  // Thicken hairline parts (guards, strings) so they survive as real 3D shapes.
  const outline = traceOutline(fillHoles(dilate(mask, GRID, 1), GRID), GRID)
  if (outline.length < 6) return null
  const smooth = chaikin(simplify(outline, 0.7), 2)
  // unit coords: x right, y up, in [0,1]
  const unit = smooth.map(([x, y]) => [x / GRID, 1 - y / GRID] as [number, number])

  const ca = Math.cos(params.angle), sa = Math.sin(params.angle)
  // params.angle is in canvas space (y down); in y-up space the rotation flips sign.
  const rot = (x: number, y: number): [number, number] => [x * ca + y * sa, -x * sa + y * ca]
  const cx = unit.reduce((s, p) => s + p[0], 0) / unit.length
  const cy = unit.reduce((s, p) => s + p[1], 0) / unit.length
  const r = unit.map(([x, y]) => rot(x - cx, y - cy))
  let minY = Infinity, maxY = -Infinity
  for (const [, y] of r) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const H = Math.max(0.05, maxY - minY)
  const target = TARGET_LENGTH[type] * params.scale
  const s = target / H
  const gripBand = r.filter(([, y]) => y < minY + H * 0.15)
  const gripX = gripBand.length ? gripBand.reduce((a, p) => a + p[0], 0) / gripBand.length : 0

  const shape = new Shape(unit.map(([x, y]) => new Vector2(x, y)))
  const worldThickness = (type === 'shield' ? 0.09 : 0.055) * params.thickness
  const depth = worldThickness / s
  const geo = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: Math.min(0.006, depth * 0.4), bevelSegments: 2, curveSegments: 1,
  })
  geo.translate(-cx, -cy, -depth / 2)
  geo.rotateZ(-params.angle)
  geo.scale(s, s, s)
  geo.translate(-gripX * s, -minY * s - target * 0.12, 0)
  geo.computeVertexNormals()

  const tex = document.createElement('canvas')
  tex.width = tex.height = 512
  const g = tex.getContext('2d')!
  drawPaper(g, paperId, 512)
  drawStrokes(g, strokes, 512)
  const map = new CanvasTexture(tex)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4

  const tools = new Set(strokes.map((st) => TOOL_BY_ID[st.t]?.render))
  const glow = tools.has('neon') || tools.has('legendary')
  const metal = tools.has('gold')
  const face = new MeshStandardMaterial({
    map, roughness: metal ? 0.35 : 0.65, metalness: metal ? 0.45 : 0.05,
    emissive: glow ? new Color('#ffffff') : new Color('#000000'), emissiveMap: glow ? map : null, emissiveIntensity: glow ? 0.55 : 0,
  })
  const side = new MeshStandardMaterial({ color: new Color(dominantColor(strokes)).multiplyScalar(0.55), roughness: 0.6 })

  const group = new Group()
  const mesh = new Mesh(geo, [face, side])
  mesh.castShadow = true
  if (params.flip) mesh.scale.x = -1
  group.add(mesh)
  if (type === 'twinblades') {
    const twin = mesh.clone()
    twin.position.x = 0.35
    twin.scale.x = params.flip ? 1 : -1
    group.add(twin)
  }
  group.userData = { weaponLength: target }
  return {
    group,
    length: target,
    dispose: () => {
      geo.dispose()
      map.dispose()
      face.dispose()
      side.dispose()
    },
  }
}
