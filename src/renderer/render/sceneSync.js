import * as THREE from 'three'

const CHASE_OFFSET = new THREE.Vector3(0, 14, -42)

export function syncMeshToEntity(mesh, entityState) {
  mesh.position.fromArray(entityState.position)
  mesh.quaternion.fromArray(entityState.quaternion)
}

export function syncChaseCamera(camera, shipState) {
  const quat = new THREE.Quaternion().fromArray(shipState.quaternion)
  const shipPos = new THREE.Vector3().fromArray(shipState.position)
  const desiredPos = shipPos.clone().add(CHASE_OFFSET.clone().applyQuaternion(quat))
  camera.position.lerp(desiredPos, 0.15)
  camera.up.set(0, 1, 0)
  camera.lookAt(shipPos)
}
