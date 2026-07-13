import * as THREE from 'three'
import { buildHullGeometry } from '../procgen/hull.js'
import { mulberry32 } from '../procgen/prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const hardpointMarkerGeometry = new THREE.ConeGeometry(0.25, 0.6, 6)
const hardpointMarkerMaterial = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true })

const canopyMaterial = new THREE.MeshLambertMaterial({ color: 0x1a2a3a, flatShading: true, transparent: true, opacity: 0.85 })
const engineGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
const greebleMaterial = new THREE.MeshLambertMaterial({ color: 0x15181f, flatShading: true })

// Small cosmetic details layered on top of the parametric hull loft — a
// cockpit canopy near the nose, glowing engine nacelles at the tail, and a
// scatter of small "greeble" panel blocks along the spine — purely visual,
// no gameplay effect. Seeded off the ship class id (not per-instance, not
// Math.random()) so every ship of the same class always looks identical,
// matching the rest of the game's per-class cosmetic convention (station
// variants, procedural hull silhouettes, etc.)
function addHullDetails(group, hull) {
  const rng = mulberry32(hashString(group.name))
  const { length, stationWidths, stationHeights } = hull
  const peakWidth = Math.max(...stationWidths)
  const peakHeight = Math.max(...stationHeights)

  // A small flattened dome sat just above the hull spine, roughly a third
  // of the way back from the nose (local +Z is forward — see hardpoint
  // positions, which are always positive-Z).
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(peakWidth * 0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    canopyMaterial
  )
  canopy.scale.set(1, 0.6, 1.8)
  canopy.position.set(0, peakHeight * 0.7, length * 0.18)
  group.add(canopy)

  // Engine glow: one disc for slender hulls, two side-by-side for wide ones
  // (a twin-engine silhouette), always at the tail (-Z).
  const engineCount = peakWidth > length * 0.08 ? 2 : 1
  for (let i = 0; i < engineCount; i++) {
    const offsetX = engineCount === 1 ? 0 : (i === 0 ? -1 : 1) * peakWidth * 0.35
    const glow = new THREE.Mesh(new THREE.CircleGeometry(peakHeight * 0.35, 10), engineGlowMaterial)
    glow.position.set(offsetX, 0, -length / 2 - 0.05)
    glow.rotation.y = Math.PI
    group.add(glow)
  }

  // A handful of small dark panel-line blocks scattered along the spine, so
  // the flat-shaded hull reads as having actual surface detail rather than
  // one smooth faceted shape.
  const greebleCount = 3 + Math.floor(rng() * 3)
  for (let i = 0; i < greebleCount; i++) {
    const w = peakWidth * (0.08 + rng() * 0.1)
    const greeble = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.4, w * 1.5), greebleMaterial)
    greeble.position.set((rng() - 0.5) * peakWidth * 1.2, peakHeight * (0.5 + rng() * 0.4), (rng() - 0.5) * length * 0.6)
    greeble.rotation.y = rng() * Math.PI
    group.add(greeble)
  }
}

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

  addHullDetails(group, shipClass.hull)

  for (const hp of shipClass.hardpoints ?? []) {
    const marker = new THREE.Mesh(hardpointMarkerGeometry, hardpointMarkerMaterial)
    marker.position.set(...hp.position)
    marker.rotation.x = Math.PI / 2
    group.add(marker)
  }

  return group
}
