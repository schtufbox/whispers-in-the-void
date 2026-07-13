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

const NEBULA_HUES = [270, 205, 320, 190]

// A handful of large, softly-glowing sprite clusters scattered around a few
// centers (rather than one uniform haze) so it reads as wispy cosmic dust
// clouds. Not seeded off the galaxy PRNG — this is a fixed decorative
// backdrop, same convention as starfield.js's plain Math.random().
export function createNebula(clusterCount = 9, puffsPerCluster = 20) {
  const texture = buildCloudTexture()
  const group = new THREE.Group()

  for (let c = 0; c < clusterCount; c++) {
    const color = new THREE.Color().setHSL(NEBULA_HUES[c % NEBULA_HUES.length] / 360, 0.6, 0.5)
    // Every system shares the same (0,0,0) local origin (see galaxy.js), so a
    // cluster placed too close to it would loom over every system's view.
    // Keeping centers well outside the largest local play volume (bodies up
    // to ~1600 out, giant-star coronas up to ~380) guarantees it always
    // reads as distant backdrop instead of an occasional close-up wash-out.
    const angle = Math.random() * Math.PI * 2
    const centerDist = 2800 + Math.random() * 2000
    const center = new THREE.Vector3(Math.cos(angle) * centerDist, (Math.random() - 0.5) * 800, Math.sin(angle) * centerDist)

    for (let i = 0; i < puffsPerCluster; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0.04 + Math.random() * 0.07,
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
      sprite.scale.set(scale, scale, 1)
      group.add(sprite)
    }
  }

  group.userData.spinSpeed = 0.006
  return group
}

// Slow drift so the clouds read as swirling rather than a static painting —
// driven by dt like everything else (see updateStarMesh), not wall-clock time.
export function updateNebula(nebula, dt) {
  nebula.rotation.y += nebula.userData.spinSpeed * dt
}
