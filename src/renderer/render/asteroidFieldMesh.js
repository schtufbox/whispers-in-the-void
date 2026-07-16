import * as THREE from 'three'
import { mulberry32, range } from '../procgen/prng.js'
import { getSurfaceTextures } from './textures.js'
import { oreTierForSystem } from '../game/mining.js'
import { MINED_ORE_GOOD_IDS } from '../data/goods.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const ROCK_COUNT = 22

// Seeded from the body's id so the same field always scatters the same
// rocks. Spread matches body.radius (field extent for targeting / spawn
// clearance). Flight collision uses each rock individually — see collision.js.
// Exported so main.js targeting and game/collision.js share one rock layout.
export function getAsteroidRocks(body) {
  const rng = mulberry32(hashString(body.id))
  const spread = body.radius
  const rocks = []
  for (let i = 0; i < ROCK_COUNT; i++) {
    rocks.push({
      radius: range(rng, 1.5, 5.5),
      position: [range(rng, -spread, spread), range(rng, -spread, spread) * 0.3, range(rng, -spread, spread)],
      rotation: [range(rng, 0, Math.PI), range(rng, 0, Math.PI), range(rng, 0, Math.PI)],
      scaleY: range(rng, 0.6, 1.4)
    })
  }
  return rocks
}

// Base albedo tint per mined-ore tier (system coreFraction → ore type).
// Rock PBR maps multiply this color so richer ores read warmer/colder.
const ORE_TINT = {
  raw_ore: new THREE.Color(0x8a8274), // dull grey-brown
  rich_ore: new THREE.Color(0xb87333), // copper / iron
  exotic_ore: new THREE.Color(0x3d9b78), // green mineral
  quantum_ore: new THREE.Color(0x7b4fc4) // violet
}

function tintForOreTier(oreId, rockIndex, fieldId) {
  const base = (ORE_TINT[oreId] ?? ORE_TINT.raw_ore).clone()
  // Mild per-rock variation so the belt isn't a flat paint job.
  const rng = mulberry32(hashString(`${fieldId}:tint:${rockIndex}`))
  const jitter = (rng() - 0.5) * 0.12
  base.offsetHSL(jitter * 0.15, jitter * 0.2, jitter * 0.18)
  return base
}

/**
 * @param {object} body asteroidField body
 * @param {object} [system] current system — picks ore-tier tint via coreFraction
 */
export function buildAsteroidFieldMesh(body, system = null) {
  const oreId =
    system != null
      ? oreTierForSystem(system)
      : MINED_ORE_GOOD_IDS[0]
  const maps = getSurfaceTextures('rocky') ?? {}
  const group = new THREE.Group()

  getAsteroidRocks(body).forEach((rock, i) => {
    // Per-rock material so ore tint + slight variation show; maps are shared GPU textures.
    const material = new THREE.MeshStandardMaterial({
      color: tintForOreTier(oreId, i, body.id),
      roughness: 0.92,
      metalness: oreId === 'quantum_ore' ? 0.22 : oreId === 'rich_ore' ? 0.14 : 0.05,
      flatShading: false,
      ...maps,
      // Stronger normals so rock grain reads on small icosahedra.
      normalScale: maps.normalMap ? new THREE.Vector2(0.85, 0.85) : undefined
    })
    // detail 1: enough faces for rock maps without planet-level cost.
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(rock.radius, 1), material)
    mesh.position.set(...rock.position)
    mesh.rotation.set(...rock.rotation)
    mesh.scale.y = rock.scaleY
    group.add(mesh)
  })

  return group
}
