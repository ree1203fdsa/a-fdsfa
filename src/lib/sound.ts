import { useAuth } from '@/stores/auth'
import { guestPrefs } from './guestPrefs'
import { playMusic, setMusicVolume, stopMusic, type TrackName } from './music'

let ctx: AudioContext | null = null

export function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function volume() {
  const user = useAuth.getState().user
  if (!user) return guestPrefs().sound ? 0.8 : 0
  const v = user.settings?.sfx ?? 80
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

// ── background music lives in music.ts; these wrappers keep the volume tied to settings ──
function bgmVolume() {
  const user = useAuth.getState().user
  if (!user) return guestPrefs().sound ? 0.5 : 0
  const v = user.settings?.bgm ?? 60
  return Math.max(0, Math.min(100, v)) / 100
}

/** Starts or switches the background song (call after a user gesture). */
export function startBgm(track: TrackName = 'lobby') {
  const vol = bgmVolume()
  if (vol <= 0) return stopMusic()
  const a = audio()
  if (a) playMusic(a, track, vol)
}

export function stopBgm() {
  stopMusic()
}

export { setMusicVolume }

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
