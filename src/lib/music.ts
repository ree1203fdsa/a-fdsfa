/**
 * Background music, synthesised live with Web Audio (no audio files).
 * Three original songs: a bright lobby theme, a driving battle theme and a calm workshop theme.
 * Each song is a set of bars (chord + melody line); a lookahead scheduler plays drums, bass,
 * chords, arpeggio and lead on a 16th-note grid, with a soft echo and a limiter on the master bus.
 */

export type TrackName = 'lobby' | 'battle' | 'workshop'

// ───────────────────────── note helpers ─────────────────────────

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }
const midiOf = (n: string) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(n)
  if (!m) throw new Error(`bad note ${n}`)
  return NOTE[m[1]] + (Number(m[2]) + 1) * 12
}
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
const chord = (s: string) => s.split(' ').map(midiOf)

interface NoteEv { s: number; midi: number; len: number }
/** "E5 - G5 . ..." → notes on a 16-step bar ("-" holds, "." rests). */
function line(bar: string): NoteEv[] {
  const tok = bar.trim().split(/\s+/)
  if (tok.length !== 16) throw new Error(`bar needs 16 steps: ${bar}`)
  const out: NoteEv[] = []
  tok.forEach((t, i) => {
    if (t === '-' || t === '.') return
    let len = 1
    while (tok[i + len] === '-') len++
    out.push({ s: i, midi: midiOf(t), len })
  })
  return out
}

// ───────────────────────── songs ─────────────────────────

interface Song {
  bpm: number
  swing: number
  chords: number[][]
  melody: NoteEv[][]
  /** Which parts play, per 8-bar (or 4-bar) pass of the loop. */
  sections: { lead: boolean; arp: boolean; drums: 0 | 1 | 2 }[]
  play: (p: Player, step: number, bar: number, sec: Song['sections'][number], t: number) => void
}

const SONGS: Record<TrackName, Song> = {
  // Bright, bouncy casual theme in C major.
  lobby: {
    bpm: 112,
    swing: 0.08,
    chords: ['C4 E4 G4', 'B3 D4 G4', 'C4 E4 A4', 'C4 F4 A4', 'C4 E4 G4', 'B3 D4 G4', 'C4 F4 A4', 'B3 D4 G4'].map(chord),
    melody: [
      'E5 - G5 - C6 - - - B5 - G5 - E5 - - -',
      'D5 - - - G5 - B5 - D6 - - - B5 - A5 -',
      'C6 - - - B5 - A5 - E5 - - - A5 - C6 -',
      'A5 - - - - - G5 - F5 - - - . . . .',
      'E5 - G5 - C6 - E6 - D6 - C6 - G5 - - -',
      'B5 - D6 - - - B5 - G5 - A5 - B5 - - -',
      'C6 - - - A5 - F5 - A5 - C6 - F6 - - -',
      'E6 - D6 - - - B5 - D6 - - - . . . .',
    ].map(line),
    sections: [
      { lead: false, arp: true, drums: 1 },
      { lead: true, arp: false, drums: 2 },
      { lead: true, arp: true, drums: 2 },
      { lead: false, arp: true, drums: 2 },
    ],
    play(p, s, bar, sec, t) {
      const ch = this.chords[bar % 8]
      const bassRoot = midiOf(['C2', 'G2', 'A2', 'F2', 'C2', 'G2', 'F2', 'G2'][bar % 8])
      if (sec.drums) {
        if (s === 0 || s === 8 || (sec.drums === 2 && s === 10)) p.kick(t, 0.9)
        if (s === 4 || s === 12) p.snare(t, 0.55)
        if (s % 2 === 0) p.hat(t, s % 4 === 0 ? 0.22 : 0.14, false)
        if (sec.drums === 2 && s === 14) p.hat(t, 0.18, true)
      }
      if ([0, 3, 6, 8, 11, 14].includes(s)) p.bass(t, s === 14 ? bassRoot + 7 : bassRoot + (s === 8 ? 12 : 0), 0.18, 0.5)
      if (s === 0) p.pad(t, ch, p.bar * 0.98, 0.09)
      if (sec.arp) {
        const notes = [...ch, ch[0] + 12]
        p.pluck(t, notes[[0, 1, 2, 3, 2, 1][s % 6] ?? 0] + 12, 0.12, s % 4 === 0 ? 0.13 : 0.08)
      }
      if (sec.lead) for (const n of this.melody[bar % 8]) if (n.s === s) p.lead(t, n.midi - 12, n.len * p.step, 0.17, 'square')
    },
  },

  // Driving minor-key battle theme.
  battle: {
    bpm: 148,
    swing: 0,
    chords: ['A3 C4 E4', 'A3 C4 F4', 'G3 C4 E4', 'G3 B3 D4', 'A3 C4 E4', 'A3 C4 F4', 'G3 B3 D4', 'G#3 B3 E4'].map(chord),
    melody: [
      'A4 - C5 - E5 - A5 - G5 - E5 - C5 - D5 -',
      'C5 - - - A4 - C5 - F5 - - - E5 - C5 -',
      'E5 - G5 - C6 - - - B5 - G5 - E5 - G5 -',
      'D5 - - - B4 - D5 - G5 - - - - - . .',
      'A5 - G5 - E5 - A5 - C6 - B5 - A5 - E5 -',
      'F5 - - - C5 - F5 - A5 - G5 - F5 - E5 -',
      'D5 - G5 - B5 - D6 - - - B5 - G5 - D5 -',
      'E5 - - - G#5 - B5 - E6 - - - - - - -',
    ].map(line),
    sections: [
      { lead: false, arp: true, drums: 1 },
      { lead: true, arp: false, drums: 2 },
      { lead: true, arp: true, drums: 2 },
    ],
    play(p, s, bar, sec, t) {
      const b = bar % 8
      const roots = ['A1', 'F1', 'C2', 'G1', 'A1', 'F1', 'G1', 'E1'].map(midiOf)
      const root = roots[b]
      if (s === 0 && b === 0) p.crash(t, 0.35)
      if (sec.drums) {
        if (s % 4 === 0 || (sec.drums === 2 && s === 7)) p.kick(t, 1)
        if (s === 4 || s === 12) p.snare(t, 0.7)
        if (sec.drums === 2 && b === 7 && s >= 12) p.snare(t, 0.35 + (s - 12) * 0.1)
        p.hat(t, s % 2 === 0 ? 0.16 : 0.08, sec.drums === 2 && s % 4 === 2)
      }
      if (s % 2 === 0) p.bass(t, root + (s % 4 === 2 ? 12 : 0), 0.12, 0.55)
      if ([0, 6, 10].includes(s)) p.pad(t, this.chords[b], p.step * 2.5, 0.08)
      if (sec.arp && s % 2 === 1) p.pluck(t, this.chords[b][(s >> 1) % 3] + 12, 0.08, 0.08)
      if (sec.lead) for (const n of this.melody[b]) if (n.s === s) p.lead(t, n.midi, n.len * p.step, 0.14, 'sawtooth')
    },
  },

  // Calm, warm workshop theme with jazzy 7th chords.
  workshop: {
    bpm: 88,
    swing: 0.12,
    chords: ['F3 A3 C4 E4', 'E3 G3 B3 D4', 'D3 F3 A3 C4', 'C3 E3 G3 B3'].map(chord),
    melody: [
      'A5 - - - C6 - - - E6 - - - - - - -',
      'D6 - - - B5 - - - G5 - - - - - . .',
      'F5 - A5 - C6 - - - A5 - - - F5 - - -',
      'E5 - - - G5 - - - - - - - . . . .',
    ].map(line),
    sections: [
      { lead: false, arp: true, drums: 1 },
      { lead: true, arp: true, drums: 1 },
      { lead: true, arp: false, drums: 1 },
      { lead: false, arp: true, drums: 0 },
    ],
    play(p, s, bar, sec, t) {
      const ch = this.chords[bar % 4]
      if (sec.drums) {
        if (s === 0 || s === 10) p.kick(t, 0.5)
        if (s === 12) p.snare(t, 0.2)
        if (s % 2 === 0) p.hat(t, 0.07, false)
      }
      if (s === 0 || s === 10) p.bass(t, ch[0] - 12, p.step * (s === 0 ? 8 : 5), 0.45, 'sine')
      if (s === 0 || s === 7) p.keys(t, ch, p.step * 6, 0.1)
      if (sec.arp && s % 3 === 0) p.keys(t, [ch[(s / 3) % ch.length] + 12], p.step * 2, 0.05)
      if (sec.lead) for (const n of this.melody[bar % 4]) if (n.s === s) p.lead(t, n.midi - 12, n.len * p.step, 0.1, 'triangle')
    },
  },
}

// ───────────────────────── synth ─────────────────────────

class Player {
  readonly ctx: AudioContext
  readonly out: GainNode
  readonly echo: GainNode
  private noise: AudioBuffer
  step = 0.125
  bar = 2

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.ratio.value = 8
    limiter.connect(ctx.destination)
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(limiter)

    // soft dotted-8th echo for lead / plucks
    this.echo = ctx.createGain()
    this.echo.gain.value = 0.28
    const delay = ctx.createDelay(1)
    const fb = ctx.createGain()
    fb.gain.value = 0.3
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2600
    this.echo.connect(delay).connect(tone).connect(fb).connect(delay)
    tone.connect(this.out)
    this.delay = delay

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  readonly delay: DelayNode

  private env(t: number, peak: number, attack: number, decay: number, to: AudioNode = this.out) {
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    g.connect(to)
    return g
  }
  private osc(type: OscillatorType, freq: number, t: number, end: number, to: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.detune.value = detune
    o.connect(to)
    o.start(t)
    o.stop(end)
    return o
  }
  private noiseHit(t: number, dur: number, filter: BiquadFilterType, freq: number, peak: number) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = freq
    src.connect(f).connect(this.env(t, peak, 0.002, dur))
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur + 0.05)
  }

  kick(t: number, v: number) {
    const g = this.env(t, v, 0.003, 0.32)
    const o = this.osc('sine', 150, t, t + 0.4, g)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
  }
  snare(t: number, v: number) {
    this.noiseHit(t, 0.16, 'highpass', 1400, v * 0.6)
    this.osc('triangle', 190, t, t + 0.12, this.env(t, v * 0.4, 0.002, 0.09))
  }
  hat(t: number, v: number, open: boolean) {
    this.noiseHit(t, open ? 0.22 : 0.035, 'highpass', 7500, v)
  }
  crash(t: number, v: number) {
    this.noiseHit(t, 1.4, 'highpass', 4500, v)
  }
  bass(t: number, midi: number, dur: number, v: number, type: OscillatorType = 'sawtooth') {
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 5
    f.frequency.setValueAtTime(1100, t)
    f.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.08, dur))
    f.connect(this.env(t, v * 0.5, 0.006, dur + 0.06))
    this.osc(type, hz(midi), t, t + dur + 0.12, f)
  }
  pad(t: number, notes: number[], dur: number, v: number) {
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 1500
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v / notes.length, t + Math.min(0.25, dur * 0.3))
    g.gain.setValueAtTime(v / notes.length, t + dur * 0.8)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(this.out)
    for (const n of notes) for (const det of [-7, 7]) this.osc('sawtooth', hz(n), t, t + dur + 0.05, f, det)
  }
  pluck(t: number, midi: number, dur: number, v: number) {
    const g = this.env(t, v, 0.003, dur + 0.12)
    g.connect(this.echo)
    this.osc('triangle', hz(midi), t, t + dur + 0.2, g)
  }
  keys(t: number, notes: number[], dur: number, v: number) {
    for (const n of notes) {
      const g = this.env(t, v / Math.sqrt(notes.length), 0.004, dur)
      g.connect(this.echo)
      this.osc('sine', hz(n), t, t + dur + 0.1, g)
      this.osc('sine', hz(n) * 2, t, t + 0.3, this.env(t, (v * 0.35) / notes.length, 0.002, 0.25))
    }
  }
  lead(t: number, midi: number, dur: number, v: number, type: OscillatorType) {
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = type === 'sawtooth' ? 3200 : 2400
    const g = this.ctx.createGain()
    const hold = Math.max(0.06, dur - 0.04)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v, t + 0.015)
    g.gain.setValueAtTime(v * 0.8, t + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.12)
    f.connect(g)
    g.connect(this.out)
    g.connect(this.echo)
    const o = this.osc(type, hz(midi), t, t + hold + 0.15, f)
    if (dur > 0.25) {
      // gentle vibrato on held notes
      const lfo = this.ctx.createOscillator()
      const depth = this.ctx.createGain()
      lfo.frequency.value = 5.5
      depth.gain.setValueAtTime(0, t)
      depth.gain.linearRampToValueAtTime(hz(midi) * 0.006, t + 0.25)
      lfo.connect(depth).connect(o.frequency)
      lfo.start(t)
      lfo.stop(t + hold + 0.15)
    }
  }
}

// ───────────────────────── scheduler ─────────────────────────

let player: Player | null = null
let timer: ReturnType<typeof setInterval> | null = null
let current: TrackName | null = null
let pending: TrackName | null = null
let switching = false
let stepNo = 0
let nextTime = 0
let level = 0.6

function songFor(name: TrackName) {
  return SONGS[name]
}

function tick() {
  if (!player || !current || switching) return
  const ctx = player.ctx
  const song = songFor(current)
  const step = 60 / song.bpm / 4
  player.step = step
  player.bar = step * 16
  const barsPerSection = song.chords.length
  while (nextTime < ctx.currentTime + 0.15) {
    const s = stepNo % 16
    const barNo = Math.floor(stepNo / 16)
    // switch songs on a bar line so the change sounds musical
    if (pending && s === 0) {
      fadeTo(0, 0.5)
      const next = pending
      pending = null
      switching = true
      setTimeout(() => {
        switching = false
        current = next
        stepNo = 0
        if (player) nextTime = player.ctx.currentTime + 0.05
        fadeTo(level, 1.2)
      }, 550)
      return
    }
    const sec = song.sections[Math.floor(barNo / barsPerSection) % song.sections.length]
    const t = nextTime + (s % 2 === 1 ? song.swing * step : 0)
    try {
      song.play.call(song, player, s, barNo, sec, t)
    } catch { /* never let a bad note stop the music */ }
    nextTime += step
    stepNo++
  }
}

function fadeTo(v: number, sec: number) {
  if (!player) return
  const g = player.out.gain
  const now = player.ctx.currentTime
  g.cancelScheduledValues(now)
  g.setValueAtTime(g.value, now)
  g.linearRampToValueAtTime(v, now + sec)
}

/** Starts (or switches to) a song. `volume` is 0–1. */
export function playMusic(ctx: AudioContext, name: TrackName, volume: number) {
  level = Math.max(0, Math.min(1, volume)) * 0.55
  if (!player || player.ctx !== ctx) player = new Player(ctx)
  if (!timer) {
    current = name
    stepNo = 0
    nextTime = ctx.currentTime + 0.1
    fadeTo(level, 1.5)
    timer = setInterval(tick, 25)
    return
  }
  if (name !== current) pending = name
  else fadeTo(level, 0.3)
}

export function setMusicVolume(volume: number) {
  level = Math.max(0, Math.min(1, volume)) * 0.55
  if (timer) fadeTo(level, 0.3)
}

export function stopMusic() {
  if (!timer) return
  fadeTo(0, 0.6)
  const t = timer
  timer = null
  current = null
  pending = null
  switching = false
  setTimeout(() => clearInterval(t), 650)
}

export function musicPlaying() {
  return timer !== null
}

/** Renders a song offline (for checking levels without speakers). */
export async function renderSong(name: TrackName, seconds: number, sampleRate = 22050) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
  const p = new Player(ctx as unknown as AudioContext)
  p.out.gain.value = 0.55
  const song = SONGS[name]
  const step = 60 / song.bpm / 4
  p.step = step
  p.bar = step * 16
  for (let n = 0; n * step < seconds - 0.5; n++) {
    const bar = Math.floor(n / 16)
    const sec = song.sections[Math.floor(bar / song.chords.length) % song.sections.length]
    song.play.call(song, p, n % 16, bar, sec, n * step + (n % 2 ? song.swing * step : 0) + 0.01)
  }
  return ctx.startRendering()
}
