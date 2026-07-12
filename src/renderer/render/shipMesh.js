import * as THREE from 'three'
import { buildHullGeometry } from '../procgen/hull.js'

const hardpointMarkerGeometry = new THREE.ConeGeometry(0.25, 0.6, 6)
const hardpointMarkerMaterial = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true })

export function buildShipMesh(shipClass) {
  const group = new THREE.Group()
  group.name = shipClass.id

  const geometry = buildHullGeometry(shipClass.hull)
  const material = new THREE.MeshLambertMaterial({
    color: shipClass.hull.color,
    flatShading: true,
    side: THREE.DoubleSide
  })
  const hullMesh = new THREE.Mesh(geometry, material)
  group.add(hullMesh)

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 25),
    new THREE.LineBasicMaterial({ color: 0x0a0a0a })
  )
  group.add(edges)

  for (const hp of shipClass.hardpoints ?? []) {
    const marker = new THREE.Mesh(hardpointMarkerGeometry, hardpointMarkerMaterial)
    marker.position.set(...hp.position)
    marker.rotation.x = Math.PI / 2
    group.add(marker)
  }

  return group
}
