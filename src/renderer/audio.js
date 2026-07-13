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
  titleMusic?.play().catch(() => {})
  deathMusic?.play().catch(() => {})
  ambientMusic?.play().catch(() => {})
}
window.addEventListener('keydown', resumeAudioOnGesture, { once: true })
window.addEventListener('click', resumeAudioOnGesture, { once: true })

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

// One firing sound per weapon in data/weapons.js's catalog, keyed by weapon
// id directly (no separate "sound theme" indirection — each weapon already
// has exactly one sound). pulse_laser/rocket_pod reuse the original
// playLaser/playMissileLaunch layering unchanged; the rest scale the same
// "transient + body + sub" layering technique up or down with the weapon's
// own power so bigger guns read as meaningfully beefier, not just louder.
const WEAPON_SOUND_PROFILES = {
  pulse_laser: () => {
    tone({ type: 'sawtooth', freq: 1300, freqEnd: 350, duration: 0.15, peak: 0.22 })
    tone({ type: 'square', freq: 650, freqEnd: 175, duration: 0.12, peak: 0.12 })
    tone({ type: 'sine', freq: 150, freqEnd: 60, duration: 0.12, peak: 0.2 })
  },
  rapid_laser: () => {
    // Higher-pitched and shorter than pulse_laser — reads as a faster,
    // lighter-caliber weapon to match its quicker cooldown/lower damage.
    tone({ type: 'sawtooth', freq: 1700, freqEnd: 550, duration: 0.09, peak: 0.18 })
    tone({ type: 'square', freq: 850, freqEnd: 300, duration: 0.07, peak: 0.1 })
  },
  burst_laser: () => {
    // Two closely-spaced zaps (a real delay via tone's own `delay` param)
    // for a "burst" read instead of one shot.
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
    tone({ type: 'sawtooth', freq: 220, freqEnd: 60, duration: 0.35, peak: 0.14 })
    noiseBurst({ duration: 0.45, filterFreq: 350, peak: 0.28, drive: 2.5 })
  },
  seeker_missile: () => {
    tone({ type: 'sine', freq: 130, freqEnd: 55, duration: 0.55, peak: 0.32 })
    tone({ type: 'triangle', freq: 900, freqEnd: 1400, duration: 0.18, peak: 0.12 }) // a targeting-lock chirp
    noiseBurst({ duration: 0.5, filterFreq: 300, peak: 0.3, drive: 2.5 })
  },
  torpedo: () => {
    tone({ type: 'sine', freq: 70, freqEnd: 30, duration: 0.7, peak: 0.4 })
    noiseBurst({ duration: 0.6, filterFreq: 220, peak: 0.36, drive: 3 })
    tone({ type: 'square', freq: 55, freqEnd: 22, duration: 0.55, peak: 0.2 })
  }
}

export function playWeaponFire(weaponId) {
  const play = WEAPON_SOUND_PROFILES[weaponId] ?? WEAPON_SOUND_PROFILES.pulse_laser
  play()
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

// A heavier, more mechanical clamp-and-seal sound (a hard metallic clunk as
// the docking clamps engage, then a hydraulic hiss as the bay seals) layered
// on top of the original rising access-granted tone, rather than that tone
// alone reading as a soft chime.
export function playDock() {
  tone({ type: 'sine', freq: 260, freqEnd: 480, duration: 0.7, attack: 0.1, peak: 0.16 })
  tone({ type: 'square', freq: 90, freqEnd: 55, duration: 0.18, peak: 0.32 })
  noiseBurst({ duration: 0.1, filterFreq: 1800, peak: 0.3, drive: 2.5 })
  noiseBurst({ duration: 0.5, filterFreq: 3000, peak: 0.14, delay: 0.08 })
}

// The reverse sequence — hiss (clamps releasing) first, then the clunk of
// mechanical disengagement — under the original falling departure tone.
export function playUndock() {
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
export function announce(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel() // don't queue up stale callouts behind a new one
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.05
  utterance.pitch = 0.85
  utterance.volume = 0.8
  window.speechSynthesis.speak(utterance)
}

let thrustOsc = null
let thrustGain = null
let thrustMode = null // 'accel' | 'brake' | null

// Distinct waveform + pitch per mode (not just on/off) — a duller square
// wave a fourth lower for braking reads as "backing off/reverse" against the
// brighter accelerating sawtooth, without needing a second signal chain.
const THRUST_PROFILES = {
  accel: { type: 'sawtooth', freq: 70, peak: 0.05 },
  brake: { type: 'square', freq: 48, peak: 0.045 }
}

export function setThrustState(mode) {
  const audio = getContext()
  if (mode === thrustMode) return
  if (thrustOsc) {
    thrustGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.15)
    thrustOsc.stop(audio.currentTime + 0.2)
    thrustOsc = null
    thrustGain = null
  }
  thrustMode = mode
  if (!mode) return

  const profile = THRUST_PROFILES[mode]
  thrustOsc = audio.createOscillator()
  thrustGain = audio.createGain()
  thrustOsc.type = profile.type
  thrustOsc.frequency.value = profile.freq
  thrustGain.gain.setValueAtTime(0, audio.currentTime)
  thrustGain.gain.linearRampToValueAtTime(profile.peak, audio.currentTime + 0.2)
  thrustOsc.connect(thrustGain).connect(audio.destination)
  thrustOsc.start()
}

let cruiseOscs = null
let cruiseGain = null

export function setSupercruiseActive(active) {
  const audio = getContext()
  if (active && !cruiseOscs) {
    // A much bassier one-shot "punch" for the engage moment, on top of the
    // sustained cruise hum below — a rising sub-bass sweep plus a driven
    // low rumble, not just a louder version of the hum.
    tone({ type: 'sine', freq: 45, freqEnd: 130, duration: 0.6, attack: 0.05, peak: 0.5 })
    tone({ type: 'square', freq: 30, freqEnd: 70, duration: 0.5, peak: 0.3 })
    noiseBurst({ duration: 0.4, filterFreq: 250, peak: 0.3, drive: 2 })

    cruiseGain = audio.createGain()
    cruiseGain.gain.setValueAtTime(0, audio.currentTime)
    cruiseGain.gain.linearRampToValueAtTime(0.06, audio.currentTime + 0.4)
    cruiseOscs = [220, 224].map((freq) => {
      const osc = audio.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(cruiseGain)
      osc.start()
      return osc
    })
    cruiseGain.connect(audio.destination)
  } else if (!active && cruiseOscs) {
    // The mirror disengage punch — falling instead of rising.
    tone({ type: 'sine', freq: 130, freqEnd: 35, duration: 0.6, attack: 0.02, peak: 0.45 })
    tone({ type: 'square', freq: 70, freqEnd: 25, duration: 0.5, peak: 0.28 })
    noiseBurst({ duration: 0.35, filterFreq: 200, peak: 0.25, drive: 1.5 })

    cruiseGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.3)
    for (const osc of cruiseOscs) osc.stop(audio.currentTime + 0.35)
    cruiseOscs = null
    cruiseGain = null
  }
}

let miningBeamOsc = null
let miningBeamGain = null
let miningBeamLFO = null

// A steady, gently warbling triangle-wave hum — deliberately unlike any of
// the WEAPON_SOUND_PROFILES' bright one-shot zaps, since this needs to
// sustain continuously for as long as the mining beam is actively firing
// rather than play as a one-shot.
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

