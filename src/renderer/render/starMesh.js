import * as THREE from 'three'
import { mulberry32 } from '../procgen/prng.js'
import { buildLensFlare } from './lensFlare.js'
import { getSurfaceTextures } from './textures.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const STAR_HUES = [45, 30, 55, 10, 200]

// Weighted so a normal yellow/white star is the common case; the rest give
// systems visual variety without every system looking exotic.
const STAR_TYPES = ['mainSequence', 'mainSequence', 'mainSequence', 'redDwarf', 'redDwarf', 'whiteDwarf', 'giant', 'binary']
const BINARY_COMPONENT_TYPES = ['mainSequence', 'redDwarf', 'whiteDwarf']

// Cheap seeded "value noise" over the unit sphere (a sum of a few sine
// waves at seeded phases) — gives smooth, continuous blotches to drive
// surface turbulence/color without a real noise library or per-vertex
// independent randomness (which would look like static, not flame texture).
function surfaceNoise(nx, ny, nz, seed) {
  return Math.sin(nx * 3.7 + seed[0]) * Math.cos(ny * 4.1 + seed[1]) * Math.sin(nz * 3.3 + seed[2])
}

// A fixed subdivision level looked fine before STAR_SIZE_SCALE grew this
// much — the same handful of flat facets now span a much bigger sphere,
// reading as crudely faceted rather than a roiling plasma ball (the same
// issue and fix as render/planetMesh.js's detailForRadius).
function detailForRadius(radius) {
  if (radius > 3000) return 6
  if (radius > 1200) return 5
  if (radius > 400) return 4
  return 3
}

// Jitters vertices radially by the noise field so the surface reads as
// roiling plasma rather than a perfect sphere.
function buildTurbulentSurface(radius, offsets, coreColor, hotColor) {
  const geometry = new THREE.IcosahedronGeometry(radius, detailForRadius(radius))
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()
  const colors = []
  const c = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const n = surfaceNoise(v.x, v.y, v.z, offsets)
    const bump = 1 + n * 0.09
    v.multiplyScalar(radius * bump)
    pos.setXYZ(i, v.x, v.y, v.z)

    // Hotter (brighter) where the noise peaks, like flare patches. Raised to
    // a power <1 to punch up the contrast between core and hot-spot color —
    // sharper flares read as more fiery/dramatic than a soft linear blend.
    c.copy(coreColor).lerp(hotColor, Math.pow(Math.max(0, n), 0.7) * 0.95)
    colors.push(c.r, c.g, c.b)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

// Per-type visual parameters. Radius/hue ranges give each type a distinct
// silhouette and color; corona opacity/scale set how puffy vs. tight the
// halo reads (e.g. a white dwarf is small and sharp, a giant is huge and hazy).
const STAR_TYPE_PARAMS = {
  mainSequence: (rng) => ({
    radius: 70 + rng() * 60,
    hue: STAR_HUES[Math.floor(rng() * STAR_HUES.length)],
    coreSat: 1, coreLight: 0.6, hotSat: 0.4, hotLight: 0.92,
    corona1Opacity: 0.22, corona2Opacity: 0.1, corona1Scale: 1.28, corona2Scale: 1.7
  }),
  redDwarf: (rng) => ({
    radius: 30 + rng() * 20,
    hue: 5 + rng() * 15,
    coreSat: 0.9, coreLight: 0.4, hotSat: 0.6, hotLight: 0.6,
    corona1Opacity: 0.14, corona2Opacity: 0.06, corona1Scale: 1.22, corona2Scale: 1.5
  }),
  whiteDwarf: (rng) => ({
    radius: 16 + rng() * 10,
    hue: 200 + rng() * 20,
    coreSat: 0.15, coreLight: 0.85, hotSat: 0.1, hotLight: 0.98,
    corona1Opacity: 0.32, corona2Opacity: 0.14, corona1Scale: 1.15, corona2Scale: 1.32
  }),
  giant: (rng) => {
    const blue = rng() < 0.5
    return {
      radius: 150 + rng() * 50,
      hue: blue ? 210 + rng() * 20 : 5 + rng() * 10,
      coreSat: 0.85, coreLight: 0.55, hotSat: 0.5, hotLight: 0.88,
      corona1Opacity: 0.18, corona2Opacity: 0.08, corona1Scale: 1.35, corona2Scale: 1.9
    }
  }
}

// Suns "400% bigger", then "another 200% bigger" (3x on top) per two rounds
// of user request — a single multiplier here (rather than editing every
// STAR_TYPE_PARAMS range) since corona scales are already relative to radius
// and grow with it automatically. (Was 2.5, then 12.5 — each pass still read
// as too small.)
const STAR_SIZE_SCALE = 37.5

// Builds one star's core + corona shells inside its own group (so a binary
// pair can position/spin each component independently). Returns the group
// plus the bits updateStarMesh needs to animate it each frame.
function buildSingleStar(type, rng) {
  const params = STAR_TYPE_PARAMS[type](rng)
  const radius = params.radius * STAR_SIZE_SCALE
  const offsets = [rng() * 10, rng() * 10, rng() * 10]
  const coreColor = new THREE.Color().setHSL(params.hue / 360, params.coreSat, params.coreLight)
  const hotColor = new THREE.Color().setHSL(params.hue / 360, params.hotSat, params.hotLight)
  const color = new THREE.Color().setHSL(params.hue / 360, 0.9, 0.6)

  const group = new THREE.Group()

  // The lava CC0 photo texture (render/textures.js) layers cracked/molten
  // surface detail under the existing turbulent vertex-color noise (which
  // still drives the animated hot-spot flare look) — MeshBasicMaterial
  // multiplies vertexColors * map * material.color, all self-lit (ignores
  // scene lighting) same as before. No normalMap here: MeshBasicMaterial
  // doesn't light-shade at all, so a normal map would have zero visible
  // effect — switching to a lit material risked the self-lit "roiling
  // plasma" look and the lens flare's self-occlusion fix (see below), for a
  // detail that wouldn't even show through additive corona shells most of
  // the time.
  const core = new THREE.Mesh(
    buildTurbulentSurface(radius, offsets, coreColor, hotColor),
    new THREE.MeshBasicMaterial({ vertexColors: true, map: getSurfaceTextures('volcanic').map })
  )
  group.add(core)

  const corona1 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * params.corona1Scale, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: params.corona1Opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  group.add(corona1)

  const corona2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * params.corona2Scale, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: params.corona2Opacity, blending: THREE.AdditiveBlending, depthWrite: false })
  )
  group.add(corona2)

  // Added at the star's local origin initially; updateStarMesh repositions
  // it every frame to just outside the core's near surface facing the
  // camera (see the comment there for why — the exact center sits behind
  // the star's own opaque front hemisphere and always self-occludes).
  const flare = buildLensFlare(color)
  group.add(flare)

  return {
    group,
    radius,
    color,
    spinSpeed: 0.015 + rng() * 0.02,
    pulsePhase: rng() * Math.PI * 2,
    corona1,
    corona2,
    flare
  }
}

// A thick, fiery additive-blended ring lying flat around the stationary
// (bigger) star, at the exact radius the smaller star orbits at — so the
// smaller star always sits right on the ring, "intersecting" it as it goes
// around. Vertex-painted with the same value-noise trick as the star cores
// (deep red through hot yellow-orange) rather than a flat tint, so it reads
// as roiling plasma; `ring.rotateOnWorldAxis` in updateStarMesh spins that
// noise pattern around the circle each frame for a flowing-fire look
// (rotateOnWorldAxis, not plain rotation.y, since the ring's own local axes
// are already reoriented by the initial flat-lie rotation below). A few
// bright spark spheres travel around the ring on their own independent
// phase/speed on top of that. Static position once built (only pulses/spins
// in place) — much cheaper per-frame than a beam re-measured between two
// moving endpoints every frame.
// Tube/spark size used to be a flat "4"/"3.2" regardless of the ring's own
// radius — fine back when STAR_SIZE_SCALE was small, but as that scale grew
// (2.5 -> 12.5 -> 37.5) the ring's radius grew right along with it while the
// tube didn't, so the ring got proportionally thinner each time — eventually
// a near-invisible hairline (the same class of bug detailForRadius fixed for
// planet/star surface faceting above). Sizing both off the ring's own radius
// keeps the ring's thickness readable at any scale.
function buildEnergyRing(radius, rng) {
  const tubeRadius = Math.max(4, radius * 0.035)
  const geometry = new THREE.TorusGeometry(radius, tubeRadius, 12, 64)
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()
  const colors = []
  const deepColor = new THREE.Color().setHSL(0.02, 0.95, 0.3)
  const hotColor = new THREE.Color().setHSL(0.12, 1, 0.62)
  const c = new THREE.Color()
  const offsets = [rng() * 10, rng() * 10, rng() * 10]
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    const n = surfaceNoise(v.x, v.y, v.z, offsets)
    c.copy(deepColor).lerp(hotColor, Math.min(1, Math.max(0, n * 1.3)))
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const ring = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
  ring.rotation.x = Math.PI / 2 // lie flat in the XZ plane — the same plane the smaller star orbits in
  const group = new THREE.Group()
  group.add(ring)

  const sparks = []
  const sparkCount = 5
  for (let i = 0; i < sparkCount; i++) {
    const color = new THREE.Color().setHSL(0.05 + rng() * 0.08, 1, 0.6)
    const spark = new THREE.Mesh(new THREE.SphereGeometry(tubeRadius * 0.8, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }))
    group.add(spark)
    sparks.push({ mesh: spark, phase: rng() * Math.PI * 2, speed: 0.3 + rng() * 0.25 })
  }

  return { group, ring, radius, sparks, spinSpeed: 0.15 + rng() * 0.1 }
}

// A star (or, for binary systems, a pair of stars) always sits at a system's
// local origin. Each star's core is self-lit (MeshBasicMaterial ignores
// scene lighting) with a turbulent, mottled surface so it reads as a roiling
// ball of plasma rather than a flat gem; two additive corona shells give it
// a soft, pulsing halo. In a binary, the bigger star is stationary at the
// origin and the smaller one orbits it (see updateStarMesh, called each
// frame from main.js).
// forceType (optional) skips the hashed random pick — used by main.js's
// main-menu flyby to always get a binary pair rather than leaving it to luck.
export function buildStarMesh(system, forceType = null) {
  const hash = hashString(system.id)
  const rng = mulberry32(hash)
  const type = forceType ?? STAR_TYPES[Math.floor(rng() * STAR_TYPES.length)]

  const group = new THREE.Group()
  group.userData.stars = []

  if (type === 'binary') {
    const componentTypes = [
      BINARY_COMPONENT_TYPES[Math.floor(rng() * BINARY_COMPONENT_TYPES.length)],
      BINARY_COMPONENT_TYPES[Math.floor(rng() * BINARY_COMPONENT_TYPES.length)]
    ]
    const orbitSpeed = 0.04 + rng() * 0.04
    const stars = componentTypes.map((componentType) => buildSingleStar(componentType, rng))
    // Wide enough that the two cores (and ideally most of their coronas,
    // which reach up to ~1.9x radius) read as a clear double star rather
    // than one blob — corona reach, not core radius alone, dominates here.
    const separation = Math.max(220, (stars[0].radius + stars[1].radius) * 2.2)

    // The bigger star stays put at the system origin (it's the "primary" —
    // and also where the rest of the system, arrival point included, is
    // anchored); the smaller one orbits around it. Real binaries orbit a
    // shared barycenter, but a single stationary anchor reads more clearly
    // and keeps every other body's already-origin-relative position simple.
    const biggerIndex = stars[0].radius >= stars[1].radius ? 0 : 1
    const smallerIndex = 1 - biggerIndex

    group.add(stars[biggerIndex].group)
    group.userData.stars.push(stars[biggerIndex])

    const orbit = { radius: separation, angle0: rng() * Math.PI * 2, speed: orbitSpeed }
    stars[smallerIndex].group.position.set(Math.cos(orbit.angle0) * orbit.radius, 0, Math.sin(orbit.angle0) * orbit.radius)
    group.add(stars[smallerIndex].group)
    group.userData.stars.push({ ...stars[smallerIndex], orbit })

    const energyRing = buildEnergyRing(orbit.radius, rng)
    group.add(energyRing.group)
    group.userData.energyRing = energyRing
  } else {
    const star = buildSingleStar(type, rng)
    group.add(star.group)
    group.userData.stars.push(star)
  }

  return group
}

const WORLD_Y = new THREE.Vector3(0, 1, 0)

// Scratch objects reused every frame in updateStarMesh's flare repositioning
// (see below) rather than allocated per star per frame.
const flareWorldPos = new THREE.Vector3()
const flareWorldScale = new THREE.Vector3()
const flareTargetWorld = new THREE.Vector3()

// Slow rotation plus a gentle breathing pulse on the corona shells for every
// star in the system (1, or 2 for a binary) — driven by gameState.simTime
// (via the elapsed param), never wall-clock time. In a binary, only the
// smaller star has an `orbit` (the bigger one is stationary at the origin —
// see buildStarMesh); the energy ring sits fixed at that orbit radius so the
// smaller star always intersects it, and only needs pulsing/spinning/spark
// motion, not repositioning.
// camera (optional) drives the lens flare: three.js's Lensflare occludes
// itself via a depth-buffer test at its own anchor point, but that anchor
// starts out at the star's exact center — behind the near (camera-facing)
// hemisphere of the star's own opaque core, which always wins that depth
// test and made the flare permanently invisible. Re-anchoring it every frame
// just outside the core's near surface, facing whichever way the camera
// currently is, keeps the flare in front of the star's own geometry (so it
// stops self-occluding) while still correctly hiding behind anything
// genuinely in front of the star (a planet, the ship, etc.).
export function updateStarMesh(mesh, elapsed, dt, camera) {
  for (const star of mesh.userData.stars) {
    star.group.rotation.y += star.spinSpeed * dt
    star.corona1.scale.setScalar(1 + Math.sin(elapsed * 0.6 + star.pulsePhase) * 0.07)
    star.corona2.scale.setScalar(1 + Math.sin(elapsed * 0.4 + star.pulsePhase + 1) * 0.11)
    if (star.orbit) {
      const angle = star.orbit.angle0 + elapsed * star.orbit.speed
      star.group.position.x = Math.cos(angle) * star.orbit.radius
      star.group.position.z = Math.sin(angle) * star.orbit.radius
    }

    if (camera && star.flare) {
      star.group.getWorldPosition(flareWorldPos)
      star.group.getWorldScale(flareWorldScale)
      flareTargetWorld.copy(camera.position).sub(flareWorldPos).normalize()
      flareTargetWorld.multiplyScalar(star.radius * flareWorldScale.x * 1.02).add(flareWorldPos)
      star.group.worldToLocal(flareTargetWorld)
      star.flare.position.copy(flareTargetWorld)
    }
  }

  const energyRing = mesh.userData.energyRing
  if (energyRing) {
    // rotateOnWorldAxis (not rotation.y) since the ring's own local axes are
    // already reoriented by its initial flat-lie rotation.x — this spins the
    // fire pattern around the circle regardless of that, for a flowing look.
    energyRing.ring.rotateOnWorldAxis(WORLD_Y, energyRing.spinSpeed * dt)
    const pulse = 1 + Math.sin(elapsed * 3) * 0.08
    energyRing.ring.scale.setScalar(pulse)
    energyRing.ring.material.opacity = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 4))
    for (const spark of energyRing.sparks) {
      const angle = elapsed * spark.speed + spark.phase
      spark.mesh.position.set(Math.cos(angle) * energyRing.radius, 0, Math.sin(angle) * energyRing.radius)
    }
  }
}
