import * as THREE from 'three'
import { collisionRadiusFor } from './collision.js'

export const SUPERCRUISE_MULTIPLIER = 4.2 // "~40% faster" per user request (was 3)
// Default for tests / callers that don't pass a body-sized range. Real play
// uses collisionRadius + ship radius + margin — a flat 60 never reaches the
// center of a large planet/station (collision stops you far outside it).
export const DEFAULT_ARRIVAL_RANGE = 60
const STEER_RATE_MULTIPLIER = 1.5
const DAMPING_PER_SECOND = 0.35

// How far along the path to scan for blocking bodies (world units).
const LOOK_AHEAD = 900
// Extra gap beyond the collision shell when skirting an obstacle.
const AVOID_MARGIN = 40
// How far past the skirt point to aim so we don't orbit the body forever.
const AVOID_LEAD = 0.35

const _up = new THREE.Vector3(0, 1, 0)
const _xAxis = new THREE.Vector3(1, 0, 0)
const _pathDir = new THREE.Vector3()
const _toBody = new THREE.Vector3()
const _closest = new THREE.Vector3()
const _lateral = new THREE.Vector3()
const _avoidAim = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()

/**
 * If the straight line ship→target clips any body shell (except the
 * destination body), return an aim point that skirts the nearest threat;
 * otherwise return the original target.
 *
 * bodies: system bodies array; destinationBodyId: waypoint body to not avoid.
 */
export function aimAroundObstacles(shipPos, targetPos, bodies, shipRadius, destinationBodyId = null) {
  if (!bodies?.length) return targetPos

  const distToTarget = _pathDir.copy(targetPos).sub(shipPos).length()
  if (distToTarget < 1e-3) return targetPos
  _pathDir.multiplyScalar(1 / distToTarget)

  const scanDist = Math.min(distToTarget, LOOK_AHEAD)
  let threatProj = Infinity
  let threatClearance = 0
  let threatBodyPos = null

  for (const body of bodies) {
    if (destinationBodyId && body.id === destinationBodyId) continue
    const bodyRadius = collisionRadiusFor(body)
    if (bodyRadius == null) continue

    _bodyPos.fromArray(body.position)
    _toBody.copy(_bodyPos).sub(shipPos)
    const proj = _toBody.dot(_pathDir)
    // Only care about obstacles ahead of us, not behind, and within look-ahead.
    if (proj < 0 || proj > scanDist) continue

    _closest.copy(shipPos).addScaledVector(_pathDir, proj)
    const miss = _closest.distanceTo(_bodyPos)
    const clearance = bodyRadius + shipRadius + AVOID_MARGIN
    if (miss >= clearance) continue

    // Nearest threat along the path wins (steer early for the first blocker).
    if (proj < threatProj) {
      threatProj = proj
      threatClearance = clearance
      threatBodyPos = _bodyPos.clone()
    }
  }

  if (!threatBodyPos) return targetPos

  // Lateral = component of (ship - body) perpendicular to path; head-on uses
  // path × world-up so we prefer climbing over a random horizontal flip.
  _lateral.copy(shipPos).sub(threatBodyPos)
  _lateral.addScaledVector(_pathDir, -_lateral.dot(_pathDir))
  if (_lateral.lengthSq() < 1e-6) {
    _lateral.crossVectors(_pathDir, _up)
    if (_lateral.lengthSq() < 1e-6) _lateral.crossVectors(_pathDir, _xAxis)
  }
  _lateral.normalize()

  // Skirt outside the shell, slightly ahead of the closest approach so the
  // ship commits past the body rather than orbiting it.
  _avoidAim
    .copy(threatBodyPos)
    .addScaledVector(_lateral, threatClearance * 1.05)
    .addScaledVector(_pathDir, threatClearance * AVOID_LEAD)
  return _avoidAim.clone()
}

// Autopilot flight toward a fixed target while supercruise is engaged.
// Returns true once the ship has arrived (caller should disengage).
// arrivalRange is the distance-to-target center that counts as "there"
// (main.js sizes this off the waypoint body's collision shell).
// bodies / shipRadius / destinationBodyId enable automatic path skirting.
export function updateSupercruise(
  shipState,
  shipClass,
  targetPosition,
  dt,
  arrivalRange = DEFAULT_ARRIVAL_RANGE,
  bodies = null,
  shipRadius = 0,
  destinationBodyId = null
) {
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  const targetPos = new THREE.Vector3(...targetPosition)
  const toTarget = targetPos.clone().sub(shipPos)
  if (toTarget.length() < arrivalRange) return true

  const aimPos = aimAroundObstacles(shipPos, targetPos, bodies, shipRadius, destinationBodyId)

  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  // Matrix4.lookAt follows the camera convention (local +Z points away from
  // the target), but our ships' forward is +Z, so eye/target are swapped —
  // matches the same fix used for NPC AI facing in combat.js.
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(aimPos, shipPos, new THREE.Vector3(0, 1, 0))
  )
  quat.slerp(targetQuat, Math.min(1, shipClass.stats.turnRate * STEER_RATE_MULTIPLIER * dt))

  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
  const velocity = new THREE.Vector3().fromArray(shipState.velocity)
  // Cruise top speed = SUPERCRUISE_MULTIPLIER × ship max; ease down on final
  // approach so we don't overshoot the arrival sphere (or skirt forever).
  const dist = toTarget.length()
  const approachFactor = Math.min(1, Math.max(0.22, dist / Math.max(arrivalRange * 10, 350)))
  const maxSpeed = shipClass.stats.speed * SUPERCRUISE_MULTIPLIER * approachFactor
  const cruiseAccel = shipClass.stats.accel * SUPERCRUISE_MULTIPLIER * 2.5
  velocity.addScaledVector(forward, cruiseAccel * dt)
  const dragK = cruiseAccel / Math.max(1e-3, shipClass.stats.speed * SUPERCRUISE_MULTIPLIER)
  velocity.multiplyScalar(1 / (1 + dragK * dt))
  if (velocity.length() > maxSpeed) velocity.setLength(maxSpeed)

  const position = shipPos.addScaledVector(velocity, dt)

  shipState.position = position.toArray()
  shipState.velocity = velocity.toArray()
  shipState.quaternion = quat.toArray()
  return false
}
