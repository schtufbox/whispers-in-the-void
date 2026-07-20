import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { stationMaterialMaps } from './textures.js'

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
 */
function addModule(group, modName, x, z, rotY = 0, uniformScale = 1) {
  const cloned = cloneModule(modName)
  if (!cloned) return null
  const { obj, size } = cloned
  obj.scale.setScalar(uniformScale)
  obj.rotation.y = rotY
  // Centered model: bottom was at -size.y/2; lift so it sits on y=0.
  const halfH = (size.y * uniformScale) / 2
  obj.position.set(x, halfH, z)
  group.add(obj)
  return { size: size.multiplyScalar(uniformScale), x, z, rotY }
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
  // Main body — already a complete building.
  addModule(g, 'hangar_largeA', 0, 0, 0, 1)
  // Small side hangar snug against the long side (hangar is ~2 wide × 3 deep).
  addModule(g, 'hangar_smallA', 0, 2.05, Math.PI, 0.85)
  // Dish on the roof (hangar height ~1).
  const dish = cloneModule('satelliteDish')
  if (dish) {
    dish.obj.scale.setScalar(0.9)
    dish.obj.position.set(0, 1 + dish.size.y * 0.45, -0.3)
    g.add(dish.obj)
  }
  // Short corridor docking collar on the front.
  addModule(g, 'corridor', 0, -2.0, 0, 0.9)
  return normalizeGroup(g, 28)
}

// --- Type 1: Round habitat dome + pad ------------------------------------
function buildDomeStation() {
  const g = new THREE.Group()
  addModule(g, 'platform_large', 0, 0, 0, 1.6)
  addModule(g, 'hangar_roundGlass', 0, 0, 0, 1)
  // Side machine block tight to the dome (~1.6 radius).
  addModule(g, 'machine_generator', 2.0, 0.4, -0.3, 1.4)
  addModule(g, 'hangar_smallA', -2.2, 0, Math.PI / 2, 0.7)
  const dish = cloneModule('satelliteDish')
  if (dish) {
    dish.obj.scale.setScalar(1.1)
    dish.obj.position.set(0.6, 1.55, 0.4)
    g.add(dish.obj)
  }
  return normalizeGroup(g, 26)
}

// --- Type 2: Gate tower with rocket stack --------------------------------
function buildGateStation() {
  const g = new THREE.Group()
  // Platform base
  addModule(g, 'platform_large', 0, 0, 0, 1.8)
  // Gate is small (~1×1×0.5) — scale up so it reads as the main structure.
  addModule(g, 'gate_complex', 0, 0, 0, 2.4)
  // Rocket stack beside the gate, sitting on the pad.
  let top = 0
  top = stackModule(g, 'rocket_baseA', 1.9, 0.3, top, 0, 0.75)
  top = stackModule(g, 'rocket_fuelA', 1.9, 0.3, top, 0, 0.75)
  stackModule(g, 'rocket_finsA', 1.9, 0.3, top, 0, 0.75)
  // Chimney opposite side
  addModule(g, 'chimney_detailed', -1.7, 0.2, 0, 1.1)
  // Second hangar module as cargo bay
  addModule(g, 'hangar_roundA', 0, -2.0, 0, 0.65)
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
  // Match exterior station detail density (stronger normals + denser tiles).
  const mapsHull = stationMaterialMaps('hull')
  const mapsAccent = stationMaterialMaps('accent')
  const mapsPanel = stationMaterialMaps('panel')
  let i = 0
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return
    // Keep nav beacons (MeshBasicMaterial) alone.
    if (o.material.isMeshBasicMaterial) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const replaced = mats.map((orig) => {
      const pick = i++ % 5
      // Mostly hull, occasional accent/panel — avoids rainbow noise.
      const role = pick === 0 ? 'accent' : pick === 1 ? 'panel' : 'hull'
      const color =
        role === 'accent' ? accentColor : role === 'panel' ? panelColor : hullColor
      const maps = role === 'accent' ? mapsAccent : role === 'panel' ? mapsPanel : mapsHull
      // Brighten slightly so metal maps don't crush Kenney silhouettes to black.
      const c = color.clone().offsetHSL(0, 0, 0.08)
      return new THREE.MeshStandardMaterial({
        color: c,
        metalness: 0.82,
        roughness: 0.42,
        envMapIntensity: 1.05,
        map: maps.map,
        normalMap: maps.normalMap,
        roughnessMap: maps.roughnessMap,
        metalnessMap: maps.metalnessMap,
        normalScale: maps.normalScale,
        side: THREE.DoubleSide
      })
    })
    o.material = replaced.length === 1 ? replaced[0] : replaced
  })
}

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

  const warm = colorRng() < 0.45
  const hue = warm ? 25 + colorRng() * 20 : 200 + colorRng() * 20
  // Brighter base so stations read against space, not as black lumps.
  const hullColor = new THREE.Color().setHSL(hue / 360, 0.1 + colorRng() * 0.12, 0.52 + colorRng() * 0.12)
  const accentColor = new THREE.Color().setHSL(((hue + 100 + colorRng() * 80) % 360) / 360, 0.45, 0.55)
  const panelColor = hullColor.clone().offsetHSL(0, 0, -0.1)
  tintMaterials(group, hullColor, accentColor, panelColor)
  addNavBeacons(group, colorRng() * Math.PI * 2)

  return group
}
