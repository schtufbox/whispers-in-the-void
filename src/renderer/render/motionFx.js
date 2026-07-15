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

/**
 * @param {HTMLElement} container - usually #app
 */
export function createMotionEffects(container) {
  const texture = buildStreakTexture()
  // Amber/orange for normal thrust; cyan for supercruise — reads as different modes.
  const normal = createStreakPool(STREAK_COUNT, texture, 0xffa040)
  const cruise = createStreakPool(STREAK_COUNT_CRUISE, texture, 0xc8f0ff)
  // Pre-seed lives so first frame isn't empty.
  for (const s of normal.meshes) respawnStreak(s, 0.2, false)
  for (const s of cruise.meshes) respawnStreak(s, 0.5, true)

  const group = new THREE.Group()
  group.add(normal.group, cruise.group)

  const overlay = document.createElement('div')
  overlay.id = 'motion-fx-overlay'
  // Radial vignette + soft edge glow only — no vertical line streaks
  // (those read as a scanline cage, not motion). 3D speed lines handle rush.
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
      overlay.classList.remove('cruise')
    },
    /**
     * @param {number} speed - current speed magnitude
     * @param {number} refSpeed - ship class max (normal) speed for 0–1 norm
     * @param {boolean} cruising
     * @param {number} [throttle] - -1..1 main throttle (drives thrust streaks)
     */
    update(dt, { speed, refSpeed, cruising, throttle = 0, shipPos, shipQuat }) {
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
        updatePool(cruise, dt, intensity, true, shipP, quat)
      } else {
        updatePool(normal, dt, intensity, false, shipP, quat)
        updatePool(cruise, dt, 0, true, shipP, quat)
      }

      overlay.style.opacity = String(cruising ? Math.min(1, intensity * 1.05) : intensity * 0.35)
      overlay.classList.toggle('cruise', cruising)

      // Mild FOV punch only — cruise was reading as fisheye at 22+18.
      return { intensity, speedNorm, fovBoost: cruising ? 6 + intensity * 8 : intensity * 4 }
    },
    hide() {
      overlay.style.opacity = '0'
      overlay.classList.remove('cruise')
      clearPool(normal)
      clearPool(cruise)
    },
    dispose() {
      overlay.remove()
      style.remove()
    }
  }
}

// Starfield stretch/smear from camera motion — cheap uniform scale on layers.
export function updateStarfieldMotion(starfield, intensity, cruising) {
  if (!starfield) return
  // Snap back to idle the moment supercruise ends (no lingering stretch).
  if (!cruising) {
    starfield.scale.set(1, 1, 1)
    for (const child of starfield.children) {
      if (!child.material) continue
      child.userData.baseSize ??= child.material.size
      child.material.size = child.userData.baseSize
      if (!starfield.userData.twinkleLayers?.some((t) => t.layer === child)) {
        child.material.opacity = 1
      }
    }
    return
  }
  const sizeMul = 1 + intensity * 2.8
  const stretch = 1 + intensity * 4
  for (const child of starfield.children) {
    if (!child.material) continue
    child.userData.baseSize ??= child.material.size
    child.material.size = child.userData.baseSize * sizeMul
    if (!starfield.userData.twinkleLayers?.some((t) => t.layer === child)) {
      child.material.opacity = Math.min(1, 0.85 + intensity * 0.2)
    }
  }
  starfield.scale.set(1, 1, 1 / stretch)
}
