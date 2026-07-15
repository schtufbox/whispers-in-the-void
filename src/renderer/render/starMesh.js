import * as THREE from 'three'
import { mulberry32 } from '../procgen/prng.js'
import { starTypeForSystem } from '../procgen/starType.js'
import { buildLensFlare } from './lensFlare.js'
import { getSurfaceTextures } from './textures.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

const STAR_HUES = [45, 30, 55, 10, 200]

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
  if (radius > 2000) return 6
  if (radius > 800) return 5
  if (radius > 300) return 4
  return 4
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
// 6× prior scale (37.5) — suns "600% bigger" pass.
const STAR_SIZE_SCALE = 225

// Soft multi-stop radial glow (lazy — tests import this module with no DOM).
// Wider falloff than a hard disc so the corona reads as real solar atmosphere
// rather than a flat billboard circle.
let haloTexture = null
function getHaloTexture() {
  if (haloTexture) return haloTexture
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.08, 'rgba(255,252,240,0.85)')
  g.addColorStop(0.2, 'rgba(255,240,200,0.45)')
  g.addColorStop(0.4, 'rgba(255,200,120,0.18)')
  g.addColorStop(0.65, 'rgba(255,160,80,0.06)')
  g.addColorStop(1, 'rgba(255,120,40,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  haloTexture = new THREE.CanvasTexture(canvas)
  return haloTexture
}

// Elongated soft streak for coronal streamers (drawn once, reused).
let streamerTexture = null
function getStreamerTexture() {
  if (streamerTexture) return streamerTexture
  const w = 64
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(w / 2, h * 0.15, 0, w / 2, h * 0.4, h * 0.55)
  g.addColorStop(0, 'rgba(255,255,255,0.7)')
  g.addColorStop(0.35, 'rgba(255,220,160,0.25)')
  g.addColorStop(1, 'rgba(255,180,80,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  streamerTexture = new THREE.CanvasTexture(canvas)
  return streamerTexture
}

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
  // Cloned per star (not the shared instance from render/textures.js) so
  // updateStarMesh can drift this star's map offset every frame for a
  // boiling-surface look without also scrolling every volcanic planet's
  // surface — clone() shares the underlying image, so the cost is one extra
  // GPU upload for the 1-2 stars alive at a time, not a second decode.
  const coreMap = getSurfaceTextures('volcanic').map.clone()
  const core = new THREE.Mesh(
    buildTurbulentSurface(radius, offsets, coreColor, hotColor),
    new THREE.MeshBasicMaterial({ vertexColors: true, map: coreMap })
  )
  core.frustumCulled = false
  group.add(core)

  // Multi-layer soft glow: inner hot disc + wide outer atmosphere falloff.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getHaloTexture(),
    color,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  }))
  const haloBase = radius * 4.2
  halo.scale.setScalar(haloBase)
  halo.frustumCulled = false
  group.add(halo)

  const haloOuter = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getHaloTexture(),
    color: color.clone().lerp(new THREE.Color(1, 0.7, 0.35), 0.35),
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  }))
  const haloOuterBase = radius * 7.5
  haloOuter.scale.setScalar(haloOuterBase)
  haloOuter.frustumCulled = false
  group.add(haloOuter)

  // Always-readable distant sun: a tight white-hot disc with a floor on
  // angular size so the star stays a bright pinprick from the system rim.
  const distantSpot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getHaloTexture(),
    color: new THREE.Color(1, 0.98, 0.9),
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true
  }))
  const distantSpotBase = radius * 1.6
  distantSpot.scale.setScalar(distantSpotBase)
  distantSpot.frustumCulled = false
  group.add(distantSpot)

  // Corona shells: higher detail + slight noise-scale so the rim isn't a
  // perfect circle (real corona is structured, not a uniform bubble).
  const coronaDetail = Math.max(5, detailForRadius(radius))
  function buildCoronaShell(scale, opacity, colorMul) {
    const geo = new THREE.IcosahedronGeometry(radius * scale, coronaDetail)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i))
      const n = surfaceNoise(v.x / radius, v.y / radius, v.z / radius, offsets)
      // Uneven limb: streamers bulge more at mid-latitudes of each facet.
      const bump = 1 + n * 0.06 + Math.abs(v.y / (radius * scale)) * 0.03
      v.multiplyScalar(bump)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(colorMul),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    return new THREE.Mesh(geo, mat)
  }

  const corona1 = buildCoronaShell(params.corona1Scale, params.corona1Opacity * 1.15, 1.05)
  group.add(corona1)
  const corona2 = buildCoronaShell(params.corona2Scale, params.corona2Opacity * 1.1, 0.95)
  group.add(corona2)
  const corona3 = buildCoronaShell(params.corona2Scale * 1.22, params.corona2Opacity * 0.45, 0.75)
  group.add(corona3)

  // Coronal streamers — long soft sprites around the equator, slight random tilt.
  const streamers = []
  const streamerCount = 6 + Math.floor(rng() * 4)
  for (let i = 0; i < streamerCount; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getStreamerTexture(),
      color: color.clone().lerp(new THREE.Color(1, 0.85, 0.5), 0.4),
      transparent: true,
      opacity: 0.22 + rng() * 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }))
    const ang = (i / streamerCount) * Math.PI * 2 + rng() * 0.3
    const reach = radius * (1.6 + rng() * 0.9)
    spr.position.set(Math.cos(ang) * reach * 0.55, (rng() - 0.5) * radius * 0.35, Math.sin(ang) * reach * 0.55)
    spr.scale.set(radius * (0.35 + rng() * 0.25), radius * (1.4 + rng() * 0.9), 1)
    spr.material.rotation = ang + Math.PI / 2
    group.add(spr)
    streamers.push({ mesh: spr, phase: rng() * Math.PI * 2, speed: 0.15 + rng() * 0.2 })
  }

  // Added at the star's local origin initially; updateStarMesh repositions
  // it every frame to just outside the core's near surface facing the
  // camera (see the comment there for why — the exact center sits behind
  // the star's own opaque front hemisphere and always self-occludes).
  const flare = buildLensFlare(color)
  group.add(flare)

  // Coronal mass ejections — pooled, launched occasionally (see updateStarCmes).
  const cmes = buildCmePool(group, radius, color, rng)

  group.frustumCulled = false
  return {
    group,
    radius,
    color,
    spinSpeed: 0.015 + rng() * 0.02,
    pulsePhase: rng() * Math.PI * 2,
    corona1,
    corona2,
    corona3,
    streamers,
    flare,
    halo,
    haloOuter,
    distantSpot,
    haloBase,
    haloOuterBase,
    distantSpotBase,
    coreMap,
    // Slow, slightly diagonal texture drift — see updateStarMesh.
    mapDrift: [0.004 + rng() * 0.004, 0.002 + rng() * 0.003],
    cmes
  }
}

// Prebuild a few reusable CME groups per star (never allocate mid-flight).
// Each is a short plasma loop/jet: root blob + expanding arc puffs + leading ribbon.
function buildCmePool(starGroup, radius, starColor, rng) {
  const pool = []
  const poolSize = 3
  const hot = starColor.clone().lerp(new THREE.Color(1, 0.95, 0.7), 0.45)
  const mid = starColor.clone().lerp(new THREE.Color(1, 0.45, 0.15), 0.35)

  for (let i = 0; i < poolSize; i++) {
    const g = new THREE.Group()
    g.visible = false

    // Root flare at the surface (bright lift-off).
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({
        color: hot,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    g.add(root)

    // Arc of plasma puffs along the ejection path.
    const puffs = []
    for (let p = 0; p < 7; p++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({
          color: mid.clone().lerp(hot, p / 6),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
      puff.frustumCulled = false
      g.add(puff)
      puffs.push(puff)
    }

    // Leading ribbon / streamer sprite (camera-facing gas sheet).
    const ribbon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getStreamerTexture(),
      color: hot,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }))
    g.add(ribbon)

    // Soft halo around the front of the mass.
    const frontHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color: mid,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }))
    g.add(frontHalo)

    starGroup.add(g)
    pool.push({
      group: g,
      root,
      puffs,
      ribbon,
      frontHalo,
      active: false,
      age: 0,
      duration: 6,
      // Local unit direction of ejection (from star center).
      dir: new THREE.Vector3(1, 0, 0),
      speed: radius * 0.35,
      // ~⅔ of previous scale (user: reduce CME size by a third).
      size: radius * 0.2 * (2 / 3),
      peak: 1
    })
  }

  return {
    pool,
    // First CME after a short settle so menu/load isn't an instant blast.
    nextAt: 12 + rng() * 28,
    // Mean ~38s between ejections; jitter keeps them irregular.
    meanInterval: 32 + rng() * 18,
    rngSeed: rng() * 1e6
  }
}

// Cheap deterministic-ish float from a seed + salt (no need to re-seed mulberry).
function cmeRand(seed, salt) {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function launchCme(star, elapsed) {
  const cmes = star.cmes
  if (!cmes) return
  const slot = cmes.pool.find((c) => !c.active)
  if (!slot) return

  const seed = cmes.rngSeed + elapsed * 17.13
  // Random direction on the sphere (slightly prefer mid-latitudes — real CMEs).
  const u = cmeRand(seed, 1)
  const v = cmeRand(seed, 2)
  const theta = u * Math.PI * 2
  const phi = Math.acos(2 * v - 1) * 0.75 + Math.PI * 0.125 // avoid pure poles a bit
  slot.dir.set(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize()

  slot.active = true
  slot.age = 0
  slot.duration = 5 + cmeRand(seed, 3) * 4.5
  // Size ~⅔ of original (reduce CMEs by a third).
  const sizeScale = 2 / 3
  slot.speed = star.radius * (0.28 + cmeRand(seed, 4) * 0.35) * sizeScale
  slot.size = star.radius * (0.12 + cmeRand(seed, 5) * 0.18) * sizeScale
  slot.peak = 0.85 + cmeRand(seed, 6) * 0.35
  slot.group.visible = true
  slot.group.position.set(0, 0, 0)

  // Schedule next: rare-ish but regular enough to notice in a play session.
  const gap = cmes.meanInterval * (0.55 + cmeRand(seed, 7) * 0.9)
  cmes.nextAt = elapsed + Math.max(18, gap)
}

function updateStarCmes(star, elapsed, dt) {
  const cmes = star.cmes
  if (!cmes) return

  if (elapsed >= cmes.nextAt) launchCme(star, elapsed)

  for (const cme of cmes.pool) {
    if (!cme.active) continue
    cme.age += dt
    const u = Math.min(1, cme.age / cme.duration)
    // Ease-out expansion: fast launch, then coast / disperse.
    const travel = cme.speed * (cme.age * (0.55 + 0.45 * (1 - u * u)))
    const front = star.radius * 1.02 + travel
    // Opacity: bright rise, long fade.
    const fade = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.35)
    const opacity = Math.max(0, fade * cme.peak)

    // Root sits on the photosphere, flaring as the mass lifts off.
    cme.root.position.copy(cme.dir).multiplyScalar(star.radius * 1.02)
    const rootScale = cme.size * (1.2 + u * 2.5) * (u < 0.2 ? 1.4 : 1 - u * 0.5)
    cme.root.scale.setScalar(Math.max(0.01, rootScale))
    cme.root.material.opacity = opacity * (u < 0.35 ? 1 : 1 - (u - 0.35) * 1.2)

    // Chain of puffs along the expanding front — loops slightly off-axis.
    for (let i = 0; i < cme.puffs.length; i++) {
      const puff = cme.puffs[i]
      const t = (i + 1) / (cme.puffs.length + 1)
      // Arc: lateral offset grows then collapses (classic CME loop).
      const arc = Math.sin(t * Math.PI) * cme.size * (1.2 + u * 3.5)
      // Build a stable perpendicular from dir.
      const ax = Math.abs(cme.dir.y) < 0.9 ? 0 : 1
      const side = new THREE.Vector3(ax, 1 - ax, 0).cross(cme.dir).normalize()
      const up = new THREE.Vector3().crossVectors(cme.dir, side).normalize()
      const loopPhase = t * Math.PI * 2 + elapsed * 0.4
      const lat = side.clone().multiplyScalar(Math.cos(loopPhase) * arc)
        .add(up.clone().multiplyScalar(Math.sin(loopPhase) * arc * 0.55))
      const along = front * (0.25 + t * 0.75)
      puff.position.copy(cme.dir).multiplyScalar(along).add(lat)
      const puffScale = cme.size * (0.7 + t * 1.4) * (1 + u * 2.8)
      puff.scale.setScalar(Math.max(0.01, puffScale))
      puff.material.opacity = opacity * (0.35 + 0.65 * (1 - t * 0.5))
    }

    // Ribbon points along the jet (sprite is camera-facing; stretch length).
    const tip = front * 1.05
    cme.ribbon.position.copy(cme.dir).multiplyScalar(tip * 0.72)
    cme.ribbon.scale.set(
      cme.size * (1.5 + u * 4),
      cme.size * (4 + u * 10),
      1
    )
    cme.ribbon.material.opacity = opacity * 0.65
    cme.ribbon.material.rotation = Math.atan2(cme.dir.x, cme.dir.z)

    cme.frontHalo.position.copy(cme.dir).multiplyScalar(tip)
    const haloS = cme.size * (3 + u * 8)
    cme.frontHalo.scale.setScalar(Math.max(0.01, haloS))
    cme.frontHalo.material.opacity = opacity * 0.45

    // Peak corona swell from the youngest active CME (applied once after loop).
    if (u < 0.18) {
      cmes.coronaPunch = Math.max(cmes.coronaPunch ?? 0, (1 - u / 0.18) * 0.12)
    }

    if (u >= 1) {
      cme.active = false
      cme.group.visible = false
    }
  }
}

// Soft radial-gradient sprite for gaseous plasma puffs (shared).
let _plasmaPuffTex = null
function plasmaPuffTexture() {
  if (_plasmaPuffTex) return _plasmaPuffTex
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,220,140,1)')
  grd.addColorStop(0.25, 'rgba(255,120,40,0.7)')
  grd.addColorStop(0.55, 'rgba(180,30,20,0.3)')
  grd.addColorStop(1, 'rgba(40,0,10,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  _plasmaPuffTex = new THREE.CanvasTexture(c)
  return _plasmaPuffTex
}

// Centerline of the plasma bridge: imperfect ellipse + multi-harmonic warp
// so it never reads as a clean torus, while still roughly linking both suns
// (radius ≈ separation/2, center at the pair midpoint).
function energyRingPathPoint(theta, radius, t, warp) {
  const w1 = Math.sin(2 * theta + t * warp.flow1 + warp.p1)
  const w2 = Math.sin(3 * theta - t * warp.flow2 + warp.p2)
  const w3 = Math.sin(5 * theta + t * warp.flow3 + warp.p3)
  const radial = 1 + warp.a1 * w1 + warp.a2 * w2 + warp.a3 * w3
  // Mild ellipse that breathes over time.
  const ex = 1 + warp.ellipse * Math.sin(t * warp.ellipseSpeed)
  const ez = 1 - warp.ellipse * 0.85 * Math.sin(t * warp.ellipseSpeed + 0.8)
  const r = radius * radial
  const y =
    radius * (warp.y1 * Math.sin(2 * theta + t * warp.yFlow1 + warp.py1)
      + warp.y2 * Math.sin(3 * theta - t * warp.yFlow2 + warp.py2)
      + warp.y3 * Math.sin(4 * theta + t * warp.yFlow3))
  return {
    x: Math.cos(theta) * r * ex,
    y,
    z: Math.sin(theta) * r * ez
  }
}

// Build a soft tube along the warped path (not a perfect TorusGeometry).
// tubularSegs along the loop, radialSegs around the tube cross-section.
function buildWarpedTubeGeometry(radius, tubeR, tubularSegs, radialSegs, warp, t = 0, colorDeep, colorHot, noiseOffsets) {
  const positions = []
  const colors = []
  const indices = []
  const c = new THREE.Color()
  const deep = colorDeep.clone()
  const hot = colorHot.clone()

  const centers = []
  for (let i = 0; i <= tubularSegs; i++) {
    const theta = (i / tubularSegs) * Math.PI * 2
    centers.push(energyRingPathPoint(theta, radius, t, warp))
  }

  for (let i = 0; i <= tubularSegs; i++) {
    const p = centers[i]
    const prev = centers[(i - 1 + tubularSegs) % tubularSegs]
    const next = centers[(i + 1) % tubularSegs]
    // Tangent along the path.
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    let tz = next.z - prev.z
    const tlen = Math.hypot(tx, ty, tz) || 1
    tx /= tlen; ty /= tlen; tz /= tlen
    // Build a frame (N, B) perpendicular to tangent.
    let nx = -ty, ny = tx, nz = 0
    let nlen = Math.hypot(nx, ny, nz)
    if (nlen < 1e-4) { nx = 0; ny = -tz; nz = ty; nlen = Math.hypot(nx, ny, nz) || 1 }
    nx /= nlen; ny /= nlen; nz /= nlen
    // B = T × N
    let bx = ty * nz - tz * ny
    let by = tz * nx - tx * nz
    let bz = tx * ny - ty * nx
    const blen = Math.hypot(bx, by, bz) || 1
    bx /= blen; by /= blen; bz /= blen

    // Tube radius also breathes irregularly along the path.
    const theta = (i / tubularSegs) * Math.PI * 2
    const tubeScale = 1 + 0.35 * Math.sin(3 * theta + t * 1.1) + 0.2 * Math.sin(7 * theta - t * 0.7)
    const tr = tubeR * tubeScale

    for (let j = 0; j <= radialSegs; j++) {
      const phi = (j / radialSegs) * Math.PI * 2
      const cp = Math.cos(phi)
      const sp = Math.sin(phi)
      const px = p.x + (nx * cp + bx * sp) * tr
      const py = p.y + (ny * cp + by * sp) * tr
      const pz = p.z + (nz * cp + bz * sp) * tr
      positions.push(px, py, pz)

      const nNoise = surfaceNoise(px / radius, py / radius, pz / radius, noiseOffsets)
      // Hotter toward tube center (lower |phi variation| is wrong — use radial
      // ring angle + noise for fire blotches).
      const heat = Math.pow(Math.max(0, 0.45 + nNoise * 0.7 + 0.25 * Math.sin(theta * 4 + phi * 2)), 0.75)
      c.copy(deep).lerp(hot, Math.min(1, heat))
      colors.push(c.r, c.g, c.b)
    }
  }

  const stride = radialSegs + 1
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j
      const b = a + stride
      const c0 = a + 1
      const d = b + 1
      indices.push(a, b, c0, b, d, c0)
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geom.setIndex(indices)
  geom.computeVertexNormals()
  return geom
}

// Plasma bridge between a binary pair: warped / weaving multi-layer fire-gas
// tube (not a perfect torus). Geometry path is rebuilt each frame so the
// ring thrashs and breathes while the group still tracks the star midpoint.
//
// Geometry: nominal radius = separation/2, centered on the pair midpoint so
// it roughly threads both stars; harmonics + out-of-plane waves keep it from
// reading as a clean circle. updateStarMesh re-centers/yaws/rolls the group
// and remeshes the warp.
function buildEnergyRing(separation, rng) {
  const radius = separation / 2
  const tubeRadius = Math.max(5, radius * 0.055)
  const noiseOffsets = [rng() * 10, rng() * 10, rng() * 10]
  const group = new THREE.Group()
  group.rotation.order = 'YXZ'

  const warp = {
    a1: 0.1 + rng() * 0.08,
    a2: 0.06 + rng() * 0.05,
    a3: 0.03 + rng() * 0.04,
    p1: rng() * Math.PI * 2,
    p2: rng() * Math.PI * 2,
    p3: rng() * Math.PI * 2,
    flow1: 0.35 + rng() * 0.25,
    flow2: 0.45 + rng() * 0.3,
    flow3: 0.55 + rng() * 0.25,
    ellipse: 0.06 + rng() * 0.06,
    ellipseSpeed: 0.18 + rng() * 0.12,
    y1: 0.1 + rng() * 0.08,
    y2: 0.06 + rng() * 0.05,
    y3: 0.03 + rng() * 0.03,
    yFlow1: 0.4 + rng() * 0.25,
    yFlow2: 0.55 + rng() * 0.3,
    yFlow3: 0.7 + rng() * 0.25,
    py1: rng() * Math.PI * 2,
    py2: rng() * Math.PI * 2
  }

  const deepOuter = new THREE.Color().setHSL(0.02, 0.95, 0.28)
  const hotOuter = new THREE.Color().setHSL(0.07, 1, 0.52)
  const deepMid = new THREE.Color().setHSL(0.05, 1, 0.4)
  const hotMid = new THREE.Color().setHSL(0.1, 1, 0.62)
  const deepCore = new THREE.Color().setHSL(0.1, 0.85, 0.7)
  const hotCore = new THREE.Color().setHSL(0.14, 0.55, 0.95)

  function makeLayer(tubeScale, deep, hot, opacity) {
    const geom = buildWarpedTubeGeometry(radius, tubeRadius * tubeScale, 72, 10, warp, 0, deep, hot, noiseOffsets)
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.frustumCulled = false
    group.add(mesh)
    return mesh
  }

  // Three nested shells: smoky outer gas → fire mid → white-hot filament.
  const gas = makeLayer(1.85, deepOuter, hotOuter, 0.28)
  const mid = makeLayer(1.05, deepMid, hotMid, 0.55)
  const core = makeLayer(0.38, deepCore, hotCore, 0.85)

  // Soft gaseous puffs drifting along the bridge.
  const puffs = []
  const puffTex = plasmaPuffTexture()
  const puffCount = 22
  for (let i = 0; i < puffCount; i++) {
    const mat = new THREE.SpriteMaterial({
      map: puffTex,
      color: new THREE.Color().setHSL(0.04 + rng() * 0.08, 0.95, 0.55 + rng() * 0.2),
      transparent: true,
      opacity: 0.35 + rng() * 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    const sprite = new THREE.Sprite(mat)
    const size = tubeRadius * (2.5 + rng() * 4)
    sprite.scale.set(size, size, 1)
    group.add(sprite)
    puffs.push({
      mesh: sprite,
      phase: rng() * Math.PI * 2,
      speed: 0.15 + rng() * 0.35,
      size,
      radialJitter: 0.04 + rng() * 0.1,
      yJitter: tubeRadius * (0.5 + rng() * 2)
    })
  }

  // Ember sparks — chaotic, not locked to a perfect circle.
  const sparks = []
  const sparkCount = 18
  for (let i = 0; i < sparkCount; i++) {
    const color = new THREE.Color().setHSL(0.04 + rng() * 0.12, 1, 0.55 + rng() * 0.35)
    const size = tubeRadius * (0.25 + rng() * 0.7)
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    )
    group.add(spark)
    sparks.push({
      mesh: spark,
      phase: rng() * Math.PI * 2,
      speed: 0.25 + rng() * 0.65,
      wobble: tubeRadius * (0.8 + rng() * 2.2),
      wobbleFreq: 1.5 + rng() * 3.5,
      trail: rng() * Math.PI * 2
    })
  }

  return {
    group,
    layers: [
      { mesh: gas, tubeScale: 1.85, deep: deepOuter, hot: hotOuter, baseOpacity: 0.28, pulse: 3.1 },
      { mesh: mid, tubeScale: 1.05, deep: deepMid, hot: hotMid, baseOpacity: 0.55, pulse: 4.2 },
      { mesh: core, tubeScale: 0.38, deep: deepCore, hot: hotCore, baseOpacity: 0.85, pulse: 5.5 }
    ],
    radius,
    tubeRadius,
    warp,
    noiseOffsets,
    puffs,
    sparks,
    // Group roll / thrash around the star-to-star axis.
    weaveSpeed: 0.35 + rng() * 0.25,
    weaveAmplitude: 0.55 + rng() * 0.4,
    weaveSpeed2: 0.55 + rng() * 0.35,
    weaveAmplitude2: 0.2 + rng() * 0.2,
    // How often we rebuild warped mesh (every N frames worth of time).
    morphAccum: 0,
    morphInterval: 1 / 28 // ~28 Hz morph — smooth enough, cheap enough
  }
}

// A star (or multi-star system) always sits at a system's local origin.
// Each star's core is self-lit (MeshBasicMaterial ignores scene lighting)
// with a turbulent, mottled surface so it reads as a roiling ball of plasma
// rather than a flat gem; corona shells give it a soft, pulsing halo.
// Binary / trinary: biggest component stays at the origin (primary + system
// anchor); companions orbit it with plasma energy rings bridging each pair
// (see updateStarMesh). Trinary only exists on Whispers (system.starType).
// forceType (optional) skips the hashed random pick — used by main.js's
// main-menu flyby to always get Whispers' trinary rather than leaving it to luck.
export function buildStarMesh(system, forceType = null) {
  const hash = hashString(system.id)
  const rng = mulberry32(hash)
  // Same source of truth as starting-system pick / Whispers override.
  const type = forceType ?? starTypeForSystem(system)

  const group = new THREE.Group()
  group.userData.stars = []
  group.userData.energyRings = []

  if (type === 'binary' || type === 'trinary') {
    const count = type === 'trinary' ? 3 : 2
    const componentTypes = Array.from({ length: count }, () =>
      BINARY_COMPONENT_TYPES[Math.floor(rng() * BINARY_COMPONENT_TYPES.length)]
    )
    const stars = componentTypes.map((componentType) => buildSingleStar(componentType, rng))
    // Primary = largest; companions orbit it (same stationary-anchor rule as binary).
    const order = stars
      .map((s, i) => i)
      .sort((a, b) => stars[b].radius - stars[a].radius)
    const primary = stars[order[0]]
    group.add(primary.group)
    group.userData.stars.push(primary)

    // Companions: each separation clears corona reach; outer ones step out so
    // they don't sit on top of the inner orbit (trinary hierarchical look).
    let prevSep = 0
    for (let c = 1; c < order.length; c++) {
      const companion = stars[order[c]]
      const baseSep = Math.max(220, (primary.radius + companion.radius) * 2.2)
      // Outer companion farther than the previous so the triple reads clearly.
      const separation = Math.max(baseSep, prevSep * 1.55 + primary.radius * 0.35)
      prevSep = separation
      const orbitSpeed = (0.035 + rng() * 0.04) * (c === 1 ? 1 : 0.72)
      const orbit = {
        radius: separation,
        angle0: rng() * Math.PI * 2,
        speed: orbitSpeed
      }
      companion.group.position.set(
        Math.cos(orbit.angle0) * orbit.radius,
        0,
        Math.sin(orbit.angle0) * orbit.radius
      )
      group.add(companion.group)
      const orbiterEntry = { ...companion, orbit }
      group.userData.stars.push(orbiterEntry)

      // Plasma bridge threads primary (origin) ↔ this companion.
      // orbit.radius = separation; ring radius = separation/2 (buildEnergyRing).
      const energyRing = buildEnergyRing(orbit.radius, rng)
      // Index into userData.stars of the companion this ring follows.
      energyRing.orbiterIndex = group.userData.stars.length - 1
      group.add(energyRing.group)
      group.userData.energyRings.push(energyRing)
    }

    // Legacy single-ring handle (binary tools / older call sites).
    group.userData.energyRing = group.userData.energyRings[0] ?? null
  } else {
    const star = buildSingleStar(type, rng)
    group.add(star.group)
    group.userData.stars.push(star)
  }

  group.frustumCulled = false
  return group
}

// Scratch objects reused every frame in updateStarMesh's flare repositioning
// (see below) rather than allocated per star per frame.
const flareWorldPos = new THREE.Vector3()
const flareWorldScale = new THREE.Vector3()
const flareTargetWorld = new THREE.Vector3()
// Minimum angular size (radians) for the distant-sun spot so a star never
// shrinks below a readable bright pinprick at the system rim.
const DISTANT_SUN_MIN_ANGLE = 0.014

// Slow rotation plus a gentle breathing pulse on the corona shells for every
// star in the system (1, 2 binary, or 3 trinary) — driven by gameState.simTime
// (via the elapsed param), never wall-clock time. Companions carry `orbit`;
// the primary stays at the origin. Each energy ring threads primary↔one
// companion and is re-centered on that pair's midpoint each frame.
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
    // CME corona swell is layered on after updateStarCmes (below).
    if (star.cmes) star.cmes.coronaPunch = 0
    star.corona1.scale.setScalar(1 + Math.sin(elapsed * 0.6 + star.pulsePhase) * 0.07)
    star.corona2.scale.setScalar(1 + Math.sin(elapsed * 0.4 + star.pulsePhase + 1) * 0.11)
    if (star.corona3) star.corona3.scale.setScalar(1 + Math.sin(elapsed * 0.28 + star.pulsePhase + 2) * 0.09)
    // Boiling-surface motion: this star's own cloned map drifts slowly, on
    // top of the group's spin — the two motions layered read as convecting
    // plasma rather than a static skin rotating.
    if (star.coreMap) {
      star.coreMap.offset.x = elapsed * star.mapDrift[0]
      star.coreMap.offset.y = elapsed * star.mapDrift[1]
    }
    // Halo layers breathe out of phase so the atmosphere shimmers.
    if (star.halo) star.halo.material.opacity = 0.78 + 0.18 * Math.sin(elapsed * 1.3 + star.pulsePhase)
    if (star.haloOuter) star.haloOuter.material.opacity = 0.28 + 0.1 * Math.sin(elapsed * 0.7 + star.pulsePhase + 1)
    if (star.streamers) {
      for (const s of star.streamers) {
        s.mesh.material.opacity = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase))
        s.mesh.material.rotation += dt * 0.05
      }
    }
    // Occasional coronal mass ejections (rare but not vanishingly rare).
    updateStarCmes(star, elapsed, dt)
    if (star.cmes?.coronaPunch > 0) {
      const p = star.cmes.coronaPunch
      star.corona1.scale.setScalar(star.corona1.scale.x * (1 + p))
      star.corona2.scale.setScalar(star.corona2.scale.x * (1 + p * 0.7))
      if (star.corona3) star.corona3.scale.setScalar(star.corona3.scale.x * (1 + p * 0.45))
      if (star.halo) star.halo.material.opacity = Math.min(1, (star.halo.material.opacity ?? 0.8) + p * 0.5)
    }
    if (star.orbit) {
      const angle = star.orbit.angle0 + elapsed * star.orbit.speed
      star.group.position.x = Math.cos(angle) * star.orbit.radius
      star.group.position.z = Math.sin(angle) * star.orbit.radius
    }

    if (camera) {
      star.group.getWorldPosition(flareWorldPos)
      const dist = Math.max(1, camera.position.distanceTo(flareWorldPos))
      // Grow the distant spot so angular size never drops below the floor —
      // reads as a bright pinprick that swells as you approach.
      if (star.distantSpot) {
        const minSize = dist * DISTANT_SUN_MIN_ANGLE
        const size = Math.max(star.distantSpotBase ?? star.radius * 1.6, minSize)
        star.distantSpot.scale.setScalar(size)
        // Dim slightly when close so the real corona reads; full when far.
        const close = Math.min(1, (star.radius * 8) / dist)
        star.distantSpot.material.opacity = 0.55 + 0.45 * (1 - close * 0.7)
      }
      // Soft floor on main halo too so the star glow never fully vanishes.
      if (star.halo && star.haloBase) {
        const minHalo = dist * DISTANT_SUN_MIN_ANGLE * 2.2
        star.halo.scale.setScalar(Math.max(star.haloBase, minHalo))
      }
      if (star.haloOuter && star.haloOuterBase) {
        const minOuter = dist * DISTANT_SUN_MIN_ANGLE * 3.5
        star.haloOuter.scale.setScalar(Math.max(star.haloOuterBase, minOuter))
      }

      if (star.flare) {
        star.group.getWorldScale(flareWorldScale)
        flareTargetWorld.copy(camera.position).sub(flareWorldPos).normalize()
        flareTargetWorld.multiplyScalar(star.radius * flareWorldScale.x * 1.02).add(flareWorldPos)
        star.group.worldToLocal(flareTargetWorld)
        star.flare.position.copy(flareTargetWorld)
      }
    }
  }

  // Binary: one ring. Trinary: one ring per companion (primary ↔ each orbiter).
  const energyRings =
    mesh.userData.energyRings?.length
      ? mesh.userData.energyRings
      : mesh.userData.energyRing
        ? [mesh.userData.energyRing]
        : []

  for (const energyRing of energyRings) {
    // Midpoint between primary (origin) and its companion; yaw so local X ≈
    // star axis, then thrash roll so the bridge weaves out of the orbital plane.
    const orbiter =
      energyRing.orbiterIndex != null
        ? mesh.userData.stars[energyRing.orbiterIndex]
        : mesh.userData.stars.find((s) => s.orbit)
    if (!orbiter?.orbit) continue
    const angle = orbiter.orbit.angle0 + elapsed * orbiter.orbit.speed
    energyRing.group.position.set(Math.cos(angle) * energyRing.radius, 0, Math.sin(angle) * energyRing.radius)
    energyRing.group.rotation.y = -angle
    energyRing.group.rotation.x =
      Math.sin(elapsed * energyRing.weaveSpeed) * energyRing.weaveAmplitude
      + Math.sin(elapsed * energyRing.weaveSpeed2 * 1.7 + 1.1) * energyRing.weaveAmplitude2
    energyRing.group.rotation.z =
      Math.sin(elapsed * energyRing.weaveSpeed2 + 0.6) * energyRing.weaveAmplitude2 * 0.85

    // Remesh warped tubes on a timer so the fire/gas path lives without
    // rebuilding every frame (still ~28 Hz — reads as continuous thrash).
    energyRing.morphAccum = (energyRing.morphAccum ?? 0) + dt
    if (energyRing.morphAccum >= energyRing.morphInterval) {
      energyRing.morphAccum = 0
      for (const layer of energyRing.layers) {
        const next = buildWarpedTubeGeometry(
          energyRing.radius,
          energyRing.tubeRadius * layer.tubeScale,
          72,
          10,
          energyRing.warp,
          elapsed,
          layer.deep,
          layer.hot,
          energyRing.noiseOffsets
        )
        layer.mesh.geometry.dispose()
        layer.mesh.geometry = next
        const pulse = layer.baseOpacity * (0.75 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * layer.pulse)))
        layer.mesh.material.opacity = pulse
      }
    } else {
      // Opacity still breathes between remeshes.
      for (const layer of energyRing.layers) {
        layer.mesh.material.opacity =
          layer.baseOpacity * (0.75 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * layer.pulse)))
      }
    }

    // Gaseous puffs ride the warped centerline and pulse.
    for (const puff of energyRing.puffs) {
      const theta = elapsed * puff.speed + puff.phase
      const p = energyRingPathPoint(theta, energyRing.radius, elapsed, energyRing.warp)
      const j = puff.radialJitter * energyRing.radius * Math.sin(elapsed * 1.3 + puff.phase)
      puff.mesh.position.set(
        p.x * (1 + j / Math.max(1, energyRing.radius)),
        p.y + Math.sin(elapsed * 2.1 + puff.phase) * puff.yJitter,
        p.z * (1 + j / Math.max(1, energyRing.radius))
      )
      const breathe = 0.85 + 0.35 * Math.sin(elapsed * 2.4 + puff.phase)
      puff.mesh.scale.setScalar(puff.size * breathe)
      puff.mesh.material.opacity = 0.2 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 3 + puff.phase))
    }

    // Embers thrash off the bridge rather than skating a perfect circle.
    for (const spark of energyRing.sparks) {
      const sparkAngle = elapsed * spark.speed + spark.phase
      const p = energyRingPathPoint(sparkAngle, energyRing.radius, elapsed, energyRing.warp)
      const wobble = Math.sin(elapsed * spark.wobbleFreq + spark.phase) * spark.wobble
      const wobble2 = Math.cos(elapsed * spark.wobbleFreq * 0.7 + spark.trail) * spark.wobble * 0.7
      spark.mesh.position.set(p.x + wobble, p.y + wobble2, p.z + wobble * 0.5)
      spark.mesh.material.opacity = 0.45 + 0.5 * (0.5 + 0.5 * Math.sin(elapsed * 6 + spark.phase))
      const s = 0.7 + 0.5 * Math.sin(elapsed * 5 + spark.trail)
      spark.mesh.scale.setScalar(s)
    }
  }
}
