import * as THREE from 'three'

// A soft radial-gradient sprite, generated once via Canvas 2D (no image
// assets/textures anywhere else in the codebase, so this stays consistent —
// just a procedural circle instead of a procedural vertex-color pattern).
function buildCloudTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

const NEBULA_HUES = [270, 205, 320, 190, 15, 350]

// A handful of large, softly-glowing sprite clusters scattered around a few
// centers (rather than one uniform haze) so it reads as wispy cosmic dust
// clouds. Not seeded off the galaxy PRNG — this is a fixed decorative
// backdrop, same convention as starfield.js's plain Math.random().
export function createNebula(clusterCount = 9, puffsPerCluster = 20) {
  const texture = buildCloudTexture()
  const group = new THREE.Group()

  for (let c = 0; c < clusterCount; c++) {
    const hue = NEBULA_HUES[c % NEBULA_HUES.length]
    // Every system shares the same (0,0,0) local origin (see galaxy.js), so a
    // cluster placed too close to it would loom over every system's view.
    // Keeping centers well outside the largest local play volume (bodies up
    // to ~1600 out, giant-star coronas up to ~380) guarantees it always
    // reads as distant backdrop instead of an occasional close-up wash-out.
    const angle = Math.random() * Math.PI * 2
    const centerDist = 2800 + Math.random() * 2000
    const center = new THREE.Vector3(Math.cos(angle) * centerDist, (Math.random() - 0.5) * 800, Math.sin(angle) * centerDist)

    for (let i = 0; i < puffsPerCluster; i++) {
      // Hue drifts slightly per puff (real emission nebulae aren't one flat
      // color), and each puff is stretched into a randomly-rotated ellipse —
      // overlapping elongated wisps at different angles read as filamentary
      // gas structure instead of a pile of circles.
      const color = new THREE.Color().setHSL(((hue + (Math.random() - 0.5) * 40) % 360) / 360, 0.55 + Math.random() * 0.25, 0.45 + Math.random() * 0.15)
      const material = new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0.04 + Math.random() * 0.07,
        rotation: Math.random() * Math.PI * 2,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(
        center.x + (Math.random() - 0.5) * 1400,
        center.y + (Math.random() - 0.5) * 500,
        center.z + (Math.random() - 0.5) * 1400
      )
      const scale = 800 + Math.random() * 1400
      sprite.scale.set(scale * (1.4 + Math.random() * 1.2), scale * (0.4 + Math.random() * 0.5), 1)
      group.add(sprite)
    }
  }

  // A few huge, extremely faint neutral-grey veils spread wide — the "cosmic
  // dust" haze between the colored clusters, barely perceptible individually
  // but together they kill the pure-black emptiness between nebulae.
  for (let i = 0; i < 8; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color().setHSL(220 / 360, 0.15, 0.5),
      transparent: true,
      opacity: 0.02 + Math.random() * 0.02,
      rotation: Math.random() * Math.PI * 2,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
    const sprite = new THREE.Sprite(material)
    const angle = Math.random() * Math.PI * 2
    const dist = 3000 + Math.random() * 2500
    sprite.position.set(Math.cos(angle) * dist, (Math.random() - 0.5) * 1500, Math.sin(angle) * dist)
    sprite.scale.set(3500 + Math.random() * 2000, 1200 + Math.random() * 900, 1)
    group.add(sprite)
  }

  group.userData.spinSpeed = 0.006
  return group
}

// Slow drift so the clouds read as swirling rather than a static painting —
// driven by dt like everything else (see updateStarMesh), not wall-clock time.
export function updateNebula(nebula, dt) {
  nebula.rotation.y += nebula.userData.spinSpeed * dt
}
