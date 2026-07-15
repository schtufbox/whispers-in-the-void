import * as THREE from 'three'

// Hyperdrive corridor — same full-frame camera-parented idea as the
// supercruise tunnel, but the cross-section is a 5-pointed star rather
// than a circle. Streaks ride the star wall, star-shaped depth rings rush
// past, and a soft star haze sells the tube.

const STREAK_WALL = 160
const STREAK_INNER = 80
const RING_COUNT = 7
const STAR_POINTS = 5
const STAR_OUTER = 28
const STAR_INNER_RATIO = 0.38
const STAR_ROT_SPEED = 0.12

function buildStreakMap() {
  const w = 32
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.12, 'rgba(180,255,220,0.9)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(0.88, 'rgba(120,220,255,0.75)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const core = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  core.addColorStop(0, 'rgba(255,255,255,0)')
  core.addColorStop(0.4, 'rgba(255,255,255,0.95)')
  core.addColorStop(0.6, 'rgba(255,255,255,0.95)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = core
  ctx.fillRect(w * 0.38, 0, w * 0.24, h)
  return new THREE.CanvasTexture(canvas)
}

function buildGlowMap() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(200,255,240,0.8)')
  g.addColorStop(0.45, 'rgba(80,200,255,0.28)')
  g.addColorStop(1, 'rgba(20,80,140,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

/**
 * Unit radius of a regular star polygon envelope at angle θ.
 * Tips at outer=1, valleys at innerRatio — continuous wall, not discrete spikes only.
 */
function starRadiusAt(theta, points = STAR_POINTS, innerRatio = STAR_INNER_RATIO) {
  const sector = Math.PI / points
  // Fold into one half-point: 0 at tip, sector at valley.
  let a = theta % (2 * sector)
  if (a < 0) a += 2 * sector
  if (a > sector) a = 2 * sector - a
  const t = a / sector
  // Slightly concave blend so tips read sharp.
  const ease = t * t * (3 - 2 * t)
  return 1 + (innerRatio - 1) * ease
}

/** Sample a 2D star outline (closed) for ring / haze geometry. */
function starOutlineVertices(outerR, innerRatio, points = STAR_POINTS, stepsPerPoint = 8) {
  const verts = []
  const total = points * 2 * stepsPerPoint
  for (let i = 0; i <= total; i++) {
    const theta = (i / total) * Math.PI * 2 - Math.PI / 2
    const r = outerR * starRadiusAt(theta, points, innerRatio)
    verts.push(Math.cos(theta) * r, Math.sin(theta) * r, 0)
  }
  return new Float32Array(verts)
}

function makeStarRingMesh(outerR, thickness, color) {
  // Two concentric star outlines extruded as a thin annular strip via triangles.
  const stepsPerPoint = 6
  const points = STAR_POINTS
  const total = points * 2 * stepsPerPoint
  const positions = []
  const indices = []
  for (let i = 0; i <= total; i++) {
    const theta = (i / total) * Math.PI * 2 - Math.PI / 2
    const unit = starRadiusAt(theta, points, STAR_INNER_RATIO)
    const ro = outerR * unit
    const ri = (outerR - thickness) * unit
    positions.push(Math.cos(theta) * ro, Math.sin(theta) * ro, 0)
    positions.push(Math.cos(theta) * ri, Math.sin(theta) * ri, 0)
  }
  for (let i = 0; i < total; i++) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    indices.push(a, c, b, b, c, d)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
  )
}

function makeStarHazeMesh(outerR, depth, color, opacity) {
  // Open star-tube: rings of star cross-sections lofted along Z, open-ended.
  const rings = 10
  const stepsPerPoint = 5
  const total = STAR_POINTS * 2 * stepsPerPoint
  const positions = []
  const indices = []
  for (let zi = 0; zi <= rings; zi++) {
    const z = -depth * (zi / rings)
    const taper = 0.85 + 0.2 * (zi / rings)
    for (let i = 0; i < total; i++) {
      const theta = (i / total) * Math.PI * 2 - Math.PI / 2
      const r = outerR * taper * starRadiusAt(theta, STAR_POINTS, STAR_INNER_RATIO)
      positions.push(Math.cos(theta) * r, Math.sin(theta) * r, z)
    }
  }
  for (let zi = 0; zi < rings; zi++) {
    for (let i = 0; i < total; i++) {
      const i2 = (i + 1) % total
      const a = zi * total + i
      const b = zi * total + i2
      const c = (zi + 1) * total + i
      const d = (zi + 1) * total + i2
      indices.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      wireframe: false
    })
  )
}

export function createHyperspaceTunnel() {
  const group = new THREE.Group()
  group.visible = false
  group.renderOrder = 10
  group.frustumCulled = false

  // Spinning star frame — streaks/rings parented so the whole corridor twists.
  const spin = new THREE.Group()
  spin.frustumCulled = false
  group.add(spin)

  const streakMap = buildStreakMap()
  const glowMap = buildGlowMap()
  const geometry = new THREE.PlaneGeometry(1, 1)

  function makeStreak(lightJitter, layer) {
    const mat = new THREE.MeshBasicMaterial({
      map: streakMap,
      color: new THREE.Color().setHSL(0.48 + Math.random() * 0.12, 0.55, 0.72 + lightJitter),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.frustumCulled = false
    spin.add(mesh)
    return {
      mesh,
      layer,
      // angle on the star wall (0..2π)
      angle: Math.random() * Math.PI * 2,
      // radial scale relative to star unit radius (wall band / inner band)
      radiusScale: 1,
      z: -20,
      speed: 100,
      len: 12,
      thick: 0.15,
      phase: Math.random(),
      lightJitter
    }
  }

  const streaks = []
  for (let i = 0; i < STREAK_WALL; i++) {
    streaks.push(makeStreak(0.05 + Math.random() * 0.15, 'wall'))
  }
  for (let i = 0; i < STREAK_INNER; i++) {
    streaks.push(makeStreak(0.1 + Math.random() * 0.2, 'inner'))
  }

  // Bright vanishing-point core
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: 0xc8fff0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
  )
  core.scale.setScalar(40)
  core.position.set(0, 0, -120)
  core.frustumCulled = false
  group.add(core)

  // Star-shaped depth rings
  const rings = []
  for (let i = 0; i < RING_COUNT; i++) {
    const mesh = makeStarRingMesh(STAR_OUTER * (0.85 + (i % 3) * 0.06), 1.1 + (i % 2) * 0.4, 0x7affd0)
    mesh.frustumCulled = false
    spin.add(mesh)
    rings.push({
      mesh,
      z: -28 - i * (130 / RING_COUNT),
      speed: 85 + i * 14,
      baseScale: 0.9 + (i % 3) * 0.05
    })
  }

  // Soft star-tube haze (outer + tighter inner)
  const haze = makeStarHazeMesh(STAR_OUTER * 1.12, 200, 0x0a3040, 0.22)
  haze.position.z = 0
  haze.frustumCulled = false
  spin.add(haze)

  const hazeInner = makeStarHazeMesh(STAR_OUTER * 0.55, 160, 0x104858, 0.1)
  hazeInner.frustumCulled = false
  spin.add(hazeInner)

  // Faint wireframe star outline near the camera as a "portal lip"
  {
    const lipPos = starOutlineVertices(STAR_OUTER * 1.05, STAR_INNER_RATIO, STAR_POINTS, 10)
    const lipGeo = new THREE.BufferGeometry()
    lipGeo.setAttribute('position', new THREE.BufferAttribute(lipPos, 3))
    const lip = new THREE.Line(
      lipGeo,
      new THREE.LineBasicMaterial({
        color: 0xa0ffe8,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
      })
    )
    lip.position.z = -18
    lip.frustumCulled = false
    spin.add(lip)
  }

  let active = false
  let spinAngle = 0

  function resetStreak(s, strength) {
    s.angle = Math.random() * Math.PI * 2
    if (s.layer === 'wall') {
      // Tight band on the star wall.
      s.radiusScale = 0.88 + Math.random() * 0.2
      s.speed = (160 + Math.random() * 320) * (0.65 + strength * 0.9)
      s.len = 14 + Math.random() * 50 * (0.7 + strength)
      s.thick = 0.1 + Math.random() * 0.38
    } else {
      // Inner filaments closer to the axis, still on a star-ish distribution.
      s.radiusScale = 0.18 + Math.random() * 0.5
      s.speed = (220 + Math.random() * 400) * (0.7 + strength)
      s.len = 10 + Math.random() * 36 * (0.6 + strength)
      s.thick = 0.05 + Math.random() * 0.2
    }
    s.z = -18 - Math.random() * 200
    s.phase = Math.random()
  }

  for (const s of streaks) resetStreak(s, 0.7)

  return {
    group,
    start() {
      active = true
      spinAngle = 0
      group.visible = true
      for (const s of streaks) resetStreak(s, 0.7)
    },
    stop() {
      active = false
      group.visible = false
    },
    /**
     * @param {number} dt
     * @param {number} strength 0–1 overall effect strength
     * @param {THREE.Camera} camera
     */
    update(dt, strength, camera) {
      if (!active) return
      group.visible = strength > 0.02

      // Stick to camera so the tunnel always fills the frame.
      group.position.copy(camera.position)
      group.quaternion.copy(camera.quaternion)

      // Slow twist of the star corridor — more "matrix corridor" than rigid pipe.
      spinAngle += STAR_ROT_SPEED * (0.4 + strength) * dt
      spin.rotation.z = spinAngle

      const rush = 0.6 + strength * 2.0
      const i = Math.min(1, Math.max(0.2, strength))

      for (const s of streaks) {
        s.z += s.speed * rush * dt
        if (s.z > 22) resetStreak(s, strength)

        // Perspective flare as streaks approach the lens.
        const depthT = Math.min(1, Math.max(0, (s.z + 180) / 200))
        const flare = 1 + depthT * depthT * 0.9
        // angle is spin-local; parent spin group handles corridor twist.
        const unitR = starRadiusAt(s.angle, STAR_POINTS, STAR_INNER_RATIO)
        const r = STAR_OUTER * s.radiusScale * unitR * flare
        // Cancel spin on angle placement so wall stays fixed in spin group;
        // angle is already in spin-local space.
        const x = Math.cos(s.angle) * r
        const y = Math.sin(s.angle) * r
        s.mesh.position.set(x, y, s.z)
        const lenMul = 0.55 + i * 1.25
        const thickMul = 0.7 + i * 1.0
        s.mesh.scale.set(s.thick * thickMul, s.len * lenMul, 1)
        s.mesh.rotation.set(Math.PI / 2, 0, s.angle)
        const nearFade = Math.min(1, (20 - s.z) / 24 + 0.25)
        const farFade = Math.min(1, (-s.z) / 50 + 0.2)
        s.mesh.material.opacity =
          (s.layer === 'wall' ? 0.4 : 0.26) * (0.5 + i * 0.75) * (0.4 + s.phase * 0.6) * nearFade * farFade
      }

      for (const r of rings) {
        r.z += r.speed * rush * dt
        if (r.z > 18) {
          r.z = -190 - Math.random() * 40
          r.baseScale = 0.85 + Math.random() * 0.2
        }
        const depthT = Math.min(1, Math.max(0, (r.z + 180) / 200))
        const sc = r.baseScale * (1 + depthT * 0.85) * (0.8 + i * 0.3)
        r.mesh.scale.set(sc, sc, sc)
        r.mesh.position.set(0, 0, r.z)
        r.mesh.material.opacity = (0.06 + i * 0.2) * Math.min(1, (-r.z) / 35 + 0.25)
      }

      haze.material.opacity = 0.1 + i * 0.28
      haze.scale.set(0.95 + i * 0.1, 0.95 + i * 0.1, 0.9 + i * 0.2)
      hazeInner.material.opacity = 0.05 + i * 0.12
      hazeInner.scale.set(0.9 + i * 0.12, 0.9 + i * 0.12, 0.85 + i * 0.2)

      core.position.z = -95 - (1 - strength) * 35
      core.scale.setScalar(22 + strength * 60)
      core.material.opacity = 0.3 + strength * 0.65
    }
  }
}
