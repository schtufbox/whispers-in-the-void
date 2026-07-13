import * as THREE from 'three'

let loader = null
const cache = {}

// One shared, read-only texture triple per surface archetype rather than a
// clone per body — keeps GPU memory bounded regardless of galaxy size (up to
// ~1500 planets, only ever a handful live at once since main.js tears down
// the previous system's meshes on jump/dock, but still no reason to clone).
// Per-body variety still comes from each body's own vertex-color tint (see
// planetMesh.js's paintVertexColors), not from the texture itself.
//
// Lazy (only touches THREE.TextureLoader, and therefore `document`, the
// first time a given archetype is actually requested) rather than loaded
// eagerly at module import time — combat.js/missions.js's game/*.test.js
// suites transitively import this module (via asteroidFieldMesh.js's
// getAsteroidRocks) but run under plain Node with no DOM, and never
// actually build a mesh, so they must never trigger a real texture load.
function loadSet(prefix) {
  if (cache[prefix]) return cache[prefix]
  loader ??= new THREE.TextureLoader()
  const map = loader.load(`textures/${prefix}_color.jpg`)
  const normalMap = loader.load(`textures/${prefix}_normal.jpg`)
  const roughnessMap = loader.load(`textures/${prefix}_roughness.jpg`)
  map.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 2)
  }
  cache[prefix] = { map, normalMap, roughnessMap }
  return cache[prefix]
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
