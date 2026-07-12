import * as THREE from 'three'

const WEAPON_VISUALS = {
  laser: { color: 0x5ee6ff, length: 12, radius: 0.18 },
  missile: { color: 0xff8a3d, length: 2, radius: 0.35 }
}

export function buildProjectileMesh(weaponType) {
  const visual = WEAPON_VISUALS[weaponType] ?? WEAPON_VISUALS.laser
  const geometry =
    weaponType === 'missile'
      ? new THREE.ConeGeometry(visual.radius, visual.length, 8)
      : new THREE.CylinderGeometry(visual.radius, visual.radius, visual.length, 6)
  geometry.rotateX(Math.PI / 2) // align the geometry's length axis with local +z (forward)
  const material = new THREE.MeshBasicMaterial({ color: visual.color })
  return new THREE.Mesh(geometry, material)
}

export function buildImpactFlash(color = 0xffcc66) {
  const geometry = new THREE.SphereGeometry(1, 8, 8)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.scale.setScalar(0.5)
  return mesh
}
