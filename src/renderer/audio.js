let ctx = null
let ambientStarted = false

function getContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Browsers/Electron require a user gesture before audio can start.
window.addEventListener('keydown', () => getContext(), { once: true })
window.addEventListener('click', () => getContext(), { once: true })

function tone({ type = 'sine', freq, freqEnd, duration, attack = 0.005, peak = 0.25 }) {
  const audio = getContext()
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, audio.currentTime)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, audio.currentTime + duration)
  gain.gain.setValueAtTime(0, audio.currentTime)
  gain.gain.linearRampToValueAtTime(peak, audio.currentTime + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + duration + 0.05)
}

function noiseBurst({ duration, filterFreq = 800, peak = 0.4 }) {
  const audio = getContext()
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
  gain.gain.setValueAtTime(peak, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration)

  source.connect(filter).connect(gain).connect(audio.destination)
  source.start()
}

export function playLaser() {
  tone({ type: 'sawtooth', freq: 1300, freqEnd: 350, duration: 0.15, peak: 0.15 })
}

export function playMissileLaunch() {
  tone({ type: 'sine', freq: 90, freqEnd: 50, duration: 0.4, peak: 0.2 })
  noiseBurst({ duration: 0.3, filterFreq: 400, peak: 0.15 })
}

export function playHit() {
  noiseBurst({ duration: 0.15, filterFreq: 1500, peak: 0.2 })
}

export function playExplosion() {
  noiseBurst({ duration: 0.6, filterFreq: 600, peak: 0.5 })
  tone({ type: 'sine', freq: 120, freqEnd: 40, duration: 0.5, peak: 0.3 })
}

export function playDeath() {
  tone({ type: 'sawtooth', freq: 400, freqEnd: 40, duration: 1.8, attack: 0.05, peak: 0.3 })
}

export function playClick() {
  tone({ type: 'square', freq: 700, duration: 0.05, peak: 0.08 })
}

export function playHyperspace() {
  tone({ type: 'sine', freq: 200, freqEnd: 1600, duration: 0.9, attack: 0.3, peak: 0.22 })
  noiseBurst({ duration: 0.9, filterFreq: 2200, peak: 0.12 })
}

export function playDock() {
  tone({ type: 'sine', freq: 260, freqEnd: 480, duration: 0.7, attack: 0.1, peak: 0.16 })
}

export function playUndock() {
  tone({ type: 'sine', freq: 480, freqEnd: 260, duration: 0.7, attack: 0.1, peak: 0.16 })
}

export function playMiningPing() {
  tone({ type: 'triangle', freq: 900, freqEnd: 1400, duration: 0.12, peak: 0.14 })
}

let thrustOsc = null
let thrustGain = null

export function setThrustActive(active) {
  const audio = getContext()
  if (active && !thrustOsc) {
    thrustOsc = audio.createOscillator()
    thrustGain = audio.createGain()
    thrustOsc.type = 'sawtooth'
    thrustOsc.frequency.value = 70
    thrustGain.gain.setValueAtTime(0, audio.currentTime)
    thrustGain.gain.linearRampToValueAtTime(0.05, audio.currentTime + 0.2)
    thrustOsc.connect(thrustGain).connect(audio.destination)
    thrustOsc.start()
  } else if (!active && thrustOsc) {
    thrustGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.2)
    thrustOsc.stop(audio.currentTime + 0.25)
    thrustOsc = null
    thrustGain = null
  }
}

let cruiseOscs = null
let cruiseGain = null

export function setSupercruiseActive(active) {
  const audio = getContext()
  if (active && !cruiseOscs) {
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
    cruiseGain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.3)
    for (const osc of cruiseOscs) osc.stop(audio.currentTime + 0.35)
    cruiseOscs = null
    cruiseGain = null
  }
}

export function startAmbientHum() {
  if (ambientStarted) return
  ambientStarted = true
  const audio = getContext()
  for (const freq of [55, 82.5]) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.02
    osc.connect(gain).connect(audio.destination)
    osc.start()
  }
}
