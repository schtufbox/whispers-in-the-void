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

// Multi-octave noise for displacement so bumps are continuous ridges rather
// than each vertex flying off on its own (the old rng()-per-vertex jitter
// is what made large bodies look like shattered glass).
function surfaceNoiseFbm(nx, ny, nz, offsets) {
  let n = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < 3; o++) {
    n += amp * surfaceNoise(nx * freq, ny * freq, nz * freq, [
      offsets[0] + o * 1.7,
      offsets[1] + o * 2.3,
      offsets[2] + o * 1.1
    ])
    norm += amp
    amp *= 0.5
    freq *= 2.1
  }
  return n / norm
}

// Sphere segment counts scale with radius so silhouette facets stay small
// after PLANET_SIZE_SCALE. Caps keep GPU cost sane (few bodies live at once).
function sphereGeometryForRadius(radius) {
  const lat = Math.max(48, Math.min(96, Math.round(radius / 5)))
  const lon = lat * 2
  return new THREE.SphereGeometry(radius, lon, lat)
}

// Radial displacement from continuous noise (amount is peak ± fraction of
// radius). Always recompute normals so lighting follows the new surface.
function displaceWithNoise(geometry, radius, offsets, amount) {
  if (amount <= 0) return
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const n = surfaceNoiseFbm(v.x, v.y, v.z, offsets)
    v.multiplyScalar(radius * (1 + n * amount))
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

// Cratered rock — continuous noise hills, muted browns/greys.
function buildRocky(radius, rng) {
  const geometry = sphereGeometryForRadius(radius)
  const offsets = seededOffsets(rng)
  displaceWithNoise(geometry, radius, offsets, 0.045)
  const base = new THREE.Color().setHSL(range(rng, 10, 45) / 360, 0.3, range(rng, 0.35, 0.5))
  const accent = base.clone().multiplyScalar(0.55)
  paintVertexColors(geometry, base, accent, offsets, (n) => (n > 0.2 ? 0.7 : 0))
  return geometry
}

// Gas giant — smooth surface, horizontal cloud bands by latitude.
function buildGasGiant(radius, rng) {
  const geometry = sphereGeometryForRadius(radius)
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
  const geometry = sphereGeometryForRadius(radius)
  const offsets = seededOffsets(rng)
  displaceWithNoise(geometry, radius, offsets, 0.02)
  const hue = range(rng, 190, 215) / 360
  const base = new THREE.Color().setHSL(hue, 0.3, 0.72)
  const accent = new THREE.Color().setHSL(hue, 0.1, 0.94)
  paintVertexColors(geometry, base, accent, offsets, (n, v) => Math.max(n, 0) * 0.7 + Math.abs(v.y) * 0.4)
  return geometry
}

// Lush world — ocean/continent patches.
function buildLush(radius, rng) {
  const geometry = sphereGeometryForRadius(radius)
  const ocean = new THREE.Color().setHSL(range(rng, 200, 225) / 360, 0.55, 0.4)
  const land = new THREE.Color().setHSL(range(rng, 85, 140) / 360, 0.45, 0.38)
  paintVertexColors(geometry, ocean, land, seededOffsets(rng), (n) => (n > 0.05 ? 1 : 0))
  return geometry
}

// Volcanic world — charred crust with glowing lava cracks (gentle relief).
function buildVolcanic(radius, rng) {
  const geometry = sphereGeometryForRadius(radius)
  const offsets = seededOffsets(rng)
  displaceWithNoise(geometry, radius, offsets, 0.05)
  const base = new THREE.Color().setHSL(range(rng, 0, 20) / 360, 0.3, 0.12)
  const lava = new THREE.Color().setHSL(range(rng, 10, 30) / 360, 0.9, 0.55)
  paintVertexColors(geometry, base, lava, offsets, (n) => (n > 0.35 ? 1 : 0))
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
  const geometry = sphereGeometryForRadius(radius)
  const offsets = seededOffsets(rng)
  displaceWithNoise(geometry, radius, offsets, 0.055)
  const base = new THREE.Color().setHSL(range(rng, 20, 60) / 360, 0.12, 0.42)
  const accent = base.clone().multiplyScalar(0.6)
  paintVertexColors(geometry, base, accent, offsets, (n) => (n > 0.15 ? 0.6 : 0))
  return geometry
}

// Seeded archetype (rocky/gas/ice/lush/volcanic for planets, always cratered
// rock for moons). Radius is the body's real (generation-time, collision)
// size. Geometry is a high-segment SphereGeometry so silhouettes stay round
// at current PLANET_SIZE_SCALE; relief uses continuous noise, not per-vertex RNG.
export function buildPlanetMesh(body) {
  const rng = mulberry32(hashString(body.id))
  const radius = body.radius

  // Moons always reuse the 'rocky' texture set (barren cratered rock, same
  // as an asteroid) rather than picking their own archetype.
  const archetypeName = body.kind === 'moon' ? 'rocky' : pick(rng, PLANET_ARCHETYPE_NAMES)
  const geometry = body.kind === 'moon' ? buildMoon(radius, rng) : PLANET_ARCHETYPES[archetypeName](radius, rng)

  // Real CC0 photo textures (see render/textures.js) layered under the
  // existing per-body vertex-color tint. Smooth shading only — flatShading
  // and EdgesGeometry were what made bodies read as shattered polyhedra.
  const textures = getSurfaceTextures(archetypeName)
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: 0.9,
    metalness: 0,
    ...textures
  })
  const mesh = new THREE.Mesh(geometry, material)

  // ~3% of planets (never moons) get a ring — purely cosmetic, so it's
  // decided from the same per-body rng rather than a persisted field, same
  // convention as archetype/color selection above.
  if (body.kind === 'planet' && rng() < 0.03) mesh.add(buildRing(radius, rng))

  // Axial tilt (some worlds spin well off the system plane).
  const axialTilt = body.kind === 'planet' ? range(rng, 0, 0.55) * (rng() < 0.5 ? 1 : -1) : range(rng, 0, 0.2) * (rng() < 0.5 ? 1 : -1)
  mesh.rotation.z = axialTilt
  mesh.userData.axialTilt = axialTilt

  // ~55% of moons are tidally locked (main.js aims them at their parent);
  // the rest and all planets get a slow axial spin.
  const tidallyLocked = body.kind === 'moon' && rng() < 0.55
  mesh.userData.tidallyLocked = tidallyLocked
  mesh.userData.parentId = body.parentId
  // Slower than the old 0.015–0.05 so rotation reads as planetary, not a top.
  mesh.userData.spinSpeed = tidallyLocked ? 0 : range(rng, 0.004, 0.014) * (rng() < 0.5 ? 1 : -1)

  return mesh
}
