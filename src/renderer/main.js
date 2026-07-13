import * as THREE from 'three'
import { createScene } from './render/scene.js'
import { createStarfield } from './render/starfield.js'
import { createNebula, updateNebula } from './render/nebula.js'
import { buildShipMesh } from './render/shipMesh.js'
import { buildStationMeshForBody, updateStationMesh } from './render/stationMesh.js'
import { buildPlanetMesh } from './render/planetMesh.js'
import { buildStarMesh, updateStarMesh } from './render/starMesh.js'
import { buildAsteroidFieldMesh, getAsteroidRocks } from './render/asteroidFieldMesh.js'
import { buildProjectileMesh, buildImpactFlash } from './render/projectileMesh.js'
import { buildStationInteriorMesh } from './render/stationInterior.js'
import { buildWreckMesh, updateWreckMesh } from './render/wreckMesh.js'
import { syncMeshToEntity, syncChaseCamera } from './render/sceneSync.js'
import { createThrusterEffects } from './render/thrusterParticles.js'
import { createDamageEffects } from './render/damageEffects.js'
import { createGameState } from './game/state.js'
import { createInputState, createMouseAimState, updateFlight } from './game/flight.js'
import { updateSupercruise } from './game/supercruise.js'
import { spawnEncounterNear } from './game/spawner.js'
import { fireProjectile, updateProjectiles, updateNpcAI, updateCombatFlag, getShipCollisionRadius, truceActive } from './game/combat.js'
import { resolveBodyCollisions, collisionRadiusFor } from './game/collision.js'
import { mineRock, isRockAlive, rockDisplayName } from './game/mining.js'
import { pruneWrecks, lootWreck } from './game/wrecks.js'
import { markBodyVisited, markBodyProbed, updateMissionProgress } from './game/missions.js'
import { launchProbe } from './game/probe.js'
import { saveGame as persistSaveGame, loadGame as persistLoadGame, hasSave } from './game/save.js'
import { hyperspaceJump } from './game/hyperspace.js'
import { getSystem, findBody, coreFraction, canJumpTo } from './procgen/galaxy.js'
import { createHud } from './ui/hud.js'
import { createDockingUI } from './ui/dockingUI.js'
import { createMenu } from './ui/menu.js'
import { createPauseMenu } from './ui/pauseMenu.js'
import { createNavMap } from './ui/navMap.js'
import { createInventoryUI } from './ui/inventoryUI.js'
import { createDeathScreen } from './ui/deathScreen.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from './data/shipClasses.js'
import { getGood } from './data/goods.js'
import * as audio from './audio.js'

window.addEventListener('error', (e) => console.error('uncaught error:', e.message, e.error?.stack))

const DOCK_RANGE = 30
const DOCK_RANGE_COLLISION_MARGIN = 12
// Stations/settlements "200% bigger", then "another 150% bigger" (2.5x on
// top) per two rounds of user request; game/collision.js's fixed station/
// settlement collision radii are scaled by the same factor. (Was 1.5, then
// 4.5 — each pass still read as too small.)
const STATION_SCALE = 11.25
const PROBE_RANGE = 150
const MINING_TOAST_DURATION_S = 1.6
const FACTION_TOAST_DURATION_S = 4
const MINING_RANGE = 200
const MINING_TICK_INTERVAL_S = 0.4
const AMBIENT_SPAWN_INTERVAL_S = 90
const AMBIENT_NPC_CAP = 3
const RADAR_RANGE = 400
const IMPACT_FLASH_TTL = 0.25
const JUMP_DURATION_S = 1.1
const BASE_FOV = 60
const CRUISE_FOV = 78

const CROSSHAIR_DISTANCE = 80

const DOCK_ANIM_DURATION_S = 2.4
const DOCK_EXTERIOR_STANDOFF = 18
const UNDOCK_BACKOFF_DISTANCE = 70
const DOCK_FLASH_FADE_S = 0.4
const HYPERSPACE_FLASH_COLOR = '#eaffff'
const DOCK_FLASH_COLOR = '#4fc3d9'
// A dedicated coordinate region for the docking-bay interior, far enough
// from any system-local coordinates (which top out around 2200) that it can
// never overlap real flight space.
const DOCKING_BAY_ORIGIN = new THREE.Vector3(2_000_000, 0, 0)
const BAY_ENTRY_OFFSET = new THREE.Vector3(0, 0, -55)
const BAY_PARK_OFFSET = new THREE.Vector3(0, 0, 20)

const appEl = document.getElementById('app')
const { scene, camera, renderer } = createScene(appEl)
const starfield = createStarfield()
scene.add(starfield)
const nebula = createNebula()
scene.add(nebula)

const keys = createInputState()
const mouseAim = createMouseAimState()
const EMPTY_KEYS = new Set()
let flightMode = false
let laserFireHeld = false
let missileFireHeld = false
// Mining mode swaps laser control from manual/crosshair fire to an
// auto-firing beam locked onto the current target (see updateMiningBeam) —
// only meaningful while the target is an asteroid; toggled by KeyR.
let miningMode = false

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) laserFireHeld = true
  if (e.button === 2) missileFireHeld = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) laserFireHeld = false
  if (e.button === 2) missileFireHeld = false
})
// Right-click is used for missile fire, not the OS/browser context menu.
window.addEventListener('contextmenu', (e) => e.preventDefault())

function exitFlightMode() {
  flightMode = false
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
  // updateMiningBeam() (which would otherwise silence this itself) doesn't
  // run at all once paused/docked/nav-map-open, so a beam active right as
  // one of those starts would otherwise hum forever.
  audio.setMiningBeamActive(false)
}

// The mirror of exitFlightMode — called whenever a menu/popup that forced
// the mouse free (pause, nav map, docking, a probe result alert) closes
// again, so the player lands back in flight controls without having to
// press Space themselves. Same fire-and-forget pointer-lock request/catch
// pattern as the Space keydown handler below; if the browser refuses it
// (e.g. too long after the last user gesture), flightMode just settles back
// to false instead of throwing.
function reenterFlightMode() {
  flightMode = true
  renderer.domElement.requestPointerLock().catch((err) => {
    console.error('Pointer lock request failed:', err)
    flightMode = false
  })
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement) flightMode = false
})

let gameState = null
let playerShipClass = null
let playerMesh = null
let thrusterEffects = null
let damageEffects = null
let hud = null
let dockingUI = null
let pauseMenu = null
let navMap = null
let inventoryUI = null
let dockPromptEl = null
let probePromptEl = null
let wreckPromptEl = null
let miningToastEl = null
let miningToastUntil = 0
let factionToastEl = null
let factionToastUntil = 0
// Edge-detects "aliens just got wiped out/left while pirates were truced" —
// see the ambient-spawn block in animate() for the actual thank-you/cleanup.
let truceWasActive = false
let waypointEl = null
let crosshairEl = null
let targetIndicatorEl = null
// The player's current combat/scan target — { kind: 'npc'|'body'|'asteroid', id
// or (fieldId, index) } — set by the Tab key (see cycleTarget); never
// persisted, ships/bodies are looked up fresh each frame (see resolveTarget).
let currentTarget = null
let miningBeamMesh = null
let nextMiningTickAt = 0
let cruiseIndicatorEl = null
let miningModeIndicatorEl = null
let jumpFlashEl = null
let jumpEffect = null
let dockEffect = null
let dockedApproach = null
let interiorMesh = null
const npcMeshes = new Map()
const bodyMeshes = new Map()
const wreckMeshes = new Map()
// Moons visually orbit their parent planet — see loadBodiesForCurrentSystem
// (populates this) and the per-frame update near updateStarMesh below.
// Keyed by moon body id: { body, parentPosition, radius, angle0, y, speed }.
const moonOrbits = new Map()
let starMesh = null
const projectileMeshes = new Map()
const impactFlashes = []

function buildBodyMesh(body) {
  if (body.kind === 'planet' || body.kind === 'moon') return buildPlanetMesh(body)
  if (body.kind === 'asteroidField') return buildAsteroidFieldMesh(body)
  const mesh = buildStationMeshForBody(body)
  const settlementFactor = body.kind === 'settlement' ? 0.55 : 1
  // Reuses the existing per-body hash (see hashStringForOrbit below) for a
  // touch of +/-15% size variety, so stations aren't all uniformly sized.
  const variance = 0.85 + (hashStringForOrbit(body.id) % 1000) / 1000 * 0.3
  mesh.scale.setScalar(STATION_SCALE * settlementFactor * variance)
  return mesh
}

// Removes/clears whatever the previous system's bodies were, so this is
// safe to call on its own — callers don't have to remember to tear down the
// old system first (a caller that forgot was exactly how two systems' worth
// of stars/bodies could end up stacked in the same scene at once).
function loadBodiesForCurrentSystem() {
  if (starMesh) scene.remove(starMesh)
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  bodyMeshes.clear()
  moonOrbits.clear()
  currentTarget = null

  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  starMesh = buildStarMesh(currentSystem)
  scene.add(starMesh)
  for (const body of currentSystem.bodies) {
    const mesh = buildBodyMesh(body)
    mesh.position.fromArray(body.position)
    bodyMeshes.set(body.id, mesh)
    scene.add(mesh)

    if (body.kind === 'moon') {
      const parent = currentSystem.bodies.find((b) => b.id === body.parentId)
      if (parent) {
        const dx = body.position[0] - parent.position[0]
        const dz = body.position[2] - parent.position[2]
        const hash = hashStringForOrbit(body.id)
        moonOrbits.set(body.id, {
          body,
          parentPosition: parent.position,
          radius: Math.hypot(dx, dz),
          angle0: Math.atan2(dz, dx),
          y: body.position[1] - parent.position[1],
          speed: 0.05 + ((hash % 1000) / 1000) * 0.1
        })
      }
    }
  }
}

function hashStringForOrbit(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function ensureInteriorMesh() {
  if (!interiorMesh) {
    interiorMesh = buildStationInteriorMesh()
    interiorMesh.position.copy(DOCKING_BAY_ORIGIN)
  }
  return interiorMesh
}

// Docking swaps the whole exterior scene out for the bay interior (and back)
// rather than modeling a real interior per body — meshes are only
// removed/re-added, never rebuilt, so nothing is lost.
function swapToInterior() {
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  for (const mesh of npcMeshes.values()) scene.remove(mesh)
  for (const mesh of projectileMeshes.values()) scene.remove(mesh)
  for (const mesh of wreckMeshes.values()) scene.remove(mesh)
  for (const flash of impactFlashes) scene.remove(flash.mesh)
  if (starMesh) scene.remove(starMesh)
  scene.add(ensureInteriorMesh())
}

function swapToExterior() {
  scene.remove(ensureInteriorMesh())
  for (const mesh of bodyMeshes.values()) scene.add(mesh)
  for (const mesh of npcMeshes.values()) scene.add(mesh)
  for (const mesh of projectileMeshes.values()) scene.add(mesh)
  for (const mesh of wreckMeshes.values()) scene.add(mesh)
  for (const flash of impactFlashes) scene.add(flash.mesh)
  if (starMesh) scene.add(starMesh)
}

function quatFacing(fromPos, towardPos) {
  // Matrix4.lookAt follows the camera convention (local +Z points away from
  // the target), but ship forward is +Z, so eye/target are swapped here —
  // same convention used in combat.js and supercruise.js.
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(towardPos, fromPos, new THREE.Vector3(0, 1, 0)))
}

let docked = false
let paused = false
let navMapOpen = false
let inventoryOpen = false
let cruising = false
// Edge-detected in animate() to fire the supercruise engage/disengage voice
// callout exactly once per transition, regardless of whether cruising flips
// via the KeyC handler (manual) or the cruising block below (auto-arrival/
// combat-interrupt) — one check covers every trigger source.
let wasCruising = false
let nextAmbientSpawnAt = 0

let menuStarMesh = null
let menuAnimT = 0

// Real binary stars (see render/starMesh.js) are thousands of units across
// post-STAR_SIZE_SCALE — far too big for this tiny fixed-camera stage. Rather
// than a hardcoded shrink factor (which would need re-tuning every time
// STAR_SIZE_SCALE changes, as happened once already), the built mesh is
// measured with a bounding sphere and normalized to a fixed on-screen size —
// self-adjusting regardless of how big the underlying game-scale stars get.
// The scale still applies to the same pre-scale local coordinates
// updateStarMesh already animates in (orbit radius, spark positions, etc.),
// so nothing about that logic needs to know it's being shown shrunk down.
const MENU_STAR_DISPLAY_RADIUS = 26
// Fixed anchor point the binary pair sits at — the camera orbits this
// instead of the star itself moving, so "closer" just means a tighter
// MENU_ORBIT_RADIUS without needing to re-time any sweep.
const MENU_STAR_CENTER = new THREE.Vector3(0, -10, 40)

function startMenuBackground() {
  if (menuStarMesh) return
  menuStarMesh = buildStarMesh({ id: 'menu-binary-star' }, 'binary')
  const bounds = new THREE.Box3().setFromObject(menuStarMesh).getBoundingSphere(new THREE.Sphere())
  menuStarMesh.scale.setScalar(MENU_STAR_DISPLAY_RADIUS / bounds.radius)
  menuStarMesh.position.copy(MENU_STAR_CENTER)
  scene.add(menuStarMesh)
  menuAnimT = 0
  audio.playTitleMusic()
}

function stopMenuBackground() {
  if (menuStarMesh) scene.remove(menuStarMesh)
  menuStarMesh = null
  audio.stopTitleMusic()
}

const MENU_ORBIT_PERIOD_S = 42
const MENU_ORBIT_RADIUS = 48
const MENU_ORBIT_HEIGHT = 14
// The title text sits vertically centered on screen (#main-menu's flex
// centering), and camera.lookAt(MENU_STAR_CENTER) always puts the star dead
// center in frame regardless of MENU_STAR_CENTER's own world Y — so the star
// used to sit right behind the title no matter where it was placed in world
// space. Looking at a point above the star instead (rather than at the star
// itself) pushes the star's on-screen position down, clear of the text.
const MENU_LOOKAT_LIFT = 20
const menuLookAtTarget = MENU_STAR_CENTER.clone().add(new THREE.Vector3(0, MENU_LOOKAT_LIFT, 0))

function updateMenuBackground(dt) {
  if (!menuStarMesh) return
  menuAnimT += dt
  updateStarMesh(menuStarMesh, menuAnimT, dt, camera)
  // The star pair stays put; the camera slowly orbits around it instead of
  // a static camera watching it sweep past — reads as flying a lazy circle
  // around the binary rather than a one-shot flyby.
  const angle = (menuAnimT / MENU_ORBIT_PERIOD_S) * Math.PI * 2
  camera.position.set(
    MENU_STAR_CENTER.x + Math.cos(angle) * MENU_ORBIT_RADIUS,
    MENU_STAR_CENTER.y + MENU_ORBIT_HEIGHT,
    MENU_STAR_CENTER.z + Math.sin(angle) * MENU_ORBIT_RADIUS
  )
  camera.lookAt(menuLookAtTarget)
}

function doSave() {
  return persistSaveGame(gameState).then(
    () => alert('Game saved.'),
    (err) => alert(`Save failed: ${err.message}`)
  )
}

function onWeaponFired(weaponId) {
  audio.playWeaponFire(weaponId)
}

function onProjectileHit({ position, destroyed, mined }) {
  const flash = buildImpactFlash(mined ? 0xc2a35c : destroyed ? 0xff8a3d : 0xffcc66)
  flash.position.fromArray(position)
  if (mined?.destroyed) flash.scale.setScalar(1.4) // depleted rock exploding reads bigger than a regular mining ping
  scene.add(flash)
  impactFlashes.push({ mesh: flash, ttl: IMPACT_FLASH_TTL })

  if (mined) {
    audio.playMiningPing()
    if (mined.destroyed) audio.playExplosion()
    miningToastEl.textContent = mined.destroyed
      ? `${getGood(mined.goodId).name} deposit depleted!`
      : mined.mined
        ? `Mined 1 ${getGood(mined.goodId).name}`
        : 'Mining hold full!'
    miningToastEl.style.display = 'block'
    miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
  } else if (destroyed) {
    audio.playExplosion()
  } else {
    audio.playHit()
  }
}

// A constant unit-length beam (height 1, along local Y) rescaled/reoriented
// between the ship's laser hardpoint and the current target every frame
// while mining mode is auto-firing — same stretch-a-unit-shape technique
// used for the binary stars' old energy trail beam.
function buildMiningBeamMesh() {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 1, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  )
  beam.visible = false
  return beam
}

function isMiningHoldFull() {
  const hold = gameState.player.ship.miningHold
  const used = Object.values(hold).reduce((a, b) => a + b, 0)
  return used >= playerShipClass.stats.miningCapacity
}

// While mining mode is on and the current target is an asteroid in range,
// the laser auto-fires a continuous beam at it — no aiming, no held mouse
// button — ticking mineRock on a timer instead of spawning
// physical projectiles (there's nothing to travel or collide with; the beam
// always "hits" while active). Stops on its own once the hold is full, by
// simply never activating in that state (see isMiningHoldFull) rather than
// firing a doomed tick and spamming the "hold full" toast every interval.
function updateMiningBeam() {
  const target = resolveTarget()
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const inRange = target ? shipPos.distanceTo(new THREE.Vector3(...target.position)) <= MINING_RANGE : false
  const active = miningMode && flightMode && !cruising && target?.isAsteroid && inRange && !isMiningHoldFull()

  if (!active) {
    miningBeamMesh.visible = false
    audio.setMiningBeamActive(false)
    return
  }

  const laserHardpoint = playerShipClass.hardpoints.find((hp) => hp.type === 'laser') ?? playerShipClass.hardpoints[0]
  const quat = new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
  const origin = new THREE.Vector3(...laserHardpoint.position).applyQuaternion(quat).add(shipPos)
  const targetPos = new THREE.Vector3(...target.position)
  const delta = targetPos.clone().sub(origin)
  const length = delta.length()

  miningBeamMesh.visible = true
  audio.setMiningBeamActive(true)
  miningBeamMesh.position.copy(origin).addScaledVector(delta, 0.5)
  miningBeamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  miningBeamMesh.scale.set(1, length, 1)
  miningBeamMesh.material.opacity = 0.6 + 0.2 * Math.sin(gameState.simTime * 20)

  if (gameState.simTime >= nextMiningTickAt) {
    nextMiningTickAt = gameState.simTime + MINING_TICK_INTERVAL_S
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const mined = mineRock(gameState, playerShipClass, currentSystem, currentTarget.fieldId, currentTarget.index)
    onProjectileHit({ position: target.position, weaponType: 'laser', destroyed: false, mined })
  }
}

const deathScreen = createDeathScreen(appEl, () => returnToMenu())
const menu = createMenu(appEl, {
  onNewGame: ({ characterName, shipInstanceName }) => {
    startSession(
      createGameState({
        characterName,
        shipInstanceName,
        shipClassId: STARTER_SHIP_CLASS_ID,
        seed: Math.floor(Math.random() * 1e9)
      }),
      { enterFlightMode: true }
    )
  },
  onLoadGame: async () => {
    const loaded = await persistLoadGame()
    if (loaded) startSession(loaded)
    else menu.show(await hasSave())
  }
})

function clearSession() {
  if (playerMesh) scene.remove(playerMesh)
  if (thrusterEffects) scene.remove(thrusterEffects.group)
  thrusterEffects = null
  if (damageEffects) scene.remove(damageEffects.group)
  damageEffects = null
  if (miningBeamMesh) scene.remove(miningBeamMesh)
  miningBeamMesh = null
  miningMode = false
  for (const mesh of npcMeshes.values()) scene.remove(mesh)
  npcMeshes.clear()
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  bodyMeshes.clear()
  moonOrbits.clear()
  if (starMesh) scene.remove(starMesh)
  starMesh = null
  for (const mesh of projectileMeshes.values()) scene.remove(mesh)
  projectileMeshes.clear()
  for (const mesh of wreckMeshes.values()) scene.remove(mesh)
  wreckMeshes.clear()
  for (const flash of impactFlashes) scene.remove(flash.mesh)
  impactFlashes.length = 0
  hud?.element.remove()
  dockingUI?.element.remove()
  pauseMenu?.element.remove()
  navMap?.element.remove()
  inventoryUI?.element.remove()
  dockPromptEl?.remove()
  probePromptEl?.remove()
  wreckPromptEl?.remove()
  miningToastEl?.remove()
  factionToastEl?.remove()
  truceWasActive = false
  waypointEl?.remove()
  crosshairEl?.remove()
  targetIndicatorEl?.remove()
  currentTarget = null
  cruiseIndicatorEl?.remove()
  miningModeIndicatorEl?.remove()
  jumpFlashEl?.remove()
  if (interiorMesh) scene.remove(interiorMesh)
  audio.setThrustState(null)
  audio.setSupercruiseActive(false)
  audio.setMiningBeamActive(false)
  audio.stopAmbientMusic()
  camera.fov = BASE_FOV
  camera.updateProjectionMatrix()
  docked = false
  paused = false
  navMapOpen = false
  inventoryOpen = false
  cruising = false
  wasCruising = false
  jumpEffect = null
  dockEffect = null
  dockedApproach = null
  exitFlightMode()
}

function startSession(newGameState, { enterFlightMode = false } = {}) {
  clearSession()
  stopMenuBackground()
  gameState = newGameState
  playerShipClass = getShipClass(gameState.player.ship.classId)
  playerMesh = buildShipMesh(playerShipClass)
  scene.add(playerMesh)
  thrusterEffects = createThrusterEffects()
  scene.add(thrusterEffects.group)
  damageEffects = createDamageEffects()
  scene.add(damageEffects.group)
  miningBeamMesh = buildMiningBeamMesh()
  scene.add(miningBeamMesh)

  for (const npc of gameState.npcs) {
    const mesh = buildShipMesh(getShipClass(npc.shipClassId))
    npcMeshes.set(npc.id, mesh)
    scene.add(mesh)
  }
  loadBodiesForCurrentSystem()

  hud = createHud(appEl)
  dockingUI = createDockingUI(appEl, gameState, Math.random)
  pauseMenu = createPauseMenu(appEl, {
    onResume: () => {
      paused = false
      audio.setThrustState(null)
      reenterFlightMode()
    },
    onSave: () => doSave(),
    onRestart: () => {
      if (confirm('Return to main menu? Unsaved progress will be lost.')) {
        pauseMenu.hide()
        returnToMenu()
      }
    },
    onQuit: () => window.electronAPI.quitApp()
  })
  navMap = createNavMap(appEl, gameState)
  inventoryUI = createInventoryUI(appEl, gameState)

  dockPromptEl = document.createElement('div')
  dockPromptEl.id = 'dock-prompt'
  dockPromptEl.style.cssText =
    'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);font-family:monospace;color:#cfe3ff;background:rgba(10,14,24,0.8);padding:8px 16px;display:none;'
  appEl.appendChild(dockPromptEl)

  probePromptEl = document.createElement('div')
  probePromptEl.id = 'probe-prompt'
  probePromptEl.style.cssText =
    'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);font-family:monospace;color:#cfe3ff;background:rgba(10,14,24,0.8);padding:8px 16px;display:none;'
  appEl.appendChild(probePromptEl)

  wreckPromptEl = document.createElement('div')
  wreckPromptEl.id = 'wreck-prompt'
  wreckPromptEl.style.cssText =
    'position:fixed;bottom:240px;left:50%;transform:translateX(-50%);font-family:monospace;color:#ff8a3d;background:rgba(10,14,24,0.8);padding:8px 16px;display:none;'
  wreckPromptEl.textContent = 'Press F to salvage wreck'
  appEl.appendChild(wreckPromptEl)

  miningToastEl = document.createElement('div')
  miningToastEl.id = 'mining-toast'
  miningToastEl.style.cssText =
    'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);font-family:monospace;color:#c2a35c;background:rgba(10,14,24,0.85);padding:8px 16px;display:none;'
  appEl.appendChild(miningToastEl)

  factionToastEl = document.createElement('div')
  factionToastEl.id = 'faction-toast'
  factionToastEl.style.cssText =
    'position:fixed;bottom:200px;left:50%;transform:translateX(-50%);font-family:monospace;color:#7fe0a0;background:rgba(10,14,24,0.85);padding:8px 16px;display:none;'
  appEl.appendChild(factionToastEl)

  waypointEl = document.createElement('div')
  waypointEl.id = 'waypoint-indicator'
  waypointEl.style.cssText = 'position:fixed;pointer-events:none;display:none;'
  waypointEl.innerHTML = `
    <div class="wp-arrow" style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:16px solid #7fe0a0;margin:0 auto;"></div>
    <div class="wp-label" style="margin-top:4px;font-family:monospace;color:#7fe0a0;font-size:11px;background:rgba(10,14,24,0.75);padding:2px 6px;white-space:nowrap;text-align:center;"></div>
  `
  appEl.appendChild(waypointEl)

  crosshairEl = document.createElement('div')
  crosshairEl.id = 'crosshair'
  crosshairEl.style.cssText =
    'position:fixed;pointer-events:none;display:none;transform:translate(-50%,-50%);width:16px;height:16px;'
  crosshairEl.innerHTML = `
    <div style="position:absolute;inset:0;border:1.5px solid #7fe0a0;border-radius:50%;opacity:0.85;"></div>
    <div style="position:absolute;left:50%;top:50%;width:3px;height:3px;background:#7fe0a0;transform:translate(-50%,-50%);border-radius:50%;"></div>
  `
  appEl.appendChild(crosshairEl)

  targetIndicatorEl = document.createElement('div')
  targetIndicatorEl.id = 'target-indicator'
  targetIndicatorEl.style.cssText =
    'position:fixed;pointer-events:none;display:none;transform:translate(-50%,-50%);width:56px;height:56px;'
  targetIndicatorEl.innerHTML = `
    <div class="target-box" style="position:absolute;inset:0;border:2px solid #cfe3ff;"></div>
    <div class="target-label" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;font-family:monospace;font-size:11px;color:#cfe3ff;background:rgba(10,14,24,0.75);padding:2px 6px;white-space:nowrap;text-align:center;"></div>
  `
  appEl.appendChild(targetIndicatorEl)

  cruiseIndicatorEl = document.createElement('div')
  cruiseIndicatorEl.id = 'cruise-indicator'
  cruiseIndicatorEl.textContent = 'SUPERCRUISE ENGAGED'
  cruiseIndicatorEl.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);font-family:monospace;letter-spacing:2px;color:#7fe0a0;background:rgba(10,14,24,0.7);padding:6px 16px;display:none;'
  appEl.appendChild(cruiseIndicatorEl)

  // Top-left (not top-center like cruiseIndicatorEl) since mining mode is
  // just a standing toggle independent of supercruise — both could be on
  // at once (the beam simply won't fire while cruising).
  miningModeIndicatorEl = document.createElement('div')
  miningModeIndicatorEl.id = 'mining-mode-indicator'
  miningModeIndicatorEl.textContent = 'MINING MODE'
  miningModeIndicatorEl.style.cssText =
    'position:fixed;top:16px;left:16px;font-family:monospace;letter-spacing:2px;color:#ffb347;background:rgba(10,14,24,0.7);padding:6px 16px;display:none;'
  appEl.appendChild(miningModeIndicatorEl)

  // Reused for both the hyperspace punch and the dock/undock transition —
  // background color is set explicitly wherever each effect triggers.
  jumpFlashEl = document.createElement('div')
  jumpFlashEl.id = 'jump-flash'
  jumpFlashEl.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;display:none;'
  appEl.appendChild(jumpFlashEl)

  nextAmbientSpawnAt = gameState.simTime + AMBIENT_SPAWN_INTERVAL_S
  audio.startAmbientMusic()

  // Only a brand new game defaults into flight mode — per user request, not
  // a loaded save, which resumes however the player last left it (paused,
  // docked, etc. are all reset to the flying state regardless, but there's
  // no reason to force the mouse captured the instant a load finishes).
  if (enterFlightMode) reenterFlightMode()
}

function returnToMenu() {
  clearSession()
  gameState = null
  startMenuBackground()
  hasSave().then((exists) => menu.show(exists))
}

// Stations and settlements are always dockable (they *are* the base). A bare
// planet/moon is only dockable if it happens to have a base — reusing
// hasMissions as that flag, since a body only ever gets a mission board if
// it has one. Asteroid fields never have a base.
function isDockable(body) {
  if (body.kind === 'station' || body.kind === 'settlement') return true
  if (body.kind === 'planet' || body.kind === 'moon') return body.hasMissions
  return false
}

// The collision shell around a body (its physical radius + the ship's own)
// can exceed the flat DOCK_RANGE for large planets/ships, which would make
// docking physically unreachable — widen the range per body so it's always
// comfortably outside that shell.
function dockRangeFor(body) {
  const bodyRadius = collisionRadiusFor(body) ?? 0
  return Math.max(DOCK_RANGE, bodyRadius + getShipCollisionRadius(playerShipClass) + DOCK_RANGE_COLLISION_MARGIN)
}

function findNearbyDockableBody() {
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  let nearest = null
  let nearestDist = Infinity
  for (const body of currentSystem.bodies) {
    if (!isDockable(body)) continue
    const dist = playerPos.distanceTo(new THREE.Vector3().fromArray(body.position))
    if (dist < dockRangeFor(body) && dist < nearestDist) {
      nearest = body
      nearestDist = dist
    }
  }
  return nearest
}

const LOOT_RANGE = 50

function findNearbyWreck() {
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  let nearest = null
  let nearestDist = Infinity
  for (const wreck of gameState.wrecks) {
    const dist = playerPos.distanceTo(new THREE.Vector3().fromArray(wreck.position))
    if (dist < LOOT_RANGE && dist < nearestDist) {
      nearest = wreck
      nearestDist = dist
    }
  }
  return nearest
}

function lootNearbyWreck(wreck) {
  const loot = lootWreck(gameState, playerShipClass, wreck.id)
  audio.playClick()
  const parts = loot.cargo ? Object.entries(loot.cargo).map(([id, qty]) => `${qty} ${getGood(id).name}`).join(', ') : ''
  const partsMsg = loot.shipParts ? `${parts ? ' and ' : ''}${loot.shipParts} Ship Part${loot.shipParts > 1 ? 's' : ''}` : ''
  miningToastEl.textContent = `Salvaged ${parts}${partsMsg} from the wreck`
  miningToastEl.style.display = 'block'
  miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
}

function isProbeable(body) {
  return body.kind === 'planet' || body.kind === 'moon' || body.kind === 'asteroidField'
}

function findNearbyProbeableBody() {
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  let nearest = null
  let nearestDist = Infinity
  for (const body of currentSystem.bodies) {
    if (!isProbeable(body)) continue
    const dist = playerPos.distanceTo(new THREE.Vector3().fromArray(body.position))
    if (dist < PROBE_RANGE && dist < nearestDist) {
      nearest = body
      nearestDist = dist
    }
  }
  return nearest
}

function probeBody(body) {
  const missionHere = gameState.missions.active.find(
    (m) => m.type === 'probe' && !m.objectiveComplete && m.target.bodyId === body.id
  )
  markBodyProbed(gameState, body.id)
  updateMissionProgress(gameState)

  const result = launchProbe(gameState, playerShipClass, Math.random)
  audio.playClick()

  const messages = []
  if (missionHere) {
    const giver = findBody(gameState.galaxy, missionHere.giverStationId)
    messages.push(`Mission data acquired! Return to ${giver?.name ?? 'the mission giver'} to turn it in.`)
  }
  if (result.found && result.stored) messages.push(`Probe found valuable survey data at ${body.name}! Added to cargo — sell it at any station.`)
  else if (result.found) messages.push(`Probe found valuable survey data at ${body.name}, but your cargo hold is full!`)
  else if (!missionHere) messages.push(`Probe found nothing of interest at ${body.name}.`)
  const wasFlying = flightMode
  alert(messages.join('\n'))
  // The native alert() dialog itself releases pointer lock (the existing
  // pointerlockchange listener already flips flightMode off when that
  // happens) — restore it once the dialog closes, same as every other
  // menu/popup that forces the mouse free.
  if (wasFlying) reenterFlightMode()
}

// The chase camera sits behind+above the ship via lookAt() with a world-up
// vector. For a camera to stay right-side-up while its view direction
// matches the ship's forward, its own "right" ends up equal to the ship's
// LOCAL -X (a forced consequence of the camera's -Z-forward convention vs.
// the ship's +Z-forward convention — proven by comparing camera.matrixWorld's
// right-vector column against the ship's local +X under this setup). So
// ship-local +X actually renders on screen-left, not screen-right; negate x
// here so radar "right" matches what the player actually sees on screen.
function computeRadarContacts() {
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const shipQuatInverse = new THREE.Quaternion().fromArray(gameState.player.ship.quaternion).invert()
  const contacts = []

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    const rel = new THREE.Vector3().fromArray(npc.position).sub(shipPos)
    if (rel.length() > RADAR_RANGE) continue
    rel.applyQuaternion(shipQuatInverse)
    contacts.push({ x: -rel.x, z: rel.z, kind: isHostileToPlayer(npc) ? 'hostile' : 'neutral' })
  }

  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  for (const body of currentSystem.bodies) {
    const rel = new THREE.Vector3().fromArray(body.position).sub(shipPos)
    if (rel.length() > RADAR_RANGE) continue
    rel.applyQuaternion(shipQuatInverse)
    contacts.push({ x: -rel.x, z: rel.z, kind: body.id === gameState.player.waypointBodyId ? 'waypoint' : 'body' })
  }

  for (const wreck of gameState.wrecks) {
    const rel = new THREE.Vector3().fromArray(wreck.position).sub(shipPos)
    if (rel.length() > RADAR_RANGE) continue
    rel.applyQuaternion(shipQuatInverse)
    contacts.push({ x: -rel.x, z: rel.z, kind: 'wreck' })
  }

  return contacts
}

function handleJump(targetSystemId) {
  // Validate up front so we don't play the animation just to fail partway
  // through; hyperspaceJump re-checks these itself as the safety net.
  if (gameState.inCombat) {
    alert('Cannot hyperspace while in combat.')
    return
  }
  if (targetSystemId === gameState.player.currentSystemId) {
    alert('Already in that system.')
    return
  }
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!canJumpTo(currentSystem, targetSystemId)) {
    alert('Out of hyperspace range — jump via a neighboring system first.')
    return
  }
  navMapOpen = false
  navMap.hide()
  jumpEffect = { elapsed: 0, targetSystemId, jumped: false }
  jumpFlashEl.style.background = HYPERSPACE_FLASH_COLOR
  jumpFlashEl.style.display = 'block'
  audio.playHyperspace()
  audio.announce('Hyperdrive engaged')
}

function updateJumpEffect(dt) {
  syncChaseCamera(camera, gameState.player.ship)
  jumpEffect.elapsed += dt
  const t = Math.min(jumpEffect.elapsed / JUMP_DURATION_S, 1)
  const punch = Math.sin(t * Math.PI)
  camera.fov = BASE_FOV + punch * 55
  camera.updateProjectionMatrix()
  jumpFlashEl.style.opacity = String(Math.min(1, punch * 1.4))

  if (jumpEffect.elapsed >= JUMP_DURATION_S / 2 && !jumpEffect.jumped) {
    jumpEffect.jumped = true
    try {
      hyperspaceJump(gameState, jumpEffect.targetSystemId, Math.random)
      for (const mesh of npcMeshes.values()) scene.remove(mesh)
      npcMeshes.clear()
      for (const mesh of bodyMeshes.values()) scene.remove(mesh)
      bodyMeshes.clear()
      if (starMesh) scene.remove(starMesh)
      starMesh = null
      for (const mesh of projectileMeshes.values()) scene.remove(mesh)
      projectileMeshes.clear()
      for (const mesh of wreckMeshes.values()) scene.remove(mesh)
      wreckMeshes.clear()
      for (const flash of impactFlashes) scene.remove(flash.mesh)
      impactFlashes.length = 0
      for (const npc of gameState.npcs) {
        const mesh = buildShipMesh(getShipClass(npc.shipClassId))
        npcMeshes.set(npc.id, mesh)
        scene.add(mesh)
      }
      loadBodiesForCurrentSystem()
    } catch (err) {
      alert(err.message)
      jumpEffect = null
      jumpFlashEl.style.display = 'none'
      camera.fov = BASE_FOV
      camera.updateProjectionMatrix()
      return
    }
  }

  if (jumpEffect && jumpEffect.elapsed >= JUMP_DURATION_S) {
    jumpEffect = null
    jumpFlashEl.style.display = 'none'
    audio.playHyperspaceArrival()
    audio.announce('Hyperdrive disengaged')
    camera.fov = BASE_FOV
    camera.updateProjectionMatrix()
  }
}

function dock(body) {
  docked = true
  audio.setThrustState(null)
  markBodyVisited(gameState, body.id)
  // Shields regenerate on their own anyway (see combat.js's regenShields) —
  // docking just tops them off instantly and for free, since only hull/armor
  // repair costs credits in the shipyard.
  gameState.player.ship.shields = playerShipClass.stats.shields
  dockPromptEl.style.display = 'none'
  dockingUI.show(body, () => beginUndocking())
}

// Docking/undocking is a scripted two-half animation: fly from wherever the
// ship is to just outside the body, swap the whole exterior scene for the
// bay interior behind a brief flash (masking the cut), then glide to the
// parked spot. Undocking reverses the same path. dockedApproach remembers
// the original approach vector/point so the reverse trip lines up.
function beginDocking(body) {
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const bodyPos = new THREE.Vector3(...body.position)
  const approachDir = bodyPos.clone().sub(shipPos).normalize()
  const exteriorPoint = bodyPos.clone().addScaledVector(approachDir, -DOCK_EXTERIOR_STANDOFF)

  dockedApproach = { body, exteriorPoint, approachDir }
  dockEffect = {
    undocking: false,
    elapsed: 0,
    body,
    swapped: false,
    fromPos: shipPos,
    fromQuat: new THREE.Quaternion().fromArray(gameState.player.ship.quaternion),
    exteriorPoint,
    facingQuat: quatFacing(exteriorPoint, bodyPos)
  }
  gameState.player.ship.velocity = [0, 0, 0]
  audio.setThrustState(null)
  exitFlightMode()
  dockPromptEl.style.display = 'none'
  probePromptEl.style.display = 'none'
  jumpFlashEl.style.background = DOCK_FLASH_COLOR
  jumpFlashEl.style.opacity = '0'
  jumpFlashEl.style.display = 'block'
  audio.playDock()
}

function beginUndocking() {
  if (!dockedApproach) {
    docked = false
    return
  }
  const { exteriorPoint, approachDir, body } = dockedApproach
  dockEffect = {
    undocking: true,
    elapsed: 0,
    body,
    swapped: false,
    exteriorPoint,
    awayQuat: quatFacing(exteriorPoint, exteriorPoint.clone().addScaledVector(approachDir, -1)),
    backAwayPoint: exteriorPoint.clone().addScaledVector(approachDir, -UNDOCK_BACKOFF_DISTANCE)
  }
  jumpFlashEl.style.background = DOCK_FLASH_COLOR
  jumpFlashEl.style.opacity = '0'
  jumpFlashEl.style.display = 'block'
  audio.playUndock()
  // Requested here (immediately, as a direct continuation of the Undock
  // button click) rather than when the animation finishes a couple seconds
  // later — flightMode is harmless while dockEffect is active (updateFlight
  // never runs during it), and Chromium's pointer-lock grant needs a live
  // user gesture, which a requestAnimationFrame callback well after the
  // click no longer has.
  reenterFlightMode()
}

function updateDockEffect(dt) {
  dockEffect.elapsed += dt
  const half = DOCK_ANIM_DURATION_S / 2

  if (!dockEffect.undocking) {
    if (dockEffect.elapsed < half) {
      const lt = dockEffect.elapsed / half
      gameState.player.ship.position = dockEffect.fromPos.clone().lerp(dockEffect.exteriorPoint, lt).toArray()
      gameState.player.ship.quaternion = dockEffect.fromQuat.clone().slerp(dockEffect.facingQuat, lt).toArray()
    } else {
      if (!dockEffect.swapped) {
        dockEffect.swapped = true
        swapToInterior()
        gameState.player.ship.quaternion = [0, 0, 0, 1]
      }
      const lt = Math.min(1, (dockEffect.elapsed - half) / half)
      const entry = DOCKING_BAY_ORIGIN.clone().add(BAY_ENTRY_OFFSET)
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      gameState.player.ship.position = entry.lerp(park, lt).toArray()
    }
  } else {
    if (dockEffect.elapsed < half) {
      const lt = dockEffect.elapsed / half
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      const entry = DOCKING_BAY_ORIGIN.clone().add(BAY_ENTRY_OFFSET)
      gameState.player.ship.position = park.clone().lerp(entry, lt).toArray()
    } else {
      if (!dockEffect.swapped) {
        dockEffect.swapped = true
        swapToExterior()
        gameState.player.ship.position = dockEffect.exteriorPoint.toArray()
        gameState.player.ship.quaternion = dockEffect.awayQuat.toArray()
      }
      const lt = Math.min(1, (dockEffect.elapsed - half) / half)
      gameState.player.ship.position = dockEffect.exteriorPoint.clone().lerp(dockEffect.backAwayPoint, lt).toArray()
    }
  }

  syncMeshToEntity(playerMesh, gameState.player.ship)
  syncChaseCamera(camera, gameState.player.ship)

  const sinceSwap = dockEffect.elapsed - half
  if (sinceSwap >= 0) jumpFlashEl.style.opacity = String(Math.max(0, 1 - sinceSwap / DOCK_FLASH_FADE_S))

  if (dockEffect.elapsed >= DOCK_ANIM_DURATION_S) {
    jumpFlashEl.style.display = 'none'
    if (!dockEffect.undocking) {
      const finishedBody = dockEffect.body
      dockEffect = null
      dock(finishedBody)
    } else {
      gameState.player.ship.velocity = [0, 0, 0]
      dockEffect = null
      docked = false
      dockedApproach = null
    }
  }
}

function handlePlayerDeath() {
  const summary = {
    characterName: gameState.player.name,
    credits: gameState.player.credits,
    reputation: gameState.player.reputation,
    cause: 'Ship destroyed in combat'
  }
  audio.playExplosion()
  clearSession()
  audio.playDeathMusic()
  gameState = null
  deathScreen.show(summary)
}

window.addEventListener('keydown', (e) => {
  if (!gameState) return
  if (e.code === 'KeyF' && !docked && !dockEffect && !navMapOpen && !paused && !inventoryOpen) {
    const body = findNearbyDockableBody()
    if (body) {
      beginDocking(body)
    } else {
      const wreck = findNearbyWreck()
      if (wreck) lootNearbyWreck(wreck)
    }
  } else if (e.code === 'KeyP' && !docked && !navMapOpen && !paused && !inventoryOpen) {
    const body = findNearbyProbeableBody()
    if (body) probeBody(body)
  } else if (e.code === 'F5') {
    e.preventDefault()
    doSave()
  } else if (e.code === 'Escape' && !docked && !navMapOpen && !inventoryOpen) {
    paused = !paused
    audio.setThrustState(null)
    if (paused) {
      exitFlightMode()
      pauseMenu.show()
    } else {
      pauseMenu.hide()
      reenterFlightMode()
    }
  } else if (e.code === 'KeyM' && !docked && !paused && !inventoryOpen) {
    navMapOpen = !navMapOpen
    audio.setThrustState(null)
    if (navMapOpen) {
      exitFlightMode()
      navMap.show({ onJump: handleJump, onClose: () => { navMapOpen = false; reenterFlightMode() } })
    } else {
      navMap.hide()
      reenterFlightMode()
    }
  } else if (e.code === 'KeyC' && !docked && !navMapOpen && !paused && !inventoryOpen) {
    if (cruising) {
      cruising = false
    } else if (!gameState.player.waypointBodyId) {
      alert('Set a waypoint (Navigation > Current System) before engaging supercruise.')
    } else if (gameState.inCombat) {
      alert('Cannot engage supercruise while in combat.')
    } else {
      cruising = true
    }
  } else if (e.code === 'Space' && !docked && !dockEffect && !navMapOpen && !paused && !inventoryOpen) {
    flightMode = !flightMode
    if (flightMode) {
      // If the lock request fails, resolve flightMode immediately rather
      // than waiting on an uncertain-timing pointerlockchange event.
      renderer.domElement.requestPointerLock().catch((err) => {
        console.error('Pointer lock request failed:', err)
        flightMode = false
      })
    } else {
      document.exitPointerLock()
    }
  } else if (e.code === 'Tab' && !docked && !navMapOpen && !paused && !inventoryOpen) {
    e.preventDefault()
    cycleTarget()
  } else if (e.code === 'KeyR' && !docked && !navMapOpen && !paused && !inventoryOpen) {
    miningMode = !miningMode
  } else if (e.code === 'KeyI' && !docked && !navMapOpen && !paused) {
    inventoryOpen = !inventoryOpen
    audio.setThrustState(null)
    if (inventoryOpen) {
      exitFlightMode()
      inventoryUI.show(() => { inventoryOpen = false; reenterFlightMode() })
    } else {
      inventoryUI.hide()
      reenterFlightMode()
    }
  }
})

// Ships, stations/settlements, and individual asteroids within a field are
// targetable; planets and moons are deliberately excluded (per design —
// they're never a combat or scan target, only dock/probe candidates). Only
// entities within TARGET_RANGE are considered, same range as the radar.
const TARGET_RANGE = RADAR_RANGE

function asteroidWorldPosition(field, rock) {
  return [field.position[0] + rock.position[0], field.position[1] + rock.position[1], field.position[2] + rock.position[2]]
}

// Aliens are always hostile to the player; pirates are too, except while
// truced against a shared alien threat (see combat.js's truceActive) — used
// for both the radar dot color and the target-indicator reticle tint.
function isHostileToPlayer(npc) {
  return npc.faction === 'alien' || (npc.faction === 'pirate' && !truceActive(gameState))
}

function getTargetableEntities() {
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const entities = []

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(npc.position))
    if (dist <= TARGET_RANGE) entities.push({ kind: 'npc', id: npc.id, position: npc.position, dist })
  }

  for (const wreck of gameState.wrecks) {
    const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(wreck.position))
    if (dist <= TARGET_RANGE) entities.push({ kind: 'wreck', id: wreck.id, position: wreck.position, dist })
  }

  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  for (const body of currentSystem.bodies) {
    if (body.kind === 'station' || body.kind === 'settlement') {
      const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(body.position))
      if (dist <= TARGET_RANGE) entities.push({ kind: 'body', id: body.id, position: body.position, dist })
    } else if (body.kind === 'asteroidField') {
      getAsteroidRocks(body).forEach((rock, index) => {
        if (!isRockAlive(gameState, body.id, index)) return
        const position = asteroidWorldPosition(body, rock)
        const dist = shipPos.distanceTo(new THREE.Vector3(...position))
        if (dist <= TARGET_RANGE) entities.push({ kind: 'asteroid', fieldId: body.id, index, position, dist })
      })
    }
  }

  return entities
}

// Asteroid entries are identified by (fieldId, index) rather than a single
// id, since one field body produces many targetable rocks.
function sameTarget(a, b) {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'asteroid' ? a.fieldId === b.fieldId && a.index === b.index : a.id === b.id
}

function toTargetRef(entity) {
  return entity.kind === 'asteroid' ? { kind: 'asteroid', fieldId: entity.fieldId, index: entity.index } : { kind: entity.kind, id: entity.id }
}

// First press (or if the current target's gone) locks onto whatever's
// closest to the ship's actual forward vector (a forgiving cone, not a
// precise raycast) — i.e. "what's under the crosshair", since the crosshair
// itself just projects that same forward vector. Subsequent presses cycle
// to the next-nearest targetable entity by distance, wrapping around.
function cycleTarget() {
  const entities = getTargetableEntities()
  if (entities.length === 0) {
    currentTarget = null
    return
  }

  const stillValid = currentTarget && entities.some((e) => sameTarget(e, currentTarget))
  if (!stillValid) {
    const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(gameState.player.ship.quaternion))
    let best = null
    let bestDot = 0.94 // roughly a 20deg cone around the crosshair
    for (const e of entities) {
      const dir = new THREE.Vector3().fromArray(e.position).sub(shipPos).normalize()
      const dot = dir.dot(forward)
      if (dot > bestDot) {
        bestDot = dot
        best = e
      }
    }
    currentTarget = best ? toTargetRef(best) : null
    return
  }

  entities.sort((a, b) => a.dist - b.dist)
  const idx = entities.findIndex((e) => sameTarget(e, currentTarget))
  const next = entities[(idx + 1) % entities.length]
  currentTarget = toTargetRef(next)
}

// Looks the current target up fresh each frame (never cached), so a
// destroyed NPC target correctly resolves to null instead of a stale
// position. isAsteroid drives both the mining-beam auto-fire eligibility
// (updateMiningBeam) and the reticle's amber tint (updateTargetIndicator).
function resolveTarget() {
  if (!currentTarget) return null
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (currentTarget.kind === 'npc') {
    const npc = gameState.npcs.find((n) => n.id === currentTarget.id && !n.destroyed)
    if (!npc) return null
    const shipClass = getShipClass(npc.shipClassId)
    return { position: npc.position, name: shipClass.name, hostile: isHostileToPlayer(npc), hullPct: Math.max(0, npc.hull / shipClass.stats.hull), isAsteroid: false }
  }
  if (currentTarget.kind === 'wreck') {
    const wreck = gameState.wrecks.find((w) => w.id === currentTarget.id)
    return wreck ? { position: wreck.position, name: 'Wreck', hostile: false, hullPct: null, isAsteroid: false } : null
  }
  if (currentTarget.kind === 'asteroid') {
    const field = currentSystem.bodies.find((b) => b.id === currentTarget.fieldId)
    if (!field) return null
    const rock = getAsteroidRocks(field)[currentTarget.index]
    if (!rock || !isRockAlive(gameState, field.id, currentTarget.index)) return null
    return { position: asteroidWorldPosition(field, rock), name: `${rockDisplayName(currentSystem)} (${field.name})`, hostile: false, hullPct: null, isAsteroid: true }
  }
  const body = currentSystem.bodies.find((b) => b.id === currentTarget.id)
  return body ? { position: body.position, name: body.name, hostile: false, hullPct: null, isAsteroid: false } : null
}

function updateTargetIndicator() {
  const target = resolveTarget()
  if (!target) {
    currentTarget = null
    targetIndicatorEl.style.display = 'none'
    return
  }

  const projected = new THREE.Vector3(...target.position).project(camera)
  if (projected.z > 1) {
    targetIndicatorEl.style.display = 'none'
    return
  }

  targetIndicatorEl.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`
  targetIndicatorEl.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`
  targetIndicatorEl.style.display = 'block'
  const color = target.hostile ? '#e05a5a' : target.isAsteroid ? '#ffb347' : '#cfe3ff'
  targetIndicatorEl.querySelector('.target-box').style.borderColor = color
  const label = targetIndicatorEl.querySelector('.target-label')
  label.style.color = color
  const dist = new THREE.Vector3().fromArray(gameState.player.ship.position).distanceTo(new THREE.Vector3(...target.position))
  label.textContent = target.hullPct !== null ? `${target.name} · ${Math.round(dist)}m · ${Math.round(target.hullPct * 100)}%` : `${target.name} · ${Math.round(dist)}m`
}

// Shows exactly where the ship is currently pointing (and thus where fixed
// hardpoints will shoot) — projected the same way updateWaypointIndicator
// projects the waypoint arrow, just for a point a fixed distance ahead of
// the ship instead of a distant body.
function updateCrosshair() {
  crosshairEl.style.display = flightMode ? 'block' : 'none'
  if (!flightMode) return

  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const quat = new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
  const aimPoint = shipPos.addScaledVector(forward, CROSSHAIR_DISTANCE)
  const projected = aimPoint.project(camera)
  if (projected.z > 1) return

  crosshairEl.style.left = `${(projected.x * 0.5 + 0.5) * window.innerWidth}px`
  crosshairEl.style.top = `${(-projected.y * 0.5 + 0.5) * window.innerHeight}px`
}

function updateWaypointIndicator() {
  const bodyId = gameState.player.waypointBodyId
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  const body = bodyId ? currentSystem.bodies.find((b) => b.id === bodyId) : null
  if (!body) {
    waypointEl.style.display = 'none'
    return
  }

  const targetPos = new THREE.Vector3(...body.position)
  const projected = targetPos.clone().project(camera)
  const behind = projected.z > 1
  const w = window.innerWidth
  const h = window.innerHeight
  let x = (projected.x * 0.5 + 0.5) * w
  let y = (-projected.y * 0.5 + 0.5) * h
  if (behind) {
    x = w - x
    y = h - y
  }

  const cx = w / 2
  const cy = h / 2
  let dx = x - cx || 0.0001
  let dy = y - cy || 0.0001
  const margin = 60
  const scale = Math.min((w / 2 - margin) / Math.abs(dx), (h / 2 - margin) / Math.abs(dy))
  if (scale < 1 || behind) {
    dx *= scale
    dy *= scale
  }

  const angle = Math.atan2(dy, dx) + Math.PI / 2
  waypointEl.style.left = `${cx + dx}px`
  waypointEl.style.top = `${cy + dy}px`
  waypointEl.style.transform = 'translate(-50%, -50%)'
  waypointEl.style.display = 'block'
  waypointEl.querySelector('.wp-arrow').style.transform = `rotate(${angle}rad)`
  const distance = new THREE.Vector3().fromArray(gameState.player.ship.position).distanceTo(targetPos)
  waypointEl.querySelector('.wp-label').textContent = `${body.name} · ${Math.round(distance)}m`
}

let lastTime = performance.now()
function animate() {
  requestAnimationFrame(animate)
  const now = performance.now()
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  // Both are fixed-radius point/sprite clouds scattered around world origin
  // at creation time — recentering them on the camera every frame turns them
  // into a proper skybox that always surrounds the viewer, rather than a
  // patch of decoration the camera can fly outside of once it's traveled
  // far enough from the origin (now routine given how large systems are).
  starfield.position.copy(camera.position)
  nebula.position.copy(camera.position)
  updateNebula(nebula, dt)

  if (!gameState) {
    updateMenuBackground(dt)
    renderer.render(scene, camera)
    return
  }

  if (jumpEffect) {
    updateJumpEffect(dt)
    renderer.render(scene, camera)
    return
  }

  // Checked before the `docked` early-return below: docked stays true for
  // the whole undocking animation (it only flips false once the animation
  // completes), so this branch must run regardless of `docked`.
  if (dockEffect) {
    updateDockEffect(dt)
    renderer.render(scene, camera)
    return
  }

  if (docked || paused || navMapOpen || inventoryOpen) {
    renderer.render(scene, camera)
    return
  }

  gameState.simTime += dt

  let thrustState = null
  if (cruising) {
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const waypointBody = currentSystem.bodies.find((b) => b.id === gameState.player.waypointBodyId)
    if (!waypointBody || gameState.inCombat) {
      cruising = false
    } else if (updateSupercruise(gameState.player.ship, playerShipClass, waypointBody.position, dt)) {
      cruising = false
    }
    audio.setThrustState(null)
  } else {
    updateFlight(gameState.player.ship, playerShipClass, flightMode ? keys : EMPTY_KEYS, mouseAim, dt)
    thrustState = !flightMode ? null : keys.has('KeyW') ? 'accel' : keys.has('KeyS') ? 'brake' : null
    audio.setThrustState(thrustState)
  }
  audio.setSupercruiseActive(cruising)
  if (cruising !== wasCruising) {
    audio.announce(cruising ? 'Supercruise engaged' : 'Supercruise disengaged')
    wasCruising = cruising
  }

  resolveBodyCollisions(
    gameState.player.ship,
    getSystem(gameState.galaxy, gameState.player.currentSystemId).bodies,
    getShipCollisionRadius(playerShipClass)
  )

  camera.fov += ((cruising ? CRUISE_FOV : BASE_FOV) - camera.fov) * Math.min(1, dt * 3)
  camera.updateProjectionMatrix()
  if (cruising) {
    const pulse = 0.6 + 0.4 * Math.sin(gameState.simTime * 6)
    cruiseIndicatorEl.style.opacity = pulse.toFixed(2)
    cruiseIndicatorEl.style.display = 'block'
  } else {
    cruiseIndicatorEl.style.display = 'none'
  }
  miningModeIndicatorEl.style.display = miningMode ? 'block' : 'none'
  syncMeshToEntity(playerMesh, gameState.player.ship)
  thrusterEffects.update(dt, {
    accelActive: thrustState === 'accel',
    brakeActive: thrustState === 'brake',
    cruiseActive: cruising,
    shipPos: new THREE.Vector3().fromArray(gameState.player.ship.position),
    shipQuat: new THREE.Quaternion().fromArray(gameState.player.ship.quaternion),
    hullLength: playerShipClass.hull.length
  })
  damageEffects.update(dt, {
    armorFraction: gameState.player.ship.armor / playerShipClass.stats.armor,
    hullFraction: gameState.player.ship.hull / playerShipClass.stats.hull,
    shipPos: new THREE.Vector3().fromArray(gameState.player.ship.position),
    shipQuat: new THREE.Quaternion().fromArray(gameState.player.ship.quaternion),
    hullLength: playerShipClass.hull.length
  })

  // Mining mode swaps the laser from manual crosshair fire to an auto-firing
  // beam locked onto the current target — see updateMiningBeam. Missiles are
  // unaffected either way.
  if (flightMode && !cruising) {
    if (!miningMode && laserFireHeld) fireProjectile(gameState, gameState.player.ship, playerShipClass, 'player', onWeaponFired, 'laser')
    if (missileFireHeld) fireProjectile(gameState, gameState.player.ship, playerShipClass, 'player', onWeaponFired, 'missile')
  }
  updateMiningBeam()

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    updateNpcAI(npc, gameState, dt, onWeaponFired)
    // Shown once, the frame an NPC commits to a suicide run (see combat.js's
    // RAM_CHANCE) — ramQuote is set exactly once, alongside aiState, so this
    // flag just guards against re-showing it every subsequent frame.
    if (npc.aiState === 'ram' && !npc.ramAnnounced) {
      npc.ramAnnounced = true
      factionToastEl.textContent = npc.ramQuote
      factionToastEl.style.color = '#e05a5a'
      factionToastEl.style.display = 'block'
      factionToastUntil = gameState.simTime + FACTION_TOAST_DURATION_S
    }
  }
  updateProjectiles(gameState, dt, onProjectileHit)
  updateCombatFlag(gameState)
  updateMissionProgress(gameState)

  // A pirate truce (see combat.js's truceActive) lasts only as long as a live
  // alien is around to justify it. The moment it lapses — the aliens are all
  // destroyed or have left — any pirates who were part of it thank the player
  // and hyperspace out, rather than turning back to attack the player they
  // were just fighting alongside.
  const truceNowActive = truceActive(gameState)
  if (truceWasActive && !truceNowActive) {
    const departingIds = gameState.npcs.filter((n) => n.faction === 'pirate' && !n.destroyed).map((n) => n.id)
    if (departingIds.length) {
      for (const id of departingIds) {
        const mesh = npcMeshes.get(id)
        if (mesh) {
          scene.remove(mesh)
          npcMeshes.delete(id)
        }
      }
      gameState.npcs = gameState.npcs.filter((n) => !departingIds.includes(n.id))
      factionToastEl.textContent = 'The pirates thank you for the assist, and hyperspace away.'
      factionToastEl.style.color = '#7fe0a0'
      factionToastEl.style.display = 'block'
      factionToastUntil = gameState.simTime + FACTION_TOAST_DURATION_S
    }
  }
  truceWasActive = truceNowActive

  // Busier (higher cap, shorter interval) near the galactic core, quieter
  // toward the rim — spawnEncounterNear separately biases alien vs.
  // pirate/trader odds by the same coreFraction, toward the rim.
  const spawnSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  const core = coreFraction(spawnSystem)
  const ambientCap = Math.max(1, Math.round(AMBIENT_NPC_CAP + 1 - core * 3))
  // The player's own starting system stays free of hostile encounters until
  // they break that peace themselves (see combat.js's updateProjectiles) —
  // ambient traffic still spawns there, just neutral-only in the meantime.
  const atPeacefulHome = gameState.player.currentSystemId === gameState.player.startingSystemId && !gameState.flags.startingSystemPeaceBroken
  if (gameState.simTime > nextAmbientSpawnAt && gameState.npcs.filter((n) => !n.destroyed).length < ambientCap) {
    gameState.npcs.push(spawnEncounterNear(Math.random, gameState.player.ship.position, gameState.galaxy, core, atPeacefulHome))
    nextAmbientSpawnAt = gameState.simTime + AMBIENT_SPAWN_INTERVAL_S * (0.7 + core * 0.6)
  }

  for (const npc of gameState.npcs) {
    let mesh = npcMeshes.get(npc.id)
    if (!mesh && !npc.destroyed) {
      mesh = buildShipMesh(getShipClass(npc.shipClassId))
      npcMeshes.set(npc.id, mesh)
      scene.add(mesh)
    }
    if (!mesh) continue
    if (npc.destroyed) {
      scene.remove(mesh)
      npcMeshes.delete(npc.id)
      continue
    }
    syncMeshToEntity(mesh, npc)
  }

  const liveProjectileIds = new Set()
  for (const proj of gameState.projectiles) {
    liveProjectileIds.add(proj.id)
    let mesh = projectileMeshes.get(proj.id)
    if (!mesh) {
      mesh = buildProjectileMesh(proj.weaponId, proj.weaponType)
      projectileMeshes.set(proj.id, mesh)
      scene.add(mesh)
    }
    syncMeshToEntity(mesh, proj)
  }
  for (const [id, mesh] of projectileMeshes) {
    if (!liveProjectileIds.has(id)) {
      scene.remove(mesh)
      projectileMeshes.delete(id)
    }
  }

  pruneWrecks(gameState)
  const liveWreckIds = new Set()
  for (const wreck of gameState.wrecks) {
    liveWreckIds.add(wreck.id)
    let mesh = wreckMeshes.get(wreck.id)
    if (!mesh) {
      mesh = buildWreckMesh()
      mesh.position.fromArray(wreck.position)
      wreckMeshes.set(wreck.id, mesh)
      scene.add(mesh)
    }
    updateWreckMesh(mesh, gameState.simTime, dt)
  }
  for (const [id, mesh] of wreckMeshes) {
    if (!liveWreckIds.has(id)) {
      scene.remove(mesh)
      wreckMeshes.delete(id)
    }
  }

  for (let i = impactFlashes.length - 1; i >= 0; i--) {
    const flash = impactFlashes[i]
    flash.ttl -= dt
    const t = Math.max(0, flash.ttl / IMPACT_FLASH_TTL)
    flash.mesh.scale.setScalar(0.5 + (1 - t) * 2)
    flash.mesh.material.opacity = t
    if (flash.ttl <= 0) {
      scene.remove(flash.mesh)
      impactFlashes.splice(i, 1)
    }
  }

  syncChaseCamera(camera, gameState.player.ship)
  if (starMesh) updateStarMesh(starMesh, gameState.simTime, dt, camera)
  for (const mesh of bodyMeshes.values()) updateStationMesh(mesh, gameState.simTime, dt)
  // Depleted rocks "explode" (see onProjectileHit) and stay hidden until
  // their own respawn delay passes — isRockAlive is the single source of
  // truth for that, shared with targeting (getTargetableEntities/resolveTarget).
  for (const body of getSystem(gameState.galaxy, gameState.player.currentSystemId).bodies) {
    if (body.kind !== 'asteroidField') continue
    const mesh = bodyMeshes.get(body.id)
    if (!mesh) continue
    mesh.children.forEach((child, i) => { child.visible = isRockAlive(gameState, body.id, i) })
  }
  for (const orbit of moonOrbits.values()) {
    const angle = orbit.angle0 + gameState.simTime * orbit.speed
    const newPosition = [orbit.parentPosition[0] + orbit.radius * Math.cos(angle), orbit.parentPosition[1] + orbit.y, orbit.parentPosition[2] + orbit.radius * Math.sin(angle)]
    orbit.body.position = newPosition
    const mesh = bodyMeshes.get(orbit.body.id)
    if (mesh) mesh.position.fromArray(newPosition)
  }
  const shipVelocity = new THREE.Vector3().fromArray(gameState.player.ship.velocity)
  const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(gameState.player.ship.quaternion))
  const speed = shipVelocity.length()
  const forwardSpeed = shipVelocity.dot(shipForward)
  hud.update(gameState.player.ship, playerShipClass, speed, forwardSpeed)
  hud.updateRadar(computeRadarContacts(), RADAR_RANGE, gameState.simTime)

  const nearbyBody = findNearbyDockableBody()
  dockPromptEl.style.display = nearbyBody ? 'block' : 'none'
  if (nearbyBody) dockPromptEl.textContent = `Press F to dock at ${nearbyBody.name}`

  const nearbyProbeBody = findNearbyProbeableBody()
  probePromptEl.style.display = nearbyProbeBody ? 'block' : 'none'
  if (nearbyProbeBody) probePromptEl.textContent = `Press P to launch a probe at ${nearbyProbeBody.name}`

  // Only shown when there's no dockable body in range too, matching the
  // KeyF handler's own dock-takes-priority-over-loot fallback.
  wreckPromptEl.style.display = !nearbyBody && findNearbyWreck() ? 'block' : 'none'

  if (miningToastEl.style.display === 'block' && gameState.simTime > miningToastUntil) {
    miningToastEl.style.display = 'none'
  }
  if (factionToastEl.style.display === 'block' && gameState.simTime > factionToastUntil) {
    factionToastEl.style.display = 'none'
  }

  updateWaypointIndicator()
  updateCrosshair()
  updateTargetIndicator()

  renderer.render(scene, camera)

  if (gameState.player.ship.hull <= 0) handlePlayerDeath()
}
animate()

startMenuBackground()
hasSave().then((exists) => menu.show(exists))
