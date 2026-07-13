import * as THREE from 'three'
import { getWeapon, BASE_WEAPON_ID } from '../data/weapons.js'

// Size scales with the weapon's own damage, and color/shape come straight
// from its catalog entry (data/weapons.js) — so a Plasma Cannon bolt visibly
// reads as bigger/different from a stock Pulse Laser, not just a recolored
// version of one fixed laser/missile shape.
export function buildProjectileMesh(weaponId, mountType = 'laser') {
  const weapon = getWeapon(weaponId ?? BASE_WEAPON_ID[mountType])
  const isMissile = weapon.category === 'missile'
  const length = isMissile ? 1.6 + weapon.damage * 0.03 : 7 + weapon.damage * 0.35
  const radius = isMissile ? 0.28 + weapon.damage * 0.008 : 0.14 + weapon.damage * 0.01
  const geometry = isMissile
    ? new THREE.ConeGeometry(radius, length, 8)
    : new THREE.CylinderGeometry(radius, radius, length, 6)
  geometry.rotateX(Math.PI / 2) // align the geometry's length axis with local +z (forward)
  const material = new THREE.MeshBasicMaterial({ color: weapon.color })
  return new THREE.Mesh(geometry, material)
}

export function buildImpactFlash(color = 0xffcc66) {
  const geometry = new THREE.SphereGeometry(1, 8, 8)
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.scale.setScalar(0.5)
  return mesh
}
