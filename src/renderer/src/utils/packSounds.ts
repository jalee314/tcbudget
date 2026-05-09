// Synthesized sound effects for the pack-opening flow. Uses the Web Audio API
// directly so we don't ship audio assets — every sound is generated on demand
// from oscillators / noise buffers. Mute state is persisted in localStorage.

const MUTE_KEY = 'pack_open_muted_v1'

export function loadMutePref(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveMutePref(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // ignore quota errors
  }
}

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (ctx) return ctx
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor() as AudioContext
    return ctx
  } catch {
    return null
  }
}

function makeNoise(durationSec: number, ctxRef: AudioContext, fadeOut = true): AudioBuffer {
  const len = Math.max(1, Math.floor(ctxRef.sampleRate * durationSec))
  const buf = ctxRef.createBuffer(1, len, ctxRef.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const env = fadeOut ? Math.pow(1 - i / len, 1.5) : 1
    data[i] = (Math.random() * 2 - 1) * env
  }
  return buf
}

// ─── Pack tear ──────────────────────────────────────────────────────────
// Two-stage rip: a sharp initial crackle (high-passed crinkle) followed
// by a longer "tearing apart" body (bandpass noise with downward sweep).
export function playPackTear(muted: boolean): void {
  if (muted) return
  const c = getContext()
  if (!c) return
  const t0 = c.currentTime

  // Stage 1 — sharp paper crackle attack.
  {
    const buf = makeNoise(0.12, c)
    const src = c.createBufferSource()
    src.buffer = buf
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3200
    const gain = c.createGain()
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(0.45, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12)
    src.connect(hp); hp.connect(gain); gain.connect(c.destination)
    src.start(t0)
  }

  // Stage 2 — body of the tear, longer and pitch sweeps down.
  {
    const buf = makeNoise(0.48, c)
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(2400, t0 + 0.05)
    bp.frequency.exponentialRampToValueAtTime(700, t0 + 0.45)
    bp.Q.value = 1.6
    const gain = c.createGain()
    gain.gain.setValueAtTime(0, t0 + 0.04)
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.08)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5)
    src.connect(bp); bp.connect(gain); gain.connect(c.destination)
    src.start(t0 + 0.04)
  }
}

// ─── Card flip ─────────────────────────────────────────────────────────
// Soft cardboard flick — short low-pass noise burst with a quick mid
// emphasis, no harsh high frequencies.
export function playCardFlip(muted: boolean, when = 0): void {
  if (muted) return
  const c = getContext()
  if (!c) return
  const start = c.currentTime + when
  const buf = makeNoise(0.14, c)
  const src = c.createBufferSource()
  src.buffer = buf
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1800, start)
  lp.frequency.exponentialRampToValueAtTime(900, start + 0.12)
  lp.Q.value = 0.8
  const peak = c.createBiquadFilter()
  peak.type = 'peaking'
  peak.frequency.value = 1100
  peak.Q.value = 1.5
  peak.gain.value = 6
  const gain = c.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(0.18, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14)
  src.connect(lp); lp.connect(peak); peak.connect(gain); gain.connect(c.destination)
  src.start(start)
}

// ─── Rare ding ─────────────────────────────────────────────────────────
// Bell-like chime built from three sine partials with a long exponential
// decay. Subtle but more "musical" than a single tone.
export function playRareDing(muted: boolean, when = 0): void {
  if (muted) return
  const c = getContext()
  if (!c) return
  const start = c.currentTime + when
  // Fundamental + 2.76 (minor third-ish overtone) + 5.4 (harmonic) — a
  // rough imitation of bell harmonics.
  const partials = [
    { freq: 1320, gain: 0.18, decay: 1.4 },
    { freq: 1980, gain: 0.10, decay: 1.1 },
    { freq: 2640, gain: 0.06, decay: 0.8 }
  ]
  for (const p of partials) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = p.freq
    const g = c.createGain()
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(p.gain, start + 0.005)
    g.gain.exponentialRampToValueAtTime(0.001, start + p.decay)
    osc.connect(g); g.connect(c.destination)
    osc.start(start)
    osc.stop(start + p.decay + 0.05)
  }
}

// ─── Best pull chime ───────────────────────────────────────────────────
// Triumphant ascending three-note triangle arpeggio with a bell-like ring.
export function playBestPullChime(muted: boolean, when = 0): void {
  if (muted) return
  const c = getContext()
  if (!c) return
  const start = c.currentTime + when
  const notes = [
    { freq: 880, t: 0.00, gain: 0.14 },     // A5
    { freq: 1108, t: 0.10, gain: 0.14 },    // C#6
    { freq: 1318, t: 0.20, gain: 0.16 },    // E6
    { freq: 1760, t: 0.32, gain: 0.18 }     // A6 — climax
  ]
  for (const n of notes) {
    const osc = c.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(n.freq, start + n.t)
    const g = c.createGain()
    g.gain.setValueAtTime(0, start + n.t)
    g.gain.linearRampToValueAtTime(n.gain, start + n.t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, start + n.t + 1.0)
    osc.connect(g); g.connect(c.destination)
    osc.start(start + n.t)
    osc.stop(start + n.t + 1.05)
  }
  // Add a soft bell shimmer at the climax.
  {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 3520
    const g = c.createGain()
    g.gain.setValueAtTime(0, start + 0.32)
    g.gain.linearRampToValueAtTime(0.05, start + 0.34)
    g.gain.exponentialRampToValueAtTime(0.001, start + 1.4)
    osc.connect(g); g.connect(c.destination)
    osc.start(start + 0.32)
    osc.stop(start + 1.45)
  }
}

// ─── Reveal-all whoosh ─────────────────────────────────────────────────
// Single satisfying sweep used when the user clicks "Open all" or in
// reveal-all mode after the spread phase. Combines a rising filtered
// noise sweep with a soft bell tail so it both reads as motion AND has
// the warm "moment of revelation" feel.
export function playRevealAll(muted: boolean, when = 0): void {
  if (muted) return
  const c = getContext()
  if (!c) return
  const start = c.currentTime + when

  // Filtered noise sweep — the "whoosh".
  {
    const buf = makeNoise(0.6, c, false)
    const src = c.createBufferSource()
    src.buffer = buf
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(600, start)
    bp.frequency.exponentialRampToValueAtTime(4200, start + 0.4)
    bp.Q.value = 2.4
    const g = c.createGain()
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(0.22, start + 0.08)
    g.gain.linearRampToValueAtTime(0.18, start + 0.34)
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.55)
    src.connect(bp); bp.connect(g); g.connect(c.destination)
    src.start(start)
  }

  // Soft bell shimmer at the peak — three quick partials.
  const partials = [
    { freq: 1568, t: 0.30, gain: 0.16, decay: 1.2 },
    { freq: 2349, t: 0.36, gain: 0.10, decay: 1.0 },
    { freq: 3136, t: 0.42, gain: 0.06, decay: 0.8 }
  ]
  for (const p of partials) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = p.freq
    const g = c.createGain()
    g.gain.setValueAtTime(0, start + p.t)
    g.gain.linearRampToValueAtTime(p.gain, start + p.t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, start + p.t + p.decay)
    osc.connect(g); g.connect(c.destination)
    osc.start(start + p.t)
    osc.stop(start + p.t + p.decay + 0.05)
  }
}
