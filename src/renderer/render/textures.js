import * as THREE from 'three'

let loader = null
const cache = {}

// One shared, read-only texture triple (or quadruple with metalness) per
// surface prefix rather than a clone per body — keeps GPU memory bounded
// regardless of galaxy size (up to ~1500 planets / many stations, only ever
// a handful live at once since main.js tears down the previous system's
// meshes on jump/dock). Per-body variety still comes from material color
// tints (planets: vertex colors; stations: hullMaterials RNG colors).
//
// Lazy (only touches THREE.TextureLoader, and therefore `document`, the
// first time a given prefix is actually requested) rather than loaded
// eagerly at module import time — combat.js/missions.js's game/*.test.js
// suites transitively import this module (via asteroidFieldMesh.js's
// getAsteroidRocks) but run under plain Node with no DOM, and never
// actually build a mesh, so they must never trigger a real texture load.
// Configure wrap/colorSpace only in the load callback. Setting those on an
// empty Texture marks needsUpdate before image data exists, which spams
// "Texture marked for update but no image data found" every frame until load.
function loadMap(url, { srgb = false, repeatU, repeatV } = {}) {
  return loader.load(url, (tex) => {
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatU, repeatV)
    // Sharper plating at glancing angles (stations / settlements / ships).
    tex.anisotropy = 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
  })
}

function loadSet(prefix, { repeatU = 4, repeatV = 2, withMetalness = false } = {}) {
  const key = `${prefix}|${repeatU}x${repeatV}|m${withMetalness ? 1 : 0}`
  if (cache[key]) return cache[key]
  loader ??= new THREE.TextureLoader()
  const opts = { repeatU, repeatV }
  const map = loadMap(`textures/${prefix}_color.jpg`, { ...opts, srgb: true })
  const normalMap = loadMap(`textures/${prefix}_normal.jpg`, opts)
  const roughnessMap = loadMap(`textures/${prefix}_roughness.jpg`, opts)
  const set = { map, normalMap, roughnessMap }
  if (withMetalness) {
    set.metalnessMap = loadMap(`textures/${prefix}_metalness.jpg`, opts)
  }
  cache[key] = set
  return set
}

// CC0 (public domain, no attribution required) PBR photo textures from
// ambientCG (ambientcg.com) — tiled across each body's low-poly sphere via
// RepeatWrapping rather than a single fixed equirectangular image, so four
// source textures can cover every rocky/ice/lush/volcanic planet, every
// moon and asteroid (all reuse `rocky`), and every star's surface (reuses
// `volcanic`) in the galaxy. Gas giants use free procedural cloud-band
// maps (no third-party license) that tile the same way.
// Returns undefined only when an archetype has no maps and we are in a
// headless context that cannot build canvas textures.
const ARCHETYPE_PREFIX = {
  rocky: 'rock',
  ice: 'ice',
  lush: 'lush',
  volcanic: 'lava'
  // gasGiant → makeGasGiantTextureSet() (procedural)
}

/**
 * Free procedural gas-giant cloud belts (albedo + normal + roughness).
 * Horizontal banding + soft storms; tiles with RepeatWrapping like ambientCG sets.
 * Built once via OffscreenCanvas / canvas when a DOM is available.
 */
function makeGasGiantTextureSet() {
  const key = 'gasGiant|proc|v1'
  if (cache[key]) return cache[key]
  // Headless tests: no canvas — skip maps (vertex color alone).
  const hasDom = typeof document !== 'undefined' && typeof document.createElement === 'function'
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined'
  if (!hasDom && !hasOffscreen) return undefined

  const W = 1024
  const H = 512
  const canvas =
    hasDom
      ? document.createElement('canvas')
      : new OffscreenCanvas(W, H)
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined

  // Soft noise helper (value noise via layered sin — free, deterministic).
  const n2 = (x, y) => {
    const s =
      Math.sin(x * 1.7 + y * 2.3) * 0.5 +
      Math.sin(x * 3.1 - y * 1.9 + 1.4) * 0.3 +
      Math.sin(x * 6.4 + y * 5.2 + 2.7) * 0.2
    return s * 0.5 + 0.5
  }

  const img = ctx.createImageData(W, H)
  const d = img.data
  // Warm amber / ochre cloud palette (Jupiter-like, free / original).
  const deep = [92, 48, 28]
  const mid = [168, 112, 62]
  const bright = [228, 196, 150]
  const storm = [48, 32, 36]

  for (let y = 0; y < H; y++) {
    const v = y / (H - 1) // 0..1 latitude-ish for equirect tile
    const lat = (v - 0.5) * 2 // -1..1
    for (let x = 0; x < W; x++) {
      const u = x / W
      // Cloud belts: many horizontal bands + longitudinal streaks.
      const bands =
        Math.sin(lat * Math.PI * 7.5) * 0.45 +
        Math.sin(lat * Math.PI * 15.2 + 0.7) * 0.25 +
        Math.sin(lat * Math.PI * 3.1 + u * Math.PI * 2) * 0.12
      const swirl =
        n2(u * 8 + lat * 2, lat * 10) * 0.55 +
        n2(u * 18 - lat * 3, lat * 22) * 0.35 +
        n2(u * 40, lat * 40) * 0.15
      // Great-spot style ovals (a few soft dark storms).
      const sx = ((u + 0.18) % 1) - 0.5
      const sy = lat - 0.22
      const oval1 = Math.exp(-(sx * sx * 28 + sy * sy * 55)) * 0.85
      const sx2 = ((u + 0.62) % 1) - 0.5
      const sy2 = lat + 0.35
      const oval2 = Math.exp(-(sx2 * sx2 * 40 + sy2 * sy2 * 70)) * 0.55
      let t = bands * 0.5 + 0.5
      t = t * 0.65 + swirl * 0.35
      t = Math.max(0, Math.min(1, t - oval1 * 0.45 - oval2 * 0.3))
      // Pole darkening
      const pole = Math.pow(Math.abs(lat), 2.2)
      t *= 1 - pole * 0.25

      let r, g, b
      if (oval1 > 0.35 || oval2 > 0.4) {
        const o = Math.max(oval1, oval2)
        const tr = Math.min(1, o)
        r = mid[0] * (1 - tr) + storm[0] * tr
        g = mid[1] * (1 - tr) + storm[1] * tr
        b = mid[2] * (1 - tr) + storm[2] * tr
      } else if (t < 0.45) {
        const k = t / 0.45
        r = deep[0] + (mid[0] - deep[0]) * k
        g = deep[1] + (mid[1] - deep[1]) * k
        b = deep[2] + (mid[2] - deep[2]) * k
      } else {
        const k = (t - 0.45) / 0.55
        r = mid[0] + (bright[0] - mid[0]) * k
        g = mid[1] + (bright[1] - mid[1]) * k
        b = mid[2] + (bright[2] - mid[2]) * k
      }
      const i = (y * W + x) * 4
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // Roughness from luminance (bright tops smoother).
  const roughCanvas =
    hasDom ? document.createElement('canvas') : new OffscreenCanvas(W, H)
  roughCanvas.width = W
  roughCanvas.height = H
  const rctx = roughCanvas.getContext('2d', { willReadFrequently: true })
  const rimg = rctx.createImageData(W, H)
  const rd = rimg.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
    const rv = Math.floor((0.35 + (1 - lum) * 0.5) * 255)
    rd[i] = rd[i + 1] = rd[i + 2] = rv
    rd[i + 3] = 255
  }
  rctx.putImageData(rimg, 0, 0)

  // Fake normal from height (band derivative) — subtle relief on belt edges.
  const nCanvas =
    hasDom ? document.createElement('canvas') : new OffscreenCanvas(W, H)
  nCanvas.width = W
  nCanvas.height = H
  const nctx = nCanvas.getContext('2d', { willReadFrequently: true })
  const nimg = nctx.createImageData(W, H)
  const nd = nimg.data
  const heightAt = (x, y) => {
    const xx = ((x % W) + W) % W
    const yy = Math.max(0, Math.min(H - 1, y))
    const i = (yy * W + xx) * 4
    return (d[i] + d[i + 1] + d[i + 2]) / (3 * 255)
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = heightAt(x + 1, y) - heightAt(x - 1, y)
      const dy = heightAt(x, y + 1) - heightAt(x, y - 1)
      const nx = Math.max(0, Math.min(255, Math.floor((-dx * 4.5 + 0.5) * 255)))
      const ny = Math.max(0, Math.min(255, Math.floor((-dy * 4.5 + 0.5) * 255)))
      const i = (y * W + x) * 4
      nd[i] = nx
      nd[i + 1] = ny
      nd[i + 2] = 255
      nd[i + 3] = 255
    }
  }
  nctx.putImageData(nimg, 0, 0)

  const wrapTex = (src, srgb = false) => {
    const tex = new THREE.CanvasTexture(src)
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    // Few horizontal repeats so belts stay wide on the sphere (not micro-stripes).
    tex.repeat.set(2, 1)
    tex.anisotropy = 8
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    tex.needsUpdate = true
    return tex
  }

  const set = {
    map: wrapTex(canvas, true),
    normalMap: wrapTex(nCanvas, false),
    roughnessMap: wrapTex(roughCanvas, false)
  }
  cache[key] = set
  return set
}

export function getSurfaceTextures(archetype) {
  if (archetype === 'gasGiant') return makeGasGiantTextureSet()
  const prefix = ARCHETYPE_PREFIX[archetype]
  return prefix ? loadSet(prefix) : undefined
}

// Station / settlement / bay-interior surface roles — ambientCG CC0, tiled
// on Three.js primitives. Shared across every archetype; per-body color still
// comes from hullMaterials. Higher tile density + stronger normals so orbital
// stations and surface settlements read more plated detail at typical ranges.
//
//   hull/accent → Metal032
//   panel/wall  → MetalPlates006
//   floor/beam  → Metal013 (dark industrial)
//   solar       → SolarPanel001
//   radiator    → Metal013
//   settlement  → MetalPlates013 (armor) for grit vs polished stations
const STATION_ROLE = {
  hull: { prefix: 'metal', repeatU: 3.2, repeatV: 3.2 },
  accent: { prefix: 'metal', repeatU: 2.8, repeatV: 2.8 },
  panel: { prefix: 'plates', repeatU: 2.6, repeatV: 2.6 },
  wall: { prefix: 'plates', repeatU: 3.4, repeatV: 2.8 },
  floor: { prefix: 'darkmetal', repeatU: 4.5, repeatV: 4.5 },
  beam: { prefix: 'darkmetal', repeatU: 2.8, repeatV: 2.8 },
  solar: { prefix: 'solar', repeatU: 2.8, repeatV: 1.8 },
  radiator: { prefix: 'darkmetal', repeatU: 2.6, repeatV: 2.6 },
  // Surface settlements — denser plate / armor read than free-flying hulls.
  settlementHull: { prefix: 'armor', repeatU: 3.0, repeatV: 2.6 },
  settlementPanel: { prefix: 'plates', repeatU: 3.2, repeatV: 3.0 },
  // Ship-specific CC0 maps (ambientCG PaintedMetal001 / Metal021 / MetalPlates013 / Metal009).
  // Tint with MeshStandardMaterial.color — painted hull takes class color best.
  shipHull: { prefix: 'painted', repeatU: 2.4, repeatV: 1.6 },
  shipStructure: { prefix: 'shipmetal', repeatU: 2.0, repeatV: 1.4 },
  shipArmor: { prefix: 'armor', repeatU: 1.8, repeatV: 1.3 },
  shipTrim: { prefix: 'trim', repeatU: 2.2, repeatV: 1.5 },
  // Alien hulls — ambientCG Rock035 (organic) + MetalPlates006 (chitin plates), CC0.
  alienHull: { prefix: 'alienbio', repeatU: 1.8, repeatV: 1.4 },
  alienPlate: { prefix: 'alienplate', repeatU: 2.2, repeatV: 1.6 }
}

/** Default normal intensity for exterior station / settlement materials. */
export const STATION_NORMAL_STRENGTH = 0.82

export function getStationTextures(role) {
  const cfg = STATION_ROLE[role]
  if (!cfg) return undefined
  return loadSet(cfg.prefix, {
    repeatU: cfg.repeatU,
    repeatV: cfg.repeatV,
    withMetalness: true
  })
}

/** Map fields for MeshStandardMaterial, shared texture objects. */
export function stationMaterialMaps(role, normalStrength = STATION_NORMAL_STRENGTH) {
  const t = getStationTextures(role)
  if (!t) return {}
  return {
    map: t.map,
    normalMap: t.normalMap,
    roughnessMap: t.roughnessMap,
    metalnessMap: t.metalnessMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength)
  }
}
