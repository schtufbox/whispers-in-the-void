import * as THREE from 'three'
import { buildHullGeometry } from '../procgen/hull.js'
import { mulberry32 } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const hardpointMarkerGeometry = new THREE.ConeGeometry(0.18, 0.45, 6)
const hardpointMarkerMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a2a30,
  flatShading: true,
  metalness: 0.7,
  roughness: 0.4
})

const canopyMaterial = new THREE.MeshStandardMaterial({
  color: 0x152838,
  flatShading: false,
  transparent: true,
  opacity: 0.88,
  metalness: 0.15,
  roughness: 0.08,
  emissive: 0x0a2840,
  emissiveIntensity: 0.45
})
const windowMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a4058,
  emissive: 0x3a80a0,
  emissiveIntensity: 0.55,
  metalness: 0.2,
  roughness: 0.2,
  flatShading: true
})
const engineGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x7fe6ff,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
})
const engineConeMaterial = new THREE.MeshBasicMaterial({
  color: 0x4fc3d9,
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
})
const panelMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a1e26,
  flatShading: true,
  metalness: 0.55,
  roughness: 0.55
})
const radiatorMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a3038,
  flatShading: true,
  metalness: 0.75,
  roughness: 0.35,
  emissive: 0x1a1010,
  emissiveIntensity: 0.15
})
const accentStripeMaterial = new THREE.MeshStandardMaterial({
  color: 0xc45a18,
  flatShading: true,
  metalness: 0.4,
  roughness: 0.5
})
const antennaMaterial = new THREE.MeshStandardMaterial({
  color: 0x9aabbc,
  flatShading: true,
  metalness: 0.85,
  roughness: 0.25
})
const nacelleMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a424c,
  flatShading: true,
  metalness: 0.7,
  roughness: 0.4
})

function defaultStyle(hull, rng) {
  if (hull.style) return hull.style
  // Hand-crafted classes may omit style — invent a stable one from class seed.
  return {
    asymmetric: rng() < 0.35,
    bridgeSide: rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0,
    engineLayout: Math.max(...hull.stationWidths) > hull.length * 0.08 ? 'twin' : 'single',
    hasRadiator: rng() < 0.5,
    hasCargoPods: rng() < 0.25,
    hasSensorMast: true,
    hasDockingRing: rng() < 0.15
  }
}

function engineOffsets(layout, peakWidth) {
  switch (layout) {
    case 'single':
      return [[0, 0]]
    case 'triple':
      return [[-peakWidth * 0.38, 0], [0, peakWidth * 0.12], [peakWidth * 0.38, 0]]
    case 'quad':
      return [
        [-peakWidth * 0.4, peakWidth * 0.12],
        [peakWidth * 0.4, peakWidth * 0.12],
        [-peakWidth * 0.4, -peakWidth * 0.12],
        [peakWidth * 0.4, -peakWidth * 0.12]
      ]
    case 'twin':
    default:
      return [[-peakWidth * 0.35, 0], [peakWidth * 0.35, 0]]
  }
}

// Cosmetic details on the parametric hull — canopy, engines, radiators,
// greebles, cargo. Seeded per class id so every ship of a class matches.
function addHullDetails(group, hull) {
  const rng = mulberry32(hashString(group.name))
  const { length, stationWidths, stationHeights } = hull
  const peakWidth = Math.max(...stationWidths)
  const peakHeight = Math.max(...stationHeights)
  const style = defaultStyle(hull, rng)
  const bridgeX = style.bridgeSide * peakWidth * 0.28

  // Bridge / cockpit canopy — can sit off-center on asymmetric hulls.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(peakWidth * 0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    canopyMaterial
  )
  canopy.scale.set(1.05, 0.5, 1.85)
  canopy.position.set(bridgeX, peakHeight * 0.78, length * 0.22)
  group.add(canopy)

  // Framed window strip under the canopy (reads as a bridge).
  const windowCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < windowCount; i++) {
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(peakWidth * 0.08, peakHeight * 0.07, peakWidth * 0.06),
      windowMaterial
    )
    w.position.set(
      bridgeX + (i - (windowCount - 1) / 2) * peakWidth * 0.12,
      peakHeight * 0.62,
      length * 0.28
    )
    group.add(w)
  }

  // Raised bridge tower for freighter-like silhouettes.
  if (style.bridgeSide !== 0 || rng() < 0.35) {
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(peakWidth * 0.35, peakHeight * 0.55, peakWidth * 0.5),
      panelMaterial
    )
    tower.position.set(bridgeX, peakHeight * 0.95, length * 0.05)
    group.add(tower)
  }

  // Engine nacelles + glow — real housings, not floating discs.
  const layout = style.engineLayout ?? 'twin'
  const offsets = engineOffsets(layout, peakWidth)
  const engineR = peakHeight * (layout === 'quad' ? 0.28 : 0.36)
  for (const [ox, oy] of offsets) {
    const nacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(engineR * 0.95, engineR * 1.05, peakHeight * 0.85, 8),
      nacelleMaterial
    )
    nacelle.rotation.x = Math.PI / 2
    nacelle.position.set(ox, oy, -length / 2 + peakHeight * 0.35)
    group.add(nacelle)

    // Bell / nozzle flare.
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(engineR * 1.15, engineR * 0.75, peakHeight * 0.35, 8),
      panelMaterial
    )
    bell.rotation.x = Math.PI / 2
    bell.position.set(ox, oy, -length / 2 - 0.05)
    group.add(bell)

    const glow = new THREE.Mesh(new THREE.CircleGeometry(engineR * 0.85, 12), engineGlowMaterial)
    glow.position.set(ox, oy, -length / 2 - peakHeight * 0.2)
    glow.rotation.y = Math.PI
    group.add(glow)

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(engineR * 0.55, peakHeight * 1.1, 8, 1, true),
      engineConeMaterial
    )
    cone.rotation.x = -Math.PI / 2
    cone.position.set(ox, oy, -length / 2 - peakHeight * 0.55)
    group.add(cone)

    // Nacelle mount strut if offset from centerline.
    if (Math.abs(ox) > 0.05 || Math.abs(oy) > 0.05) {
      const strutLen = Math.hypot(ox, oy)
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(strutLen, peakHeight * 0.12, peakHeight * 0.18),
        panelMaterial
      )
      strut.position.set(ox * 0.5, oy * 0.5, -length / 2 + peakHeight * 0.5)
      strut.rotation.z = Math.atan2(oy, ox)
      group.add(strut)
    }
  }

  // Heat radiators — flat dark panels hanging off one side (very "human spacecraft").
  if (style.hasRadiator) {
    const side = style.asymmetric ? (rng() < 0.5 ? -1 : 1) : 1
    const radW = peakWidth * (0.9 + rng() * 0.6)
    const radH = peakHeight * (0.08 + rng() * 0.06)
    const radL = length * (0.28 + rng() * 0.2)
    const rad = new THREE.Mesh(new THREE.BoxGeometry(radW, radH, radL), radiatorMaterial)
    rad.position.set(side * (peakWidth * 0.55 + radW * 0.45), peakHeight * 0.15, -length * 0.05)
    rad.rotation.z = side * 0.15
    group.add(rad)
    // Ribs on radiator.
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(radW * 0.95, radH * 1.4, radL * 0.03),
        panelMaterial
      )
      rib.position.set(
        side * (peakWidth * 0.55 + radW * 0.45),
        peakHeight * 0.15,
        -length * 0.05 + (i - 1.5) * (radL * 0.22)
      )
      group.add(rib)
    }
  }

  // Cargo pods / ISO containers bolted under freighters.
  if (style.hasCargoPods) {
    const pods = 2 + Math.floor(rng() * 3)
    for (let i = 0; i < pods; i++) {
      const pw = peakWidth * (0.35 + rng() * 0.25)
      const ph = peakHeight * (0.35 + rng() * 0.2)
      const pl = length * (0.12 + rng() * 0.1)
      const pod = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pl), panelMaterial)
      const side = style.asymmetric && i === 0 ? (rng() < 0.5 ? -1 : 1) : (i % 2 === 0 ? -1 : 1)
      pod.position.set(
        side * peakWidth * (0.55 + rng() * 0.2),
        -peakHeight * (0.55 + rng() * 0.15),
        (rng() - 0.5) * length * 0.35
      )
      group.add(pod)
    }
  }

  // Hazard / fleet accent stripe.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(peakWidth * 0.1, peakHeight * 0.06, length * 0.5),
    accentStripeMaterial
  )
  stripe.position.set(bridgeX * 0.3, peakHeight * 0.48, length * 0.02)
  group.add(stripe)

  // Sensor mast / comms array.
  if (style.hasSensorMast !== false) {
    const mastX = style.asymmetric ? peakWidth * (0.2 + rng() * 0.25) * (rng() < 0.5 ? -1 : 1) : peakWidth * 0.12
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(peakWidth * 0.018, peakWidth * 0.028, peakHeight * 0.7, 5),
      antennaMaterial
    )
    mast.position.set(mastX, peakHeight * 1.05, length * 0.3)
    group.add(mast)
    const dish = new THREE.Mesh(
      new THREE.CircleGeometry(peakWidth * 0.12, 10),
      antennaMaterial
    )
    dish.position.set(mastX, peakHeight * 1.35, length * 0.3)
    dish.rotation.x = -Math.PI / 3
    group.add(dish)
    // Secondary whip antenna.
    if (rng() < 0.6) {
      const whip = new THREE.Mesh(
        new THREE.CylinderGeometry(peakWidth * 0.01, peakWidth * 0.01, peakHeight * 0.9, 4),
        antennaMaterial
      )
      whip.position.set(-mastX * 0.7, peakHeight * 1.1, length * 0.15)
      whip.rotation.z = 0.2
      group.add(whip)
    }
  }

  // Docking collar ring near nose (freighters / explorers).
  if (style.hasDockingRing) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(peakWidth * 0.55, peakWidth * 0.06, 6, 14),
      nacelleMaterial
    )
    ring.position.set(0, 0, length * 0.35)
    group.add(ring)
  }

  // RCS thruster blocks (four corners of mid-body).
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rcs = new THREE.Mesh(
      new THREE.BoxGeometry(peakWidth * 0.1, peakHeight * 0.1, peakWidth * 0.12),
      nacelleMaterial
    )
    rcs.position.set(sx * peakWidth * 0.85, sy * peakHeight * 0.55, length * 0.05)
    group.add(rcs)
  }

  // Surface plating / greeble panels — denser, more industrial.
  const greebleCount = 8 + Math.floor(rng() * 8)
  for (let i = 0; i < greebleCount; i++) {
    const w = peakWidth * (0.05 + rng() * 0.14)
    const h = peakHeight * (0.04 + rng() * 0.1)
    const d = peakWidth * (0.08 + rng() * 0.25)
    const greeble = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), panelMaterial)
    const sideBias = style.asymmetric && rng() < 0.4 ? (rng() < 0.5 ? -0.3 : 0.3) : 0
    greeble.position.set(
      (rng() - 0.5 + sideBias) * peakWidth * 1.5,
      (rng() - 0.35) * peakHeight * 1.1,
      (rng() - 0.5) * length * 0.7
    )
    greeble.rotation.y = rng() * Math.PI * 0.3
    group.add(greeble)
  }

  // Underside cargo bay / heat shield plate.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(peakWidth * 0.85, peakHeight * 0.07, length * 0.32),
    panelMaterial
  )
  plate.position.set(style.asymmetric ? peakWidth * 0.08 * style.bridgeSide : 0, -peakHeight * 0.5, -length * 0.05)
  group.add(plate)

  // Side airlock / hatch (often off-center on real ships).
  const hatchSide = style.asymmetric ? (style.bridgeSide !== 0 ? -style.bridgeSide : 1) : (rng() < 0.5 ? -1 : 1)
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(peakHeight * 0.22, peakHeight * 0.22, peakWidth * 0.08, 10),
    nacelleMaterial
  )
  hatch.rotation.z = Math.PI / 2
  hatch.position.set(hatchSide * peakWidth * 0.95, 0, length * 0.1)
  group.add(hatch)
}

export function buildShipMesh(shipClass) {
  const group = new THREE.Group()
  group.name = shipClass.id

  const geometry = buildHullGeometry(shipClass.hull)
  const baseColor = new THREE.Color(shipClass.hull.color)
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    flatShading: true,
    side: THREE.DoubleSide,
    metalness: 0.58,
    roughness: 0.42
  })
  const hullMesh = new THREE.Mesh(geometry, material)
  group.add(hullMesh)

  // Dark panel seams.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 18),
    new THREE.LineBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.75 })
  )
  group.add(edges)

  // Soft hull rim highlight against black space.
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 35),
    new THREE.LineBasicMaterial({ color: 0x6a8aaa, transparent: true, opacity: 0.22 })
  )
  group.add(rim)

  addHullDetails(group, shipClass.hull)

  for (const hp of shipClass.hardpoints ?? []) {
    const marker = new THREE.Mesh(hardpointMarkerGeometry, hardpointMarkerMaterial)
    marker.position.set(...hp.position)
    marker.rotation.x = Math.PI / 2
    group.add(marker)
  }

  return group
}
