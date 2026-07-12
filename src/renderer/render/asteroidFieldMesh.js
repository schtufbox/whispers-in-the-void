import * as THREE from 'three'
import { mulberry32, range } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const ROCK_COUNT = 22

// Seeded from the body's id so the same field always scatters the same
// rocks. Spread matches body.radius, the same value game/collision.js uses
// as this field's collision size, so the visual and physical extent agree.
// Exported (not just used internally by the mesh builder below) so main.js's
// per-asteroid targeting can compute the exact same rock positions, in the
// same body-local-offset space, without a second source of truth drifting
// out of sync with what's actually rendered.
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

export function buildAsteroidFieldMesh(body) {
  const material = new THREE.MeshLambertMaterial({ color: 0x6b6459, flatShading: true })
  const group = new THREE.Group()

  for (const rock of getAsteroidRocks(body)) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(rock.radius, 0), material)
    mesh.position.set(...rock.position)
    mesh.rotation.set(...rock.rotation)
    mesh.scale.y = rock.scaleY
    group.add(mesh)
  }

  return group
}
