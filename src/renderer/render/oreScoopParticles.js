import * as THREE from 'three'
import { buildGlowTexture } from './thrusterParticles.js'

// Short-lived ore chunks that stream from a hit rock toward the ship when
// the mining hold actually scoops the yield (hold not full).

const POOL = 48
const _toShip = new THREE.Vector3()
const _tmp = new THREE.Vector3()

export function createOreScoopEffects() {
  const texture = buildGlowTexture()
  const group = new THREE.Group()
  group.frustumCulled = false

  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(POOL * 3)
  const colors = new Float32Array(POOL * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    map: texture,
    vertexColors: true,
    size: 2.4,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  group.add(points)

  /** @type {{ alive: boolean, t: number, life: number, start: THREE.Vector3, jitter: THREE.Vector3 }[]} */
  const slots = Array.from({ length: POOL }, () => ({
    alive: false,
    t: 0,
    life: 0.55,
    start: new THREE.Vector3(),
    jitter: new THREE.Vector3()
  }))
  let next = 0

  // Amber / gold ore tint with slight variation per particle.
  function tint(i) {
    const warm = 0.75 + Math.random() * 0.25
    colors[i * 3] = 0.85 * warm
    colors[i * 3 + 1] = 0.55 * warm
    colors[i * 3 + 2] = 0.2 * warm
  }

  return {
    group,
    /**
     * Spawn a burst of ore particles at `fromWorld` that will home to the ship.
     */
    burst(fromWorld, count = 6) {
      for (let n = 0; n < count; n++) {
        const i = next
        next = (next + 1) % POOL
        const s = slots[i]
        s.alive = true
        s.t = 0
        s.life = 0.4 + Math.random() * 0.35
        s.start.copy(fromWorld).add(
          _tmp.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4)
        )
        s.jitter.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8)
        positions[i * 3] = s.start.x
        positions[i * 3 + 1] = s.start.y
        positions[i * 3 + 2] = s.start.z
        tint(i)
      }
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.color.needsUpdate = true
      points.visible = true
    },
    update(dt, shipWorldPos) {
      let any = false
      for (let i = 0; i < POOL; i++) {
        const s = slots[i]
        if (!s.alive) {
          // Park dead slots far away so they don't draw as a cluttered origin blob.
          if (positions[i * 3] !== 0 || positions[i * 3 + 1] !== 0) {
            positions[i * 3] = 0
            positions[i * 3 + 1] = -1e6
            positions[i * 3 + 2] = 0
          }
          continue
        }
        any = true
        s.t += dt / s.life
        const u = Math.min(1, s.t)
        // Ease-in toward the ship; early frames drift with jitter.
        const ease = u * u * (3 - 2 * u)
        _toShip.copy(shipWorldPos)
        const drift = 1 - ease
        positions[i * 3] = s.start.x * (1 - ease) + _toShip.x * ease + s.jitter.x * drift
        positions[i * 3 + 1] = s.start.y * (1 - ease) + _toShip.y * ease + s.jitter.y * drift
        positions[i * 3 + 2] = s.start.z * (1 - ease) + _toShip.z * ease + s.jitter.z * drift
        if (u >= 1) {
          s.alive = false
          positions[i * 3 + 1] = -1e6
        }
      }
      geometry.attributes.position.needsUpdate = true
      points.visible = any
    }
  }
}
