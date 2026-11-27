import { useAuth } from '@/stores/auth'

let ctx: AudioContext | null = null

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function volume() {
  const v = useAuth.getState().user?.settings?.sfx ?? 80
  return Math.max(0, Math.min(100, v)) / 100
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', delay = 0, gain = 0.2, slideTo?: number) {
  const a = audio()
  const vol = volume() * gain
  if (!a || vol <= 0) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

// ── background music: a soft looping pentatonic tune generated on the fly ──
const MELODY = [0, 4, 7, 9, 12, 9, 7, 4, 2, 5, 9, 12, 14, 12, 9, 5]
const ROOTS = [261.63, 220, 174.61, 196]
let bgmTimer: ReturnType<typeof setInterval> | null = null
let bgmStep = 0

function bgmVolume() {
  const v = useAuth.getState().user?.settings?.bgm ?? 60
  return Math.max(0, Math.min(100, v)) / 100
}

export function startBgm() {
  if (bgmTimer || bgmVolume() <= 0) return
  bgmTimer = setInterval(() => {
    const vol = bgmVolume()
    if (vol <= 0) return stopBgm()
    const root = ROOTS[Math.floor(bgmStep / 16) % ROOTS.length]
    const note = root * Math.pow(2, MELODY[bgmStep % 16] / 12)
    const a = audio()
    if (a) {
      const t = a.currentTime
      const o = a.createOscillator()
      const g = a.createGain()
      o.type = 'triangle'
      o.frequency.value = note
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.035 * vol, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      o.connect(g).connect(a.destination)
      o.start(t)
      o.stop(t + 0.5)
    }
    bgmStep++
  }, 260)
}

export function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer)
  bgmTimer = null
}

export const sfx = {
  click: () => tone(660, 0.07, 'triangle', 0, 0.12),
  coin: () => { tone(988, 0.08, 'square', 0, 0.08); tone(1319, 0.18, 'square', 0.07, 0.08) },
  success: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', i * 0.09, 0.15)),
  error: () => tone(220, 0.22, 'sawtooth', 0, 0.08, 150),
  levelUp: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.11, 0.18)),
  hit: () => tone(180, 0.12, 'square', 0, 0.12, 80),
  swing: () => tone(400, 0.12, 'sawtooth', 0, 0.05, 900),
  shoot: () => tone(900, 0.1, 'square', 0, 0.06, 300),
  draw: () => tone(1200 + Math.random() * 200, 0.03, 'sine', 0, 0.02),
}
