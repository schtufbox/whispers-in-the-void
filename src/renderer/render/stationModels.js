import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  stationMaterialMaps,
  cloneStationMaps,
  retileUVsTriplanar,
  STATION_NORMAL_STRENGTH
} from './textures.js'

const _worldScale = new THREE.Vector3()

// Three orbital station archetypes from Kenney Space Kit modules (CC0 —
// public/models/stations/LICENSE.txt). Each type is one solid primary
// structure plus a couple of snug attachments — not a loose kitbash field.

const BASE = 'models/stations'

const MODULE_FILES = [
  'hangar_largeA',
  'hangar_largeB',
  'hangar_roundA',
  'hangar_roundGlass',
  'hangar_smallA',
  'gate_complex',
  'corridor',
  'corridor_cross',
  'platform_large',
  'rocket_baseA',
  'rocket_finsA',
  'rocket_fuelA',
  'machine_generator',
  'satelliteDish',
  'chimney_detailed'
]

/** @type {Map<string, { root: THREE.Object3D, size: THREE.Vector3 }>} */
const moduleCache = new Map()
/** @type {(THREE.Group|null)[]} */
let templates = [null, null, null]
let loadPromise = null
let ready = false

function loadGltf(url) {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject)
  })
}

/**
 * Bake geometry so the module's visual center is at local (0,0,0) and its
 * position can be set freely without fighting an internal pivot offset.
 */
function prepareModule(scene) {
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const center = new THREE.Vector3()
  const size = new THREE.Vector3()
  box.getCenter(center)
  box.getSize(size)
  // Prefer shifting children; if the scene has no children, shift meshes.
  if (scene.children.length) {
    for (const c of scene.children) {
      c.position.x -= center.x
      c.position.y -= center.y
      c.position.z -= center.z
    }
  } else {
    scene.position.sub(center)
  }
  scene.position.set(0, 0, 0)
  scene.updateMatrixWorld(true)
  return { root: scene, size }
}

function cloneModule(modName) {
  const entry = moduleCache.get(modName)
  if (!entry) return null
  return { obj: entry.root.clone(true), size: entry.size.clone() }
}

/**
 * Add a module with its *bottom* sitting on y=0 (Kenney ground convention)
 * after we centered it — so we lift by half-height.
 * Returns measured scaled size + placement for snug attachment of neighbors.
 */
function addModule(group, modName, x, z, rotY = 0, uniformScale = 1) {
  const cloned = cloneModule(modName)
  if (!cloned) return null
  const { obj, size } = cloned
  obj.scale.setScalar(uniformScale)
  obj.rotation.y = rotY
  const sx = size.x * uniformScale
  const sy = size.y * uniformScale
  const sz = size.z * uniformScale
  // Centered model: bottom was at -size.y/2; lift so it sits on y=0.
  obj.position.set(x, sy / 2, z)
  group.add(obj)
  return { size: new THREE.Vector3(sx, sy, sz), x, z, rotY, obj }
}

/** Stack module on top of another (same x/z), sitting on `baseTopY`. */
function stackModule(group, modName, x, z, baseTopY, rotY = 0, uniformScale = 1) {
  const cloned = cloneModule(modName)
  if (!cloned) return baseTopY
  const { obj, size } = cloned
  obj.scale.setScalar(uniformScale)
  obj.rotation.y = rotY
  const h = size.y * uniformScale
  obj.position.set(x, baseTopY + h / 2, z)
  group.add(obj)
  return baseTopY + h
}

/** Horizontal gap between two modules after rotation about Y (AABB on XZ). */
function moduleHalfXZ(size, rotY = 0) {
  const c = Math.abs(Math.cos(rotY))
  const s = Math.abs(Math.sin(rotY))
  // Rotated AABB extents.
  return {
    hx: (size.x * c + size.z * s) * 0.5,
    hz: (size.x * s + size.z * c) * 0.5
  }
}

/**
 * Center + size the assembly, baking transform into children so group.scale
 * stays 1. main.js applies STATION_SCALE via setScalar on the root mesh —
 * any scale left on the group here would be wiped and stations look tiny.
 */
function normalizeGroup(group, targetSize = 26) {
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  if (box.isEmpty()) return group
  const center = new THREE.Vector3()
  box.getCenter(center)
  for (const c of group.children) {
    c.position.x -= center.x
    c.position.y -= center.y
    c.position.z -= center.z
  }
  group.position.set(0, 0, 0)
  group.scale.set(1, 1, 1)
  group.updateMatrixWorld(true)
  const box2 = new THREE.Box3().setFromObject(group)
  const size2 = new THREE.Vector3()
  box2.getSize(size2)
  const maxDim = Math.max(size2.x, size2.y, size2.z, 0.001)
  const s = targetSize / maxDim
  for (const c of group.children) {
    c.position.multiplyScalar(s)
    c.scale.multiplyScalar(s)
  }
  return group
}

// --- Type 0: Large hangar station (one solid hangar + dish + small wing) --
function buildHangarStation() {
  const g = new THREE.Group()
  const main = addModule(g, 'hangar_largeA', 0, 0, 0, 1)
  if (!main) return normalizeGroup(g, 28)
  const mainXZ = moduleHalfXZ(main.size, 0)
  // Side hangar snug on +Z face (overlap slightly so no gap after normalize).
  const sideScale = 0.85
  const side = addModule(g, 'hangar_smallA', 0, 0, Math.PI, sideScale)
  if (side) {
    const sideXZ = moduleHalfXZ(side.size, Math.PI)
    side.obj.position.z = mainXZ.hz + sideXZ.hz * 0.92
  }
  // Dish on the roof.
  const dish = cloneModule('satelliteDish')
  if (dish) {
    const ds = 0.9
    dish.obj.scale.setScalar(ds)
    dish.obj.position.set(0, main.size.y + (dish.size.y * ds) * 0.35, 0)
    g.add(dish.obj)
  }
  // Corridor docking collar on the front (−Z).
  const cor = addModule(g, 'corridor', 0, 0, 0, 0.9)
  if (cor) {
    const corXZ = moduleHalfXZ(cor.size, 0)
    cor.obj.position.z = -(mainXZ.hz + corXZ.hz * 0.92)
  }
  return normalizeGroup(g, 28)
}

// --- Type 1: Round habitat dome + pad ------------------------------------
function buildDomeStation() {
  const g = new THREE.Group()
  const pad = addModule(g, 'platform_large', 0, 0, 0, 1.6)
  const dome = addModule(g, 'hangar_roundGlass', 0, 0, 0, 1)
  const domeXZ = dome ? moduleHalfXZ(dome.size, 0) : { hx: 1, hz: 1 }
  // Machine flush to +X of dome.
  const mach = addModule(g, 'machine_generator', 0, 0, -0.3, 1.2)
  if (mach) {
    const mXZ = moduleHalfXZ(mach.size, -0.3)
    mach.obj.position.x = domeXZ.hx + mXZ.hx * 0.9
    mach.obj.position.z = 0.15
  }
  // Small hangar on −X.
  const small = addModule(g, 'hangar_smallA', 0, 0, Math.PI / 2, 0.7)
  if (small) {
    const sXZ = moduleHalfXZ(small.size, Math.PI / 2)
    small.obj.position.x = -(domeXZ.hx + sXZ.hx * 0.9)
  }
  const dish = cloneModule('satelliteDish')
  if (dish && dome) {
    const ds = 1.0
    dish.obj.scale.setScalar(ds)
    dish.obj.position.set(0.2, dome.size.y + dish.size.y * ds * 0.3, 0.2)
    g.add(dish.obj)
  }
  // Keep pad under everything (y already 0-based).
  if (pad) pad.obj.position.y = pad.size.y * 0.5
  return normalizeGroup(g, 26)
}

// --- Type 2: Gate tower with rocket stack --------------------------------
function buildGateStation() {
  const g = new THREE.Group()
  const pad = addModule(g, 'platform_large', 0, 0, 0, 1.8)
  // Gate scaled up as the main structure.
  const gate = addModule(g, 'gate_complex', 0, 0, 0, 2.4)
  const padXZ = pad ? moduleHalfXZ(pad.size, 0) : { hx: 2, hz: 2 }
  // Rocket stack on the pad, just inside the edge.
  const rx = padXZ.hx * 0.55
  const rz = padXZ.hz * 0.15
  let top = 0
  top = stackModule(g, 'rocket_baseA', rx, rz, top, 0, 0.75)
  top = stackModule(g, 'rocket_fuelA', rx, rz, top, 0, 0.75)
  stackModule(g, 'rocket_finsA', rx, rz, top, 0, 0.75)
  // Chimney opposite side, still on the pad.
  addModule(g, 'chimney_detailed', -rx * 0.9, rz, 0, 1.0)
  // Cargo bay on −Z face of pad, snug.
  const bay = addModule(g, 'hangar_roundA', 0, 0, 0, 0.65)
  if (bay) {
    const bXZ = moduleHalfXZ(bay.size, 0)
    bay.obj.position.z = -(padXZ.hz + bXZ.hz * 0.85)
  }
  return normalizeGroup(g, 30)
}

const BUILDERS = [buildHangarStation, buildDomeStation, buildGateStation]

export const STATION_TYPE_COUNT = 3
export const STATION_TYPE_NAMES = ['hangar', 'dome', 'gate']

export function stationModelsReady() {
  return ready
}

export function preloadStationModels() {
  if (ready) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    await Promise.all(
      MODULE_FILES.map(async (name) => {
        try {
          const scene = await loadGltf(`${BASE}/${name}.glb`)
          scene.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = false
              o.receiveShadow = false
              // Kenney pieces are often MeshStandard with dark defaults; ensure
              // double-sided so thin walls don't vanish from one view.
              if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material]
                for (const m of mats) {
                  if (m) m.side = THREE.DoubleSide
                }
              }
            }
          })
          moduleCache.set(name, prepareModule(scene))
        } catch (err) {
          console.warn(`[stationModels] failed to load ${name}.glb`, err)
        }
      })
    )

    for (let i = 0; i < BUILDERS.length; i++) {
      try {
        templates[i] = BUILDERS[i]()
        templates[i].name = `station-template-${STATION_TYPE_NAMES[i]}`
      } catch (err) {
        console.warn(`[stationModels] template ${i} failed`, err)
        templates[i] = null
      }
    }
    ready = templates.some(Boolean)
  })()

  return loadPromise
}

function tintMaterials(root, hullColor, accentColor, panelColor) {
  // Worn panel maps need denser UVs than Kenney atlas packing. Geometry is
  // small in local space; scale lives on parents — bake world scale into dens.
  const mapsHull = stationMaterialMaps('hull', STATION_NORMAL_STRENGTH)
  const mapsAccent = stationMaterialMaps('accent', STATION_NORMAL_STRENGTH * 1.05)
  const mapsPanel = stationMaterialMaps('panel', STATION_NORMAL_STRENGTH * 1.1)
  root.updateMatrixWorld(true)
  let i = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    // Keep nav beacons (MeshBasicMaterial) alone.
    if (o.material.isMeshBasicMaterial) return
    if (o.geometry) {
      // Only re-UV once per shared BufferGeometry (clones share geo).
      if (!o.geometry.userData.stationRetiled) {
        o.getWorldScale(_worldScale)
        const sc = Math.max(_worldScale.x, _worldScale.y, _worldScale.z, 0.01)
        // World dens ~0.28 × 12.8 plates/UV ≈ plate every ~0.3 world units
        retileUVsTriplanar(o.geometry, 0.28 * sc)
        o.geometry.userData.stationRetiled = true
      } else if (o.geometry.attributes.uv && !o.geometry.attributes.uv2) {
        o.geometry.setAttribute('uv2', o.geometry.attributes.uv)
      }
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const replaced = mats.map(() => {
      const pick = i++ % 5
      // Mostly hull, occasional accent/panel — avoids rainbow noise.
      const role = pick === 0 ? 'accent' : pick === 1 ? 'panel' : 'hull'
      const color =
        role === 'accent' ? accentColor : role === 'panel' ? panelColor : hullColor
      const baseMaps = role === 'accent' ? mapsAccent : role === 'panel' ? mapsPanel : mapsHull
      const maps = cloneStationMaps(baseMaps, {
        offsetU: (i * 0.17) % 1,
        offsetV: (i * 0.31) % 1,
        rot: (i % 4) * 0.05
      })
      // Per-panel wear variance (mottled age, not factory-fresh).
      const c = color.clone().offsetHSL(
        ((i * 17) % 7) * 0.004 - 0.012,
        0.04,
        ((i * 13) % 5) * 0.018 - 0.06
      )
      // Brighter base so map×color still reads under sparse scene lights
      // (dark worn albedo × mid greys was pure black silhouettes).
      return new THREE.MeshStandardMaterial({
        color: c,
        metalness: 0.28 + (i % 3) * 0.04,
        roughness: 0.72 + (i % 4) * 0.04,
        envMapIntensity: 0.95,
        map: maps.map,
        normalMap: maps.normalMap,
        roughnessMap: maps.roughnessMap,
        metalnessMap: maps.metalnessMap,
        aoMap: maps.aoMap,
        aoMapIntensity: maps.aoMap ? 0.95 : 1,
        normalScale: maps.normalScale
          ? maps.normalScale.clone().multiplyScalar(0.75)
          : undefined,
        side: THREE.FrontSide
      })
    })
    o.material = replaced.length === 1 ? replaced[0] : replaced
  })
}

// ponytail: AABB greebles floated off the hull ("bits not attached") — skip them.

function addNavBeacons(group, phaseBase = 0) {
  const mk = (pos, color, phase, r = 0.35) => {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(r, 10, 8),
      new THREE.MeshBasicMaterial({ color })
    )
    light.position.copy(pos)
    group.add(light)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(r * 2.4, 12, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    glow.position.copy(pos)
    group.add(glow)
    if (!group.userData.beacons) group.userData.beacons = []
    group.userData.beacons.push({ glow, phase })
  }
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  mk(new THREE.Vector3(0, box.max.y + 0.4, 0), 0xff4040, phaseBase)
  mk(new THREE.Vector3(0, box.min.y - 0.2, 0), 0xff4040, phaseBase + Math.PI, 0.28)
}

export function buildStationFromFreeModel(typeIndex, colorRng) {
  if (!ready) return null
  const idx = ((typeIndex % STATION_TYPE_COUNT) + STATION_TYPE_COUNT) % STATION_TYPE_COUNT
  const template = templates[idx]
  if (!template) return null

  const group = template.clone(true)
  group.name = `station-${STATION_TYPE_NAMES[idx]}`

  // Space-worn exterior: warmer oxidized greys (light enough to catch fill light).
  const warm = colorRng() < 0.72
  const hue = warm ? 18 + colorRng() * 28 : 195 + colorRng() * 25
  const hullColor = new THREE.Color().setHSL(hue / 360, 0.1 + colorRng() * 0.12, 0.48 + colorRng() * 0.12)
  const accentColor = new THREE.Color().setHSL(((hue + 90 + colorRng() * 70) % 360) / 360, 0.28 + colorRng() * 0.2, 0.5 + colorRng() * 0.1)
  const panelColor = hullColor.clone().offsetHSL((colorRng() - 0.5) * 0.05, 0.05, -0.06 - colorRng() * 0.05)
  tintMaterials(group, hullColor, accentColor, panelColor)
  addNavBeacons(group, colorRng() * Math.PI * 2)

  return group
}
