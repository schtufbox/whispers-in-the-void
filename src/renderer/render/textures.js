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
// `volcanic`) in the galaxy. See CLAUDE.md's Body/star visuals section.
// Returns undefined for an archetype with no texture set (gas giants —
// cloud bands don't suit a tiled photo), which callers spread harmlessly
// (`{...undefined}` is a no-op) into their material options.
const ARCHETYPE_PREFIX = { rocky: 'rock', ice: 'ice', lush: 'lush', volcanic: 'lava' }

export function getSurfaceTextures(archetype) {
  const prefix = ARCHETYPE_PREFIX[archetype]
  return prefix ? loadSet(prefix) : undefined
}

// Station / settlement / bay-interior surface roles — ambientCG CC0, tiled
// on Three.js primitives. Shared across every archetype; per-body color still
// comes from hullMaterials. Repeats are intentionally modest so large faces
// don't read as a grid of giant plate tiles ("blocky" look).
//
//   hull/accent → Metal032
//   panel/wall  → MetalPlates006
//   floor/beam  → Metal013 (dark industrial)
//   solar       → SolarPanel001
//   radiator    → Metal013
const STATION_ROLE = {
  hull: { prefix: 'metal', repeatU: 1.4, repeatV: 1.4 },
  accent: { prefix: 'metal', repeatU: 1.4, repeatV: 1.4 },
  panel: { prefix: 'plates', repeatU: 1.15, repeatV: 1.15 },
  wall: { prefix: 'plates', repeatU: 1.8, repeatV: 1.4 },
  floor: { prefix: 'darkmetal', repeatU: 3.2, repeatV: 3.2 },
  beam: { prefix: 'darkmetal', repeatU: 1.6, repeatV: 1.6 },
  solar: { prefix: 'solar', repeatU: 1.6, repeatV: 1.0 },
  radiator: { prefix: 'darkmetal', repeatU: 1.25, repeatV: 1.25 },
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
export function stationMaterialMaps(role, normalStrength = 0.38) {
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
