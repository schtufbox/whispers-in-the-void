import * as THREE from 'three'

// Default chase seat: behind and above the ship (local +Z forward).
const CHASE_OFFSET = new THREE.Vector3(0, 14, -42)
// Slightly tighter seat in supercruise so we don't read as "pulling way out".
const CRUISE_SEAT_SCALE = 0.88
const ZOOM_MIN = 0.35
const ZOOM_MAX = 3.2
const FREE_LOOK_SENS = 0.0042
const FREE_LOOK_PITCH_MAX = 1.25 // ~72deg

// Multiplier on CHASE_OFFSET; 1 = stock view. Adjusted by mouse wheel.
let chaseZoom = 1
// Alt+mouse orbit around the ship (ship-local yaw/pitch from default seat).
let freeLookActive = false
let freeLookYaw = 0
let freeLookPitch = 0

const _shipUp = new THREE.Vector3()
const _offset = new THREE.Vector3()
const _freeQ = new THREE.Quaternion()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

export function syncMeshToEntity(mesh, entityState) {
  mesh.position.fromArray(entityState.position)
  mesh.quaternion.fromArray(entityState.quaternion)
}

/** Wheel deltaY > 0 (scroll down / pinch out) → zoom out. Returns new zoom. */
export function adjustChaseZoom(deltaY) {
  // Exponential so one notch feels even at near and far ends.
  const factor = Math.exp(deltaY * 0.00115)
  chaseZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, chaseZoom * factor))
  return chaseZoom
}

export function getChaseZoom() {
  return chaseZoom
}

export function resetChaseZoom() {
  chaseZoom = 1
}

export function setChaseFreeLook(active) {
  freeLookActive = !!active
  if (!freeLookActive) {
    freeLookYaw = 0
    freeLookPitch = 0
  }
}

export function isChaseFreeLook() {
  return freeLookActive
}

/** Mouse pixel deltas while Alt free-look is held (pointer-lock movement). */
export function addChaseFreeLookDelta(dx, dy) {
  if (!freeLookActive) return
  freeLookYaw -= dx * FREE_LOOK_SENS
  freeLookPitch = Math.max(
    -FREE_LOOK_PITCH_MAX,
    Math.min(FREE_LOOK_PITCH_MAX, freeLookPitch - dy * FREE_LOOK_SENS)
  )
}

/**
 * @param {THREE.Camera} camera
 * @param {object} shipState
 * @param {{ cruising?: boolean }} [opts]
 */
export function syncChaseCamera(camera, shipState, { cruising = false } = {}) {
  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  // Cruise: don't pull the seat further out — stay near normal zoom (or slightly closer).
  const seat = chaseZoom * (cruising ? CRUISE_SEAT_SCALE : 1)

  // Ship-local seat, then optional free-look orbit, then world orientation.
  _offset.copy(CHASE_OFFSET).multiplyScalar(seat)
  if (freeLookActive && (freeLookYaw !== 0 || freeLookPitch !== 0)) {
    _euler.set(freeLookPitch, freeLookYaw, 0, 'YXZ')
    _freeQ.setFromEuler(_euler)
    _offset.applyQuaternion(_freeQ)
  }
  _offset.applyQuaternion(quat)
  const desiredPos = shipPos.clone().add(_offset)

  // Always snap to the ideal chase seat — soft lerp lagged behind mouse turns
  // and biased the view left/right instead of staying centered aft.
  // Free-look uses a light follow so orbiting feels smooth; default is hard.
  if (freeLookActive) {
    camera.position.lerp(desiredPos, cruising ? 0.9 : 0.4)
  } else if (cruising) {
    camera.position.lerp(desiredPos, 0.95)
  } else {
    camera.position.copy(desiredPos)
  }

  // Bank with the ship so local mouse axes stay screen-correct through loops.
  _shipUp.set(0, 1, 0).applyQuaternion(quat)
  camera.up.copy(_shipUp)
  camera.lookAt(shipPos)
  // lookAt only sets rotation; project() for HUD reticles needs an up-to-date
  // matrixWorldInverse or the crosshair jitters a frame behind the seat.
  camera.updateMatrixWorld(true)
}
