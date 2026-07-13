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
    // Cruise: stop any synth placeholder and start the sample loop if still wanted.
    if (cruiseWanted) {
      if (cruiseOscs) stopCruiseAudio()
      if (!cruiseNodes) startCruiseLoop()
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

export function playHyperspace() {
  tone({ type: 'sine', freq: 200, freqEnd: 1600, duration: 0.9, attack: 0.3, peak: 0.22 })
  noiseBurst({ duration: 0.9, filterFreq: 2200, peak: 0.12 })
}

// The mirror of playHyperspace — a high-to-low settling sweep plus a bassy
// thump, for the moment the jump animation actually completes and control
// returns to the player, distinct from the departure's rising whoosh.
export function playHyperspaceArrival() {
  tone({ type: 'sine', freq: 1200, freqEnd: 150, duration: 0.5, attack: 0.02, peak: 0.24 })
  tone({ type: 'sine', freq: 70, freqEnd: 32, duration: 0.6, peak: 0.35 })
  noiseBurst({ duration: 0.4, filterFreq: 1800, peak: 0.15 })
}

// Dock: metal clamp + bay door close + soft seal. Undock reverses the order.
// Kenney CC0 samples (see public/audio/sfx/); synth fallback if not loaded.
export function playDock() {
  ensureSfx()
  const clamp = playSample('dock_clamp.ogg', { volume: 0.55, rate: 0.92 })
  const door = playSample('dock.ogg', { volume: 0.5, delay: 0.06 })
  const seal = playSample('dock_seal.ogg', { volume: 0.28, rate: 0.85, delay: 0.22 })
  if (clamp || door || seal) return
  tone({ type: 'sine', freq: 260, freqEnd: 480, duration: 0.7, attack: 0.1, peak: 0.16 })
  tone({ type: 'square', freq: 90, freqEnd: 55, duration: 0.18, peak: 0.32 })
  noiseBurst({ duration: 0.1, filterFreq: 1800, peak: 0.3, drive: 2.5 })
  noiseBurst({ duration: 0.5, filterFreq: 3000, peak: 0.14, delay: 0.08 })
}

export function playUndock() {
  ensureSfx()
  const seal = playSample('dock_seal.ogg', { volume: 0.25, rate: 1.15 })
  const door = playSample('undock.ogg', { volume: 0.52, delay: 0.05 })
  const clamp = playSample('dock_clamp.ogg', { volume: 0.45, rate: 1.08, delay: 0.28 })
  if (seal || door || clamp) return
  tone({ type: 'sine', freq: 480, freqEnd: 260, duration: 0.7, attack: 0.1, peak: 0.16 })
  noiseBurst({ duration: 0.35, filterFreq: 3000, peak: 0.14 })
  tone({ type: 'square', freq: 70, freqEnd: 105, duration: 0.16, peak: 0.3, delay: 0.3 })
  noiseBurst({ duration: 0.1, filterFreq: 1800, peak: 0.28, drive: 2.5, delay: 0.3 })
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

let cruiseNodes = null
// Synth fallback for cruise (only if sample missing after load).
let cruiseOscs = null
let cruiseGain = null
// Intent flag — samples may still be loading when cruise engages; we start
// the loop once ready, and never leave a synth hum running after disengage.
let cruiseWanted = false

function stopCruiseAudio() {
  if (cruiseNodes) {
    stopSampleNodes(cruiseNodes, 0.2)
    cruiseNodes = null
  }
  if (cruiseOscs) {
    const audio = getContext()
    const now = audio.currentTime
    try {
      cruiseGain.gain.cancelScheduledValues(now)
      cruiseGain.gain.setValueAtTime(Math.max(cruiseGain.gain.value, 0.0001), now)
      cruiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.08)
      for (const osc of cruiseOscs) {
        try { osc.stop(now + 0.1) } catch { /* already stopped */ }
        try { osc.disconnect() } catch { /* already */ }
      }
      try { cruiseGain.disconnect() } catch { /* already */ }
    } catch { /* ignore */ }
    cruiseOscs = null
    cruiseGain = null
  }
}

function startCruiseLoop() {
  if (!cruiseWanted || cruiseNodes || cruiseOscs) return

  // One-shot spool-up, then a looping big-engine bed.
  playSample('engine_engage.ogg', { volume: 0.45, rate: 1.05 })

  const nodes = playSample('supercruise.ogg', {
    volume: 0.38,
    rate: 1.08,
    loop: true,
    fadeIn: 0.35
  })
  if (nodes) {
    cruiseNodes = nodes
    return
  }

  // Sample missing after load — short-lived synth only as last resort.
  const audio = getContext()
  cruiseGain = audio.createGain()
  cruiseGain.gain.setValueAtTime(0, audio.currentTime)
  cruiseGain.gain.linearRampToValueAtTime(0.04, audio.currentTime + 0.4)
  cruiseOscs = [55, 58].map((freq) => {
    const osc = audio.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const f = audio.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 200
    osc.connect(f).connect(cruiseGain)
    osc.start()
    return osc
  })
  cruiseGain.connect(audio.destination)
}

export function setSupercruiseActive(active) {
  ensureSfx()
  if (active) {
    // Called every frame while cruising — only arm once, then keep the loop
    // alive (or start it once samples finish decoding).
    if (cruiseWanted) {
      if (!cruiseNodes && !cruiseOscs) startCruiseLoop()
      return
    }
    cruiseWanted = true
    // Wait for sample decode so we don't start a synth hum that can leak
    // if disengage races the load callback.
    if (sfxBuffers.has('supercruise.ogg')) {
      startCruiseLoop()
    } else {
      sfxLoadPromise?.then(() => {
        if (cruiseWanted) startCruiseLoop()
      })
    }
  } else {
    const wasOn = cruiseWanted || cruiseNodes || cruiseOscs
    cruiseWanted = false
    stopCruiseAudio()
    if (wasOn) {
      playSample('engine_engage.ogg', { volume: 0.3, rate: 0.75 })
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

const AMBIENT_TRACKS = ['bg1.mp3', 'bg2.mp3', 'bg3.mp3', 'bg4.mp3', 'bg5.mp3', 'bg6.mp3']
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
  playNextAmbientTrack()
}

export function stopAmbientMusic() {
  if (!ambientMusic) return
  ambientMusic.onended = null
  ambientMusic.pause()
  ambientMusic = null
}

