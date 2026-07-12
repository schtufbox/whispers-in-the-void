import * as THREE from 'three'

const YAW_AXIS = new THREE.Vector3(0, 1, 0)
const PITCH_AXIS = new THREE.Vector3(1, 0, 0)
const ROLL_AXIS = new THREE.Vector3(0, 0, 1)
const FORWARD = new THREE.Vector3(0, 0, 1)
const RIGHT = new THREE.Vector3(1, 0, 0)
const DAMPING_PER_SECOND = 0.35
const BOOST_MULTIPLIER = 1.6
const THROTTLE_RATE = 0.6 // fraction of full throttle gained/lost per second while W/S is held
const THROTTLE_MIN = -1 // S can ramp throttle negative for reverse thrust
const REVERSE_SPEED_FRACTION = 0.25 // reverse speed never exceeds this fraction of the class's forward max speed
const MOUSE_SENSITIVITY = 0.0022 // radians per pixel of mouse movement, scaled by the ship's turnRate

export function createInputState() {
  const keys = new Set()
  window.addEventListener('keydown', (e) => keys.add(e.code))
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  return keys
}

// Mouse deltas accumulate here only while the pointer is locked (see
// main.js's flight-mode toggle) and are consumed — reset to 0 — once
// applied each frame in updateFlight.
export function createMouseAimState() {
  const state = { dx: 0, dy: 0 }
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return
    state.dx += e.movementX
    state.dy += e.movementY
  })
  return state
}

export function updateFlight(shipState, shipClass, keys, mouseAim, dt) {
  const { speed, turnRate, accel } = shipClass.stats
  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  const velocity = new THREE.Vector3().fromArray(shipState.velocity)

  // Mouse aim: the ship's facing follows the mouse directly (pointer-lock
  // relative deltas), scaled by the ship's own turnRate so heavier ships
  // still feel sluggish to aim with. Roll stays a dedicated keyboard axis
  // since a 2-axis mouse can't drive a third rotation axis. Pitch is
  // inverted (mouse up -> nose up), the traditional flight-stick mapping.
  const yawAmount = -mouseAim.dx * MOUSE_SENSITIVITY * turnRate
  const pitchAmount = mouseAim.dy * MOUSE_SENSITIVITY * turnRate
  quat.multiply(new THREE.Quaternion().setFromAxisAngle(YAW_AXIS, yawAmount))
  quat.multiply(new THREE.Quaternion().setFromAxisAngle(PITCH_AXIS, pitchAmount))
  mouseAim.dx = 0
  mouseAim.dy = 0

  const rollTurn = turnRate * dt
  if (keys.has('KeyQ')) quat.multiply(new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, rollTurn))
  if (keys.has('KeyE')) quat.multiply(new THREE.Quaternion().setFromAxisAngle(ROLL_AXIS, -rollTurn))
  quat.normalize()

  // W/S ramp a persistent throttle rather than applying thrust only while
  // held, so releasing both keys holds the current cruising speed. Below
  // zero, S applies reverse thrust (capped separately below).
  shipState.throttle ??= 0
  if (keys.has('KeyW')) shipState.throttle = Math.min(1, shipState.throttle + THROTTLE_RATE * dt)
  if (keys.has('KeyS')) shipState.throttle = Math.max(THROTTLE_MIN, shipState.throttle - THROTTLE_RATE * dt)

  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? BOOST_MULTIPLIER : 1
  const forward = FORWARD.clone().applyQuaternion(quat)
  velocity.addScaledVector(forward, accel * boost * shipState.throttle * dt)

  const right = RIGHT.clone().applyQuaternion(quat)
  if (keys.has('KeyA')) velocity.addScaledVector(right, -accel * dt)
  if (keys.has('KeyD')) velocity.addScaledVector(right, accel * dt)

  velocity.multiplyScalar(Math.pow(DAMPING_PER_SECOND, dt))

  const maxSpeed = speed * boost
  if (velocity.length() > maxSpeed) velocity.setLength(maxSpeed)

  // Cap reverse (backward-facing) speed to a small fraction of the forward
  // max — the maxSpeed clamp above only bounds overall magnitude, not
  // direction, so it wouldn't stop the ship reversing at full speed.
  const forwardSpeed = velocity.dot(forward)
  const maxReverseSpeed = speed * REVERSE_SPEED_FRACTION
  if (forwardSpeed < -maxReverseSpeed) velocity.addScaledVector(forward, -(forwardSpeed + maxReverseSpeed))

  const position = new THREE.Vector3().fromArray(shipState.position).addScaledVector(velocity, dt)

  shipState.position = position.toArray()
  shipState.velocity = velocity.toArray()
  shipState.quaternion = quat.toArray()
}
