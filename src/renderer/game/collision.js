import * as THREE from 'three'

// Stations/settlements never vary in size, so a fixed radius per kind is
// enough — unlike planets/moons/asteroid fields, which store their own
// per-instance radius on the body (see procgen/galaxy.js). Scaled 1.5x to
// match main.js's STATION_SCALE render multiplier (main.js also layers a
// small +/-15% per-body render variance on top that isn't mirrored here —
// the DOCK_RANGE_COLLISION_MARGIN buffer comfortably absorbs that).
const STATION_COLLISION_RADIUS = 30
const SETTLEMENT_COLLISION_RADIUS = 16.5

export function collisionRadiusFor(body) {
  if (body.kind === 'planet' || body.kind === 'moon' || body.kind === 'asteroidField') return body.radius
  if (body.kind === 'station') return STATION_COLLISION_RADIUS
  if (body.kind === 'settlement') return SETTLEMENT_COLLISION_RADIUS
  return null
}

// Sphere-sphere collision against system bodies: pushes the ship back to the
// surface and cancels the velocity component pointing into the body, so
// flying into something slides you along its surface rather than damaging
// you or letting you pass through.
export function resolveBodyCollisions(shipState, bodies, shipRadius) {
  const shipPos = new THREE.Vector3().fromArray(shipState.position)

  for (const body of bodies) {
    const bodyRadius = collisionRadiusFor(body)
    if (bodyRadius == null) continue

    const bodyPos = new THREE.Vector3(...body.position)
    const offset = shipPos.clone().sub(bodyPos)
    const dist = offset.length()
    const minDist = bodyRadius + shipRadius
    if (dist >= minDist || dist === 0) continue

    const normal = offset.normalize()
    shipPos.copy(bodyPos).addScaledVector(normal, minDist)
    shipState.position = shipPos.toArray()

    const velocity = new THREE.Vector3().fromArray(shipState.velocity)
    const inward = velocity.dot(normal)
    if (inward < 0) {
      velocity.addScaledVector(normal, -inward)
      shipState.velocity = velocity.toArray()
    }
  }
}
