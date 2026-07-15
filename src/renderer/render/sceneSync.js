import * as THREE from 'three'

// Default chase seat: behind and above the ship (local +Z forward).
const CHASE_OFFSET = new THREE.Vector3(0, 14, -42)
// Slightly tighter seat in supercruise so we don't read as "pulling way out".
const CRUISE_SEAT_SCALE = 0.88
const ZOOM_MIN = 0.35
const ZOOM_MAX = 3.2
// Multiplier on CHASE_OFFSET; 1 = stock view. Adjusted by mouse wheel.
let chaseZoom = 1

const _shipUp = new THREE.Vector3()
const _offset = new THREE.Vector3()

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
  _offset.copy(CHASE_OFFSET).multiplyScalar(seat).applyQuaternion(quat)
  const desiredPos = shipPos.clone().add(_offset)
  // At cruise speeds a soft lerp leaves the camera hundreds of units behind
  // every frame (reads as a huge zoom-out). Snap almost hard while cruising.
  const follow = cruising ? 0.92 : 0.18
  camera.position.lerp(desiredPos, follow)
  // Bank with the ship (hard, not lerped) so local mouse axes stay screen-
  // correct through loops. Lerping up lagged lookAt and felt like a
  // persistent right-hand yaw bias.
  _shipUp.set(0, 1, 0).applyQuaternion(quat)
  camera.up.copy(_shipUp)
  camera.lookAt(shipPos)
}
