import * as THREE from 'three'

// Star Wars–style hyperdrive tunnel: dense elongated streaks rushing past
// the camera, plus a bright core and soft tube rings. Parent to camera each
// frame so the corridor always fills the view during a jump.

const STREAK_COUNT = 220
const RING_COUNT = 6

function buildStreakMap() {
  const w = 32
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.15, 'rgba(200,240,255,0.95)')
  g.addColorStop(0.5, 'rgba(255,255,255,1)')
  g.addColorStop(0.85, 'rgba(160,210,255,0.7)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Hot core line
  const core = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  core.addColorStop(0, 'rgba(255,255,255,0)')
  core.addColorStop(0.4, 'rgba(255,255,255,0.9)')
  core.addColorStop(0.6, 'rgba(255,255,255,0.9)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = core
  ctx.fillRect(w * 0.4, 0, w * 0.2, h)
  return new THREE.CanvasTexture(canvas)
}

function buildGlowMap() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.2, 'rgba(200,240,255,0.7)')
  g.addColorStop(0.5, 'rgba(100,180,255,0.25)')
  g.addColorStop(1, 'rgba(40,100,200,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

export function createHyperspaceTunnel() {
  const group = new THREE.Group()
  group.visible = false
  group.renderOrder = 10

  const streakMap = buildStreakMap()
  const glowMap = buildGlowMap()
  const geometry = new THREE.PlaneGeometry(1, 1)
  const baseMat = new THREE.MeshBasicMaterial({
    map: streakMap,
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  })

  const streaks = []
  for (let i = 0; i < STREAK_COUNT; i++) {
    const mat = baseMat.clone()
    // Slight blue / white variation
    const t = Math.random()
    mat.color.setRGB(0.75 + t * 0.25, 0.88 + t * 0.12, 1)
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.frustumCulled = false
    group.add(mesh)
    streaks.push({
      mesh,
      angle: Math.random() * Math.PI * 2,
      radius: 4 + Math.random() * 48,
      z: -20 - Math.random() * 220,
      speed: 180 + Math.random() * 420,
      len: 12 + Math.random() * 55,
      thick: 0.08 + Math.random() * 0.35,
      phase: Math.random()
    })
  }

  // Bright vanishing-point core
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowMap,
      color: 0xd0f0ff,
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

  // Soft concentric rings for corridor depth
  const rings = []
  const ringGeo = new THREE.RingGeometry(0.9, 1.05, 48)
  for (let i = 0; i < RING_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
    const ring = new THREE.Mesh(ringGeo, mat)
    ring.frustumCulled = false
    group.add(ring)
    rings.push({
      mesh: ring,
      z: -30 - i * 35,
      speed: 90 + i * 12,
      scale: 8 + i * 6
    })
  }

  // Outer dark-blue cylindrical haze (reads as tunnel walls)
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(55, 55, 280, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x0a2040,
      transparent: true,
      opacity: 0.35,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  )
  haze.rotation.x = Math.PI / 2
  haze.position.z = -80
  haze.frustumCulled = false
  group.add(haze)

  let active = false
  let intensity = 0

  function resetStreak(s) {
    s.angle = Math.random() * Math.PI * 2
    s.radius = 3 + Math.random() * 50
    s.z = -30 - Math.random() * 240
    s.speed = 200 + Math.random() * 480
    s.len = 14 + Math.random() * 60
    s.thick = 0.1 + Math.random() * 0.4
  }

  return {
    group,
    start() {
      active = true
      intensity = 0
      group.visible = true
      for (const s of streaks) resetStreak(s)
    },
    stop() {
      active = false
      intensity = 0
      group.visible = false
    },
    /**
     * @param {number} dt
     * @param {number} strength 0–1 overall effect strength
     * @param {THREE.Camera} camera
     */
    update(dt, strength, camera) {
      if (!active) return
      intensity = strength
      group.visible = strength > 0.02

      // Stick to camera so the tunnel always fills the frame.
      group.position.copy(camera.position)
      group.quaternion.copy(camera.quaternion)

      const rush = 0.55 + strength * 1.8
      for (const s of streaks) {
        s.z += s.speed * rush * dt
        // Past the camera (camera looks down local -Z; streaks start far -Z and run toward +Z)
        if (s.z > 25) resetStreak(s)

        const x = Math.cos(s.angle) * s.radius
        const y = Math.sin(s.angle) * s.radius
        s.mesh.position.set(x, y, s.z)
        // Planes face outward a bit; length along view (Z)
        s.mesh.scale.set(s.thick * (0.6 + strength), s.len * (0.5 + strength * 1.2), 1)
        s.mesh.rotation.x = Math.PI / 2
        s.mesh.rotation.z = s.angle
        s.mesh.material.opacity = (0.35 + strength * 0.65) * (0.5 + s.phase * 0.5)
      }

      core.position.z = -90 - (1 - strength) * 40
      core.scale.setScalar(25 + strength * 55)
      core.material.opacity = 0.35 + strength * 0.65

      for (const r of rings) {
        r.z += r.speed * rush * dt
        if (r.z > 20) r.z = -200 - Math.random() * 40
        const sc = r.scale * (0.7 + strength * 0.6)
        r.mesh.scale.set(sc, sc, sc)
        r.mesh.position.set(0, 0, r.z)
        r.mesh.material.opacity = 0.06 + strength * 0.18
      }

      haze.material.opacity = 0.15 + strength * 0.35
      haze.scale.set(1, 1, 0.8 + strength * 0.5)
    }
  }
}
