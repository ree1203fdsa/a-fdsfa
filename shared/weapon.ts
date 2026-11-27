import {
  CANVAS_SIZE, MAX_POINTS_TOTAL, MAX_STROKES, TOOL_BY_ID, WEAPON_INFO, WEAPON_TYPES,
  type WeaponType,
} from './constants.ts'

/** Flattened points: x, y, pressure(0-100) triplets in a CANVAS_SIZE square. */
export interface Stroke {
  t: string
  c: string
  w: number
  p: number[]
}

export interface ModelParams {
  angle: number
  flip: boolean
  thickness: number
  scale: number
}

export interface WeaponFeatures {
  ok: boolean
  reason?: string
  inkCells: number
  size: number
  elongation: number
  headRatio: number
  peakPos: number
  headAspect: number
  asymmetry: number
  curvature: number
  fillRatio: number
  widthRatio: number
  components: number
  secondComponentRatio: number
  angle: number
  handleAtStart: boolean
}

export interface WeaponStats {
  attack: number
  speed: number
  area: number
  range: number
  weight: number
  defense: number
  special: string
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function validateStrokes(strokes: unknown): { ok: true; strokes: Stroke[] } | { ok: false; error: string } {
  if (!Array.isArray(strokes)) return { ok: false, error: '그림 데이터 형식이 올바르지 않아요.' }
  if (strokes.length === 0) return { ok: false, error: '그림이 비어 있어요.' }
  if (strokes.length > MAX_STROKES) return { ok: false, error: `선은 최대 ${MAX_STROKES}개까지 그릴 수 있어요.` }
  let total = 0
  const out: Stroke[] = []
  for (const s of strokes) {
    if (!s || typeof s !== 'object') return { ok: false, error: '그림 데이터가 손상되었어요.' }
    const { t, c, w, p } = s as Stroke
    const tool = TOOL_BY_ID[t]
    if (!tool) return { ok: false, error: '알 수 없는 그림 도구가 있어요.' }
    if (typeof c !== 'string' || !HEX.test(c)) return { ok: false, error: '색상 값이 올바르지 않아요.' }
    if (typeof w !== 'number' || w < tool.minWidth || w > tool.maxWidth) return { ok: false, error: '선 굵기가 올바르지 않아요.' }
    if (!Array.isArray(p) || p.length < 3 || p.length % 3 !== 0) return { ok: false, error: '선 데이터가 올바르지 않아요.' }
    total += p.length / 3
    if (total > MAX_POINTS_TOTAL) return { ok: false, error: '그림이 너무 복잡해요. 선을 조금 줄여 주세요.' }
    for (let i = 0; i < p.length; i++) {
      const v = p[i]
      if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: '선 좌표가 올바르지 않아요.' }
      const max = i % 3 === 2 ? 100 : CANVAS_SIZE
      if (v < 0 || v > max) return { ok: false, error: '그림이 종이 밖으로 나갔어요.' }
    }
    out.push({ t, c: c.toLowerCase(), w: Math.round(w * 10) / 10, p: p.map((v) => Math.round(v)) })
  }
  if (!out.some((s) => s.t !== 'eraser')) return { ok: false, error: '그림이 비어 있어요.' }
  return { ok: true, strokes: out }
}

export function toolsUsed(strokes: Stroke[]): string[] {
  return [...new Set(strokes.map((s) => s.t))]
}

/** Rasterises strokes into an N×N occupancy grid (eraser strokes clear cells). */
export function rasterize(strokes: Stroke[], N: number): Uint8Array {
  const grid = new Uint8Array(N * N)
  const k = N / CANVAS_SIZE
  for (const s of strokes) {
    const val = s.t === 'eraser' ? 0 : 1
    const r = Math.max(0.6, (s.w / 2) * k)
    const pts = s.p
    for (let i = 0; i < pts.length; i += 3) {
      const x1 = pts[i] * k
      const y1 = pts[i + 1] * k
      const x0 = i >= 3 ? pts[i - 3] * k : x1
      const y0 = i >= 3 ? pts[i - 2] * k : y1
      const dist = Math.hypot(x1 - x0, y1 - y0)
      const steps = Math.max(1, Math.ceil(dist / Math.max(0.5, r * 0.5)))
      for (let j = 0; j <= steps; j++) {
        const cx = x0 + ((x1 - x0) * j) / steps
        const cy = y0 + ((y1 - y0) * j) / steps
        stamp(grid, N, cx, cy, r, val)
      }
    }
  }
  return grid
}

function stamp(grid: Uint8Array, N: number, cx: number, cy: number, r: number, val: number) {
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(N - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(N - 1, Math.ceil(cy + r))
  const r2 = r * r
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2 + 0.25) grid[y * N + x] = val
    }
  }
}

export function dilate(grid: Uint8Array, N: number, times = 1): Uint8Array {
  let src = grid
  for (let t = 0; t < times; t++) {
    const dst = new Uint8Array(N * N)
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x
        if (src[i] || (x > 0 && src[i - 1]) || (x < N - 1 && src[i + 1]) || (y > 0 && src[i - N]) || (y < N - 1 && src[i + N])) dst[i] = 1
      }
    }
    src = dst
  }
  return src
}

export function erode(grid: Uint8Array, N: number, times = 1): Uint8Array {
  let src = grid
  for (let t = 0; t < times; t++) {
    const dst = new Uint8Array(N * N)
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = y * N + x
        if (src[i] && src[i - 1] && src[i + 1] && src[i - N] && src[i + N]) dst[i] = 1
      }
    }
    src = dst
  }
  return src
}

/** Fills enclosed holes so outlined drawings become solid silhouettes. */
export function fillHoles(grid: Uint8Array, N: number): Uint8Array {
  const outside = new Uint8Array(N * N)
  const stack: number[] = []
  for (let i = 0; i < N; i++) {
    for (const idx of [i, (N - 1) * N + i, i * N, i * N + N - 1]) {
      if (!grid[idx] && !outside[idx]) {
        outside[idx] = 1
        stack.push(idx)
      }
    }
  }
  while (stack.length) {
    const i = stack.pop()!
    const x = i % N
    const y = (i / N) | 0
    const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]
    for (const j of nb) {
      if (j >= 0 && !grid[j] && !outside[j]) {
        outside[j] = 1
        stack.push(j)
      }
    }
  }
  const out = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) out[i] = outside[i] ? 0 : 1
  return out
}

/** Labels 4-connected components; returns label grid and sizes sorted largest first. */
export function components(grid: Uint8Array, N: number): { labels: Int32Array; sizes: { label: number; size: number }[] } {
  const labels = new Int32Array(N * N).fill(-1)
  const sizes: { label: number; size: number }[] = []
  let next = 0
  const stack: number[] = []
  for (let s = 0; s < N * N; s++) {
    if (!grid[s] || labels[s] !== -1) continue
    const label = next++
    let size = 0
    labels[s] = label
    stack.push(s)
    while (stack.length) {
      const i = stack.pop()!
      size++
      const x = i % N
      const y = (i / N) | 0
      const nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]
      for (const j of nb) {
        if (j >= 0 && grid[j] && labels[j] === -1) {
          labels[j] = label
          stack.push(j)
        }
      }
    }
    sizes.push({ label, size })
  }
  sizes.sort((a, b) => b.size - a.size)
  return { labels, sizes }
}

/** Returns the solid silhouette (largest merged component, holes filled). */
export function silhouette(strokes: Stroke[], N: number): { mask: Uint8Array; ink: Uint8Array; comps: { label: number; size: number }[] } {
  const ink = rasterize(strokes, N)
  // Closing (grow then shrink) bridges small gaps between parts a person would see as one weapon,
  // e.g. an open-ended crossguard drawn as two separate lines.
  const close = Math.max(1, Math.round(N / 64))
  const merged = fillHoles(erode(dilate(dilate(ink, N, 1), N, close), N, close), N)
  const { labels, sizes } = components(merged, N)
  const mask = new Uint8Array(N * N)
  if (sizes.length) {
    const keep = sizes[0].label
    for (let i = 0; i < N * N; i++) if (labels[i] === keep) mask[i] = 1
  }
  return { mask, ink, comps: sizes }
}

export const ANALYSIS_GRID = 96

export function analyzeStrokes(strokes: Stroke[]): WeaponFeatures {
  const N = ANALYSIS_GRID
  const empty: WeaponFeatures = {
    ok: false, inkCells: 0, size: 0, elongation: 1, headRatio: 1, peakPos: 0, headAspect: 1, asymmetry: 0, curvature: 0, fillRatio: 0,
    widthRatio: 1, components: 0, secondComponentRatio: 0, angle: 0, handleAtStart: true,
  }
  const { mask, ink, comps } = silhouette(strokes, N)
  let inkCells = 0
  for (let i = 0; i < ink.length; i++) inkCells += ink[i]
  const area = comps.length ? comps[0].size : 0
  if (inkCells < 12 || area < 20) return { ...empty, inkCells, reason: '그림이 너무 작아요. 조금 더 크게 그려 주세요.' }

  let mx = 0, my = 0
  for (let i = 0; i < N * N; i++) if (mask[i]) { mx += i % N; my += (i / N) | 0 }
  mx /= area
  my /= area
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < N * N; i++) {
    if (!mask[i]) continue
    const dx = (i % N) - mx
    const dy = ((i / N) | 0) - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  sxx /= area
  syy /= area
  sxy /= area
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = Math.max(0.25, tr / 2 - disc)
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)

  const cells: [number, number][] = []
  for (let i = 0; i < N * N; i++) if (mask[i]) cells.push([(i % N) + 0.5 - mx, ((i / N) | 0) + 0.5 - my])

  let p = profile(cells, angle)
  // Re-align the axis to the thin handle third: heavy heads (axe, hammer) tilt the global PCA axis.
  const third = p.L / 3
  const handleCells = cells.filter((_, k) => (p.handleAtStart ? p.us[k] - p.umin < third : p.umax - p.us[k] < third))
  if (handleCells.length > 8) {
    const h = pca(handleCells)
    if (h.elong > 1.8) {
      let a2 = h.angle
      if (Math.cos(a2 - angle) < 0) a2 += Math.PI
      if (Math.abs(Math.atan2(Math.sin(a2 - angle), Math.cos(a2 - angle))) < 0.8) p = profile(cells, a2)
    }
  }

  return {
    ok: true,
    inkCells,
    size: round3(p.L / N),
    elongation: round3(Math.sqrt(l1 / l2)),
    headRatio: round3(p.tipRatio),
    peakPos: round3(p.peakPos),
    headAspect: round3(p.headAspect),
    asymmetry: round3(p.asymmetry),
    curvature: round3(p.curvature),
    fillRatio: round3(area / (p.L * p.W)),
    widthRatio: round3(p.W / p.L),
    components: comps.filter((c) => c.size >= Math.max(15, comps[0].size * 0.08)).length,
    secondComponentRatio: round3(comps.length > 1 ? comps[1].size / comps[0].size : 0),
    angle: round3(p.angle),
    handleAtStart: p.handleAtStart,
  }
}

function pca(cells: [number, number][]) {
  let mx = 0, my = 0
  for (const [x, y] of cells) { mx += x; my += y }
  mx /= cells.length
  my /= cells.length
  let sxx = 0, syy = 0, sxy = 0
  for (const [x, y] of cells) {
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
    sxy += (x - mx) * (y - my)
  }
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = Math.max(0.25 * cells.length, tr / 2 - disc)
  return { angle: 0.5 * Math.atan2(2 * sxy, sxx - syy), elong: Math.sqrt(l1 / l2) }
}

function profile(cells: [number, number][], angle: number) {
  const ux = Math.cos(angle), uy = Math.sin(angle)
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity
  const us: number[] = []
  const vs: number[] = []
  for (const [dx, dy] of cells) {
    const u = dx * ux + dy * uy
    const v = -dx * uy + dy * ux
    us.push(u)
    vs.push(v)
    if (u < umin) umin = u
    if (u > umax) umax = u
    if (v < vmin) vmin = v
    if (v > vmax) vmax = v
  }
  const L = Math.max(1, umax - umin)
  const W = Math.max(1, vmax - vmin)
  const BINS = 12
  const binLen = L / BINS
  const count = new Array(BINS).fill(0)
  const vsum = new Array(BINS).fill(0)
  const bmin = new Array(BINS).fill(Infinity)
  const bmax = new Array(BINS).fill(-Infinity)
  for (let k = 0; k < us.length; k++) {
    const b = Math.min(BINS - 1, Math.floor((us[k] - umin) / binLen))
    count[b]++
    vsum[b] += vs[k]
    bmin[b] = Math.min(bmin[b], vs[k])
    bmax[b] = Math.max(bmax[b], vs[k])
  }
  const width = count.map((c) => c / Math.max(0.5, binLen))
  const center = vsum.map((s, b) => (count[b] ? s / count[b] : 0))
  const avg = (arr: number[], a: number, b: number) => {
    let s = 0
    for (let i = a; i < b; i++) s += arr[i]
    return s / (b - a)
  }
  const startW = avg(width, 0, 2)
  const endW = avg(width, BINS - 2, BINS)
  let handleAtStart = startW <= endW
  if (Math.max(startW, endW) / Math.max(0.5, Math.min(startW, endW)) < 1.4) {
    // Both ends look alike: a peak right at one end is a head (spear); a peak set back from an end is a guard.
    let rawPeak = 0
    for (let b = 1; b < BINS; b++) if (width[b] > width[rawPeak]) rawPeak = b
    const d = rawPeak / (BINS - 1)
    if (d < 0.15) handleAtStart = false
    else if (d > 0.85) handleAtStart = true
    else handleAtStart = d < 0.5
  }
  // Index bins from the handle (0) to the head (BINS-1).
  const at = (arr: number[], i: number) => (handleAtStart ? arr[i] : arr[BINS - 1 - i])
  const hw = Math.max(1, (at(width, 0) + at(width, 1)) / 2)
  const tipRatio = (at(width, BINS - 1) + at(width, BINS - 2) + at(width, BINS - 3) + at(width, BINS - 4)) / 4 / hw
  let peak = 0, peakBin = 0
  for (let i = 0; i < BINS; i++) if (at(width, i) > peak) { peak = at(width, i); peakBin = i }
  const peakPos = peakBin / (BINS - 1)
  const hc = (at(center, 0) + at(center, 1) + at(center, 2)) / 3
  let hmin = Infinity, hmax = -Infinity, headBins = 0
  for (let i = Math.floor(BINS * 0.6); i < BINS; i++) {
    hmin = Math.min(hmin, at(bmin, i))
    hmax = Math.max(hmax, at(bmax, i))
    if (at(width, i) > hw * 1.5) headBins++
  }
  const above = Math.max(0, hmax - hc)
  const below = Math.max(0, hc - hmin)
  const asymmetry = above + below > 0 ? Math.abs(above - below) / (above + below) : 0
  const headAspect = (hmax - hmin) / Math.max(binLen, headBins * binLen)
  const midCenter = avg(center, 4, 8)
  const endsCenter = (avg(center, 0, 2) + avg(center, BINS - 2, BINS)) / 2
  const curvature = Math.min(1, Math.abs(midCenter - endsCenter) / L)
  const headDirAngle = angle
  return { angle: headDirAngle, us, umin, umax, L, W, handleAtStart, tipRatio, peakPos, headAspect, asymmetry, curvature }
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000
}

const band = (v: number, lo: number, hi: number, soft = 0.5) => {
  if (v >= lo && v <= hi) return 1
  const d = v < lo ? (lo - v) / Math.max(0.01, lo * soft) : (v - hi) / Math.max(0.01, hi * soft)
  return Math.max(0, 1 - d)
}

export function classify(f: WeaponFeatures): { type: WeaponType; confidence: number; scores: Record<WeaponType, number> } {
  const e = f.elongation
  const scores = Object.fromEntries(WEAPON_TYPES.map((t) => [t, 0])) as Record<WeaponType, number>
  if (!f.ok) return { type: 'freeform', confidence: 0, scores }
  const twin = f.secondComponentRatio > 0.45 ? 1 : 0
  const bigHead = band(f.headRatio, 1.9, 50, 0.3)
  const noHead = band(f.headRatio, 0, 1.6, 0.4)
  const guard = band(f.peakPos, 0, 0.5, 0.3)
  const tipPeak = band(f.peakPos, 0.65, 1, 0.3)
  scores.shield = band(e, 1, 1.5, 0.3) * band(f.fillRatio, 0.55, 1)
  scores.special = band(e, 1, 1.8, 0.3) * band(f.fillRatio, 0, 0.55, 0.3) * 0.9
  scores.bow = band(f.curvature, 0.1, 1, 0.4) * band(f.fillRatio, 0, 0.45, 0.4) * band(e, 2, 30)
  scores.hammer = bigHead * band(f.asymmetry, 0, 0.35, 0.6) * band(f.headAspect, 1.35, 20, 0.3) * band(e, 1.6, 8)
  scores.staff = bigHead * band(f.asymmetry, 0, 0.35, 0.6) * band(f.headAspect, 0, 1.35, 0.3) * band(e, 3, 40) * band(f.size, 0.55, 2, 0.3)
  scores.axe = bigHead * band(f.asymmetry, 0.35, 1, 0.4) * band(e, 2.7, 12) * band(f.curvature, 0, 0.09, 0.5)
  scores.scythe = band(f.headRatio, 1.4, 50, 0.3) * band(f.asymmetry, 0.5, 1, 0.3) * band(f.curvature, 0.06, 1, 0.5) * band(e, 2.2, 30)
  scores.gun = bigHead * band(f.asymmetry, 0.3, 1, 0.4) * band(e, 1.5, 2.7, 0.3) * band(f.size, 0.3, 0.75) * band(f.fillRatio, 0.4, 1, 0.3)
  scores.spear = tipPeak * band(e, 5, 50, 0.3) * band(f.headRatio, 1.1, 2.2, 0.3) * band(f.size, 0.7, 1.5)
  const blade = (guard * 0.6 + noHead * 0.4) * band(e, 2, 40, 0.3) * band(f.curvature, 0, 0.08, 0.5)
  scores.dagger = blade * band(f.size, 0, 0.48, 0.15)
  scores.sword = blade * band(f.size, 0.48, 0.8, 0.15)
  scores.longsword = blade * band(f.size, 0.8, 1.5, 0.15)
  scores.twinblades = twin * band(e, 2, 30) * 1.5
  scores.freeform = 0.3
  const sorted = (Object.entries(scores) as [WeaponType, number][]).sort((a, b) => b[1] - a[1])
  const [best, second] = sorted
  const confidence = Math.max(0, Math.min(1, best[1] - second[1] * 0.5))
  return { type: best[0], confidence: round3(confidence), scores }
}

const TYPICAL_SIZE: Partial<Record<WeaponType, number>> = {
  dagger: 0.38, sword: 0.68, longsword: 0.92, spear: 0.95, staff: 0.85, gun: 0.6, bow: 0.8, shield: 0.6,
}

const STAT_KEYS = ['attack', 'speed', 'area', 'range', 'weight', 'defense'] as const

/**
 * Stats come from weapon type plus drawing shape, then get renormalised to the type's
 * power budget so a bigger or thicker drawing trades one stat for another instead of
 * simply being stronger.
 */
export function computeStats(type: WeaponType, f: WeaponFeatures, thickness: number): WeaponStats {
  const info = WEAPON_INFO[type]
  const base = { ...info.base }
  const clamp = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v))
  const sizeM = f.ok ? clamp((f.size - (TYPICAL_SIZE[type] ?? 0.7)) / 0.4) : 0
  const thickM = f.ok ? clamp((f.widthRatio - 0.25) / 0.25) : 0
  const headM = f.ok ? clamp((f.headRatio - 1.5) / 1.5) : 0
  const thickP = clamp((Math.max(0.5, Math.min(1.5, thickness)) - 1) * 2)

  const s: Record<(typeof STAT_KEYS)[number], number> = {
    attack: base.attack + 6 * headM + 4 * sizeM,
    speed: base.speed - 6 * sizeM - 5 * headM - 4 * thickP - 3 * thickM,
    area: base.area + 5 * sizeM + 4 * headM,
    range: base.range + 8 * sizeM,
    weight: base.weight + 6 * sizeM + 5 * thickP + 4 * thickM + 3 * headM,
    defense: base.defense + 5 * thickM + 5 * thickP,
  }
  const power = (x: typeof s) => x.attack + x.speed + x.area + x.range + x.defense - x.weight * 0.5
  const diff = power(s) - power(base)
  const pos = ['attack', 'speed', 'area', 'range', 'defense'] as const
  const posSum = pos.reduce((a, k) => a + s[k], 0)
  for (const k of pos) s[k] -= (diff * s[k]) / posSum
  const out = {} as WeaponStats
  for (const k of STAT_KEYS) out[k] = Math.round(Math.max(5, Math.min(95, s[k])))
  out.special = info.special
  return out
}

export function specialBonus(tools: string[]): number {
  return tools.reduce((m, t) => Math.max(m, TOOL_BY_ID[t]?.specialBonus ?? 0), 0)
}

/** Rotation that stands the drawing's long axis upright with the handle at the bottom. */
export function autoModelParams(f: WeaponFeatures): ModelParams {
  // In canvas coords y grows downward; we want the head direction to point to -y (up on paper).
  const headDir = f.handleAtStart ? f.angle : f.angle + Math.PI
  let angle = -Math.PI / 2 - headDir
  angle = Math.atan2(Math.sin(angle), Math.cos(angle))
  return { angle: round3(angle), flip: false, thickness: 1, scale: 1 }
}

export function sanitizeModelParams(p: unknown, fallback: ModelParams): ModelParams {
  const o = (p && typeof p === 'object' ? p : {}) as Partial<ModelParams>
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d
  return {
    angle: num(o.angle, -Math.PI, Math.PI, fallback.angle),
    flip: typeof o.flip === 'boolean' ? o.flip : fallback.flip,
    thickness: num(o.thickness, 0.5, 1.5, fallback.thickness),
    scale: num(o.scale, 0.7, 1.3, fallback.scale),
  }
}

/** Combat numbers derived from stats; used by the server simulation and client HUD. */
export function combatProfile(type: WeaponType, st: Omit<WeaponStats, 'special'>, bonus = 0) {
  const info = WEAPON_INFO[type]
  const ranged = info.style !== 'melee'
  return {
    style: info.style,
    // Tuned so a 2v2 lasts roughly 30–90s with HP 100 (bot simulations ended in ~10s at 7 + 0.2×attack).
    damage: 2.5 + st.attack * 0.075,
    cooldown: Math.max(0.35, 1.15 - st.speed * 0.0075),
    reach: info.reach * (0.85 + st.range * 0.004),
    arc: ((55 + st.area * 1.1) * Math.PI) / 180,
    moveMul: 1.1 - st.weight * 0.0032,
    blockReduce: Math.min(0.85, 0.3 + st.defense * 0.0058),
    projectileSpeed: type === 'bow' ? 26 : type === 'gun' ? 34 : 18,
    projectileRange: ranged ? 10 + st.range * 0.22 : 0,
    magazine: type === 'gun' ? 8 : type === 'bow' ? 6 : 0,
    reloadSec: type === 'gun' ? 1.8 : type === 'bow' ? 1.6 : 0,
    specialRate: 1 + bonus,
  }
}

/** Creates a deterministic sample drawing for bots, starter weapons and the codex. */
export function presetStrokes(type: WeaponType, color = '#9aa0a6', accent = '#8b5a2b'): Stroke[] {
  const polys = presetShapes(type)
  const strokes: Stroke[] = []
  polys.forEach((poly, i) => {
    const fill = i === 0 ? color : accent
    strokes.push(...hatch(poly.pts, fill))
    const p: number[] = []
    for (const [x, y] of [...poly.pts, poly.pts[0]]) p.push(Math.round(x), Math.round(y), 50)
    strokes.push({ t: 'ballpoint', c: '#111111', w: 6, p })
  })
  return strokes
}

function hatch(pts: [number, number][], color: string): Stroke[] {
  const ys = pts.map((p) => p[1])
  const out: Stroke[] = []
  for (let y = Math.min(...ys) + 6; y < Math.max(...ys); y += 9) {
    const xs: number[] = []
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (xs[k + 1] - xs[k] < 2) continue
      out.push({ t: 'ballpoint', c: color, w: 10, p: [Math.round(xs[k]), Math.round(y), 50, Math.round(xs[k + 1]), Math.round(y), 50] })
    }
  }
  return out
}

function presetShapes(type: WeaponType): { pts: [number, number][] }[] {
  const rect = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const circle = (cx: number, cy: number, r: number, n = 20): [number, number][] =>
    Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number])
  switch (type) {
    case 'sword':
      return [{ pts: [[500, 170], [540, 240], [540, 620], [460, 620], [460, 240]] }, { pts: rect(390, 620, 220, 40) }, { pts: rect(475, 660, 50, 150) }]
    case 'longsword':
      return [{ pts: [[500, 60], [535, 130], [535, 680], [465, 680], [465, 130]] }, { pts: rect(400, 680, 200, 36) }, { pts: rect(478, 716, 44, 200) }]
    case 'dagger':
      return [{ pts: [[500, 330], [535, 400], [530, 560], [470, 560], [465, 400]] }, { pts: rect(430, 560, 140, 30) }, { pts: rect(478, 590, 44, 100) }]
    case 'gun':
      return [{ pts: [[250, 400], [720, 400], [720, 470], [420, 470], [420, 640], [330, 640], [330, 470], [250, 470]] }, { pts: rect(700, 410, 60, 30) }]
    case 'bow': {
      const arc: [number, number][] = []
      for (let i = 0; i <= 16; i++) {
        const a = -Math.PI / 2.4 + (i / 16) * (Math.PI / 1.2)
        arc.push([380 + Math.cos(a) * 300, 500 + Math.sin(a) * 380])
      }
      for (let i = 16; i >= 0; i--) {
        const a = -Math.PI / 2.4 + (i / 16) * (Math.PI / 1.2)
        arc.push([380 + Math.cos(a) * 260, 500 + Math.sin(a) * 340])
      }
      return [{ pts: arc }, { pts: rect(470, 470, 50, 60) }]
    }
    case 'spear':
      return [{ pts: [[500, 60], [550, 190], [500, 230], [450, 190]] }, { pts: rect(482, 230, 36, 700) }]
    case 'axe':
      return [{ pts: [[510, 180], [720, 120], [760, 300], [700, 420], [510, 360]] }, { pts: rect(470, 150, 46, 760) }]
    case 'hammer':
      return [{ pts: rect(330, 150, 340, 200) }, { pts: rect(475, 350, 50, 560) }]
    case 'shield':
      return [{ pts: [[260, 220], [740, 220], [740, 560], [500, 820], [260, 560]] }, { pts: circle(500, 470, 80) }]
    case 'staff':
      return [{ pts: circle(500, 180, 110) }, { pts: rect(482, 290, 36, 640) }]
    case 'scythe':
      return [{ pts: [[520, 140], [820, 200], [860, 340], [780, 270], [520, 230]] }, { pts: rect(480, 140, 40, 780) }]
    case 'twinblades':
      return [
        { pts: [[300, 200], [340, 260], [340, 620], [260, 620], [260, 260]] },
        { pts: [[700, 200], [740, 260], [740, 620], [660, 620], [660, 260]] },
        { pts: rect(275, 620, 50, 130) },
        { pts: rect(675, 620, 50, 130) },
      ]
    case 'special':
      return [{ pts: Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 140 : 300
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        return [500 + Math.cos(a) * r, 420 + Math.sin(a) * r] as [number, number]
      }) }, { pts: rect(475, 600, 50, 300) }]
    default:
      return [{ pts: [[500, 150], [620, 300], [560, 650], [440, 650], [380, 300]] }, { pts: rect(470, 650, 60, 220) }]
  }
}
