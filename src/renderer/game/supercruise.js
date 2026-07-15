import * as THREE from 'three'
import { collisionRadiusFor } from './collision.js'

// 3× prior (12.6) for the larger systems — normal flight speeds unchanged.
export const SUPERCRUISE_MULTIPLIER = 37.8
// Time to spool from engage to full cruise cap (seconds of simTime).
export const SUPERCRUISE_RAMP_UP_S = 3
// Default for tests / callers that don't pass a body-sized range. Real play
// uses collisionRadius + ship radius + margin — a flat 60 never reaches the
// center of a large planet/station (collision stops you far outside it).
export const DEFAULT_ARRIVAL_RANGE = 60
const STEER_RATE_MULTIPLIER = 1.5

// How far along the path to scan for blocking bodies (world units).
// Scaled with the faster cruise multiplier so we still steer early.
const LOOK_AHEAD = 9600
// Extra gap beyond the collision shell when skirting an obstacle.
const AVOID_MARGIN = 40
// How far past the skirt point to aim so we don't orbit the body forever.
const AVOID_LEAD = 0.55
// Floor on approach speed factor so we always creep into the arrival sphere.
const APPROACH_MIN = 0.06
// Deceleration distance ≈ this many seconds of full-cruise travel.
const DECEL_TRAVEL_S = 2.8
// Inside this multiple of arrivalRange, stop skirting and fly straight in —
// prevents endless orbits around host planets when the waypoint is a
// surface settlement / near-shell station.
const FINAL_APPROACH_MUL = 3.5
const FINAL_APPROACH_MIN = 600

const _up = new THREE.Vector3(0, 1, 0)
const _xAxis = new THREE.Vector3(1, 0, 0)
const _pathDir = new THREE.Vector3()
const _toBody = new THREE.Vector3()
const _closest = new THREE.Vector3()
const _lateral = new THREE.Vector3()
const _avoidAim = new THREE.Vector3()
const _bodyPos = new THREE.Vector3()
const _destPos = new THREE.Vector3()

/**
 * Bodies we must not skirt/tunnel-skip around when flying to a destination:
 * the destination itself, and any body whose shell contains (or nearly
 * contains) the destination — e.g. the host planet of a surface settlement.
 * Without this, SC keeps orbiting the parent and never arrives.
 */
function copyPos(out, pos) {
  if (!pos) return null
  if (pos.isVector3) return out.copy(pos)
  return out.fromArray(pos)
}

export function ignoreBodyAsCruiseObstacle(body, destPos, destBodyId = null, arrivalRange = 60) {
  if (destBodyId && body.id === destBodyId) return true
  if (!destPos) return false
  const bodyRadius = collisionRadiusFor(body)
  if (bodyRadius == null) return false
  _bodyPos.fromArray(body.position)
  copyPos(_destPos, destPos)
  const d = _bodyPos.distanceTo(_destPos)
  // Dest sits inside / on / just outside this shell → host terrain, not a blocker.
  return d <= bodyRadius + arrivalRange + AVOID_MARGIN
}

/**
 * If the straight line ship→target clips any body shell (except the
 * destination / its host), return an aim point that skirts the nearest threat;
 * otherwise return the original target.
 *
 * bodies: system bodies array; destinationBodyId: waypoint body to not avoid.
 * destPos / arrivalRange: used to also skip host bodies (settlement on planet).
 */
export function aimAroundObstacles(
  shipPos,
  targetPos,
  bodies,
  shipRadius,
  destinationBodyId = null,
  destPos = null,
  arrivalRange = 60
) {
  if (!bodies?.length) return targetPos

  const distToTarget = _pathDir.copy(targetPos).sub(shipPos).length()
  if (distToTarget < 1e-3) return targetPos
  _pathDir.multiplyScalar(1 / distToTarget)

  // Final approach: commit straight to the waypoint (no more skirting).
  if (distToTarget < Math.max(arrivalRange * FINAL_APPROACH_MUL, FINAL_APPROACH_MIN)) {
    return targetPos
  }

  const scanDist = Math.min(distToTarget, LOOK_AHEAD)
  let threatProj = Infinity
  let threatClearance = 0
  let threatBodyPos = null
  const dest = destPos ?? targetPos

  for (const body of bodies) {
    if (ignoreBodyAsCruiseObstacle(body, dest, destinationBodyId, arrivalRange)) continue
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

function smoothstep01(t) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/**
 * Spool factor 0→1 over SUPERCRUISE_RAMP_UP_S after engage.
 * Caller should reset shipState.supercruiseElapsed = 0 when engaging.
 */
export function supercruiseRampUpFactor(elapsedS) {
  return smoothstep01((elapsedS ?? 0) / SUPERCRUISE_RAMP_UP_S)
}

/**
 * Approach factor 0→1: full speed far out, eases down inside decelerateDistance.
 */
export function supercruiseApproachFactor(dist, arrivalRange, cruiseTopSpeed) {
  const decelDistance = Math.max(
    arrivalRange * 20,
    cruiseTopSpeed * DECEL_TRAVEL_S,
    400
  )
  // Remaining distance past a soft buffer inside the arrival sphere.
  const remaining = Math.max(0, dist - arrivalRange * 0.35)
  return Math.min(1, Math.max(APPROACH_MIN, remaining / decelDistance))
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
  const dist = toTarget.length()
  if (dist < arrivalRange) return true

  const aimPos = aimAroundObstacles(
    shipPos,
    targetPos,
    bodies,
    shipRadius,
    destinationBodyId,
    targetPosition,
    arrivalRange
  )

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

  // Spool-up after engage (reset supercruiseElapsed on engage in main.js).
  shipState.supercruiseElapsed = (shipState.supercruiseElapsed ?? 0) + dt
  const rampUp = supercruiseRampUpFactor(shipState.supercruiseElapsed)

  const cruiseTop = shipClass.stats.speed * SUPERCRUISE_MULTIPLIER
  const approach = supercruiseApproachFactor(dist, arrivalRange, cruiseTop)
  const maxSpeed = cruiseTop * rampUp * approach

  // Accel scales with the allowed cap so spool-up feels smooth, not instant.
  const cruiseAccel = shipClass.stats.accel * SUPERCRUISE_MULTIPLIER * 2.5 * Math.max(0.15, rampUp)
  velocity.addScaledVector(forward, cruiseAccel * dt)
  const dragK = cruiseAccel / Math.max(1e-3, cruiseTop)
  velocity.multiplyScalar(1 / (1 + dragK * dt))
  if (velocity.length() > maxSpeed) velocity.setLength(maxSpeed)

  const position = shipPos.addScaledVector(velocity, dt)

  shipState.position = position.toArray()
  shipState.velocity = velocity.toArray()
  shipState.quaternion = quat.toArray()
  return false
}
