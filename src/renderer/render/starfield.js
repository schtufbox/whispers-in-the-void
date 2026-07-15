import * as THREE from 'three'

// Thin shell only — if stars fill a thick volume around the camera, ones
// between the camera and a planet draw *in front* of the planet (see-through
// starfield). Keep them at ~radius so depthTest can hide them behind solids.
function scatterPositions(count, radius) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = radius * (0.94 + Math.random() * 0.06)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  return positions
}

// A rough stellar-temperature palette (cool blue/white through warm
// yellow/orange) instead of uniform white, so the field reads as varied
// pinpricks of real stars rather than a flat wall of identical dots.
const STAR_TINTS = [0xffffff, 0xd8e6ff, 0xbcd8ff, 0xfff4e0, 0xffe0b0]

// Without a map, PointsMaterial renders each star as a hard square pixel
// block — a soft radial-gradient sprite (the same canvas technique
// nebula.js/thrusterParticles.js use) makes every star a round point of
// light instead. One shared texture for every layer.
let starSprite = null
function getStarSprite() {
  if (starSprite) return starSprite
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  starSprite = new THREE.CanvasTexture(canvas)
  return starSprite
}

function buildLayer(count, radius, size, brightnessMin = 0.5) {
  const colors = new Float32Array(count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    c.set(STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0])
    const brightness = brightnessMin + Math.random() * (1 - brightnessMin)
    colors[i * 3] = c.r * brightness
    colors[i * 3 + 1] = c.g * brightness
    colors[i * 3 + 2] = c.b * brightness
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(scatterPositions(count, radius), 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: false,
    vertexColors: true,
    map: getStarSprite(),
    transparent: true,
    // depthTest so planets/stations occlude stars; no depthWrite so stars
    // don't punch holes in each other. Transparent + additive still draws
    // after opaques, but fails the depth test where a solid is nearer.
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
  return new THREE.Points(geometry, material)
}

// Three size tiers — many small dim pinpricks, a sparser mid layer, and a
// handful of big soft "hero" glow stars — reads as a naturally varied field
// with depth instead of one uniform point cloud. ~2% of the field twinkles:
// those stars live in four small extra layers, each layer's whole-material
// opacity oscillating on its own phase/speed (see updateStarfield) — cheap
// per-layer uniform animation instead of a per-star shader, and with the
// stars scattered randomly across four out-of-phase groups it still reads
// as individual stars twinkling rather than a synchronized blink.
// Radius near the camera far plane (see render/scene.js) so the shell sits
// behind typical in-system bodies when the field is re-centered on the camera.
export function createStarfield(count = 9000, radius = 17000) {
  const group = new THREE.Group()
  group.add(buildLayer(Math.round(count * 0.85), radius, 2.2, 0.35))
  group.add(buildLayer(Math.round(count * 0.15), radius, 4.5, 0.6))
  group.add(buildLayer(60, radius, 11, 0.8))

  const twinkleLayers = []
  const perLayer = Math.round((count * 0.02) / 4)
  for (let i = 0; i < 4; i++) {
    const layer = buildLayer(perLayer, radius, 3.5, 0.85)
    group.add(layer)
    twinkleLayers.push({ layer, phase: (i / 4) * Math.PI * 2, speed: 1.5 + i * 0.7 })
  }
  group.userData.twinkleLayers = twinkleLayers
  return group
}

// Called each frame from main.js right after the starfield is re-centered
// on the camera — elapsed is wall-clock-ish accumulated time (the twinkle is
// pure decoration, so it doesn't need gameState.simTime discipline).
export function updateStarfield(starfield, elapsed) {
  for (const t of starfield.userData.twinkleLayers) {
    t.layer.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(elapsed * t.speed + t.phase))
  }
}
