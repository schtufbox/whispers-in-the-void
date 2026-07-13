import * as THREE from 'three'
import { mulberry32, range, pick } from '../procgen/prng.js'
import { getSurfaceTextures } from './textures.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Cheap seeded "value noise" over the unit sphere (a sum of a few sine
// waves at seeded phases) — smooth, continuous blotches for patchy surface
// features (craters, oceans, lava cracks), unlike per-vertex independent
// randomness which would look like uncorrelated static.
function surfaceNoise(nx, ny, nz, offsets) {
  return Math.sin(nx * 3.7 + offsets[0]) * Math.cos(ny * 4.1 + offsets[1]) * Math.sin(nz * 3.3 + offsets[2])
}

function jitterGeometry(geometry, radius, rng, amount) {
  if (amount <= 0) return
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const bump = 1 + (rng() - 0.5) * amount
    v.multiplyScalar(radius * bump)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

// blend(noiseValue, normalizedVertex) -> 0..1 lerp factor from base to accent.
function paintVertexColors(geometry, base, accent, offsets, blend) {
  const pos = geometry.attributes.position
  const colors = []
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const n = surfaceNoise(v.x, v.y, v.z, offsets)
    c.copy(base).lerp(accent, Math.max(0, Math.min(1, blend(n, v))))
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
}

function seededOffsets(rng) {
  return [rng() * 10, rng() * 10, rng() * 10]
}

// Icosahedron subdivision scales with radius so facet size stays roughly
// constant after PLANET_SIZE_SCALE/MOON_SIZE_SCALE growth (see galaxy.js).
// Cap at 6 — enough for the largest planets (~900 radius) without blowing
// vertex counts (only a handful of bodies are live per system).
function detailForRadius(radius) {
  if (radius > 550) return 6
  if (radius > 250) return 5
  if (radius > 100) return 4
  if (radius > 40) return 3
  return 2
}

// Cratered rock — bumpy surface, muted browns/greys, darker crater patches.
function buildRocky(radius, rng) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  jitterGeometry(geometry, radius, rng, 0.14)
  const base = new THREE.Color().setHSL(range(rng, 10, 45) / 360, 0.3, range(rng, 0.35, 0.5))
  const accent = base.clone().multiplyScalar(0.55)
  paintVertexColors(geometry, base, accent, seededOffsets(rng), (n) => (n > 0.2 ? 0.7 : 0))
  return geometry
}

// Gas giant — smooth surface, horizontal cloud bands by latitude.
function buildGasGiant(radius, rng) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  const hue1 = range(rng, 0, 360) / 360
  const hue2 = (hue1 + range(rng, 0.06, 0.16)) % 1
  const base = new THREE.Color().setHSL(hue1, 0.5, 0.55)
  const accent = new THREE.Color().setHSL(hue2, 0.55, 0.62)
  const bandFreq = range(rng, 4, 8)
  const bandPhase = rng() * Math.PI * 2

  const pos = geometry.attributes.position
  const colors = []
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const band = Math.sin(v.y * bandFreq + bandPhase) * 0.5 + 0.5
    c.copy(base).lerp(accent, band)
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

// Ice world — mostly smooth, pale base with brighter cracks and whiter poles.
function buildIce(radius, rng) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  jitterGeometry(geometry, radius, rng, 0.04)
  const hue = range(rng, 190, 215) / 360
  const base = new THREE.Color().setHSL(hue, 0.3, 0.72)
  const accent = new THREE.Color().setHSL(hue, 0.1, 0.94)
  paintVertexColors(geometry, base, accent, seededOffsets(rng), (n, v) => Math.max(n, 0) * 0.7 + Math.abs(v.y) * 0.4)
  return geometry
}

// Lush world — ocean/continent patches.
function buildLush(radius, rng) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  const ocean = new THREE.Color().setHSL(range(rng, 200, 225) / 360, 0.55, 0.4)
  const land = new THREE.Color().setHSL(range(rng, 85, 140) / 360, 0.45, 0.38)
  paintVertexColors(geometry, ocean, land, seededOffsets(rng), (n) => (n > 0.05 ? 1 : 0))
  return geometry
}

// Volcanic world — charred bumpy crust with glowing lava cracks.
function buildVolcanic(radius, rng) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  jitterGeometry(geometry, radius, rng, 0.16)
  const base = new THREE.Color().setHSL(range(rng, 0, 20) / 360, 0.3, 0.12)
  const lava = new THREE.Color().setHSL(range(rng, 10, 30) / 360, 0.9, 0.55)
  paintVertexColors(geometry, base, lava, seededOffsets(rng), (n) => (n > 0.35 ? 1 : 0))
  return geometry
}

// Named rather than a plain array of functions so buildPlanetMesh can look up
// the matching getSurfaceTextures() entry (gasGiant has none — cloud bands
// don't suit a tiled photo texture, so it stays purely vertex-colored).
const PLANET_ARCHETYPES = {
  rocky: buildRocky,
  gasGiant: buildGasGiant,
  ice: buildIce,
  lush: buildLush,
  volcanic: buildVolcanic
}
const PLANET_ARCHETYPE_NAMES = Object.keys(PLANET_ARCHETYPES)

// A thin, tilted debris ring — MeshBasicMaterial (self-lit) rather than
// Lambert, since a paper-thin disc only catches directional light at very
// specific angles under normal shading and would flicker dark from most
// viewpoints. Banded coloring reuses the "vary color by radial distance"
// trick, giving it visible structure instead of a flat tinted disc.
function buildRing(radius, rng) {
  const inner = radius * (1.5 + rng() * 0.3)
  const outer = inner + radius * (0.6 + rng() * 0.7)
  const geometry = new THREE.RingGeometry(inner, outer, 64, 6)
  const hue = range(rng, 25, 50) / 360
  const bandFreq = range(rng, 10, 22)

  const pos = geometry.attributes.position
  const colors = []
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i))
    const t = (r - inner) / (outer - inner)
    const band = Math.sin(t * bandFreq) * 0.5 + 0.5
    c.setHSL(hue, 0.3, 0.3 + band * 0.3)
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
  const ring = new THREE.Mesh(geometry, material)
  ring.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.6
  ring.rotation.z = rng() * Math.PI * 2
  return ring
}

// Moons are always small barren rock — cratered, muted, no atmosphere-driven
// variety (bands/oceans/lava wouldn't make sense at that scale).
function buildMoon(radius, rng) {
  // Same detail curve as planets (no -1) so large moons don't re-faceted
  // after the size scale-up; barren look still comes from rock texture + jitter.
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  jitterGeometry(geometry, radius, rng, 0.18)
  const base = new THREE.Color().setHSL(range(rng, 20, 60) / 360, 0.12, 0.42)
  const accent = base.clone().multiplyScalar(0.6)
  paintVertexColors(geometry, base, accent, seededOffsets(rng), (n) => (n > 0.15 ? 0.6 : 0))
  return geometry
}

// A low-poly faceted sphere with a seeded archetype (rocky/gas/ice/lush/
// volcanic for planets, always cratered rock for moons) so bodies read as
// distinct worlds rather than a single reskinned sphere. Radius is the
// body's real (generation-time, collision-relevant) size.
export function buildPlanetMesh(body) {
  const rng = mulberry32(hashString(body.id))
  const radius = body.radius

  // Moons always reuse the 'rocky' texture set (barren cratered rock, same
  // as an asteroid) rather than picking their own archetype.
  const archetypeName = body.kind === 'moon' ? 'rocky' : pick(rng, PLANET_ARCHETYPE_NAMES)
  const geometry = body.kind === 'moon' ? buildMoon(radius, rng) : PLANET_ARCHETYPES[archetypeName](radius, rng)

  // Real CC0 photo textures (see render/textures.js) layered under the
  // existing per-body vertex-color tint/craters/bands — MeshStandardMaterial
  // multiplies map * vertexColors * material.color, so the same handful of
  // shared textures still reads as ~1500 visually distinct worlds. Gas
  // giants have no texture set (cloud bands don't suit a tiled photo), so
  // they fall back to vertex-color-only shading, same as before.
  // Smooth shading (not flat) so high-detail icosahedra read as continuous
  // spheres — flatShading + EdgesGeometry made large planets look shattered
  // into crystal facets even after detailForRadius stepped up. Surface
  // interest comes from vertex colors + PBR maps, not per-face normals.
  const textures = getSurfaceTextures(archetypeName)
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: 1,
    metalness: 0,
    ...textures
  })
  const mesh = new THREE.Mesh(geometry, material)

  // ~3% of planets (never moons) get a ring — purely cosmetic, so it's
  // decided from the same per-body rng rather than a persisted field, same
  // convention as archetype/color selection above.
  if (body.kind === 'planet' && rng() < 0.03) mesh.add(buildRing(radius, rng))

  // Slow seeded axial spin — picked up generically by main.js's per-frame
  // body-mesh update loop (see stationMesh.js's updateStationMesh, which
  // just checks userData.spinSpeed regardless of body kind).
  mesh.userData.spinSpeed = range(rng, 0.015, 0.05) * (rng() < 0.5 ? 1 : -1)

  return mesh
}
