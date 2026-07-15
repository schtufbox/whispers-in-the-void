let ctx = null

function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Browsers/Electron require a user gesture before audio can start — this
// blocks both the Web Audio context above and any <audio> element's
// .play(), including the title music kicked off at module load (before any
// gesture has happened). Retrying whichever track is current once a gesture
// finally arrives unsticks that initial attempt; every subsequent music
// change already happens as the direct result of a button click, so it
// doesn't need this retry.
function resumeAudioOnGesture() {
  getContext()
  ensureSfx()
  titleMusic?.play().catch(() => {})
  deathMusic?.play().catch(() => {})
  ambientMusic?.play().catch(() => {})
}
window.addEventListener('keydown', resumeAudioOnGesture, { once: true })
window.addEventListener('click', resumeAudioOnGesture, { once: true })

// --- Sample SFX (Kenney Sci-Fi Sounds, CC0 — see public/audio/sfx/KENNEY_LICENSE.txt) ---
// Real engine/weapon recordings beat pure oscillators for "sounds like a ship".
// Loaded lazily on first user gesture; synth code remains as a fallback until
// (or if) decode finishes so nothing goes silent mid-frame.
const sfxBuffers = new Map()
let sfxLoadPromise = null

const SFX_FILES = [
  'thrust.ogg', 'thrust_brake.ogg', 'supercruise.ogg', 'engine_engage.ogg',
  'laser_pulse.ogg', 'laser_rapid.ogg', 'laser_burst.ogg', 'laser_beam.ogg', 'laser_plasma.ogg',
  'rocket.ogg', 'missile.ogg', 'torpedo.ogg',
  'dock.ogg', 'undock.ogg', 'dock_clamp.ogg', 'dock_seal.ogg'
]

function ensureSfx() {
  if (sfxLoadPromise) return sfxLoadPromise
  const audio = getContext()
  sfxLoadPromise = Promise.all(SFX_FILES.map(async (name) => {
    try {
      const res = await fetch(`audio/sfx/${name}`)
      if (!res.ok) throw new Error(res.statusText)
      const raw = await res.arrayBuffer()
      const buf = await audio.decodeAudioData(raw.slice(0))
      sfxBuffers.set(name, buf)
    } catch (err) {
      console.warn(`sfx load failed: ${name}`, err)
    }
  })).then(() => {
    // If thrust started on synth before decode finished, swap to samples.
    if (thrustMode && !thrustNodes) {
      const mode = thrustMode
      thrustMode = null
      setThrustState(mode)
    }
    // Cruise bed is pure synth (stretched thunder) — only re-arm if still wanted.
    if (cruiseWanted) {
      if (!cruiseRumble) startCruiseLoop()
    } else {
      stopCruiseAudio()
    }
  })
  return sfxLoadPromise
}

// One-shot or looping sample. Returns { source, gain, volume } or null if not loaded.
function playSample(name, { volume = 0.5, rate = 1, loop = false, fadeIn = 0, delay = 0 } = {}) {
  const buf = sfxBuffers.get(name)
  if (!buf) return null
  const audio = getContext()
  const source = audio.createBufferSource()
  source.buffer = buf
  source.loop = loop
  source.playbackRate.value = rate
  const gain = audio.createGain()
  const now = audio.currentTime + delay
  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(volume, now + fadeIn)
  } else {
    gain.gain.setValueAtTime(volume, audio.currentTime)
  }
  source.connect(gain).connect(audio.destination)
  source.start(now)
  // Store target volume — AudioParam.value is unreliable after ramps, and
  // stopSampleNodes needs a real peak to fade from (not the 0.0001 floor).
  return { source, gain, volume }
}

function stopSampleNodes(nodes, fadeOut = 0.12) {
  if (!nodes) return
  const audio = getContext()
  const now = audio.currentTime
  try {
    const from = Math.max(nodes.volume ?? nodes.gain.gain.value ?? 0.001, 0.0001)
    nodes.gain.gain.cancelScheduledValues(now)
    nodes.gain.gain.setValueAtTime(from, now)
    nodes.gain.gain.linearRampToValueAtTime(0.0001, now + fadeOut)
    nodes.source.stop(now + fadeOut + 0.02)
    // Hard-disconnect so a failed stop can't leave a loop leaking forever.
    const src = nodes.source
    const g = nodes.gain
    setTimeout(() => {
      try { src.disconnect() } catch { /* already */ }
      try { g.disconnect() } catch { /* already */ }
    }, (fadeOut + 0.05) * 1000)
  } catch {
    try { nodes.source.stop() } catch { /* already */ }
    try { nodes.source.disconnect() } catch { /* already */ }
    try { nodes.gain.disconnect() } catch { /* already */ }
  }
}

// delay (seconds, from now) lets callers layer several tone()/noiseBurst()
// calls with a slight offset instead of all starting simultaneously — used
// by the dock/undock clunk-then-hiss sequencing below.
function tone({ type = 'sine', freq, freqEnd, duration, attack = 0.005, peak = 0.25, delay = 0 }) {
  const audio = getContext()
  const start = audio.currentTime + delay
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, start + duration)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

// A tanh soft-clip curve for WaveShaperNode — cheap analog-style saturation
// that thickens a signal ("grit"/"crunch") instead of just making it louder.
function distortionCurve(amount) {
  const samples = 256
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(amount * x)
  }
  return curve
}

function noiseBurst({ duration, filterFreq = 800, peak = 0.4, drive = 0, delay = 0 }) {
  const audio = getContext()
  const start = audio.currentTime + delay
  const bufferSize = Math.floor(audio.sampleRate * duration)
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)

  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  const gain = audio.createGain()
  gain.gain.setValueAtTime(peak, start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)

  let tail = filter
  if (drive > 0) {
    const shaper = audio.createWaveShaper()
    shaper.curve = distortionCurve(drive)
    filter.connect(shaper)
    tail = shaper
  }
  source.connect(filter)
  tail.connect(gain).connect(audio.destination)
  source.start(start)
}

// One sample (plus small rate jitter) per weapon id in data/weapons.js.
// Synth fallbacks keep fire audible if samples haven't decoded yet.
const WEAPON_SAMPLES = {
  pulse_laser: { file: 'laser_pulse.ogg', volume: 0.5, rate: 1 },
  rapid_laser: { file: 'laser_rapid.ogg', volume: 0.42, rate: 1.12 },
  burst_laser: { file: 'laser_burst.ogg', volume: 0.5, rate: 0.95 },
  beam_laser: { file: 'laser_beam.ogg', volume: 0.55, rate: 1 },
  plasma_cannon: { file: 'laser_plasma.ogg', volume: 0.6, rate: 0.88 },
  rocket_pod: { file: 'rocket.ogg', volume: 0.55, rate: 1 },
  seeker_missile: { file: 'missile.ogg', volume: 0.58, rate: 1.05 },
  torpedo: { file: 'torpedo.ogg', volume: 0.65, rate: 0.9 }
}

const WEAPON_SYNTH_FALLBACK = {
  pulse_laser: () => {
    tone({ type: 'sawtooth', freq: 1300, freqEnd: 350, duration: 0.15, peak: 0.22 })
    tone({ type: 'square', freq: 650, freqEnd: 175, duration: 0.12, peak: 0.12 })
    tone({ type: 'sine', freq: 150, freqEnd: 60, duration: 0.12, peak: 0.2 })
  },
  rapid_laser: () => {
    tone({ type: 'sawtooth', freq: 1700, freqEnd: 550, duration: 0.09, peak: 0.18 })
    tone({ type: 'square', freq: 850, freqEnd: 300, duration: 0.07, peak: 0.1 })
  },
  burst_laser: () => {
    tone({ type: 'square', freq: 1100, freqEnd: 320, duration: 0.13, peak: 0.2 })
    tone({ type: 'sawtooth', freq: 1100, freqEnd: 320, duration: 0.13, peak: 0.16, delay: 0.05 })
    tone({ type: 'sine', freq: 140, freqEnd: 55, duration: 0.14, peak: 0.18 })
  },
  beam_laser: () => {
    tone({ type: 'sine', freq: 2000, freqEnd: 900, duration: 0.3, peak: 0.22 })
    tone({ type: 'sawtooth', freq: 900, freqEnd: 400, duration: 0.3, peak: 0.16 })
    noiseBurst({ duration: 0.28, filterFreq: 4200, peak: 0.12 })
  },
  plasma_cannon: () => {
    tone({ type: 'sine', freq: 220, freqEnd: 70, duration: 0.42, peak: 0.34 })
    noiseBurst({ duration: 0.38, filterFreq: 700, peak: 0.32, drive: 2.2 })
    tone({ type: 'square', freq: 110, freqEnd: 45, duration: 0.32, peak: 0.18 })
  },
  rocket_pod: () => {
    tone({ type: 'sine', freq: 90, freqEnd: 45, duration: 0.5, peak: 0.3 })
    noiseBurst({ duration: 0.45, filterFreq: 350, peak: 0.28, drive: 2.5 })
  },
  seeker_missile: () => {
    tone({ type: 'sine', freq: 130, freqEnd: 55, duration: 0.55, peak: 0.32 })
    tone({ type: 'triangle', freq: 900, freqEnd: 1400, duration: 0.18, peak: 0.12 })
    noiseBurst({ duration: 0.5, filterFreq: 300, peak: 0.3, drive: 2.5 })
  },
  torpedo: () => {
    tone({ type: 'sine', freq: 70, freqEnd: 30, duration: 0.7, peak: 0.4 })
    noiseBurst({ duration: 0.6, filterFreq: 220, peak: 0.36, drive: 3 })
  }
}

export function playWeaponFire(weaponId) {
  ensureSfx()
  const sample = WEAPON_SAMPLES[weaponId] ?? WEAPON_SAMPLES.pulse_laser
  // Slight rate jitter so rapid fire doesn't sound like a stuck sample.
  const rate = sample.rate * (0.96 + Math.random() * 0.08)
  if (playSample(sample.file, { volume: sample.volume, rate })) return
  const fallback = WEAPON_SYNTH_FALLBACK[weaponId] ?? WEAPON_SYNTH_FALLBACK.pulse_laser
  fallback()
}

export function playHit() {
  noiseBurst({ duration: 0.18, filterFreq: 1200, peak: 0.28, drive: 1.5 })
  tone({ type: 'square', freq: 220, freqEnd: 90, duration: 0.1, peak: 0.14 })
}

// Chunkier, multi-layer boom: a sharp high-passed crack for the initial
// transient, a big driven low-passed rumble for the body, and a deep
// pitch-dropping sub layer underneath for weight — a single lowpassed noise
// burst read as a thin "hiss" rather than an actual explosion.
export function playExplosion() {
  noiseBurst({ duration: 0.08, filterFreq: 3200, peak: 0.35 })
  noiseBurst({ duration: 0.9, filterFreq: 500, peak: 0.65, drive: 3 })
  tone({ type: 'sine', freq: 110, freqEnd: 30, duration: 0.8, peak: 0.5 })
  tone({ type: 'square', freq: 55, freqEnd: 25, duration: 0.6, peak: 0.25 })
}

export function playClick() {
  tone({ type: 'square', freq: 700, duration: 0.05, peak: 0.08 })
}

/** Soft industrial "order accepted" chime when a craft job starts. */
export function playCraftStart() {
  tone({ type: 'sine', freq: 392, duration: 0.12, peak: 0.11 })
  tone({ type: 'sine', freq: 523, duration: 0.16, peak: 0.13, delay: 0.09 })
  tone({ type: 'triangle', freq: 659, duration: 0.22, peak: 0.09, delay: 0.18 })
}

/** Brighter success chime when a craft job finishes. */
export function playCraftComplete() {
  tone({ type: 'sine', freq: 523, duration: 0.14, peak: 0.13 })
  tone({ type: 'sine', freq: 659, duration: 0.16, peak: 0.15, delay: 0.11 })
  tone({ type: 'sine', freq: 784, duration: 0.22, peak: 0.16, delay: 0.22 })
  tone({ type: 'triangle', freq: 1047, duration: 0.32, peak: 0.1, delay: 0.34 })
}

/** Soft confirmation chime for successful game save. */
export function playSaveChime() {
  tone({ type: 'sine', freq: 660, duration: 0.1, peak: 0.12 })
  tone({ type: 'sine', freq: 880, duration: 0.14, peak: 0.14, delay: 0.08 })
  tone({ type: 'triangle', freq: 1320, duration: 0.22, peak: 0.1, delay: 0.18 })
  tone({ type: 'sine', freq: 1760, duration: 0.28, peak: 0.06, delay: 0.28 })
}

// Shared noise buffer fillers (hyperdrive static + supercruise thunder beds).
function fillBrownNoise(data) {
  let last = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.8
  }
}

function fillWhiteNoise(data) {
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}

// Sparse digital crackle — mostly silence with random brief ticks (matrix rain grit).
function fillCrackleNoise(data) {
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() < 0.012 ? (Math.random() * 2 - 1) * 0.9 : 0
  }
}

// --- Hyperdrive: drawn-out low static, layered — "entering the matrix" ---
// Sustained bed for the whole jump (not a rising sci-fi whoosh). Stopped on
// arrival / abort via stopHyperspaceStatic.
let hyperStatic = null

function stopHyperspaceStatic(fadeOut = 0.55) {
  if (!hyperStatic) return
  const audio = getContext()
  const now = audio.currentTime
  const { gain, sources } = hyperStatic
  try {
    const from = Math.max(gain.gain.value, 0.0001)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(from, now)
    gain.gain.linearRampToValueAtTime(0.0001, now + fadeOut)
    for (const src of sources) {
      try { src.stop(now + fadeOut + 0.08) } catch { /* already */ }
      try { src.disconnect() } catch { /* already */ }
    }
    setTimeout(() => {
      try { gain.disconnect() } catch { /* already */ }
    }, (fadeOut + 0.12) * 1000)
  } catch { /* ignore */ }
  hyperStatic = null
}

function startHyperspaceStatic() {
  if (hyperStatic) return
  const audio = getContext()
  const now = audio.currentTime
  const sources = []

  const master = audio.createGain()
  // Slow pull-in — static blooms rather than slamming on.
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.38, now + 1.4)

  // Breath gain sits before master so LFOs don't cancel the fade-in ramp.
  const breath = audio.createGain()
  breath.gain.value = 1

  // Soft clip for dense digital grit without harsh peaks.
  const grit = audio.createWaveShaper()
  grit.curve = distortionCurve(2.4)
  grit.oversample = '2x'

  const masterLp = audio.createBiquadFilter()
  masterLp.type = 'lowpass'
  masterLp.frequency.value = 1400
  masterLp.Q.value = 0.45

  // Keep the bed low — matrix entry is under the speech, not a bright whoosh.
  const masterHp = audio.createBiquadFilter()
  masterHp.type = 'highpass'
  masterHp.frequency.value = 40

  const brownSecs = 3.5
  const brownBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * brownSecs), audio.sampleRate)
  fillBrownNoise(brownBuf.getChannelData(0))

  const whiteSecs = 2.2
  const whiteBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * whiteSecs), audio.sampleRate)
  fillWhiteNoise(whiteBuf.getChannelData(0))

  const crackleSecs = 2.8
  const crackleBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * crackleSecs), audio.sampleRate)
  fillCrackleNoise(crackleBuf.getChannelData(0))

  function loopBuf(buf) {
    const src = audio.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start()
    sources.push(src)
    return src
  }

  function lfo(freq, depth, destParam, base) {
    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = audio.createGain()
    g.gain.value = depth
    destParam.setValueAtTime(base, now)
    osc.connect(g).connect(destParam)
    osc.start()
    sources.push(osc)
  }

  // Layer 1 — deep brown body (drawn-out low static).
  {
    const src = loopBuf(brownBuf)
    const lp = audio.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 180
    lp.Q.value = 0.5
    const g = audio.createGain()
    g.gain.value = 0.72
    src.connect(lp).connect(g).connect(grit)
    lfo(0.07, 40, lp.frequency, 170)
    lfo(0.11, 0.12, g.gain, 0.68)
  }

  // Layer 2 — mid murk static (second noise floor, slightly brighter).
  {
    const src = loopBuf(brownBuf)
    const lp = audio.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    const bp = audio.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 280
    bp.Q.value = 0.6
    const g = audio.createGain()
    g.gain.value = 0.32
    src.connect(lp).connect(bp).connect(g).connect(grit)
    lfo(0.09, 90, bp.frequency, 260)
    lfo(0.15, 0.08, g.gain, 0.3)
  }

  // Layer 3 — thin digital hiss (the "code rain" air).
  {
    const src = loopBuf(whiteBuf)
    const bp = audio.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 1.1
    const g = audio.createGain()
    g.gain.value = 0.07
    src.connect(bp).connect(g).connect(grit)
    lfo(0.13, 220, bp.frequency, 850)
    lfo(0.28, 0.03, g.gain, 0.065)
  }

  // Layer 4 — sparse crackle ticks (matrix grit).
  {
    const src = loopBuf(crackleBuf)
    const hp = audio.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 600
    const lp = audio.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2800
    const g = audio.createGain()
    g.gain.value = 0.14
    src.connect(hp).connect(lp).connect(g).connect(grit)
    lfo(0.19, 0.05, g.gain, 0.12)
  }

  // Layer 5 — sub drone (pressure under the static, barely pitched).
  for (const [freq, peak] of [[22, 0.22], [31, 0.14], [47, 0.08]]) {
    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = audio.createGain()
    g.gain.value = peak
    const drift = audio.createOscillator()
    drift.type = 'sine'
    drift.frequency.value = 0.05 + Math.random() * 0.04
    const driftG = audio.createGain()
    driftG.gain.value = freq * 0.03
    drift.connect(driftG).connect(osc.frequency)
    drift.start()
    sources.push(drift)
    osc.connect(g).connect(grit)
    osc.start()
    sources.push(osc)
    lfo(0.08 + Math.random() * 0.04, peak * 0.25, g.gain, peak)
  }

  // Slow amplitude "breath" on the whole bed — drawn out, not a pulse engine.
  lfo(0.06, 0.16, breath.gain, 1)

  grit.connect(masterHp).connect(masterLp).connect(breath).connect(master).connect(audio.destination)
  hyperStatic = { gain: master, sources }
}

// Entry into the jump corridor: layered low static (matrix). No rising whoosh.
export function playHyperspaceWindup() {
  ensureSfx()
  startHyperspaceStatic()
  // Soft initial "fold-in" crack under the bed bloom.
  noiseBurst({ duration: 0.9, filterFreq: 350, peak: 0.2, drive: 2.2 })
  noiseBurst({ duration: 1.4, filterFreq: 160, peak: 0.16, drive: 1.5, delay: 0.15 })
  tone({ type: 'sine', freq: 48, freqEnd: 26, duration: 2.0, attack: 0.35, peak: 0.14 })
}

export function playHyperspace() {
  playHyperspaceWindup()
}

// Silent stop (menu clear / abort without the arrival pop).
export function stopHyperspaceAudio(fadeOut = 0.4) {
  stopHyperspaceStatic(fadeOut)
}

// Dissolve the static bed + a soft pressure pop as the corridor collapses.
export function playHyperspaceArrival() {
  const wasOn = !!hyperStatic
  stopHyperspaceStatic(0.7)
  if (!wasOn) return
  noiseBurst({ duration: 0.55, filterFreq: 220, peak: 0.22, drive: 1.8 })
  noiseBurst({ duration: 0.9, filterFreq: 120, peak: 0.14, drive: 1.2, delay: 0.05 })
  tone({ type: 'sine', freq: 55, freqEnd: 18, duration: 1.1, attack: 0.04, peak: 0.2 })
  // Quiet high tail dying out — last of the static air.
  noiseBurst({ duration: 0.7, filterFreq: 1800, peak: 0.05, delay: 0.08 })
}

// Supercruise body tunnel — Doppler warp whoosh as you punch through.
export function playSupercruiseTunnel() {
  tone({ type: 'sine', freq: 900, freqEnd: 180, duration: 0.45, attack: 0.01, peak: 0.28 })
  tone({ type: 'sawtooth', freq: 1400, freqEnd: 220, duration: 0.35, peak: 0.12 })
  noiseBurst({ duration: 0.35, filterFreq: 3200, peak: 0.22 })
  noiseBurst({ duration: 0.15, filterFreq: 6000, peak: 0.18, drive: 2 })
}

// Side/vertical thruster chirp while strafing in 6DOF.
let strafeNodes = null
let strafeWanted = false

export function setStrafeActive(active) {
  ensureSfx()
  if (active === strafeWanted) return
  strafeWanted = active
  if (!active) {
    if (strafeNodes) {
      stopSampleNodes(strafeNodes, 0.08)
      strafeNodes = null
    }
    return
  }
  const nodes = playSample('thrust.ogg', { volume: 0.22, rate: 1.35, loop: true, fadeIn: 0.06 })
  if (nodes) {
    strafeNodes = nodes
    return
  }
  // Synth fallback: short bright thruster hum.
  const audioCtx = getContext()
  const source = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  source.type = 'square'
  source.frequency.value = 110
  gain.gain.setValueAtTime(0, audioCtx.currentTime)
  gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.05)
  source.connect(gain).connect(audioCtx.destination)
  source.start()
  strafeNodes = { source, gain, volume: 0.04 }
}

// Dock: approach thruster whoosh → metal clamp → bay door → soft seal → confirm chirp.
// Kenney CC0 samples (see public/audio/sfx/); synth fallback if not loaded.
export function playDock() {
  ensureSfx()
  // Soft thruster wash as the ship glides into the hang.
  playSample('thrust.ogg', { volume: 0.22, rate: 0.72, fadeIn: 0.05 })
  const clamp = playSample('dock_clamp.ogg', { volume: 0.62, rate: 0.88, delay: 0.35 })
  const door = playSample('dock.ogg', { volume: 0.55, delay: 0.48 })
  const seal = playSample('dock_seal.ogg', { volume: 0.32, rate: 0.82, delay: 0.72 })
  // Second clamp + computer confirm for a more mechanical bay sequence.
  playSample('dock_clamp.ogg', { volume: 0.35, rate: 1.15, delay: 1.05 })
  playSample('engine_engage.ogg', { volume: 0.18, rate: 1.4, delay: 1.35 })
  if (clamp || door || seal) {
    // Extra synth chirp layered under samples for a "lock confirmed" beep.
    tone({ type: 'sine', freq: 880, freqEnd: 1320, duration: 0.12, peak: 0.08, delay: 1.4 })
    tone({ type: 'sine', freq: 1320, duration: 0.08, peak: 0.06, delay: 1.52 })
    return
  }
  // Full synth fallback sequence.
  noiseBurst({ duration: 0.45, filterFreq: 900, peak: 0.12, delay: 0 })
  tone({ type: 'sine', freq: 180, freqEnd: 90, duration: 0.5, peak: 0.1, delay: 0.05 })
  tone({ type: 'square', freq: 90, freqEnd: 50, duration: 0.2, peak: 0.34, delay: 0.35 })
  noiseBurst({ duration: 0.12, filterFreq: 1600, peak: 0.32, drive: 2.8, delay: 0.35 })
  tone({ type: 'sine', freq: 260, freqEnd: 520, duration: 0.55, attack: 0.08, peak: 0.14, delay: 0.5 })
  noiseBurst({ duration: 0.4, filterFreq: 2800, peak: 0.12, delay: 0.55 })
  tone({ type: 'sine', freq: 70, freqEnd: 40, duration: 0.35, peak: 0.18, delay: 0.85 })
  tone({ type: 'sine', freq: 880, freqEnd: 1320, duration: 0.12, peak: 0.1, delay: 1.2 })
  tone({ type: 'sine', freq: 1320, duration: 0.09, peak: 0.08, delay: 1.32 })
}

export function playUndock() {
  ensureSfx()
  // Seal release → door open → clamps free → thruster push out.
  const seal = playSample('dock_seal.ogg', { volume: 0.28, rate: 1.2 })
  const door = playSample('undock.ogg', { volume: 0.58, delay: 0.08 })
  const clamp = playSample('dock_clamp.ogg', { volume: 0.5, rate: 1.12, delay: 0.32 })
  playSample('dock_clamp.ogg', { volume: 0.32, rate: 0.95, delay: 0.55 })
  playSample('thrust.ogg', { volume: 0.28, rate: 0.85, delay: 0.7 })
  playSample('engine_engage.ogg', { volume: 0.22, rate: 1.15, delay: 0.85 })
  if (seal || door || clamp) {
    tone({ type: 'sine', freq: 660, freqEnd: 440, duration: 0.15, peak: 0.07, delay: 0.05 })
    return
  }
  tone({ type: 'sine', freq: 520, freqEnd: 240, duration: 0.55, attack: 0.08, peak: 0.14 })
  noiseBurst({ duration: 0.3, filterFreq: 2600, peak: 0.12 })
  tone({ type: 'square', freq: 70, freqEnd: 110, duration: 0.18, peak: 0.3, delay: 0.35 })
  noiseBurst({ duration: 0.12, filterFreq: 1700, peak: 0.28, drive: 2.5, delay: 0.35 })
  tone({ type: 'sine', freq: 140, freqEnd: 70, duration: 0.45, peak: 0.12, delay: 0.55 })
  noiseBurst({ duration: 0.35, filterFreq: 800, peak: 0.14, delay: 0.65 })
}

// Mid-sequence thruster nudge during the exterior approach / back-away half.
export function playDockThrusterPulse() {
  ensureSfx()
  const s = playSample('thrust.ogg', { volume: 0.2, rate: 1.05, fadeIn: 0.02 })
  if (s) return
  tone({ type: 'sawtooth', freq: 95, freqEnd: 55, duration: 0.28, peak: 0.1 })
  noiseBurst({ duration: 0.22, filterFreq: 700, peak: 0.1 })
}

// Probe launch (one-shot whoosh) + continuous scan warble + soft return chirp.
export function playProbeLaunch() {
  ensureSfx()
  const s = playSample('rocket.ogg', { volume: 0.32, rate: 1.55 })
  tone({ type: 'sine', freq: 420, freqEnd: 980, duration: 0.35, peak: 0.1 })
  if (s) return
  tone({ type: 'sawtooth', freq: 280, freqEnd: 90, duration: 0.4, peak: 0.14 })
  noiseBurst({ duration: 0.3, filterFreq: 2200, peak: 0.16 })
}

export function playProbeReturn() {
  ensureSfx()
  playSample('engine_engage.ogg', { volume: 0.2, rate: 1.35 })
  tone({ type: 'sine', freq: 720, freqEnd: 360, duration: 0.28, peak: 0.09 })
  tone({ type: 'sine', freq: 980, duration: 0.1, peak: 0.07, delay: 0.2 })
}

let probeScanOsc = null
let probeScanGain = null
let probeScanLFO = null
let probeScanPing = null

// Continuous scanning hum + soft radar pings while the probe surveys a body.
export function setProbeScanActive(active) {
  const audio = getContext()
  if (active && !probeScanOsc) {
    probeScanOsc = audio.createOscillator()
    probeScanGain = audio.createGain()
    probeScanOsc.type = 'sine'
    probeScanOsc.frequency.value = 520
    probeScanGain.gain.setValueAtTime(0, audio.currentTime)
    probeScanGain.gain.linearRampToValueAtTime(0.055, audio.currentTime + 0.2)

    probeScanLFO = audio.createOscillator()
    probeScanLFO.type = 'sine'
    probeScanLFO.frequency.value = 4.5
    const lfoGain = audio.createGain()
    lfoGain.gain.value = 45
    probeScanLFO.connect(lfoGain).connect(probeScanOsc.frequency)
    probeScanLFO.start()

    probeScanOsc.connect(probeScanGain).connect(audio.destination)
    probeScanOsc.start()

    // Soft repeating radar-style pings.
    const schedulePings = () => {
      if (!probeScanOsc) return
      tone({ type: 'sine', freq: 1400, freqEnd: 900, duration: 0.12, peak: 0.045 })
      tone({ type: 'triangle', freq: 2100, freqEnd: 1200, duration: 0.08, peak: 0.03, delay: 0.04 })
      probeScanPing = setTimeout(schedulePings, 850)
    }
    probeScanPing = setTimeout(schedulePings, 200)
  } else if (!active && probeScanOsc) {
    if (probeScanPing) {
      clearTimeout(probeScanPing)
      probeScanPing = null
    }
    probeScanGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.15)
    probeScanOsc.stop(audio.currentTime + 0.2)
    probeScanLFO.stop(audio.currentTime + 0.2)
    probeScanOsc = null
    probeScanGain = null
    probeScanLFO = null
  }
}

export function playMiningPing() {
  tone({ type: 'triangle', freq: 900, freqEnd: 1400, duration: 0.12, peak: 0.14 })
}

// Speech-synthesized voice callouts ("Hyperdrive engaged", "Supercruise
// disengaged", etc.) — gracefully a no-op wherever the Web Speech API isn't
// available, rather than throwing, since this is a nice-to-have layered on
// top of the existing synthesized SFX above, not a required system.
//
// OS TTS can't be wired into the Web Audio graph, so "reverb" is faked as a
// soft multi-tap delay bloom under the phrase (plus a slower rate), not a
// true wet process of the voice itself.
let femaleVoice = null

function refreshFemaleVoice() {
  if (!window.speechSynthesis) return
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return
  const en = voices.filter((v) => /^en\b/i.test(v.lang))
  const pool = en.length ? en : voices
  // Known female system voices across macOS / Windows / Chrome.
  const prefer = /samantha|victoria|karen|moira|tessa|fiona|veena|zira|hazel|susan|linda|heather|serena|catherine|google us english female|microsoft zira|female|woman/i
  const avoidMale = /david|mark|daniel|alex|fred|jorge|male|\bman\b|guy|tom|bruce|rishi|aaron/i
  femaleVoice =
    pool.find((v) => prefer.test(v.name)) ??
    pool.find((v) => !avoidMale.test(v.name)) ??
    pool[0]
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshFemaleVoice()
  window.speechSynthesis.addEventListener('voiceschanged', refreshFemaleVoice)
}

// Quiet noise through short feed-forward taps — sits under TTS for a bit of
// space without delay feedback (feedback loops could self-oscillate into a
// sustained synth-like buzz after callouts like "Supercruise disengaged").
function playAnnounceReverbBloom(durationS = 0.9) {
  const audio = getContext()
  const now = audio.currentTime
  const length = Math.ceil(audio.sampleRate * 0.05)
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)

  const src = audio.createBufferSource()
  src.buffer = buffer

  const band = audio.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1200
  band.Q.value = 0.7

  const wet = audio.createGain()
  wet.gain.setValueAtTime(0.0001, now)
  wet.gain.exponentialRampToValueAtTime(0.03, now + 0.03)
  wet.gain.exponentialRampToValueAtTime(0.0001, now + durationS)

  src.connect(band)
  // Feed-forward taps only — no delay→feedback→delay loops.
  for (const delayS of [0.05, 0.1, 0.16]) {
    const delay = audio.createDelay(1)
    delay.delayTime.value = delayS
    const tap = audio.createGain()
    tap.gain.value = 0.35
    band.connect(delay)
    delay.connect(tap)
    tap.connect(wet)
  }
  wet.connect(audio.destination)
  src.start(now)
  src.stop(now + 0.08)
}

export function announce(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel() // don't queue up stale callouts behind a new one
  if (!femaleVoice) refreshFemaleVoice()

  playAnnounceReverbBloom(0.9)

  const utterance = new SpeechSynthesisUtterance(text)
  if (femaleVoice) utterance.voice = femaleVoice
  utterance.rate = 0.72
  utterance.pitch = 1.15
  utterance.volume = 0.85
  window.speechSynthesis.speak(utterance)
}

let thrustNodes = null
let thrustMode = null // 'accel' | 'brake' | null
// Synth fallback nodes when samples aren't ready yet.
let thrustOsc = null
let thrustGain = null

const THRUST_SAMPLE = {
  accel: { file: 'thrust.ogg', volume: 0.32, rate: 1 },
  brake: { file: 'thrust_brake.ogg', volume: 0.26, rate: 0.92 }
}

function stopThrustAudio() {
  if (thrustNodes) {
    stopSampleNodes(thrustNodes, 0.18)
    thrustNodes = null
  }
  if (thrustOsc) {
    const audio = getContext()
    thrustGain.gain.linearRampToValueAtTime(0.0001, audio.currentTime + 0.15)
    try { thrustOsc.stop(audio.currentTime + 0.2) } catch { /* already stopped */ }
    thrustOsc = null
    thrustGain = null
  }
}

export function setThrustState(mode) {
  ensureSfx()
  if (mode === thrustMode) return
  stopThrustAudio()
  thrustMode = mode
  if (!mode) return

  const profile = THRUST_SAMPLE[mode]
  const nodes = playSample(profile.file, {
    volume: profile.volume,
    rate: profile.rate,
    loop: true,
    fadeIn: 0.18
  })
  if (nodes) {
    thrustNodes = nodes
    return
  }

  // Fallback: filtered saw/square hum until samples load.
  const audio = getContext()
  thrustOsc = audio.createOscillator()
  thrustGain = audio.createGain()
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = mode === 'brake' ? 280 : 420
  thrustOsc.type = mode === 'brake' ? 'square' : 'sawtooth'
  thrustOsc.frequency.value = mode === 'brake' ? 48 : 70
  thrustGain.gain.setValueAtTime(0, audio.currentTime)
  thrustGain.gain.linearRampToValueAtTime(0.05, audio.currentTime + 0.2)
  thrustOsc.connect(filter).connect(thrustGain).connect(audio.destination)
  thrustOsc.start()
}

// Continuous "stretched thunder crack" bed while supercruise is engaged.
// (Not an engine loop — the crack's transient elongated into a rolling sustain.)
let cruiseRumble = null
let cruiseWanted = false

function stopCruiseRumble(fadeOut = 0.55) {
  if (!cruiseRumble) return
  const audio = getContext()
  const now = audio.currentTime
  const { gain, sources } = cruiseRumble
  try {
    const from = Math.max(gain.gain.value, 0.0001)
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(from, now)
    // Long die-away — thunder doesn't cut off, it rolls out.
    gain.gain.linearRampToValueAtTime(0.0001, now + fadeOut)
    for (const src of sources) {
      try { src.stop(now + fadeOut + 0.08) } catch { /* already */ }
      try { src.disconnect() } catch { /* already */ }
    }
    setTimeout(() => {
      try { gain.disconnect() } catch { /* already */ }
    }, (fadeOut + 0.12) * 1000)
  } catch { /* ignore */ }
  cruiseRumble = null
}

function stopCruiseAudio() {
  stopCruiseRumble(0.65)
}

// One-shot: the front of a thunderclap (sharp crack → boom) for engage/disengage.
function playThunderCrack({ volume = 1, delay = 0 } = {}) {
  // High crack (stretched attack of the clap).
  noiseBurst({ duration: 0.12, filterFreq: 5200, peak: 0.42 * volume, drive: 2.2, delay })
  noiseBurst({ duration: 0.28, filterFreq: 1800, peak: 0.32 * volume, drive: 1.6, delay: delay + 0.02 })
  // Body boom that blooms under the crack.
  noiseBurst({ duration: 1.1, filterFreq: 280, peak: 0.48 * volume, drive: 2.8, delay: delay + 0.04 })
  tone({ type: 'sine', freq: 95, freqEnd: 28, duration: 1.4, attack: 0.02, peak: 0.38 * volume, delay: delay + 0.03 })
  tone({ type: 'triangle', freq: 48, freqEnd: 18, duration: 1.6, attack: 0.04, peak: 0.28 * volume, delay: delay + 0.05 })
}

// Imagine a crack of thunder frozen mid-clap and stretched into a continuous
// bed: pressure boom + rolling body + sustained crack texture, all slowly
// breathing so it never reads as a static loop.
function startCruiseRumble() {
  if (cruiseRumble || !cruiseWanted) return
  const audio = getContext()
  const now = audio.currentTime
  const sources = []

  const master = audio.createGain()
  // Swell in like the clap opening out across the sky.
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(0.42, now + 1.1)

  // Mild saturation so the stack feels like real atmospheric grit, not clean synth.
  const grit = audio.createWaveShaper()
  grit.curve = distortionCurve(1.8)
  grit.oversample = '2x'

  // Soft ceiling so mid crackle doesn't get harsh at peak swell.
  const masterLp = audio.createBiquadFilter()
  masterLp.type = 'lowpass'
  masterLp.frequency.value = 4200
  masterLp.Q.value = 0.4

  // ---- Layer helpers ----
  const brownSecs = 4
  const brownBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * brownSecs), audio.sampleRate)
  fillBrownNoise(brownBuf.getChannelData(0))

  const whiteSecs = 2.5
  const whiteBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * whiteSecs), audio.sampleRate)
  fillWhiteNoise(whiteBuf.getChannelData(0))

  function loopNoise(buf) {
    const src = audio.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.start()
    sources.push(src)
    return src
  }

  function lfo(freq, depth, destParam, base = 0) {
    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = audio.createGain()
    g.gain.value = depth
    // Offset so modulation sits around `base` rather than ±depth around 0.
    destParam.setValueAtTime(base, now)
    osc.connect(g).connect(destParam)
    osc.start()
    sources.push(osc)
    return osc
  }

  // ---- 1. Pressure boom (the clap's sub, held forever) ----
  const boomBus = audio.createGain()
  boomBus.gain.value = 0.95
  for (const [freq, type, peak] of [
    [14, 'sine', 0.55],
    [19, 'sine', 0.48],
    [27, 'sine', 0.32],
    [36, 'triangle', 0.16]
  ]) {
    const osc = audio.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = audio.createGain()
    g.gain.value = peak
    // Slow detune drift — pressure wave never sits perfectly still.
    const drift = audio.createOscillator()
    drift.type = 'sine'
    drift.frequency.value = 0.07 + Math.random() * 0.06
    const driftG = audio.createGain()
    driftG.gain.value = freq * 0.04
    drift.connect(driftG).connect(osc.frequency)
    drift.start()
    sources.push(drift)
    osc.connect(g).connect(boomBus)
    osc.start()
    sources.push(osc)
  }
  // Rolling swell on the boom (thunder undulating across distance).
  lfo(0.11, 0.22, boomBus.gain, 0.85)
  boomBus.connect(grit)

  // ---- 2. Body roll — brown noise through a low, breathing filter ----
  const body = loopNoise(brownBuf)
  const bodyLp = audio.createBiquadFilter()
  bodyLp.type = 'lowpass'
  bodyLp.frequency.value = 140
  bodyLp.Q.value = 0.7
  const bodyGain = audio.createGain()
  bodyGain.gain.value = 0.7
  body.connect(bodyLp).connect(bodyGain).connect(grit)
  // Filter "rolls" — the stretched clap's body sliding lower/higher slowly.
  lfo(0.08, 55, bodyLp.frequency, 130)
  lfo(0.13, 0.18, bodyGain.gain, 0.65)

  // Second body, slightly brighter and out of phase, for depth.
  const body2 = loopNoise(brownBuf)
  const body2Lp = audio.createBiquadFilter()
  body2Lp.type = 'lowpass'
  body2Lp.frequency.value = 220
  body2Lp.Q.value = 0.5
  const body2Gain = audio.createGain()
  body2Gain.gain.value = 0.38
  body2.connect(body2Lp).connect(body2Gain).connect(grit)
  lfo(0.055, 70, body2Lp.frequency, 200)
  lfo(0.17, 0.12, body2Gain.gain, 0.35)

  // ---- 3. Stretched crack texture — bandpass noise (the "zip" of the clap, held) ----
  const crack = loopNoise(whiteBuf)
  const crackBp = audio.createBiquadFilter()
  crackBp.type = 'bandpass'
  crackBp.frequency.value = 900
  crackBp.Q.value = 0.85
  const crackHp = audio.createBiquadFilter()
  crackHp.type = 'highpass'
  crackHp.frequency.value = 280
  const crackGain = audio.createGain()
  crackGain.gain.value = 0.22
  crack.connect(crackHp).connect(crackBp).connect(crackGain).connect(grit)
  // Sweep the crack band like the formant of a clap elongated over seconds.
  lfo(0.09, 380, crackBp.frequency, 850)
  lfo(0.21, 0.08, crackGain.gain, 0.2)

  // ---- 4. Distant sizzle / residual spark — quieter high air ----
  const air = loopNoise(whiteBuf)
  const airHp = audio.createBiquadFilter()
  airHp.type = 'highpass'
  airHp.frequency.value = 2400
  const airLp = audio.createBiquadFilter()
  airLp.type = 'lowpass'
  airLp.frequency.value = 7000
  const airGain = audio.createGain()
  airGain.gain.value = 0.05
  air.connect(airHp).connect(airLp).connect(airGain).connect(grit)
  // Occasional "flicker" — irregular pulse of residual crackle.
  lfo(0.33, 0.035, airGain.gain, 0.045)
  lfo(0.07, 900, airHp.frequency, 2200)

  grit.connect(masterLp).connect(master).connect(audio.destination)
  cruiseRumble = { gain: master, sources }
}

function startCruiseLoop() {
  if (!cruiseWanted || cruiseRumble) return
  playThunderCrack({ volume: 0.85 })
  startCruiseRumble()
}

export function setSupercruiseActive(active) {
  ensureSfx()
  if (active) {
    // Called every frame while cruising — arm once, keep the bed alive.
    if (cruiseWanted) {
      if (!cruiseRumble) startCruiseLoop()
      return
    }
    cruiseWanted = true
    startCruiseLoop()
  } else {
    const wasOn = cruiseWanted || cruiseRumble
    cruiseWanted = false
    stopCruiseAudio()
    if (wasOn) {
      // Distant closing roll as the stretched clap finally ends.
      playThunderCrack({ volume: 0.45, delay: 0.05 })
      noiseBurst({ duration: 1.4, filterFreq: 180, peak: 0.28, drive: 2, delay: 0.08 })
      tone({ type: 'sine', freq: 55, freqEnd: 16, duration: 1.8, attack: 0.08, peak: 0.22, delay: 0.1 })
    }
  }
}

let miningBeamOsc = null
let miningBeamGain = null
let miningBeamLFO = null

// Continuous warbling hum for the mining beam — not a one-shot weapon sample.
export function setMiningBeamActive(active) {
  const audio = getContext()
  if (active && !miningBeamOsc) {
    miningBeamOsc = audio.createOscillator()
    miningBeamGain = audio.createGain()
    miningBeamOsc.type = 'triangle'
    miningBeamOsc.frequency.value = 340
    miningBeamGain.gain.setValueAtTime(0, audio.currentTime)
    miningBeamGain.gain.linearRampToValueAtTime(0.08, audio.currentTime + 0.15)

    miningBeamLFO = audio.createOscillator()
    miningBeamLFO.type = 'sine'
    miningBeamLFO.frequency.value = 7
    const lfoGain = audio.createGain()
    lfoGain.gain.value = 15
    miningBeamLFO.connect(lfoGain).connect(miningBeamOsc.frequency)
    miningBeamLFO.start()

    miningBeamOsc.connect(miningBeamGain).connect(audio.destination)
    miningBeamOsc.start()
  } else if (!active && miningBeamOsc) {
    miningBeamGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.1)
    miningBeamOsc.stop(audio.currentTime + 0.15)
    miningBeamLFO.stop(audio.currentTime + 0.15)
    miningBeamOsc = null
    miningBeamGain = null
    miningBeamLFO = null
  }
}

// File-based music (title/death/ambient) — plain <audio> elements rather than
// decoding through the Web Audio graph above, since these are long streamed
// tracks (not short synthesized one-shots) and the browser already handles
// looping/streaming/volume for free.
let titleMusic = null
let deathMusic = null
let ambientMusic = null
// Persists across sessions (not reset per game) so replaying "New Game"
// continues cycling forward through the playlist rather than always
// restarting at bg1.
let ambientTrackIndex = 0

const AMBIENT_TRACKS = [
  'bg1.mp3', 'bg2.mp3', 'bg3.mp3', 'bg4.mp3', 'bg5.mp3', 'bg6.mp3',
  'ancient_signal.mp3',
  'drift_signal.mp3',
  'far_signal.mp3',
  'far_signal_drift.mp3',
  'perihelion.mp3',
  'perihelion_drift.mp3',
  'relay.mp3',
  'relay_through_europa.mp3'
]
const TITLE_VOLUME = 0.5
const DEATH_VOLUME = 0.55
const AMBIENT_VOLUME = 0.15 // deliberately quiet — background gameplay music, not foreground

// A relative path (not "/audio/...") — the packaged app loads index.html via
// `file://`, where a root-absolute path resolves against the filesystem root
// instead of the app's own out/renderer directory, silently failing to find
// any track. A relative path resolves against the document's own location in
// both the dev server (served at "/") and the packaged file:// build alike.
function playFile(name, { loop = false, volume = 0.5 } = {}) {
  const el = new Audio(`audio/${name}`)
  el.loop = loop
  el.volume = volume
  el.play().catch(() => {}) // blocked without a user gesture; the existing
  // click/keydown listeners above already resume the Web Audio context on
  // first interaction, and the menu/game is always reached via a click.
  return el
}

function stopAllMusic() {
  titleMusic?.pause()
  titleMusic = null
  deathMusic?.pause()
  deathMusic = null
  if (ambientMusic) {
    ambientMusic.onended = null
    ambientMusic.pause()
    ambientMusic = null
  }
}

export function playTitleMusic() {
  stopAllMusic()
  titleMusic = playFile('intro.mp3', { loop: true, volume: TITLE_VOLUME })
}

export function stopTitleMusic() {
  titleMusic?.pause()
  titleMusic = null
}

export function playDeathMusic() {
  stopAllMusic()
  deathMusic = playFile('ded.mp3', { loop: true, volume: DEATH_VOLUME })
}

function playNextAmbientTrack() {
  const track = AMBIENT_TRACKS[ambientTrackIndex % AMBIENT_TRACKS.length]
  ambientTrackIndex++
  ambientMusic = playFile(track, { loop: false, volume: AMBIENT_VOLUME })
  ambientMusic.onended = playNextAmbientTrack
}

export function startAmbientMusic() {
  if (ambientMusic) return
  stopAllMusic()
  // Random entry point, then advance in list order so sessions don't always
  // open on bg1 — still a continuous cycle after the first pick.
  ambientTrackIndex = Math.floor(Math.random() * AMBIENT_TRACKS.length)
  playNextAmbientTrack()
}

export function stopAmbientMusic() {
  if (!ambientMusic) return
  ambientMusic.onended = null
  ambientMusic.pause()
  ambientMusic = null
}

