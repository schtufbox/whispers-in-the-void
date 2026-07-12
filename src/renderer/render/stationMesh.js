import * as THREE from 'three'
import { mulberry32, range, intRange, pick } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function hullMaterials(rng) {
  const hue = range(rng, 0, 360)
  const hullColor = new THREE.Color().setHSL(hue / 360, 0.15, 0.55)
  const accentColor = new THREE.Color().setHSL(((hue + range(rng, 140, 220)) % 360) / 360, 0.55, 0.55)
  return {
    hull: new THREE.MeshLambertMaterial({ color: hullColor, flatShading: true }),
    accent: new THREE.MeshLambertMaterial({ color: accentColor, flatShading: true })
  }
}

function edgesFor(geometry, color = 0x0a0a0a) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), new THREE.LineBasicMaterial({ color }))
}

// A small self-lit nav light plus a soft additive glow halo around it (same
// "corona shell" trick as starMesh.js's flare) — the halo's opacity is pulsed
// per-frame by updateStationMesh so stations read as alive/powered rather
// than static geometry. Registered on group.userData.beacons for that update.
function addBeacon(group, position, color, phase, radius = 0.6) {
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

// A larger, translucent additive-blended torus just outside a "real" ring,
// for a soft energized halo — cheap fanciness reusing the same additive-glow
// technique used throughout render/starMesh.js.
function addGlowRing(group, radius, tube, color, rotationX = Math.PI / 2) {
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  glow.rotation.x = rotationX
  group.add(glow)
}

// The classic ring station — also used for the main-menu flyby background
// (createHud-independent decoration), so its exact structure (a child named
// 'ring' that the flyby spins) must stay stable regardless of the variety
// added below for in-game stations/settlements.
export function buildStationMesh() {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x7d8f9a, flatShading: true })
  const accentMat = new THREE.MeshLambertMaterial({ color: 0x4fc3d9, flatShading: true })

  const coreGeometry = new THREE.CylinderGeometry(6, 6, 22, 8)
  const core = new THREE.Mesh(coreGeometry, hullMat)
  group.add(core)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(17, 1.6, 8, 24), accentMat)
  ring.rotation.x = Math.PI / 2
  ring.name = 'ring'
  group.add(ring)
  addGlowRing(group, 17, 2.6, 0x4fc3d9)

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 11), hullMat)
    arm.position.set(Math.cos(angle) * 11.5, 0, Math.sin(angle) * 11.5)
    arm.rotation.y = angle
    group.add(arm)
  }

  const cap = new THREE.Mesh(new THREE.ConeGeometry(4, 6, 8), accentMat)
  cap.position.y = 14
  group.add(cap)
  const cap2 = cap.clone()
  cap2.position.y = -14
  cap2.rotation.x = Math.PI
  group.add(cap2)

  addBeacon(group, new THREE.Vector3(0, 17, 0), 0xff4040, 0)
  addBeacon(group, new THREE.Vector3(0, -17, 0), 0xff4040, Math.PI)

  group.add(edgesFor(coreGeometry))
  return group
}

// A tall spire with a few stacked docking-ring platforms.
function buildSpireStation(rng) {
  const { hull, accent } = hullMaterials(rng)
  const group = new THREE.Group()

  const bodyHeight = 30
  const coreGeometry = new THREE.CylinderGeometry(5, 8, bodyHeight, 6)
  group.add(new THREE.Mesh(coreGeometry, hull))

  const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 16, 6), accent)
  spire.position.y = bodyHeight / 2 + 8
  group.add(spire)

  const platformCount = intRange(rng, 2, 3)
  for (let i = 0; i < platformCount; i++) {
    const platformRadius = 9 + i * 1.6
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(platformRadius, platformRadius, 1.2, 8), accent)
    platform.position.y = -bodyHeight / 2 + 5 + i * 9
    group.add(platform)
    if (i === platformCount - 1) addGlowRing(group, platformRadius, 0.4, accent.color, Math.PI / 2)
  }

  addBeacon(group, new THREE.Vector3(0, bodyHeight / 2 + 16, 0), 0xff4040, rng() * Math.PI * 2)

  group.add(edgesFor(coreGeometry))
  return group
}

// A boxy modular core with smaller modules bolted onto a random subset of
// its six faces via short struts.
function buildModularStation(rng) {
  const { hull, accent } = hullMaterials(rng)
  const group = new THREE.Group()

  const coreSize = 12
  const coreGeometry = new THREE.BoxGeometry(coreSize, coreSize, coreSize)
  group.add(new THREE.Mesh(coreGeometry, hull))

  const directions = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ]
  for (const dir of directions) {
    if (rng() < 0.35) continue
    const size = range(rng, 4, 9)
    const strutLen = range(rng, 3, 6)
    const strut = new THREE.Mesh(new THREE.BoxGeometry(2, 2, strutLen), hull)
    const module = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), accent)
    const strutCenter = coreSize / 2 + strutLen / 2
    const moduleCenter = coreSize / 2 + strutLen + size / 2
    strut.position.set(dir[0] * strutCenter, dir[1] * strutCenter, dir[2] * strutCenter)
    module.position.set(dir[0] * moduleCenter, dir[1] * moduleCenter, dir[2] * moduleCenter)
    if (dir[0] !== 0) strut.rotation.y = Math.PI / 2
    if (dir[1] !== 0) strut.rotation.x = Math.PI / 2
    group.add(strut)
    group.add(module)

    const beaconOffset = dir.map((d) => d * (moduleCenter + size / 2 + 0.4))
    addBeacon(group, new THREE.Vector3(...beaconOffset), 0xffcf4f, rng() * Math.PI * 2, 0.5)
  }

  group.add(edgesFor(coreGeometry))
  return group
}

// A low dome on a wide base, with a few antenna spikes on top.
function buildDomeStation(rng) {
  const { hull, accent } = hullMaterials(rng)
  const group = new THREE.Group()

  const baseRadius = 11
  const baseGeometry = new THREE.CylinderGeometry(baseRadius, baseRadius * 1.15, 6, 10)
  const base = new THREE.Mesh(baseGeometry, hull)
  base.position.y = -3
  group.add(base)

  const dome = new THREE.Mesh(new THREE.SphereGeometry(baseRadius * 0.85, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), accent)
  group.add(dome)
  addGlowRing(group, baseRadius * 1.05, 0.5, accent.color, Math.PI / 2)

  const spikeCount = intRange(rng, 3, 5)
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i / spikeCount) * Math.PI * 2 + rng()
    const r = baseRadius * 0.5
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.8, 6, 6), hull)
    spike.position.set(Math.cos(angle) * r, baseRadius * 0.7, Math.sin(angle) * r)
    group.add(spike)
  }

  addBeacon(group, new THREE.Vector3(0, baseRadius * 0.85, 0), 0xff4040, rng() * Math.PI * 2)

  group.add(edgesFor(baseGeometry))
  return group
}

// --- Parametric archetypes -------------------------------------------------
// Rather than hand-author dozens more one-off shapes like the 4 above, this
// combines a core-shape pool with an accessory pool. A "type" is a fixed
// combination (picked by structureRng, seeded per archetype index below), so
// every station of that generated type shares the same silhouette; only its
// colors vary per-instance (via colorRng, the body's own hash) — the same
// split the 43-vs-7 procedural ship roster in data/shipClasses.js uses.

function coreBox(size, rng) {
  const h = size * range(rng, 0.6, 1.6)
  return { geometry: new THREE.BoxGeometry(size, h, size), height: h }
}
function coreCylinder(size, rng) {
  const h = size * range(rng, 1.0, 2.2)
  return { geometry: new THREE.CylinderGeometry(size * range(rng, 0.3, 0.55), size * range(rng, 0.3, 0.6), h, intRange(rng, 5, 9)), height: h }
}
function coreCone(size, rng) {
  const h = size * range(rng, 1.2, 2.4)
  return { geometry: new THREE.ConeGeometry(size * range(rng, 0.4, 0.65), h, intRange(rng, 4, 8)), height: h }
}
function coreSphere(size, rng) {
  const r = size * range(rng, 0.45, 0.7)
  return { geometry: new THREE.SphereGeometry(r, intRange(rng, 6, 10), intRange(rng, 5, 8)), height: r * 2 }
}
function coreTorus(size, rng) {
  const tube = size * range(rng, 0.12, 0.22)
  return {
    geometry: new THREE.TorusGeometry(size * range(rng, 0.45, 0.65), tube, 6, intRange(rng, 10, 20)),
    height: tube * 2,
    rotationX: Math.PI / 2
  }
}
const CORE_BUILDERS = [coreBox, coreCylinder, coreCone, coreSphere, coreTorus]

function accessoryRing(group, size, height, hull, accent, rng) {
  const r = size * range(rng, 0.7, 1.1)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, size * 0.06, 6, 24), accent)
  ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.4
  group.add(ring)
  addGlowRing(group, r, size * 0.09, accent.color, ring.rotation.x)
}
function accessoryArms(group, size, height, hull, accent, rng) {
  const count = intRange(rng, 3, 5)
  const armLen = size * range(rng, 0.8, 1.4)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(size * 0.15, size * 0.15, armLen), hull)
    arm.position.set(Math.cos(angle) * armLen * 0.5, 0, Math.sin(angle) * armLen * 0.5)
    arm.rotation.y = angle
    group.add(arm)
  }
}
function accessorySpikes(group, size, height, hull, accent, rng) {
  const count = intRange(rng, 3, 6)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng()
    const r = size * range(rng, 0.3, 0.6)
    const spike = new THREE.Mesh(new THREE.ConeGeometry(size * 0.08, size * range(rng, 0.4, 0.8), 6), hull)
    spike.position.set(Math.cos(angle) * r, height * 0.5, Math.sin(angle) * r)
    group.add(spike)
  }
}
function accessoryModules(group, size, height, hull, accent, rng) {
  const count = intRange(rng, 2, 4)
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng()
    const dist = size * range(rng, 0.7, 1.1)
    const moduleSize = size * range(rng, 0.25, 0.45)
    const module = new THREE.Mesh(new THREE.BoxGeometry(moduleSize, moduleSize, moduleSize), accent)
    module.position.set(Math.cos(angle) * dist, (rng() - 0.5) * height * 0.4, Math.sin(angle) * dist)
    group.add(module)
  }
}
function accessoryStack(group, size, height, hull, accent, rng) {
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.25, size * range(rng, 0.4, 0.8), 6), accent)
  cap.position.y = height / 2 + size * 0.2
  group.add(cap)
}
function accessoryPanels(group, size, height, hull, accent, rng) {
  const panelW = size * range(rng, 0.5, 1.0)
  const panelH = size * range(rng, 0.8, 1.6)
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, size * 0.04), accent)
    panel.position.set(side * (size * 0.55 + panelW / 2), 0, 0)
    group.add(panel)
  }
}
const ACCESSORY_BUILDERS = [accessoryRing, accessoryArms, accessorySpikes, accessoryModules, accessoryStack, accessoryPanels]
const BEACON_COLORS = [0xff4040, 0xffcf4f, 0x4fe0ff]

function buildParametricStation(structureRng, colorRng) {
  const { hull, accent } = hullMaterials(colorRng)
  const group = new THREE.Group()
  const size = 12

  const coreBuilder = pick(structureRng, CORE_BUILDERS)
  const { geometry: coreGeometry, height, rotationX } = coreBuilder(size, structureRng)
  const core = new THREE.Mesh(coreGeometry, hull)
  if (rotationX) core.rotation.x = rotationX
  group.add(core)

  const accessoryCount = intRange(structureRng, 1, 3)
  const chosen = new Set()
  while (chosen.size < accessoryCount) chosen.add(pick(structureRng, ACCESSORY_BUILDERS))
  for (const accessoryFn of chosen) accessoryFn(group, size, height, hull, accent, structureRng)

  addBeacon(group, new THREE.Vector3(0, height / 2 + 1, 0), pick(structureRng, BEACON_COLORS), colorRng() * Math.PI * 2)
  group.add(edgesFor(coreGeometry))
  return group
}

// 40 additional archetypes built from the core/accessory pools above, each
// with its own fixed structure seed so the same archetype index always
// produces the same silhouette (colors still vary per-instance via colorRng).
const STATION_ROSTER_SEED = 'station-archetype-v1'
const GENERATED_STATION_TEMPLATES = Array.from({ length: 40 }, (_, i) => {
  const structureSeed = hashString(`${STATION_ROSTER_SEED}-${i}`)
  return (colorRng) => buildParametricStation(mulberry32(structureSeed), colorRng)
})

const STATION_VARIANTS = [buildStationMesh, buildSpireStation, buildModularStation, buildDomeStation, ...GENERATED_STATION_TEMPLATES]

// Picks one of several distinct station/settlement archetypes deterministically
// from the body's id, so the same body always looks the same but the galaxy
// isn't just one reskinned structure everywhere.
export function buildStationMeshForBody(body) {
  const rng = mulberry32(hashString(body.id))
  const variant = STATION_VARIANTS[Math.floor(rng() * STATION_VARIANTS.length)]
  const group = variant(rng)
  group.userData.spinSpeed = 0.008 + rng() * 0.012
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
