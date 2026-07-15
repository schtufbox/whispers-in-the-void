import * as THREE from 'three'
import { mulberry32, range, intRange, pick } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function hullMaterials(rng) {
  // Industrial metal: desaturated greys with a cool or warm bias.
  const warm = rng() < 0.45
  const hue = warm ? range(rng, 25, 45) : range(rng, 200, 220)
  const hullColor = new THREE.Color().setHSL(hue / 360, range(rng, 0.06, 0.18), range(rng, 0.42, 0.58))
  const accentColor = new THREE.Color().setHSL(((hue + range(rng, 100, 180)) % 360) / 360, range(rng, 0.35, 0.55), range(rng, 0.45, 0.6))
  const panelColor = hullColor.clone().offsetHSL(0, 0, -0.12)
  return {
    hull: new THREE.MeshStandardMaterial({ color: hullColor, flatShading: true, metalness: 0.62, roughness: 0.42 }),
    accent: new THREE.MeshStandardMaterial({ color: accentColor, flatShading: true, metalness: 0.45, roughness: 0.5 }),
    panel: new THREE.MeshStandardMaterial({ color: panelColor, flatShading: true, metalness: 0.7, roughness: 0.38 }),
    window: new THREE.MeshStandardMaterial({
      color: 0x1a3040,
      emissive: accentColor.clone().multiplyScalar(0.6),
      emissiveIntensity: 0.7,
      flatShading: true,
      metalness: 0.2,
      roughness: 0.25
    }),
    solar: new THREE.MeshStandardMaterial({
      color: 0x0a1a3a,
      emissive: 0x061428,
      emissiveIntensity: 0.25,
      flatShading: true,
      metalness: 0.85,
      roughness: 0.2
    }),
    radiator: new THREE.MeshStandardMaterial({
      color: 0x2a2220,
      flatShading: true,
      metalness: 0.75,
      roughness: 0.35,
      emissive: 0x1a0a08,
      emissiveIntensity: 0.12
    })
  }
}

function edgesFor(geometry, color = 0x0a0a0a) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 22), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }))
}

function addBeacon(group, position, color, phase, radius = 0.55) {
  const light = new THREE.Mesh(new THREE.SphereGeometry(radius, 6, 4), new THREE.MeshBasicMaterial({ color }))
  light.position.copy(position)
  group.add(light)

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 2.6, 8, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  glow.position.copy(position)
  group.add(glow)

  if (!group.userData.beacons) group.userData.beacons = []
  group.userData.beacons.push({ glow, phase })
}

function addGlowRing(group, radius, tube, color, rotationX = Math.PI / 2) {
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  glow.rotation.x = rotationX
  group.add(glow)
}

// Row of lit portholes along a cylinder / flat face.
function addWindowRow(group, mats, { count, radius, y, z = 0, axis = 'y' }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.2), mats.window)
    if (axis === 'y') {
      win.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius + z)
      win.lookAt(0, y, 0)
    } else {
      win.position.set((i - (count - 1) / 2) * 1.1, y, radius)
    }
    group.add(win)
  }
}

function addSolarArray(group, mats, origin, length, width, tilt = 0.15) {
  const panel = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, width), mats.solar)
  panel.position.copy(origin)
  panel.rotation.z = tilt
  group.add(panel)
  // Grid lines as thin ribs.
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(length * 0.98, 0.14, 0.08), mats.panel)
    rib.position.set(origin.x, origin.y, origin.z + (i - 2) * (width / 5))
    rib.rotation.z = tilt
    group.add(rib)
  }
  // Truss boom.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(origin.x) * 0.9 + 1, 0.35, 0.35), mats.panel)
  boom.position.set(origin.x * 0.45, origin.y, origin.z)
  group.add(boom)
}

function addRadiatorFin(group, mats, origin, size) {
  const fin = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.08, size * 0.55), mats.radiator)
  fin.position.copy(origin)
  group.add(fin)
}

function addDockingPort(group, mats, position, facing = new THREE.Vector3(0, 0, 1)) {
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 10), mats.accent)
  collar.position.copy(position)
  // Orient cylinder along facing.
  collar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), facing.clone().normalize())
  group.add(collar)
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), mats.panel)
  hatch.position.copy(position).addScaledVector(facing, 0.65)
  hatch.lookAt(position.clone().add(facing))
  group.add(hatch)
}

function addTrussModule(group, mats, from, to) {
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const len = from.distanceTo(to)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, len), mats.panel)
  beam.position.copy(mid)
  beam.lookAt(to)
  beam.rotateX(Math.PI / 2)
  group.add(beam)
}

// The classic ring station — also used for the main-menu flyby background
// (createHud-independent decoration), so its exact structure (a child named
// 'ring' that the flyby spins) must stay stable regardless of the variety
// added below for in-game stations/settlements.
export function buildStationMesh() {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x7d8f9a, flatShading: true, metalness: 0.6, roughness: 0.4 })
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x4fc3d9, flatShading: true, metalness: 0.45, roughness: 0.45 })
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x3a4550, flatShading: true, metalness: 0.7, roughness: 0.35 })

  const coreGeometry = new THREE.CylinderGeometry(5.5, 5.5, 24, 10)
  const core = new THREE.Mesh(coreGeometry, hullMat)
  group.add(core)

  // Hab ring with thicker tube (pressure shell).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 2.0, 10, 36), accentMat)
  ring.rotation.x = Math.PI / 2
  ring.name = 'ring'
  group.add(ring)
  addGlowRing(group, 17, 2.8, 0x4fc3d9)

  // Spoke arms + docking nodes.
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 12), hullMat)
    arm.position.set(Math.cos(angle) * 11.5, 0, Math.sin(angle) * 11.5)
    arm.rotation.y = -angle
    group.add(arm)
    const node = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.4, 3.2), panelMat)
    node.position.set(Math.cos(angle) * 17, 0, Math.sin(angle) * 17)
    group.add(node)
  }

  // Command modules top/bottom.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 5, 8), accentMat)
  cap.position.y = 14.5
  group.add(cap)
  const cap2 = cap.clone()
  cap2.position.y = -14.5
  group.add(cap2)

  // Solar wings.
  for (const side of [-1, 1]) {
    const solar = new THREE.Mesh(new THREE.BoxGeometry(22, 0.15, 6), new THREE.MeshStandardMaterial({
      color: 0x0a1a3a, metalness: 0.85, roughness: 0.2, flatShading: true, emissive: 0x061428, emissiveIntensity: 0.2
    }))
    solar.position.set(side * 28, 0, 0)
    group.add(solar)
  }

  addBeacon(group, new THREE.Vector3(0, 18, 0), 0xff4040, 0)
  addBeacon(group, new THREE.Vector3(0, -18, 0), 0xff4040, Math.PI)

  group.add(edgesFor(coreGeometry))
  return group
}

// Tall industrial spire with stacked decks, solar top, radiators.
function buildSpireStation(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  const bodyHeight = 32
  const coreGeometry = new THREE.CylinderGeometry(4.5, 7.5, bodyHeight, 8)
  group.add(new THREE.Mesh(coreGeometry, mats.hull))
  addWindowRow(group, mats, { count: 10, radius: 5.2, y: 4 })
  addWindowRow(group, mats, { count: 10, radius: 6.2, y: -6 })

  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.5, 14, 8), mats.accent)
  spire.position.y = bodyHeight / 2 + 7
  group.add(spire)

  const platformCount = intRange(rng, 2, 4)
  for (let i = 0; i < platformCount; i++) {
    const platformRadius = 9 + i * 1.4
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(platformRadius, platformRadius, 1.1, 12), mats.panel)
    platform.position.y = -bodyHeight / 2 + 5 + i * 8
    group.add(platform)
    // Deck edge lip.
    const lip = new THREE.Mesh(new THREE.TorusGeometry(platformRadius, 0.25, 6, 24), mats.accent)
    lip.rotation.x = Math.PI / 2
    lip.position.y = platform.position.y + 0.6
    group.add(lip)
    if (i === platformCount - 1) addGlowRing(group, platformRadius, 0.35, mats.accent.color, Math.PI / 2)
  }

  addSolarArray(group, mats, new THREE.Vector3(14, bodyHeight * 0.15, 0), 12, 5, 0.1)
  addSolarArray(group, mats, new THREE.Vector3(-14, bodyHeight * 0.15, 0), 12, 5, -0.1)
  addRadiatorFin(group, mats, new THREE.Vector3(0, -2, 10), 7)
  addDockingPort(group, mats, new THREE.Vector3(0, -bodyHeight / 2 + 2, 8), new THREE.Vector3(0, 0, 1))

  addBeacon(group, new THREE.Vector3(0, bodyHeight / 2 + 15, 0), 0xff4040, rng() * Math.PI * 2)
  group.add(edgesFor(coreGeometry))
  return group
}

// Boxy modular hub — ISS-style pressurized modules + trusses.
function buildModularStation(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  const coreSize = 10
  const coreGeometry = new THREE.BoxGeometry(coreSize, coreSize * 0.85, coreSize)
  group.add(new THREE.Mesh(coreGeometry, mats.hull))
  addWindowRow(group, mats, { count: 6, radius: coreSize / 2 + 0.1, y: 1, axis: 'flat' })

  // Central truss spine.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 1.2), mats.panel)
  group.add(spine)

  const directions = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ]
  for (const dir of directions) {
    if (rng() < 0.28) continue
    const size = range(rng, 4, 8)
    const strutLen = range(rng, 2.5, 5)
    const strut = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, strutLen), mats.panel)
    // Cylindrical habitat module (more "real station" than cubes).
    const isHab = rng() < 0.55
    const module = isHab
      ? new THREE.Mesh(new THREE.CylinderGeometry(size * 0.4, size * 0.4, size * 1.1, 10), mats.accent)
      : new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.7, size), mats.accent)
    if (isHab && dir[1] === 0) module.rotation.z = Math.PI / 2
    if (isHab && dir[2] !== 0) module.rotation.x = Math.PI / 2

    const strutCenter = coreSize / 2 + strutLen / 2
    const moduleCenter = coreSize / 2 + strutLen + size / 2
    strut.position.set(dir[0] * strutCenter, dir[1] * strutCenter, dir[2] * strutCenter)
    module.position.set(dir[0] * moduleCenter, dir[1] * moduleCenter, dir[2] * moduleCenter)
    if (dir[0] !== 0) strut.rotation.y = Math.PI / 2
    if (dir[1] !== 0) strut.rotation.x = Math.PI / 2
    group.add(strut)
    group.add(module)

    const beaconOffset = dir.map((d) => d * (moduleCenter + size / 2 + 0.4))
    addBeacon(group, new THREE.Vector3(...beaconOffset), 0xffcf4f, rng() * Math.PI * 2, 0.45)
  }

  addSolarArray(group, mats, new THREE.Vector3(18, 2, 0), 14, 5.5, 0.12)
  addSolarArray(group, mats, new THREE.Vector3(-18, -1, 0), 14, 5.5, -0.1)
  addRadiatorFin(group, mats, new THREE.Vector3(0, 8, 0), 6)
  addDockingPort(group, mats, new THREE.Vector3(0, 0, coreSize / 2 + 1.5), new THREE.Vector3(0, 0, 1))

  group.add(edgesFor(coreGeometry))
  return group
}

// Gravity-ring habitat with offset command module (asymmetric station).
function buildRingHabitatStation(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  const core = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 18, 10), mats.hull)
  group.add(core)

  const ringR = 16
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 2.2, 10, 40), mats.accent)
  ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.15
  group.add(ring)
  addGlowRing(group, ringR, 2.8, mats.accent.color, ring.rotation.x)

  // Three spokes (not four) — slight asymmetry.
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, ringR - 2), mats.panel)
    arm.position.set(Math.cos(angle) * ringR * 0.45, 0, Math.sin(angle) * ringR * 0.45)
    arm.rotation.y = -angle
    group.add(arm)
  }

  // Command pod offset above-and-to-the-side of the axis.
  const cmd = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 8), mats.hull)
  cmd.position.set(4, 12, -2)
  group.add(cmd)
  addDockingPort(group, mats, new THREE.Vector3(4, 12, 3), new THREE.Vector3(0, 0, 1))

  addSolarArray(group, mats, new THREE.Vector3(22, 3, 0), 16, 4.5, 0.08)
  addRadiatorFin(group, mats, new THREE.Vector3(-6, -8, 0), 8)
  addWindowRow(group, mats, { count: 16, radius: ringR + 1.5, y: 0 })

  addBeacon(group, new THREE.Vector3(4, 15, -2), 0xff4040, rng() * Math.PI * 2)
  group.add(edgesFor(new THREE.CylinderGeometry(3.5, 3.5, 18, 10)))
  return group
}

// Drydock frame: open truss with a ship-sized berth.
function buildDrydockStation(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  const frameL = 28
  const frameW = 16
  const frameH = 14
  // Corner posts.
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, frameH, 1.2), mats.panel)
      post.position.set(x * frameW / 2, 0, z * frameL / 2)
      group.add(post)
    }
  }
  // Longitudinal beams.
  for (const y of [-frameH / 2, frameH / 2]) {
    for (const x of [-frameW / 2, frameW / 2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 1, frameL), mats.hull)
      beam.position.set(x, y, 0)
      group.add(beam)
    }
    for (const z of [-frameL / 2, frameL / 2]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(frameW, 1, 1), mats.hull)
      beam.position.set(0, y, z)
      group.add(beam)
    }
  }

  // Control shack offset to one side.
  const shack = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), mats.accent)
  shack.position.set(frameW / 2 + 5, -2, -4)
  group.add(shack)
  addDockingPort(group, mats, new THREE.Vector3(frameW / 2 + 5, -2, 0), new THREE.Vector3(0, 0, 1))

  addSolarArray(group, mats, new THREE.Vector3(0, frameH / 2 + 2, 0), 18, 5, 0)
  addBeacon(group, new THREE.Vector3(frameW / 2, frameH / 2 + 1, frameL / 2), 0xffcf4f, 0)
  addBeacon(group, new THREE.Vector3(-frameW / 2, frameH / 2 + 1, -frameL / 2), 0xff4040, Math.PI)

  return group
}

// Low dome + wide pad — still used as a station archetype in orbit.
function buildDomeStation(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  const baseRadius = 12
  const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.12, 5, 12)
  const base = new THREE.Mesh(baseGeometry, mats.hull)
  base.position.y = -2.5
  group.add(base)

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(baseRadius * 0.82, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.accent
  )
  group.add(dome)
  addGlowRing(group, baseRadius * 1.02, 0.4, mats.accent.color, Math.PI / 2)

  // Asymmetric service tower.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3.5, 10, 3.5), mats.panel)
  tower.position.set(baseRadius * 0.55, 3, -baseRadius * 0.2)
  group.add(tower)

  addSolarArray(group, mats, new THREE.Vector3(-baseRadius * 0.9, 1, baseRadius * 0.3), 10, 4, 0.2)
  addRadiatorFin(group, mats, new THREE.Vector3(baseRadius * 0.3, 0, baseRadius * 0.85), 5)
  addDockingPort(group, mats, new THREE.Vector3(0, -1, baseRadius + 1), new THREE.Vector3(0, 0, 1))
  addWindowRow(group, mats, { count: 12, radius: baseRadius * 0.75, y: 1.5 })

  addBeacon(group, new THREE.Vector3(baseRadius * 0.55, 9, -baseRadius * 0.2), 0xff4040, rng() * Math.PI * 2)
  group.add(edgesFor(baseGeometry))
  return group
}

// --- Surface settlements (distinct from free-floating stations) ------------

function buildSettlementDomeCluster(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  // Landing pad base.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 1.2, 16), mats.panel)
  pad.position.y = -0.4
  group.add(pad)
  // Pad markings.
  const mark = new THREE.Mesh(new THREE.RingGeometry(4, 5, 24), mats.accent)
  mark.rotation.x = -Math.PI / 2
  mark.position.y = 0.25
  group.add(mark)

  // Central habitat dome.
  const mainDome = new THREE.Mesh(
    new THREE.SphereGeometry(6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.hull
  )
  mainDome.position.set(0, 0, -2)
  group.add(mainDome)

  // Secondary domes — irregular cluster, not a perfect ring.
  const satelliteCount = intRange(rng, 3, 5)
  for (let i = 0; i < satelliteCount; i++) {
    const a = (i / satelliteCount) * Math.PI * 2 + rng() * 0.4
    const dist = range(rng, 7, 11)
    const r = range(rng, 2.2, 3.8)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      i % 2 === 0 ? mats.accent : mats.hull
    )
    dome.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist)
    group.add(dome)
    // Corridor to main.
    const corridor = new THREE.Mesh(new THREE.BoxGeometry(dist * 0.55, 1.2, 1.6), mats.panel)
    corridor.position.set(Math.cos(a) * dist * 0.4, 0.6, Math.sin(a) * dist * 0.4 - 1)
    corridor.rotation.y = -a
    group.add(corridor)
  }

  // Comms tower off-center.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 12, 6), mats.panel)
  mast.position.set(5, 6, 4)
  group.add(mast)
  const dish = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12), mats.accent)
  dish.position.set(5, 12, 4)
  dish.rotation.x = -Math.PI / 3
  group.add(dish)

  addBeacon(group, new THREE.Vector3(5, 13, 4), 0xff4040, rng() * Math.PI * 2, 0.4)
  addBeacon(group, new THREE.Vector3(-8, 1, -6), 0xffcf4f, Math.PI, 0.35)
  return group
}

function buildSettlementOutpost(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  // Raised platform / cliff pad.
  const platform = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 16), mats.hull)
  platform.position.y = 0
  group.add(platform)

  // Hab blocks — staggered, asymmetric.
  const blocks = [
    [0, 3, -2, 8, 6, 7],
    [6, 2.5, 3, 5, 5, 5],
    [-7, 2, 2, 4, 4, 6],
    [2, 4.5, 5, 3.5, 3, 3.5]
  ]
  for (const [x, y, z, w, h, d] of blocks) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rng() < 0.4 ? mats.accent : mats.panel)
    b.position.set(x, y, z)
    group.add(b)
  }

  // Landing lights along pad edge.
  for (let i = 0; i < 6; i++) {
    addBeacon(group, new THREE.Vector3(-9 + i * 3.5, 1.2, 7.5), 0xffcf4f, i * 0.7, 0.3)
  }

  // Crane arm (asymmetric industrial detail).
  const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 5, 6), mats.panel)
  craneBase.position.set(-8, 4.5, -5)
  group.add(craneBase)
  const craneArm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 0.6), mats.hull)
  craneArm.position.set(-4, 7, -5)
  craneArm.rotation.z = -0.15
  group.add(craneArm)

  addSolarArray(group, mats, new THREE.Vector3(0, 8, -6), 12, 3.5, 0.25)
  return group
}

function buildSettlementMinehead(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  // Headframe over a shaft.
  const legs = [[-3, -3], [3, -3], [-3, 3], [3, 3]]
  for (const [x, z] of legs) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 0.7), mats.panel)
    leg.position.set(x, 7, z)
    group.add(leg)
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 8), mats.hull)
  cap.position.y = 14
  group.add(cap)

  // Processing building to one side.
  const plant = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 8), mats.accent)
  plant.position.set(10, 2.5, 0)
  group.add(plant)
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 10, 10), mats.hull)
  silo.position.set(10, 5, 7)
  group.add(silo)

  // Conveyor.
  const conv = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 1.5), mats.panel)
  conv.position.set(4, 3, 4)
  conv.rotation.z = -0.2
  group.add(conv)

  addBeacon(group, new THREE.Vector3(0, 15, 0), 0xff4040, 0)
  addRadiatorFin(group, mats, new THREE.Vector3(10, 6, -5), 4)
  return group
}

function buildSettlementFarmBubble(rng) {
  const mats = hullMaterials(rng)
  const group = new THREE.Group()

  // Greenhouse bubbles with green emissive tint.
  const growMat = new THREE.MeshStandardMaterial({
    color: 0x2a5a40,
    emissive: 0x1a4030,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.85,
    flatShading: true,
    metalness: 0.1,
    roughness: 0.4
  })

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3
    const dist = 5 + (i % 2) * 2
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(3.5 + (i % 2), 12, 8), growMat)
    bubble.position.set(Math.cos(a) * dist, 2.5, Math.sin(a) * dist)
    group.add(bubble)
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 4, 10), mats.hull)
  hub.position.y = 2
  group.add(hub)

  // Water tank asymmetric.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 6, 10), mats.panel)
  tank.position.set(9, 3, -3)
  group.add(tank)

  addBeacon(group, new THREE.Vector3(0, 5, 0), 0x4fe0ff, rng() * Math.PI * 2)
  addSolarArray(group, mats, new THREE.Vector3(-10, 4, 0), 10, 4, 0.3)
  return group
}

// --- Parametric orbital archetypes ----------------------------------------

function coreBox(size, rng) {
  const h = size * range(rng, 0.7, 1.4)
  return { geometry: new THREE.BoxGeometry(size, h, size * range(rng, 0.7, 1.2)), height: h }
}
function coreCylinder(size, rng) {
  const h = size * range(rng, 1.1, 2.0)
  return { geometry: new THREE.CylinderGeometry(size * range(rng, 0.28, 0.5), size * range(rng, 0.3, 0.55), h, intRange(rng, 6, 10)), height: h }
}
function coreCone(size, rng) {
  const h = size * range(rng, 1.0, 1.8)
  return { geometry: new THREE.ConeGeometry(size * range(rng, 0.35, 0.55), h, intRange(rng, 6, 8)), height: h }
}
function coreSphere(size, rng) {
  const r = size * range(rng, 0.4, 0.6)
  return { geometry: new THREE.SphereGeometry(r, intRange(rng, 8, 12), intRange(rng, 6, 10)), height: r * 2 }
}
function coreTorus(size, rng) {
  const tube = size * range(rng, 0.12, 0.2)
  return {
    geometry: new THREE.TorusGeometry(size * range(rng, 0.45, 0.65), tube, 8, intRange(rng, 16, 28)),
    height: tube * 2,
    rotationX: Math.PI / 2
  }
}
const CORE_BUILDERS = [coreBox, coreCylinder, coreCone, coreSphere, coreTorus]

function accessoryRing(group, size, height, mats, rng) {
  const r = size * range(rng, 0.75, 1.15)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, size * 0.07, 8, 28), mats.accent)
  ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.35
  group.add(ring)
  addGlowRing(group, r, size * 0.1, mats.accent.color, ring.rotation.x)
}
function accessoryArms(group, size, height, mats, rng) {
  const count = intRange(rng, 2, 4) // not always even — asymmetry
  const armLen = size * range(rng, 0.8, 1.4)
  const phase = rng() * 0.5
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + phase
    const arm = new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 0.12, armLen), mats.hull)
    arm.position.set(Math.cos(angle) * armLen * 0.5, (rng() - 0.5) * height * 0.15, Math.sin(angle) * armLen * 0.5)
    arm.rotation.y = -angle
    group.add(arm)
    // End module.
    const mod = new THREE.Mesh(new THREE.BoxGeometry(size * 0.3, size * 0.25, size * 0.3), mats.accent)
    mod.position.set(Math.cos(angle) * armLen, arm.position.y, Math.sin(angle) * armLen)
    group.add(mod)
  }
}
function accessorySpikes(group, size, height, mats, rng) {
  const count = intRange(rng, 2, 4)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng()
    const r = size * range(rng, 0.25, 0.55)
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.04, size * 0.08, size * range(rng, 0.5, 0.9), 6), mats.panel)
    spike.position.set(Math.cos(angle) * r, height * 0.45, Math.sin(angle) * r)
    group.add(spike)
  }
}
function accessoryModules(group, size, height, mats, rng) {
  const count = intRange(rng, 2, 4)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.8
    const dist = size * range(rng, 0.65, 1.15)
    const moduleSize = size * range(rng, 0.22, 0.42)
    const module = rng() < 0.5
      ? new THREE.Mesh(new THREE.CylinderGeometry(moduleSize * 0.4, moduleSize * 0.4, moduleSize, 8), mats.accent)
      : new THREE.Mesh(new THREE.BoxGeometry(moduleSize, moduleSize * 0.7, moduleSize), mats.accent)
    module.position.set(Math.cos(angle) * dist, (rng() - 0.5) * height * 0.35, Math.sin(angle) * dist)
    if (rng() < 0.5) module.rotation.z = Math.PI / 2
    group.add(module)
  }
}
function accessoryStack(group, size, height, mats, rng) {
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.28, size * range(rng, 0.35, 0.7), 8), mats.accent)
  cap.position.y = height / 2 + size * 0.15
  group.add(cap)
}
function accessoryPanels(group, size, height, mats, rng) {
  // Prefer solar-style panels, often only on one side.
  const both = rng() < 0.45
  const sides = both ? [-1, 1] : [rng() < 0.5 ? -1 : 1]
  for (const side of sides) {
    addSolarArray(group, mats, new THREE.Vector3(side * size * 1.1, height * 0.1, 0), size * 0.9, size * 0.4, side * 0.12)
  }
}
function accessoryRadiators(group, size, height, mats, rng) {
  const side = rng() < 0.5 ? -1 : 1
  addRadiatorFin(group, mats, new THREE.Vector3(side * size * 0.7, 0, size * 0.3), size * 0.55)
}
function accessoryDock(group, size, height, mats, rng) {
  const a = rng() * Math.PI * 2
  addDockingPort(group, mats, new THREE.Vector3(Math.cos(a) * size * 0.6, 0, Math.sin(a) * size * 0.6), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
}

const ACCESSORY_BUILDERS = [
  accessoryRing, accessoryArms, accessorySpikes, accessoryModules,
  accessoryStack, accessoryPanels, accessoryRadiators, accessoryDock
]
const BEACON_COLORS = [0xff4040, 0xffcf4f, 0x4fe0ff]

function buildParametricStation(structureRng, colorRng) {
  const mats = hullMaterials(colorRng)
  const group = new THREE.Group()
  const size = 12

  const coreBuilder = pick(structureRng, CORE_BUILDERS)
  const { geometry: coreGeometry, height, rotationX } = coreBuilder(size, structureRng)
  const core = new THREE.Mesh(coreGeometry, mats.hull)
  if (rotationX) core.rotation.x = rotationX
  group.add(core)

  // Occasional lateral offset of a bolted module for asymmetry.
  if (structureRng() < 0.4) {
    const side = structureRng() < 0.5 ? -1 : 1
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 0.55, 8),
      mats.accent
    )
    pod.rotation.z = Math.PI / 2
    pod.position.set(side * size * 0.55, height * 0.1, 0)
    group.add(pod)
  }

  const accessoryCount = intRange(structureRng, 2, 4)
  const chosen = new Set()
  while (chosen.size < accessoryCount) chosen.add(pick(structureRng, ACCESSORY_BUILDERS))
  for (const accessoryFn of chosen) accessoryFn(group, size, height, mats, structureRng)

  addBeacon(group, new THREE.Vector3(0, height / 2 + 1, 0), pick(structureRng, BEACON_COLORS), colorRng() * Math.PI * 2)
  // Second beacon off-axis.
  if (structureRng() < 0.6) {
    addBeacon(
      group,
      new THREE.Vector3(size * 0.4, height * 0.2, -size * 0.3),
      pick(structureRng, BEACON_COLORS),
      colorRng() * Math.PI * 2,
      0.4
    )
  }
  group.add(edgesFor(coreGeometry))
  return group
}

const STATION_ROSTER_SEED = 'station-archetype-v2'
const GENERATED_STATION_TEMPLATES = Array.from({ length: 36 }, (_, i) => {
  const structureSeed = hashString(`${STATION_ROSTER_SEED}-${i}`)
  return (colorRng) => buildParametricStation(mulberry32(structureSeed), colorRng)
})

const STATION_HANDCRAFTED = [
  buildStationMesh,
  buildSpireStation,
  buildModularStation,
  buildDomeStation,
  buildRingHabitatStation,
  buildDrydockStation
]
const STATION_VARIANTS = [...STATION_HANDCRAFTED, ...GENERATED_STATION_TEMPLATES]

const SETTLEMENT_VARIANTS = [
  buildSettlementDomeCluster,
  buildSettlementOutpost,
  buildSettlementMinehead,
  buildSettlementFarmBubble,
  // Reuse a couple of dome/spire-ish forms at settlement scale via wrappers.
  (rng) => {
    const g = buildDomeStation(rng)
    g.scale.setScalar(0.85)
    return g
  },
  (rng) => {
    const g = buildSettlementDomeCluster(rng)
    // Extra pad lights for variety.
    addBeacon(g, new THREE.Vector3(10, 0.8, 10), 0x4fe0ff, 1.2, 0.3)
    return g
  }
]

// Picks one of several distinct station/settlement archetypes deterministically
// from the body's id, so the same body always looks the same but the galaxy
// isn't just one reskinned structure everywhere.
export function buildStationMeshForBody(body) {
  const rng = mulberry32(hashString(body.id))
  const isSettlement = body.kind === 'settlement'
  const pool = isSettlement ? SETTLEMENT_VARIANTS : STATION_VARIANTS
  const variant = pool[Math.floor(rng() * pool.length)]
  const group = variant(rng)
  // Settlements on a surface shouldn't spin like free stations.
  group.userData.spinSpeed = isSettlement ? 0 : 0.006 + rng() * 0.01
  return group
}

// Pulses beacon glow halos and applies the slow idle spin set by
// buildStationMeshForBody — driven by dt/elapsed (gameState.simTime), never
// wall-clock time. Safe no-op for any mesh without that userData (planets,
// asteroid fields, the menu's own buildStationMesh() instance).
export function updateStationMesh(mesh, elapsed, dt) {
  if (mesh.userData.spinSpeed) mesh.rotation.y += mesh.userData.spinSpeed * dt
  if (mesh.userData.beacons) {
    for (const beacon of mesh.userData.beacons) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4 + beacon.phase)
      beacon.glow.material.opacity = 0.15 + pulse * 0.35
    }
  }
}
