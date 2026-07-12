import * as THREE from 'three'

// A generic docking bay backdrop shown behind the docking UI — one shared
// interior for every dockable body (planet base, moon base, station,
// settlement); it's a backdrop, not a per-body model.
const BAY_WIDTH = 60
const BAY_HEIGHT = 44
const BAY_LENGTH = 130

export function buildStationInteriorMesh() {
  const group = new THREE.Group()
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a2438, flatShading: true })
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x0d1420, flatShading: true })
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x2a3a55, flatShading: true })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0x4fc3d9, flatShading: true })

  const floor = new THREE.Mesh(new THREE.BoxGeometry(BAY_WIDTH, 2, BAY_LENGTH), floorMat)
  floor.position.set(0, -BAY_HEIGHT / 2, 0)
  group.add(floor)

  const ceiling = floor.clone()
  ceiling.position.y = BAY_HEIGHT / 2
  group.add(ceiling)

  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(2, BAY_HEIGHT, BAY_LENGTH), wallMat)
  wallLeft.position.set(-BAY_WIDTH / 2, 0, 0)
  group.add(wallLeft)

  const wallRight = wallLeft.clone()
  wallRight.position.x = BAY_WIDTH / 2
  group.add(wallRight)

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(BAY_WIDTH, BAY_HEIGHT, 2), wallMat)
  backWall.position.set(0, 0, BAY_LENGTH / 2)
  group.add(backWall)

  for (let z = -BAY_LENGTH / 2 + 20; z < BAY_LENGTH / 2; z += 32) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(BAY_WIDTH - 4, 3, 3), beamMat)
    beam.position.set(0, BAY_HEIGHT / 2 - 2, z)
    group.add(beam)
  }

  const entryRing = new THREE.Mesh(new THREE.TorusGeometry(24, 1.4, 8, 24), accentMat)
  entryRing.position.set(0, 0, -BAY_LENGTH / 2 + 4)
  group.add(entryRing)

  const padMarking = new THREE.Mesh(new THREE.RingGeometry(8, 9, 24), accentMat)
  padMarking.rotation.x = -Math.PI / 2
  padMarking.position.set(0, -BAY_HEIGHT / 2 + 1.1, 20)
  group.add(padMarking)

  const bayLight = new THREE.PointLight(0x8fb3ff, 2.2, 260)
  bayLight.position.set(0, BAY_HEIGHT / 2 - 6, 0)
  group.add(bayLight)

  return group
}
