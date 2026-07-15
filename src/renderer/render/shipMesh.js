import * as THREE from 'three'
import { buildHullGeometry } from '../procgen/hull.js'
import { mulberry32 } from '../procgen/prng.js'
import { stationMaterialMaps } from './textures.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Shared CC0 metal/panel maps (same packs as stations). Materials are built
// lazily inside buildShipMesh so node:test never hits TextureLoader at import.
function hullMaps() {
  return stationMaterialMaps('hull', 0.4)
}
function panelMaps() {
  return stationMaterialMaps('panel', 0.35)
}
function radiatorMaps() {
  return stationMaterialMaps('radiator', 0.35)
}

function makeDetailMaterials() {
  return {
    hardpoint: new THREE.MeshStandardMaterial({
      color: 0x2a2a30, metalness: 0.85, roughness: 0.4, ...panelMaps()
    }),
    canopy: new THREE.MeshStandardMaterial({
      color: 0x152838,
      flatShading: false,
      transparent: true,
      opacity: 0.88,
      metalness: 0.15,
      roughness: 0.08,
      emissive: 0x0a2840,
      emissiveIntensity: 0.45
    }),
    window: new THREE.MeshStandardMaterial({
      color: 0x1a4058,
      emissive: 0x3a80a0,
      emissiveIntensity: 0.55,
      metalness: 0.2,
      roughness: 0.2
    }),
    engineGlow: new THREE.MeshBasicMaterial({
      color: 0x7fe6ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    engineCone: new THREE.MeshBasicMaterial({
      color: 0x4fc3d9,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    panel: new THREE.MeshStandardMaterial({
      color: 0x2a3038, metalness: 0.8, roughness: 0.55, ...panelMaps()
    }),
    radiator: new THREE.MeshStandardMaterial({
      color: 0x4a3830,
      metalness: 0.85,
      roughness: 0.45,
      emissive: 0x1a1010,
      emissiveIntensity: 0.12,
      ...radiatorMaps()
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0xc45a18, metalness: 0.55, roughness: 0.5, ...panelMaps()
    }),
    antenna: new THREE.MeshStandardMaterial({
      color: 0x9aabbc, metalness: 0.9, roughness: 0.3, ...hullMaps()
    }),
    nacelle: new THREE.MeshStandardMaterial({
      color: 0x4a525c, metalness: 0.82, roughness: 0.42, ...hullMaps()
    })
  }
}

const hardpointMarkerGeometry = new THREE.ConeGeometry(0.18, 0.45, 6)

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
function addHullDetails(group, hull, mats) {
  const rng = mulberry32(hashString(group.name))
  const { length, stationWidths, stationHeights } = hull
  const peakWidth = Math.max(...stationWidths)
  const peakHeight = Math.max(...stationHeights)
  const style = defaultStyle(hull, rng)
  const bridgeX = style.bridgeSide * peakWidth * 0.28

  // Bridge / cockpit canopy — can sit off-center on asymmetric hulls.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(peakWidth * 0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.canopy
  )
  canopy.scale.set(1.05, 0.5, 1.85)
  canopy.position.set(bridgeX, peakHeight * 0.78, length * 0.22)
  group.add(canopy)

  // Framed window strip under the canopy (reads as a bridge).
  const windowCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < windowCount; i++) {
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(peakWidth * 0.08, peakHeight * 0.07, peakWidth * 0.06),
      mats.window
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
      mats.panel
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
      mats.nacelle
    )
    nacelle.rotation.x = Math.PI / 2
    nacelle.position.set(ox, oy, -length / 2 + peakHeight * 0.35)
    group.add(nacelle)

    // Bell / nozzle flare.
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(engineR * 1.15, engineR * 0.75, peakHeight * 0.35, 8),
      mats.panel
    )
    bell.rotation.x = Math.PI / 2
    bell.position.set(ox, oy, -length / 2 - 0.05)
    group.add(bell)

    const glow = new THREE.Mesh(new THREE.CircleGeometry(engineR * 0.85, 12), mats.engineGlow)
    glow.position.set(ox, oy, -length / 2 - peakHeight * 0.2)
    glow.rotation.y = Math.PI
    group.add(glow)

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(engineR * 0.55, peakHeight * 1.1, 8, 1, true),
      mats.engineCone
    )
    cone.rotation.x = -Math.PI / 2
    cone.position.set(ox, oy, -length / 2 - peakHeight * 0.55)
    group.add(cone)

    // Nacelle mount strut if offset from centerline.
    if (Math.abs(ox) > 0.05 || Math.abs(oy) > 0.05) {
      const strutLen = Math.hypot(ox, oy)
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(strutLen, peakHeight * 0.12, peakHeight * 0.18),
        mats.panel
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
    const rad = new THREE.Mesh(new THREE.BoxGeometry(radW, radH, radL), mats.radiator)
    rad.position.set(side * (peakWidth * 0.55 + radW * 0.45), peakHeight * 0.15, -length * 0.05)
    rad.rotation.z = side * 0.15
    group.add(rad)
    // Ribs on radiator.
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(radW * 0.95, radH * 1.4, radL * 0.03),
        mats.panel
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
      const pod = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pl), mats.panel)
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
    mats.accent
  )
  stripe.position.set(bridgeX * 0.3, peakHeight * 0.48, length * 0.02)
  group.add(stripe)

  // Sensor mast / comms array.
  if (style.hasSensorMast !== false) {
    const mastX = style.asymmetric ? peakWidth * (0.2 + rng() * 0.25) * (rng() < 0.5 ? -1 : 1) : peakWidth * 0.12
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(peakWidth * 0.018, peakWidth * 0.028, peakHeight * 0.7, 5),
      mats.antenna
    )
    mast.position.set(mastX, peakHeight * 1.05, length * 0.3)
    group.add(mast)
    const dish = new THREE.Mesh(
      new THREE.CircleGeometry(peakWidth * 0.12, 10),
      mats.antenna
    )
    dish.position.set(mastX, peakHeight * 1.35, length * 0.3)
    dish.rotation.x = -Math.PI / 3
    group.add(dish)
    // Secondary whip antenna.
    if (rng() < 0.6) {
      const whip = new THREE.Mesh(
        new THREE.CylinderGeometry(peakWidth * 0.01, peakWidth * 0.01, peakHeight * 0.9, 4),
        mats.antenna
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
      mats.nacelle
    )
    ring.position.set(0, 0, length * 0.35)
    group.add(ring)
  }

  // RCS thruster blocks (four corners of mid-body).
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const rcs = new THREE.Mesh(
      new THREE.BoxGeometry(peakWidth * 0.1, peakHeight * 0.1, peakWidth * 0.12),
      mats.nacelle
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
    const greeble = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.panel)
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
    mats.panel
  )
  plate.position.set(style.asymmetric ? peakWidth * 0.08 * style.bridgeSide : 0, -peakHeight * 0.5, -length * 0.05)
  group.add(plate)

  // Side airlock / hatch (often off-center on real ships).
  const hatchSide = style.asymmetric ? (style.bridgeSide !== 0 ? -style.bridgeSide : 1) : (rng() < 0.5 ? -1 : 1)
  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(peakHeight * 0.22, peakHeight * 0.22, peakWidth * 0.08, 10),
    mats.nacelle
  )
  hatch.rotation.z = Math.PI / 2
  hatch.position.set(hatchSide * peakWidth * 0.95, 0, length * 0.1)
  group.add(hatch)
}

export function buildShipMesh(shipClass) {
  const group = new THREE.Group()
  group.name = shipClass.id
  const mats = makeDetailMaterials()

  const geometry = buildHullGeometry(shipClass.hull)
  const baseColor = new THREE.Color(shipClass.hull.color)
  // Smooth + metal PBR maps; hull.color tints the shared metal albedo.
  const material = new THREE.MeshStandardMaterial({
    color: baseColor,
    side: THREE.DoubleSide,
    metalness: 0.88,
    roughness: 0.48,
    ...hullMaps()
  })
  const hullMesh = new THREE.Mesh(geometry, material)
  group.add(hullMesh)

  // Softer seams so they don't fight the normal maps.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 22),
    new THREE.LineBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.4 })
  )
  group.add(edges)

  // Soft hull rim highlight against black space.
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 35),
    new THREE.LineBasicMaterial({ color: 0x6a8aaa, transparent: true, opacity: 0.18 })
  )
  group.add(rim)

  addHullDetails(group, shipClass.hull, mats)

  for (const hp of shipClass.hardpoints ?? []) {
    const marker = new THREE.Mesh(hardpointMarkerGeometry, mats.hardpoint)
    marker.position.set(...hp.position)
    marker.rotation.x = Math.PI / 2
    group.add(marker)
  }

  return group
}
