import * as THREE from 'three'

const CHASE_OFFSET = new THREE.Vector3(0, 14, -42)
const _shipUp = new THREE.Vector3()

export function syncMeshToEntity(mesh, entityState) {
  mesh.position.fromArray(entityState.position)
  mesh.quaternion.fromArray(entityState.quaternion)
}

export function syncChaseCamera(camera, shipState) {
  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  const desiredPos = shipPos.clone().add(CHASE_OFFSET.clone().applyQuaternion(quat))
  camera.position.lerp(desiredPos, 0.15)
  // Bank with the ship (hard, not lerped) so local mouse axes stay screen-
  // correct through loops. Lerping up lagged lookAt and felt like a
  // persistent right-hand yaw bias.
  _shipUp.set(0, 1, 0).applyQuaternion(quat)
  camera.up.copy(_shipUp)
  camera.lookAt(shipPos)
}
