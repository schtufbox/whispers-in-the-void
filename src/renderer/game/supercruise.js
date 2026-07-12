import * as THREE from 'three'

export const SUPERCRUISE_MULTIPLIER = 3
const ARRIVAL_RANGE = 60
const STEER_RATE_MULTIPLIER = 1.5
const DAMPING_PER_SECOND = 0.35

// Autopilot flight toward a fixed target while supercruise is engaged.
// Returns true once the ship has arrived (caller should disengage).
export function updateSupercruise(shipState, shipClass, targetPosition, dt) {
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  const targetPos = new THREE.Vector3(...targetPosition)
  const toTarget = targetPos.clone().sub(shipPos)
  if (toTarget.length() < ARRIVAL_RANGE) return true

  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  // Matrix4.lookAt follows the camera convention (local +Z points away from
  // the target), but our ships' forward is +Z, so eye/target are swapped —
  // matches the same fix used for NPC AI facing in combat.js.
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0))
  )
  quat.slerp(targetQuat, Math.min(1, shipClass.stats.turnRate * STEER_RATE_MULTIPLIER * dt))

  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
  const velocity = new THREE.Vector3().fromArray(shipState.velocity)
  velocity.addScaledVector(forward, shipClass.stats.accel * SUPERCRUISE_MULTIPLIER * dt)
  velocity.multiplyScalar(Math.pow(DAMPING_PER_SECOND, dt))
  const maxSpeed = shipClass.stats.speed * SUPERCRUISE_MULTIPLIER
  if (velocity.length() > maxSpeed) velocity.setLength(maxSpeed)

  const position = shipPos.addScaledVector(velocity, dt)

  shipState.position = position.toArray()
  shipState.velocity = velocity.toArray()
  shipState.quaternion = quat.toArray()
  return false
}
