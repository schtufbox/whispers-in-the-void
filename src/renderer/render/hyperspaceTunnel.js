import * as THREE from 'three'
import {
  createLightningGeometry,
  createLightningMaterial,
  rewriteSpiralLightningBolt
} from './lightningBolt.js'

// Hyperdrive corridor — same spiral-lightning language as supercruise, with a
// 5-pointed star frame (haze + rings + lip). Streamers match SC (circular
// helix + mesh spin); the star is the corridor shell only so bolts stay stable.

const TUNNEL_STREAMERS = 16
const RING_COUNT = 7
const STAR_POINTS = 5
const STAR_OUTER = 28
const STAR_INNER_RATIO = 0.38
const STAR_ROT_SPEED = 0.12
// Keep all tunnel geometry past the chase-camera ship (~44u at zoom 1) so
// effects sit behind the hull rather than painting over it.
const Z_NEAR = -58
const Z_FAR = -280
// grow: 0 → 1 far→near; >1 holds full span, then recycle.
const GROW_HOLD = 1.4
// Rings / lip recycle before they reach the ship plane.
const Z_RECYCLE = Z_NEAR + 4

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

/** Sample a 2D star outline (closed) for ring / lip geometry. */
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

function tunnelMat(color, opacity, { side = THREE.DoubleSide } = {}) {
  // depthTest on so the player ship (opaque, writes depth) occludes tunnel
  // fragments behind it; depthWrite off so transparent layers don't fight.
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side
  })
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
  return new THREE.Mesh(geo, tunnelMat(color, 0.16))
}

/**
 * Open star-tube lofted along Z from zNear → zFar (both negative, |zFar| larger).
 * Starts past the ship so the near mouth never sits between camera and hull.
 */
function makeStarHazeMesh(outerR, zNear, zFar, color, opacity) {
  const rings = 12
  const stepsPerPoint = 5
  const total = STAR_POINTS * 2 * stepsPerPoint
  const positions = []
  const indices = []
  const depth = Math.abs(zFar - zNear)
  for (let zi = 0; zi <= rings; zi++) {
    const t = zi / rings
    const z = zNear + (zFar - zNear) * t
    // Slight taper: a bit wider near the camera mouth.
    const taper = 1.05 - 0.15 * t
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
  // BackSide so we see the inner wall of the corridor from inside.
  return new THREE.Mesh(geo, tunnelMat(color, opacity, { side: THREE.BackSide }))
}

export function createHyperspaceTunnel() {
  const group = new THREE.Group()
  group.visible = false
  // Below the player ship (default 0) so opaque hull wins when depths are equal;
  // with depthTest true the ship already occludes, but keep order conservative.
  group.renderOrder = 1
  group.frustumCulled = false

  // Spinning star frame — haze/rings/lip only. Streamers live on `group` so
  // they spin like supercruise (mesh.rotation.z) without double-transform.
  const spin = new THREE.Group()
  spin.frustumCulled = false
  group.add(spin)

  const glowMap = buildGlowMap()

  function makeStreamer(lightJitter) {
    const geo = createLightningGeometry()
    const hue = 0.48 + Math.random() * 0.1
    const coreMat = createLightningMaterial(
      new THREE.Color().setHSL(hue, 0.7, 0.78 + lightJitter),
      0.95
    )
    const glowMat = createLightningMaterial(
      new THREE.Color().setHSL(hue + 0.03, 0.55, 0.55 + lightJitter * 0.4),
      0.42
    )
    const core = new THREE.LineSegments(geo, coreMat)
    const glow = new THREE.LineSegments(geo, glowMat)
    core.frustumCulled = false
    glow.frustumCulled = false
    // Same as SC: geometry in tunnel space, mesh at origin, spin via rotation.z.
    core.position.set(0, 0, 0)
    glow.position.set(0, 0, 0)
    group.add(glow)
    group.add(core)
    return {
      mesh: core,
      glow,
      lightJitter,
      angle0: 0,
      radius: STAR_OUTER,
      twists: 1.2,
      spin: 0.35,
      advance: 0.12,
      phase: Math.random(),
      flickerT: 0,
      grow: 0
    }
  }

  const streaks = []
  for (let i = 0; i < TUNNEL_STREAMERS; i++) {
    streaks.push(makeStreamer(0.05 + Math.random() * 0.14))
  }

  // Bright vanishing-point core at the far mouth (lightning origins).
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: 0xc8fff0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true
    })
  )
  core.scale.setScalar(40)
  core.position.set(0, 0, Z_FAR * 0.92)
  core.frustumCulled = false
  group.add(core)

  // Star-shaped depth rings — only past the ship plane.
  const rings = []
  for (let i = 0; i < RING_COUNT; i++) {
    const mesh = makeStarRingMesh(STAR_OUTER * (0.85 + (i % 3) * 0.06), 1.1 + (i % 2) * 0.4, 0x7affd0)
    mesh.frustumCulled = false
    spin.add(mesh)
    rings.push({
      mesh,
      z: Z_NEAR - 8 - i * (Math.abs(Z_FAR - Z_NEAR) * 0.9 / RING_COUNT),
      speed: 85 + i * 14,
      baseScale: 0.9 + (i % 3) * 0.05
    })
  }

  // Soft star-tube haze from just past the ship to the far mouth.
  const haze = makeStarHazeMesh(STAR_OUTER * 1.12, Z_NEAR, Z_FAR, 0x0a3040, 0.18)
  haze.frustumCulled = false
  spin.add(haze)

  const hazeInner = makeStarHazeMesh(STAR_OUTER * 0.55, Z_NEAR - 4, Z_FAR * 0.92, 0x104858, 0.08)
  hazeInner.frustumCulled = false
  spin.add(hazeInner)

  // Portal lip just past the ship (not between camera and hull).
  {
    const lipPos = starOutlineVertices(STAR_OUTER * 1.05, STAR_INNER_RATIO, STAR_POINTS, 10)
    const lipGeo = new THREE.BufferGeometry()
    lipGeo.setAttribute('position', new THREE.BufferAttribute(lipPos, 3))
    const lip = new THREE.Line(
      lipGeo,
      new THREE.LineBasicMaterial({
        color: 0xa0ffe8,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true
      })
    )
    lip.position.z = Z_NEAR
    lip.frustumCulled = false
    spin.add(lip)
  }

  let active = false
  let spinAngle = 0
  const _aim = new THREE.Vector3()
  const _eye = new THREE.Vector3()
  const _up = new THREE.Vector3()
  const _lookMat = new THREE.Matrix4()

  function reshapeStreamer(s) {
    // Same spiral as SC: circular helix far→tip, continuous mesh spin separate.
    const twists = (1.2 + Math.random() * 1.35) * (s.spin >= 0 ? 1 : -1)
    s.twists = twists
    const g = Math.min(1, Math.max(0.04, s.grow ?? 1))
    const zTip = Z_FAR + (Z_NEAR - Z_FAR) * g
    rewriteSpiralLightningBolt(s.mesh.geometry, {
      zStart: Z_FAR,
      zEnd: zTip,
      radius: s.radius,
      angle0: 0,
      twists,
      jag: 0.9 + Math.random() * 1.15,
      forks: 2 + Math.floor(Math.random() * 3),
      thickness: 0.2 + Math.random() * 0.16
    })
    s.flickerT = 0.12 + Math.random() * 0.16
  }

  function resetStreamer(s, strength) {
    s.angle0 = Math.random() * Math.PI * 2
    s.spin = (0.3 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1)
    s.advance = (0.5 + Math.random() * 0.4) * (0.75 + strength * 0.5)
    s.radius = STAR_OUTER * (0.88 + Math.random() * 0.22)
    s.phase = Math.random()
    s.grow = Math.random() * 0.3
    reshapeStreamer(s)
  }

  for (const s of streaks) resetStreamer(s, 0.7)

  return {
    group,
    start() {
      active = true
      spinAngle = 0
      group.visible = true
      for (const s of streaks) resetStreamer(s, 0.7)
    },
    stop() {
      active = false
      group.visible = false
    },
    /**
     * @param {number} dt
     * @param {number} strength 0–1 overall effect strength
     * @param {THREE.Camera} camera
     * @param {THREE.Vector3|number[]|null} [aimWorld] - crosshair aim; corridor
     *   vanishes along camera→aim (same as supercruise tunnel).
     */
    update(dt, strength, camera, aimWorld = null) {
      if (!active) return
      group.visible = strength > 0.02

      // Stick to camera; -Z toward crosshair (camera convention).
      // Object3D.lookAt on a Group aims +Z at the target — that hid the tunnel.
      group.position.copy(camera.position)
      if (aimWorld) {
        if (aimWorld.isVector3) _aim.copy(aimWorld)
        else _aim.fromArray(aimWorld)
        _eye.copy(camera.position)
        if (_eye.distanceToSquared(_aim) > 1e-4) {
          _up.copy(camera.up)
          _lookMat.lookAt(_eye, _aim, _up)
          group.quaternion.setFromRotationMatrix(_lookMat)
        } else {
          group.quaternion.copy(camera.quaternion)
        }
      } else {
        group.quaternion.copy(camera.quaternion)
      }

      // Slow twist of the star frame only (haze + rings + lip).
      spinAngle += STAR_ROT_SPEED * (0.4 + strength) * dt
      spin.rotation.z = spinAngle

      const rush = 0.55 + strength * 1.35
      const i = Math.min(1, Math.max(0.2, strength))

      for (const s of streaks) {
        // Match SC: spin helix on the mesh + grow tip far→near.
        s.angle0 += s.spin * rush * dt
        s.grow = (s.grow || 0) + s.advance * rush * dt
        if (s.grow > GROW_HOLD) {
          resetStreamer(s, strength)
          continue
        }

        s.flickerT -= dt
        if (s.flickerT <= 0) reshapeStreamer(s)

        s.mesh.rotation.set(0, 0, s.angle0)
        s.mesh.position.set(0, 0, 0)
        s.mesh.scale.set(1, 1, 1)
        if (s.glow) {
          s.glow.rotation.copy(s.mesh.rotation)
          s.glow.position.copy(s.mesh.position)
          s.glow.scale.set(1.12, 1.12, 1.12)
        }

        const reach = Math.min(1, s.grow)
        const holdFade = s.grow > 1 ? Math.max(0, 1 - (s.grow - 1) / (GROW_HOLD - 1)) : 1
        const crackle = 0.6 + 0.4 * Math.sin(s.phase * 45 + s.angle0 * 2.2)
        const baseOp =
          0.92 * (0.5 + i * 0.75) * (0.55 + s.phase * 0.45) * (0.4 + reach * 0.6) * holdFade * crackle
        s.mesh.material.opacity = Math.max(0, baseOp)
        if (s.glow) s.glow.material.opacity = Math.max(0, baseOp * 0.48)
      }

      for (const r of rings) {
        r.z += r.speed * rush * dt
        // Recycle before the ship plane — never fly through the hull.
        if (r.z > Z_RECYCLE) {
          r.z = Z_FAR * 0.95 - Math.random() * 40
          r.baseScale = 0.85 + Math.random() * 0.2
        }
        const span = Math.abs(Z_FAR - Z_NEAR)
        const depthT = Math.min(1, Math.max(0, (r.z - Z_FAR) / span))
        const sc = r.baseScale * (1 + depthT * 0.85) * (0.8 + i * 0.3)
        r.mesh.scale.set(sc, sc, sc)
        r.mesh.position.set(0, 0, r.z)
        r.mesh.material.opacity = (0.06 + i * 0.2) * Math.min(1, (-r.z - 40) / 50 + 0.2)
      }

      haze.material.opacity = 0.08 + i * 0.2
      haze.scale.set(0.95 + i * 0.1, 0.95 + i * 0.1, 1)
      hazeInner.material.opacity = 0.04 + i * 0.1
      hazeInner.scale.set(0.9 + i * 0.12, 0.9 + i * 0.12, 1)

      core.position.z = Z_FAR * 0.92
      core.scale.setScalar(22 + strength * 60)
      core.material.opacity = 0.28 + strength * 0.55
    }
  }
}
