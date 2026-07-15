import * as THREE from 'three'

// Stations/settlements never vary in size, so a fixed radius per kind is
// enough — unlike planets/moons/asteroid fields, which store their own
// per-instance radius on the body (see procgen/galaxy.js). Scaled 11.25x to
// match main.js's STATION_SCALE render multiplier (main.js also layers a
// small +/-15% per-body render variance on top that isn't mirrored here —
// the DOCK_RANGE_COLLISION_MARGIN buffer comfortably absorbs that).
const STATION_COLLISION_RADIUS = 225
const SETTLEMENT_COLLISION_RADIUS = 123.75

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

// Supercruise: instead of bouncing off a body, tunnel straight through along
// travel direction and exit the far side. Destination body is left alone so
// normal arrival still works. Returns event info for VFX/SFX, or null.
export function trySupercruiseTunnel(shipState, bodies, shipRadius, destinationBodyId = null) {
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  const velocity = new THREE.Vector3().fromArray(shipState.velocity)
  let dir = velocity.lengthSq() > 1e-4
    ? velocity.clone().normalize()
    : new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(shipState.quaternion))

  for (const body of bodies) {
    if (destinationBodyId && body.id === destinationBodyId) continue
    const bodyRadius = collisionRadiusFor(body)
    if (bodyRadius == null) continue

    const bodyPos = new THREE.Vector3(...body.position)
    const offset = shipPos.clone().sub(bodyPos)
    const dist = offset.length()
    const minDist = bodyRadius + shipRadius
    if (dist >= minDist || dist === 0) continue

    // Exit just past the far shell along travel dir.
    const exitDist = bodyRadius + shipRadius + 24
    const exit = bodyPos.clone().addScaledVector(dir, exitDist)
    const from = shipPos.toArray()
    shipState.position = exit.toArray()
    // Keep cruise velocity; slight boost so you don't re-intersect next frame.
    if (velocity.lengthSq() > 1e-4) {
      velocity.setLength(Math.max(velocity.length(), 40))
      shipState.velocity = velocity.toArray()
    }
    return { body, from, to: exit.toArray() }
  }
  return null
}
