import * as THREE from 'three'

// The same canvas-radial-gradient sprite technique as nebula.js/asteroid
// impact flashes — a soft glowing dot with no image asset. Exported so
// render/damageEffects.js's smoke/flame puffs can reuse the exact same
// texture/emitter instead of duplicating this.
export function buildGlowTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

// A pool of round glow-sprite "puff" particles recycled round-robin, each
// just drifting in a straight line at its own spawn velocity forever — no
// per-particle fade/lifetime tracking needed, since older particles simply
// end up far enough behind (or ahead of) the ship that the chase camera
// naturally leaves them out of frame before they'd need to be reused again.
export function createPuffEmitter(count, color, size, texture) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    map: texture,
    color,
    size,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  })
  const points = new THREE.Points(geometry, material)
  points.visible = false
  points.frustumCulled = false

  const velocities = Array.from({ length: count }, () => new THREE.Vector3())
  let nextIndex = 0
  let spawnAccumulator = 0

  return {
    mesh: points,
    update(dt, active, originWorld, dirWorld, spawnRate, speed, spread) {
      points.visible = active
      if (active) {
        spawnAccumulator += dt * spawnRate
        while (spawnAccumulator >= 1) {
          spawnAccumulator -= 1
          const i = nextIndex
          nextIndex = (nextIndex + 1) % count
          positions[i * 3] = originWorld.x
          positions[i * 3 + 1] = originWorld.y
          positions[i * 3 + 2] = originWorld.z
          velocities[i]
            .copy(dirWorld)
            .multiplyScalar(speed)
            .add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread))
        }
      }
      for (let i = 0; i < count; i++) {
        positions[i * 3] += velocities[i].x * dt
        positions[i * 3 + 1] += velocities[i].y * dt
        positions[i * 3 + 2] += velocities[i].z * dt
      }
      geometry.attributes.position.needsUpdate = true
    },
    // One-shot burst (supercruise tunnel, etc.) — fills several slots at once.
    burst(originWorld, dirWorld, countBurst, speed, spread) {
      points.visible = true
      for (let n = 0; n < countBurst; n++) {
        const i = nextIndex
        nextIndex = (nextIndex + 1) % count
        positions[i * 3] = originWorld.x + (Math.random() - 0.5) * spread
        positions[i * 3 + 1] = originWorld.y + (Math.random() - 0.5) * spread
        positions[i * 3 + 2] = originWorld.z + (Math.random() - 0.5) * spread
        velocities[i]
          .copy(dirWorld)
          .multiplyScalar(speed * (0.5 + Math.random()))
          .add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2))
      }
      geometry.attributes.position.needsUpdate = true
    }
  }
}

// Elongated streak particles for supercruise — a visibly different effect
// from the round accel/brake puffs above, reusing the mining beam's "orient
// a stretched unit shape" technique: the cylinder's length axis is baked
// onto local Z once at creation (rotateX), so aligning it with the ship's
// facing each frame is just copying its quaternion directly, no per-particle
// direction math needed.
function createStreakEmitter(count, color, length, radius) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6, 1, true)
  geometry.rotateX(Math.PI / 2)
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const meshes = Array.from({ length: count }, () => new THREE.Mesh(geometry, material))
  const group = new THREE.Group()
  for (const m of meshes) group.add(m)
  group.visible = false

  const localOffsets = meshes.map(() => new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0))
  const distances = meshes.map(() => Math.random() * 30)
  const localPos = new THREE.Vector3()

  return {
    mesh: group,
    update(dt, active, shipPos, shipQuat, rearZ, speed, travel, spreadRadius) {
      if (!active) {
        group.visible = false
        // Reset so re-engage doesn't flash old trail positions.
        for (let i = 0; i < meshes.length; i++) distances[i] = Math.random() * travel
        return
      }
      group.visible = true
      for (let i = 0; i < meshes.length; i++) {
        distances[i] += dt * speed
        if (distances[i] > travel) {
          distances[i] = 0
          localOffsets[i].set((Math.random() - 0.5) * spreadRadius, (Math.random() - 0.5) * spreadRadius, 0)
        }
        localPos.set(localOffsets[i].x, localOffsets[i].y, rearZ - distances[i])
        meshes[i].position.copy(localPos).applyQuaternion(shipQuat).add(shipPos)
        meshes[i].quaternion.copy(shipQuat)
      }
    },
    stop() {
      group.visible = false
    }
  }
}

// Three visually distinct effects sharing one group: a warm rear exhaust
// puff while accelerating, a smaller cool-toned puff at the nose while
// braking, side/vertical thruster jets (6DOF), elongated cyan streaks during
// supercruise, and a one-shot tunnel burst for body pass-through.
export function createThrusterEffects() {
  const texture = buildGlowTexture()
  const rearPuff = createPuffEmitter(28, 0xff8a3d, 2.6, texture)
  const frontPuff = createPuffEmitter(14, 0x7fe6ff, 1.6, texture)
  const sidePuff = createPuffEmitter(20, 0xa0e8ff, 2.0, texture)
  // Normal forward: short amber engine trails. Supercruise: long cyan rush.
  const thrustStreaks = createStreakEmitter(8, 0xffa040, 7, 0.28)
  const cruiseStreaks = createStreakEmitter(10, 0x7fe6ff, 14, 0.35)
  const tunnelBurst = createPuffEmitter(48, 0xc8f0ff, 8, texture)

  const group = new THREE.Group()
  group.add(rearPuff.mesh, frontPuff.mesh, sidePuff.mesh, thrustStreaks.mesh, cruiseStreaks.mesh, tunnelBurst.mesh)

  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  const rearOrigin = new THREE.Vector3()
  const frontOrigin = new THREE.Vector3()
  const sideOrigin = new THREE.Vector3()
  const sideDir = new THREE.Vector3()

  return {
    group,
    update(dt, { accelActive, brakeActive, cruiseActive, strafeX = 0, strafeY = 0, shipPos, shipQuat, hullLength }) {
      const rearZ = -hullLength / 2
      const frontZ = hullLength / 2
      const halfW = hullLength * 0.12
      forward.set(0, 0, 1).applyQuaternion(shipQuat)
      right.set(1, 0, 0).applyQuaternion(shipQuat)
      up.set(0, 1, 0).applyQuaternion(shipQuat)
      rearOrigin.set(0, 0, rearZ).applyQuaternion(shipQuat).add(shipPos)
      frontOrigin.set(0, 0, frontZ).applyQuaternion(shipQuat).add(shipPos)

      rearPuff.update(dt, accelActive, rearOrigin, forward.clone().negate(), 40, 20, 3)
      frontPuff.update(dt, brakeActive, frontOrigin, forward, 24, 12, 2)
      thrustStreaks.update(dt, accelActive && !cruiseActive, shipPos, shipQuat, rearZ, 40, 18, 1.6)
      cruiseStreaks.update(dt, cruiseActive, shipPos, shipQuat, rearZ, 140, 70, 5)

      const strafing = strafeX !== 0 || strafeY !== 0
      if (strafing) {
        sideDir.set(0, 0, 0)
        if (strafeX) sideDir.addScaledVector(right, -strafeX)
        if (strafeY) sideDir.addScaledVector(up, -strafeY)
        if (sideDir.lengthSq() > 1e-6) sideDir.normalize()
        sideOrigin.copy(shipPos).addScaledVector(right, strafeX * halfW).addScaledVector(up, strafeY * halfW * 0.6)
      }
      sidePuff.update(dt, strafing, sideOrigin, sideDir, 50, 28, 2.5)

      // Keep tunnel particles drifting even when idle.
      tunnelBurst.update(dt, false, shipPos, forward, 0, 0, 0)
    },
    stopCruiseStreaks() {
      cruiseStreaks.stop()
    },
    playTunnelBurst(fromPos, toPos) {
      const from = new THREE.Vector3(...fromPos)
      const to = new THREE.Vector3(...toPos)
      const dir = to.clone().sub(from)
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
      else dir.normalize()
      const mid = from.clone().lerp(to, 0.5)
      tunnelBurst.burst(mid, dir, 36, 90, 18)
      tunnelBurst.burst(from, dir, 12, 40, 10)
    }
  }
}
