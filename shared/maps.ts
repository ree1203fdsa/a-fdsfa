export interface CircleObstacle { kind: 'circle'; x: number; z: number; r: number; h: number; style: string }
export interface BoxObstacle { kind: 'box'; x: number; z: number; w: number; d: number; h: number; style: string }
export type Obstacle = CircleObstacle | BoxObstacle

export interface MapDef {
  id: string
  name: string
  desc: string
  emoji: string
  /** Playable area is a square from -half..half on X and Z. */
  half: number
  friction: number
  /** Zones that behave like ice (low friction). */
  iceZones: { x: number; z: number; r: number }[]
  obstacles: Obstacle[]
  spawns: { RED: [number, number][]; BLUE: [number, number][] }
  theme: { ground: string; ground2: string; sky: [string, string]; fog: string; light: string; wall: string }
}

const sym = (list: Obstacle[]): Obstacle[] => list.flatMap((o) => (o.x === 0 && o.z === 0 ? [o] : [o, { ...o, x: -o.x, z: -o.z }]))

export const MAPS: Record<string, MapDef> = {
  arena: {
    id: 'arena', name: '기본 전투장', desc: '넓은 평지와 가운데 장애물. 연습하기 좋아요.', emoji: '🏟️', half: 18, friction: 12, iceZones: [],
    obstacles: [
      { kind: 'box', x: 0, z: 0, w: 4, d: 4, h: 2.2, style: 'stone' },
      ...sym([
        { kind: 'circle', x: 7, z: 6, r: 1.1, h: 3, style: 'pillar' },
        { kind: 'circle', x: -7, z: 6, r: 1.1, h: 3, style: 'pillar' },
        { kind: 'box', x: 10, z: 0, w: 1.2, d: 5, h: 1.4, style: 'stone' },
      ]),
    ],
    spawns: { RED: [[-3, 14], [3, 14]], BLUE: [[3, -14], [-3, -14]] },
    theme: { ground: '#6a73b0', ground2: '#5a629c', sky: ['#4f7cff', '#b9d4ff'], fog: '#9fb6ff', light: '#fff3dc', wall: '#565f97' },
  },
  forest: {
    id: 'forest', name: '숲', desc: '나무와 바위 사이에 숨어서 싸워요.', emoji: '🌲', half: 20, friction: 12, iceZones: [],
    obstacles: sym([
      { kind: 'circle', x: 0, z: 0, r: 1.6, h: 6, style: 'bigtree' },
      { kind: 'circle', x: 5, z: 4, r: 0.8, h: 5, style: 'tree' },
      { kind: 'circle', x: -6, z: 7, r: 0.8, h: 5, style: 'tree' },
      { kind: 'circle', x: 10, z: 9, r: 0.8, h: 5, style: 'tree' },
      { kind: 'circle', x: 13, z: -3, r: 0.8, h: 5, style: 'tree' },
      { kind: 'circle', x: -12, z: 3, r: 1.4, h: 1.6, style: 'rock' },
      { kind: 'circle', x: 3, z: 11, r: 1.2, h: 1.4, style: 'rock' },
      { kind: 'box', x: 8, z: -1, w: 3.5, d: 1.2, h: 1.2, style: 'log' },
    ]),
    spawns: { RED: [[-3, 16], [3, 16]], BLUE: [[3, -16], [-3, -16]] },
    theme: { ground: '#4f9a4f', ground2: '#438a43', sky: ['#5aa8ff', '#d8f0ff'], fog: '#bfe6c8', light: '#fff6d6', wall: '#2f6b33' },
  },
  desert: {
    id: 'desert', name: '사막', desc: '모래 위 작은 건물 사이의 넓은 전투장.', emoji: '🏜️', half: 22, friction: 10, iceZones: [],
    obstacles: sym([
      { kind: 'box', x: 0, z: 0, w: 5, d: 5, h: 3.2, style: 'house' },
      { kind: 'box', x: 11, z: 6, w: 4, d: 3, h: 2.6, style: 'house' },
      { kind: 'circle', x: -8, z: 9, r: 1.6, h: 1.8, style: 'rock' },
      { kind: 'circle', x: 15, z: -6, r: 0.5, h: 3, style: 'cactus' },
      { kind: 'circle', x: 5, z: 13, r: 0.5, h: 3, style: 'cactus' },
    ]),
    spawns: { RED: [[-3, 18], [3, 18]], BLUE: [[3, -18], [-3, -18]] },
    theme: { ground: '#e3c27a', ground2: '#d6b066', sky: ['#ff9f5a', '#ffe7b8'], fog: '#f5d9a6', light: '#fff0c8', wall: '#c48f4d' },
  },
  ice: {
    id: 'ice', name: '얼음', desc: '미끄러운 얼음 바닥! 멈추기 어려워요.', emoji: '❄️', half: 18, friction: 9,
    iceZones: [{ x: 0, z: 0, r: 7 }, { x: 10, z: -8, r: 4 }, { x: -10, z: 8, r: 4 }],
    obstacles: sym([
      { kind: 'circle', x: 0, z: 0, r: 1.2, h: 3.5, style: 'crystal' },
      { kind: 'box', x: 7, z: 4, w: 2.5, d: 2.5, h: 2, style: 'iceblock' },
      { kind: 'box', x: -11, z: -2, w: 1.5, d: 4, h: 1.8, style: 'iceblock' },
      { kind: 'circle', x: 4, z: 11, r: 1, h: 2.6, style: 'crystal' },
    ]),
    spawns: { RED: [[-3, 14], [3, 14]], BLUE: [[3, -14], [-3, -14]] },
    theme: { ground: '#dff3ff', ground2: '#c9e9fb', sky: ['#7fb8ff', '#eaf6ff'], fog: '#d6ecff', light: '#ffffff', wall: '#9fd2f5' },
  },
  space: {
    id: 'space', name: '우주', desc: '빛나는 우주 정거장 위의 결투.', emoji: '🚀', half: 18, friction: 12, iceZones: [],
    obstacles: sym([
      { kind: 'circle', x: 0, z: 0, r: 1.8, h: 2.5, style: 'reactor' },
      { kind: 'box', x: 8, z: 5, w: 1.2, d: 6, h: 2.2, style: 'panel' },
      { kind: 'circle', x: -6, z: 10, r: 0.9, h: 4, style: 'beacon' },
      { kind: 'box', x: 12, z: -6, w: 3, d: 3, h: 1.6, style: 'crate' },
    ]),
    spawns: { RED: [[-3, 14], [3, 14]], BLUE: [[3, -14], [-3, -14]] },
    theme: { ground: '#2a2f55', ground2: '#323866', sky: ['#05051a', '#1a1145'], fog: '#120c35', light: '#c8d0ff', wall: '#5a62ff' },
  },
}

export const MAP_IDS = Object.keys(MAPS)

export function onIce(map: MapDef, x: number, z: number) {
  return map.iceZones.some((zn) => (x - zn.x) ** 2 + (z - zn.z) ** 2 < zn.r * zn.r)
}

/** Pushes a circle (player) out of obstacles and map walls. Returns the corrected position. */
export function resolveCollisions(map: MapDef, x: number, z: number, radius: number, y = 0): [number, number] {
  const lim = map.half - radius
  x = Math.max(-lim, Math.min(lim, x))
  z = Math.max(-lim, Math.min(lim, z))
  for (const o of map.obstacles) {
    if (y > o.h) continue
    if (o.kind === 'circle') {
      const dx = x - o.x, dz = z - o.z
      const d = Math.hypot(dx, dz)
      const min = o.r + radius
      if (d < min) {
        const k = d > 1e-4 ? min / d : 1
        x = o.x + (d > 1e-4 ? dx * k : min)
        z = o.z + (d > 1e-4 ? dz * k : 0)
      }
    } else {
      const hx = o.w / 2, hz = o.d / 2
      const cx = Math.max(o.x - hx, Math.min(o.x + hx, x))
      const cz = Math.max(o.z - hz, Math.min(o.z + hz, z))
      const dx = x - cx, dz = z - cz
      const d = Math.hypot(dx, dz)
      if (d < radius) {
        if (d > 1e-4) {
          x = cx + (dx / d) * radius
          z = cz + (dz / d) * radius
        } else {
          // Centre inside the box: push out along the shallowest side.
          const pushes = [[o.x - hx - radius - x, 0], [o.x + hx + radius - x, 0], [0, o.z - hz - radius - z], [0, o.z + hz + radius - z]]
          pushes.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])))
          x += pushes[0][0]
          z += pushes[0][1]
        }
      }
    }
  }
  return [x, z]
}

/** True if the straight segment between two points crosses an obstacle taller than `y`. */
export function segmentBlocked(map: MapDef, x0: number, z0: number, x1: number, z1: number, y = 1): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t
    for (const o of map.obstacles) {
      if (y > o.h) continue
      if (o.kind === 'circle' ? (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r : Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2) return true
    }
  }
  return false
}
