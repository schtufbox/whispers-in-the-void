import * as THREE from 'three'
import { buildHullGeometry } from '../procgen/hull.js'
import { mulberry32 } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const hardpointMarkerGeometry = new THREE.ConeGeometry(0.22, 0.55, 6)
const hardpointMarkerMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a30, flatShading: true, metalness: 0.55, roughness: 0.45 })

const canopyMaterial = new THREE.MeshStandardMaterial({
  color: 0x1a3048,
  flatShading: true,
  transparent: true,
  opacity: 0.82,
  metalness: 0.2,
  roughness: 0.15,
  emissive: 0x0a2035,
  emissiveIntensity: 0.35
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
  opacity: 0.35,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide
})
const greebleMaterial = new THREE.MeshStandardMaterial({ color: 0x12151c, flatShading: true, metalness: 0.4, roughness: 0.7 })
const stripeMaterial = new THREE.MeshStandardMaterial({
  color: 0x3a6a88,
  flatShading: true,
  metalness: 0.6,
  roughness: 0.4,
  emissive: 0x1a3040,
  emissiveIntensity: 0.4
})
const antennaMaterial = new THREE.MeshStandardMaterial({ color: 0x8899aa, flatShading: true, metalness: 0.8, roughness: 0.3 })

// Cosmetic details on the parametric hull — canopy, engines, greebles,
// accent stripes, antenna. Seeded per class id so every ship of a class matches.
function addHullDetails(group, hull) {
  const rng = mulberry32(hashString(group.name))
  const { length, stationWidths, stationHeights } = hull
  const peakWidth = Math.max(...stationWidths)
  const peakHeight = Math.max(...stationHeights)

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(peakWidth * 0.35, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    canopyMaterial
  )
  canopy.scale.set(1, 0.55, 1.9)
  canopy.position.set(0, peakHeight * 0.72, length * 0.18)
  group.add(canopy)

  // Soft canopy rim light strip.
  const canopyRim = new THREE.Mesh(
    new THREE.TorusGeometry(peakWidth * 0.32, peakWidth * 0.03, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0x4fc3d9, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  canopyRim.rotation.x = Math.PI / 2
  canopyRim.position.set(0, peakHeight * 0.7, length * 0.18)
  canopyRim.scale.set(1, 1.6, 1)
  group.add(canopyRim)

  const engineCount = peakWidth > length * 0.08 ? 2 : 1
  for (let i = 0; i < engineCount; i++) {
    const offsetX = engineCount === 1 ? 0 : (i === 0 ? -1 : 1) * peakWidth * 0.35
    const glow = new THREE.Mesh(new THREE.CircleGeometry(peakHeight * 0.38, 12), engineGlowMaterial)
    glow.position.set(offsetX, 0, -length / 2 - 0.05)
    glow.rotation.y = Math.PI
    group.add(glow)

    // Exhaust cone volume behind each nacelle.
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(peakHeight * 0.22, peakHeight * 0.9, 8, 1, true),
      engineConeMaterial
    )
    cone.rotation.x = -Math.PI / 2
    cone.position.set(offsetX, 0, -length / 2 - peakHeight * 0.45)
    group.add(cone)

    // Engine housing ring.
    const housing = new THREE.Mesh(
      new THREE.TorusGeometry(peakHeight * 0.32, peakHeight * 0.06, 6, 12),
      greebleMaterial
    )
    housing.position.set(offsetX, 0, -length / 2 + 0.1)
    group.add(housing)
  }

  // Accent stripe along the spine.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(peakWidth * 0.12, peakHeight * 0.08, length * 0.55),
    stripeMaterial
  )
  stripe.position.set(0, peakHeight * 0.55, length * 0.02)
  group.add(stripe)

  // Antenna / sensor mast near the nose.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(peakWidth * 0.02, peakWidth * 0.03, peakHeight * 0.55, 5),
    antennaMaterial
  )
  mast.position.set(peakWidth * 0.15, peakHeight * 0.85, length * 0.28)
  group.add(mast)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(peakWidth * 0.08, 6, 4), antennaMaterial)
  dish.position.set(peakWidth * 0.15, peakHeight * 1.05, length * 0.28)
  group.add(dish)

  const greebleCount = 5 + Math.floor(rng() * 5)
  for (let i = 0; i < greebleCount; i++) {
    const w = peakWidth * (0.06 + rng() * 0.12)
    const greeble = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.35, w * (1.2 + rng())), greebleMaterial)
    greeble.position.set(
      (rng() - 0.5) * peakWidth * 1.3,
      peakHeight * (0.35 + rng() * 0.55),
      (rng() - 0.5) * length * 0.65
    )
    greeble.rotation.y = rng() * Math.PI
    group.add(greeble)
  }

  // Underside intake / cargo bay plate.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(peakWidth * 0.7, peakHeight * 0.08, length * 0.25),
    greebleMaterial
  )
  plate.position.set(0, -peakHeight * 0.45, -length * 0.05)
  group.add(plate)
}

export function buildShipMesh(shipClass) {
  const group = new THREE.Group()
  group.name = shipClass.id

  const geometry = buildHullGeometry(shipClass.hull)
  const material = new THREE.MeshStandardMaterial({
    color: shipClass.hull.color,
    flatShading: true,
    side: THREE.DoubleSide,
    metalness: 0.45,
    roughness: 0.55
  })
  const hullMesh = new THREE.Mesh(geometry, material)
  group.add(hullMesh)

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 22),
    new THREE.LineBasicMaterial({ color: 0x050608, transparent: true, opacity: 0.85 })
  )
  group.add(edges)

  // Soft hull rim highlight (reads better against black space).
  const rim = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 40),
    new THREE.LineBasicMaterial({ color: 0x4a6a88, transparent: true, opacity: 0.25 })
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
