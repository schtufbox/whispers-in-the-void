import * as THREE from 'three'

// Screen-space motion wash (CSS) + 3D speed streaks. Intensity 0–1; supercruise
// should pass ~0.85–1 so the effect reads as a different flight mode.

const STREAK_COUNT = 48
const STREAK_COUNT_CRUISE = 96

function buildStreakTexture() {
  const w = 32
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.35, 'rgba(200,240,255,0.9)')
  g.addColorStop(0.7, 'rgba(140,210,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  return new THREE.CanvasTexture(canvas)
}

function createStreakPool(count, texture, colorHex) {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: colorHex,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const meshes = []
  const group = new THREE.Group()
  group.visible = false
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geometry, material.clone())
    m.visible = false
    group.add(m)
    meshes.push({
      mesh: m,
      // Ship-local start position (offset from ship)
      lx: 0,
      ly: 0,
      lz: 0,
      speed: 1,
      life: 0,
      maxLife: 1
    })
  }
  return { group, meshes, material }
}

function respawnStreak(s, intensity, cruise) {
  // Normal: short amber trails. Supercruise: long cyan rush.
  const spread = cruise ? 55 : 22
  const depth = cruise ? 180 : 55
  s.lx = (Math.random() - 0.5) * spread * 2
  s.ly = (Math.random() - 0.5) * spread * 1.2
  s.lz = cruise ? 20 + Math.random() * depth : 6 + Math.random() * depth * 0.5
  s.speed = (cruise ? 220 : 70) * (0.6 + Math.random() * 0.8) * (0.5 + intensity)
  s.maxLife = cruise ? 0.55 + Math.random() * 0.45 : 0.28 + Math.random() * 0.25
  s.life = s.maxLife
  const len = (cruise ? 18 : 5) * (0.5 + intensity * 0.85) * (0.6 + Math.random())
  const thick = cruise ? 0.35 + Math.random() * 0.45 : 0.12 + Math.random() * 0.16
  s.mesh.scale.set(thick, len, 1)
  s.mesh.material.opacity = (cruise ? 0.55 : 0.42) * intensity * (0.55 + Math.random() * 0.45)
  s.mesh.visible = true
}

// Full-screen 3D star tunnel for supercruise — parented to the camera.
// Cylinder walls + depth rings + vanishing-point core so it reads as a
// corridor you fly through, not a flat particle spray.
// Colors follow the current system's star (see setTint).
const TUNNEL_WALL = 140
const TUNNEL_INNER = 70
const TUNNEL_RINGS = 8
const TUNNEL_RADIUS = 22
const DEFAULT_TUNNEL_TINT = new THREE.Color(0x6ec4ff)

function createCruiseStarTunnel() {
  const map = buildStreakTexture()
  const group = new THREE.Group()
  group.visible = false
  group.frustumCulled = false
  group.renderOrder = 5

  const geometry = new THREE.PlaneGeometry(1, 1)
  // Live tint (system sun color). Streaks store a per-particle lightness jitter.
  const tint = DEFAULT_TUNNEL_TINT.clone()
  const tmpColor = new THREE.Color()

  function makeStreak(lightJitter) {
    const mat = new THREE.MeshBasicMaterial({
      map,
      color: tmpColor.copy(tint).offsetHSL(0, 0, lightJitter),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    })
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.frustumCulled = false
    group.add(mesh)
    return {
      mesh,
      lightJitter,
      angle: 0,
      radius: TUNNEL_RADIUS,
      z: -20,
      speed: 100,
      len: 12,
      thick: 0.15,
      layer: 'wall',
      phase: Math.random()
    }
  }

  const streaks = []
  // Outer wall: denser cylinder of long streaks (the tunnel surface).
  for (let i = 0; i < TUNNEL_WALL; i++) {
    const s = makeStreak(0.08 + Math.random() * 0.18)
    s.layer = 'wall'
    streaks.push(s)
  }
  // Inner layer: thinner, faster filaments for depth inside the tube.
  for (let i = 0; i < TUNNEL_INNER; i++) {
    const s = makeStreak(0.12 + Math.random() * 0.2)
    s.layer = 'inner'
    streaks.push(s)
  }

  // Concentric rings rushing toward the camera — strong tunnel depth cue.
  const rings = []
  const ringGeo = new THREE.RingGeometry(0.92, 1.08, 64)
  for (let i = 0; i < TUNNEL_RINGS; i++) {
    const mesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: tint.clone().multiplyScalar(1.05),
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
      })
    )
    mesh.frustumCulled = false
    group.add(mesh)
    rings.push({
      mesh,
      z: -25 - i * (110 / TUNNEL_RINGS),
      speed: 70 + i * 8,
      baseScale: TUNNEL_RADIUS * (0.95 + (i % 3) * 0.04)
    })
  }

  // Soft cylindrical haze = tunnel walls (camera looks down -Z; cylinder along Z).
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(TUNNEL_RADIUS * 1.15, TUNNEL_RADIUS * 1.05, 160, 40, 1, true),
    new THREE.MeshBasicMaterial({
      color: tint.clone().multiplyScalar(0.22),
      transparent: true,
      opacity: 0.28,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  )
  haze.rotation.x = Math.PI / 2
  haze.position.z = -55
  haze.frustumCulled = false
  group.add(haze)

  // Second tighter haze for layered corridor.
  const hazeInner = new THREE.Mesh(
    new THREE.CylinderGeometry(TUNNEL_RADIUS * 0.55, TUNNEL_RADIUS * 0.5, 120, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: tint.clone().multiplyScalar(0.35),
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    })
  )
  hazeInner.rotation.x = Math.PI / 2
  hazeInner.position.z = -45
  hazeInner.frustumCulled = false
  group.add(hazeInner)

  // Vanishing-point core.
  const coreCanvas = document.createElement('canvas')
  coreCanvas.width = coreCanvas.height = 64
  {
    const ctx = coreCanvas.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.2, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.25)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(coreCanvas),
      color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.45),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
  )
  core.position.set(0, 0, -95)
  core.scale.setScalar(28)
  core.frustumCulled = false
  group.add(core)

  function applyTint(color) {
    if (!color) return
    const c = color.isColor ? color : new THREE.Color(color)
    // Skip redundant updates (called every frame while cruising).
    if (tint.getHex() === c.getHex()) return
    tint.copy(c)
    for (const s of streaks) {
      s.mesh.material.color.copy(tint).offsetHSL(0, 0, s.lightJitter)
    }
    for (const r of rings) {
      r.mesh.material.color.copy(tint).multiplyScalar(1.05)
    }
    haze.material.color.copy(tint).multiplyScalar(0.22)
    hazeInner.material.color.copy(tint).multiplyScalar(0.35)
    core.material.color.copy(tint).lerp(new THREE.Color(1, 1, 1), 0.45)
  }

  function reset(s, intensity) {
    s.angle = Math.random() * Math.PI * 2
    if (s.layer === 'wall') {
      // Tight band around the cylinder radius = solid tube wall.
      s.radius = TUNNEL_RADIUS * (0.88 + Math.random() * 0.22)
      s.speed = (110 + Math.random() * 200) * (0.6 + intensity * 0.85)
      s.len = 10 + Math.random() * 36 * (0.7 + intensity)
      s.thick = 0.08 + Math.random() * 0.32
    } else {
      // Inner filaments closer to the axis.
      s.radius = TUNNEL_RADIUS * (0.2 + Math.random() * 0.55)
      s.speed = (160 + Math.random() * 280) * (0.7 + intensity)
      s.len = 8 + Math.random() * 28 * (0.6 + intensity)
      s.thick = 0.04 + Math.random() * 0.18
    }
    s.z = -12 - Math.random() * 130
    s.phase = Math.random()
  }

  for (const s of streaks) reset(s, 0.75)

  return {
    group,
    setTint: applyTint,
    update(dt, intensity, camera, sunColor = null) {
      if (sunColor) applyTint(sunColor)
      if (intensity < 0.05 || !camera) {
        group.visible = false
        return
      }
      group.visible = true
      // Stick to camera — corridor always fills the frame, center = vanishing point.
      group.position.copy(camera.position)
      group.quaternion.copy(camera.quaternion)

      const rush = 0.7 + intensity * 1.75
      const i = Math.min(1, Math.max(0.25, intensity))

      for (const s of streaks) {
        s.z += s.speed * rush * dt
        // Perspective flare: walls flare out as they approach the lens.
        const depthT = Math.min(1, Math.max(0, (s.z + 140) / 150))
        const flare = 1 + depthT * depthT * 0.85
        const r = s.radius * flare
        if (s.z > 14) reset(s, intensity)

        s.mesh.position.set(Math.cos(s.angle) * r, Math.sin(s.angle) * r, s.z)
        // Length along view (Z after rotX); radial thin edge faces the wall tangent.
        const lenMul = 0.55 + i * 1.1
        const thickMul = 0.65 + i * 0.9
        s.mesh.scale.set(s.thick * thickMul, s.len * lenMul, 1)
        s.mesh.rotation.set(Math.PI / 2, 0, s.angle)
        // Dim in the distance, bright near the camera plane.
        const nearFade = Math.min(1, (18 - s.z) / 22 + 0.25)
        const farFade = Math.min(1, (-s.z) / 40 + 0.2)
        s.mesh.material.opacity =
          (s.layer === 'wall' ? 0.35 : 0.22) * (0.5 + i * 0.7) * (0.4 + s.phase * 0.6) * nearFade * farFade
      }

      for (const r of rings) {
        r.z += r.speed * rush * dt
        if (r.z > 16) {
          r.z = -125 - Math.random() * 30
          r.baseScale = TUNNEL_RADIUS * (0.9 + Math.random() * 0.2)
        }
        const depthT = Math.min(1, Math.max(0, (r.z + 140) / 150))
        const sc = r.baseScale * (1 + depthT * 0.9) * (0.85 + i * 0.25)
        r.mesh.scale.set(sc, sc, sc)
        r.mesh.position.set(0, 0, r.z)
        r.mesh.material.opacity = (0.05 + i * 0.16) * Math.min(1, (-r.z) / 30 + 0.3)
      }

      // Haze cylinders breathe slightly with intensity.
      haze.material.opacity = 0.14 + i * 0.28
      haze.scale.set(0.95 + i * 0.12, 0.95 + i * 0.12, 0.9 + i * 0.25)
      haze.position.z = -50 - (1 - i) * 15
      hazeInner.material.opacity = 0.06 + i * 0.12
      hazeInner.scale.set(0.9 + i * 0.15, 0.9 + i * 0.15, 0.85 + i * 0.2)

      core.position.z = -100 - (1 - i) * 25
      core.scale.setScalar(18 + i * 32)
      core.material.opacity = 0.28 + i * 0.5
    },
    stop() {
      group.visible = false
    }
  }
}

/**
 * @param {HTMLElement} container - usually #app
 */
export function createMotionEffects(container) {
  const texture = buildStreakTexture()
  // Amber/orange for normal thrust; cyan for supercruise — reads as different modes.
  const normal = createStreakPool(STREAK_COUNT, texture, 0xffa040)
  const cruise = createStreakPool(STREAK_COUNT_CRUISE, texture, 0xc8f0ff)
  const cruiseTunnel = createCruiseStarTunnel()
  // Pre-seed lives so first frame isn't empty.
  for (const s of normal.meshes) respawnStreak(s, 0.2, false)
  for (const s of cruise.meshes) respawnStreak(s, 0.5, true)

  const group = new THREE.Group()
  group.add(normal.group, cruise.group, cruiseTunnel.group)

  const overlay = document.createElement('div')
  overlay.id = 'motion-fx-overlay'
  // Radial vignette + soft edge glow only — no vertical line streaks
  // (those read as a scanline cage, not motion). 3D speed lines handle rush.
  // Supercruise HUD glitch lives on #hud (see ui/hud.js), not full-screen here.
  overlay.innerHTML = `
    <div class="mf-radial"></div>
    <div class="mf-chroma"></div>
  `
  const style = document.createElement('style')
  style.textContent = `
#motion-fx-overlay {
  position: fixed; inset: 0; pointer-events: none; z-index: 8;
  opacity: 0; transition: opacity 0.12s linear;
}
#motion-fx-overlay.cruise { transition: opacity 0.08s linear; }
#motion-fx-overlay .mf-radial {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center,
    transparent 28%,
    rgba(8, 20, 40, 0.12) 55%,
    rgba(4, 10, 24, 0.45) 100%);
}
#motion-fx-overlay .mf-chroma {
  position: absolute; inset: 0;
  box-shadow:
    inset 0 0 80px rgba(80, 180, 255, 0.1),
    inset 0 0 160px rgba(40, 100, 200, 0.14);
  opacity: 0;
}
#motion-fx-overlay.cruise .mf-chroma { opacity: 1; }
#motion-fx-overlay.cruise .mf-radial {
  background: radial-gradient(ellipse at center,
    transparent 22%,
    rgba(10, 40, 70, 0.18) 50%,
    rgba(5, 12, 30, 0.55) 100%);
}
`
  document.head.appendChild(style)
  container.appendChild(overlay)

  const localPos = new THREE.Vector3()
  const worldPos = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const quat = new THREE.Quaternion()

  function clearPool(pool) {
    pool.group.visible = false
    for (const s of pool.meshes) {
      s.mesh.visible = false
      s.life = 0
    }
  }

  function updatePool(pool, dt, intensity, isCruise, shipPos, shipQuat) {
    if (intensity <= 0.04) {
      clearPool(pool)
      return
    }
    const activeCount = Math.floor(pool.meshes.length * Math.min(1, intensity * (isCruise ? 1.1 : 0.9)))
    pool.group.visible = true
    for (let i = 0; i < pool.meshes.length; i++) {
      const s = pool.meshes[i]
      if (i >= activeCount) {
        s.mesh.visible = false
        continue
      }
      s.life -= dt
      s.lz -= s.speed * dt
      if (s.life <= 0 || s.lz < -(isCruise ? 40 : 18)) {
        respawnStreak(s, intensity, isCruise)
      }
      localPos.set(s.lx, s.ly, s.lz)
      worldPos.copy(localPos).applyQuaternion(shipQuat).add(shipPos)
      s.mesh.position.copy(worldPos)
      // Align plane long-axis with travel (ship -Z is aft; streaks run along forward).
      s.mesh.quaternion.copy(shipQuat)
      s.mesh.rotateX(Math.PI / 2)
      const fade = Math.max(0, s.life / s.maxLife)
      s.mesh.material.opacity = (isCruise ? 0.65 : 0.45) * intensity * fade
    }
  }

  return {
    group,
    overlay,
    // Kill cruise (and optionally all) streaks immediately — call on supercruise exit.
    stopCruiseStreaks() {
      clearPool(cruise)
      cruiseTunnel.stop()
      overlay.classList.remove('cruise')
    },
    /**
     * @param {number} speed - current speed magnitude
     * @param {number} refSpeed - ship class max (normal) speed for 0–1 norm
     * @param {boolean} cruising
     * @param {number} [throttle] - -1..1 main throttle (drives thrust streaks)
     * @param {THREE.Camera} [camera] - for full-screen cruise star tunnel
     * @param {THREE.Color|number} [starColor] - system sun tint for the cruise tunnel
     */
    update(dt, { speed, refSpeed, cruising, throttle = 0, shipPos, shipQuat, camera = null, starColor = null }) {
      quat.fromArray(shipQuat)
      const shipP = new THREE.Vector3().fromArray(shipPos)
      const speedNorm = Math.min(1, speed / Math.max(1, refSpeed))
      const thrust = Math.min(1, Math.abs(throttle))
      // Supercruise: strong cyan. Normal: milder amber, throttle/speed driven.
      const intensity = cruising
        ? 0.55 + 0.45 * Math.min(1, speed / Math.max(1, refSpeed * 3.5))
        : Math.min(1, Math.max(speedNorm * 0.55, thrust * 0.65))

      if (cruising) {
        updatePool(normal, dt, 0, false, shipP, quat)
        // Ship-local streaks stay mild; the full-screen tunnel is the main read.
        // Tint ship streaks toward the sun color too so the whole wash matches.
        if (starColor) {
          const c = starColor.isColor ? starColor : new THREE.Color(starColor)
          for (const s of cruise.meshes) {
            if (s.mesh.material?.color) s.mesh.material.color.copy(c).lerp(new THREE.Color(1, 1, 1), 0.35)
          }
        }
        updatePool(cruise, dt, intensity * 0.45, true, shipP, quat)
        cruiseTunnel.update(dt, intensity, camera, starColor)
      } else {
        updatePool(normal, dt, intensity, false, shipP, quat)
        updatePool(cruise, dt, 0, true, shipP, quat)
        cruiseTunnel.stop()
      }

      overlay.style.opacity = String(cruising ? Math.min(1, intensity * 1.05) : intensity * 0.35)
      overlay.classList.toggle('cruise', cruising)

      // Cruise FOV boost kept tiny (was 3+intensity*4 — still too much zoom-out).
      return { intensity, speedNorm, fovBoost: cruising ? intensity * 1.5 : intensity * 4 }
    },
    hide() {
      overlay.style.opacity = '0'
      overlay.classList.remove('cruise')
      clearPool(normal)
      clearPool(cruise)
      cruiseTunnel.stop()
    },
    dispose() {
      overlay.remove()
      style.remove()
    }
  }
}

// Leave the real skybox alone during cruise — the full-screen tunnel overlay
// (createMotionEffects) handles streaking instead of warping the starfield.
export function updateStarfieldMotion(starfield, _intensity, _cruising, _shipQuat = null) {
  if (!starfield) return
  starfield.scale.set(1, 1, 1)
  starfield.quaternion.identity()
  for (const child of starfield.children) {
    if (!child.material) continue
    child.userData.baseSize ??= child.material.size
    child.material.size = child.userData.baseSize
    if (!starfield.userData.twinkleLayers?.some((t) => t.layer === child)) {
      child.material.opacity = 1
    }
  }
}
