import * as THREE from 'three'
import { createScene } from './render/scene.js'
import { createStarfield, updateStarfield, setStarfieldStarTint } from './render/starfield.js'
import { createMotionEffects, updateStarfieldMotion } from './render/motionFx.js'
import { createHyperspaceTunnel } from './render/hyperspaceTunnel.js'
import { createNebula, updateNebula } from './render/nebula.js'
import { buildShipMesh } from './render/shipMesh.js'
import { buildStationMeshForBody, updateStationMesh } from './render/stationMesh.js'
import { buildPlanetMesh } from './render/planetMesh.js'
import { buildStarMesh, updateStarMesh } from './render/starMesh.js'
import { buildAsteroidFieldMesh, getAsteroidRocks } from './render/asteroidFieldMesh.js'
import { buildProjectileMesh, buildImpactFlash } from './render/projectileMesh.js'
import { buildStationInteriorMesh, updateStationInterior } from './render/stationInterior.js'
import { buildWreckMesh, updateWreckMesh } from './render/wreckMesh.js'
import { buildProbeMesh, updateProbeMesh } from './render/probeMesh.js'
import {
  syncMeshToEntity,
  syncChaseCamera,
  adjustChaseZoom,
  resetChaseZoom,
  setChaseFreeLook,
  addChaseFreeLookDelta,
  isChaseFreeLook
} from './render/sceneSync.js'
import { createThrusterEffects } from './render/thrusterParticles.js'
import { createDamageEffects } from './render/damageEffects.js'
import { createOreScoopEffects } from './render/oreScoopParticles.js'
import { createGameState } from './game/state.js'
import { createInputState, createMouseAimState, updateFlight } from './game/flight.js'
import { updateSupercruise, ignoreBodyAsCruiseObstacle } from './game/supercruise.js'
import { spawnEncounterNear } from './game/spawner.js'
import { fireProjectile, updateProjectiles, updateNpcAI, updateCombatFlag, regenShields, getShipCollisionRadius, truceActive } from './game/combat.js'
import { resolveBodyCollisions, trySupercruiseTunnel, collisionRadiusFor } from './game/collision.js'
import { mineRock, isRockAlive, rockDisplayName } from './game/mining.js'
import { pruneWrecks, lootWreck } from './game/wrecks.js'
import { updateCraftingJobs, ensureBlueprintMaps } from './game/crafting.js'
import { getBlueprint } from './data/blueprints.js'
import { markBodyVisited, markBodyProbed, updateMissionProgress, missionMarkedBodyIds, resolveInvestigationProbe } from './game/missions.js'
import {
  launchProbe,
  canProbeBody,
  recordProbeAttempt,
  isActiveMissionProbeTarget,
  probeAttemptCount,
  PROBE_EXHAUSTED_MESSAGE,
  MAX_PROBE_ATTEMPTS
} from './game/probe.js'
import { saveGame as persistSaveGame, loadGame as persistLoadGame, hasSave } from './game/save.js'
import { hyperspaceJump } from './game/hyperspace.js'
import { getSystem, findBody, coreFraction, canJumpTo } from './procgen/galaxy.js'
import { createHud } from './ui/hud.js'
import { createDockingUI } from './ui/dockingUI.js'
import { createMenu } from './ui/menu.js'
import { createPauseMenu } from './ui/pauseMenu.js'
import { createNavMap } from './ui/navMap.js'
import { createInventoryUI } from './ui/inventoryUI.js'
import { createMissionsUI } from './ui/missionsUI.js'
import { createDeathScreen } from './ui/deathScreen.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from './data/shipClasses.js'
import { getGood } from './data/goods.js'
import { getWeapon } from './data/weapons.js'
import * as audio from './audio.js'

window.addEventListener('error', (e) => console.error('uncaught error:', e.message, e.error?.stack))

const DOCK_RANGE = 30
const DOCK_RANGE_COLLISION_MARGIN = 12
// Extra approach allowance for stations/settlements (user request: +2000m).
const DOCK_RANGE_STATION_EXTRA = 2000
// Co-move with a host's orbit when this close beyond its collision shell.
const ORBITAL_CARRY_MARGIN = 900
// Solar co-orbit when this close to the system origin and not bound to a body.
// Solar co-orbit band scales with the enlarged system (was 28k).
const STAR_ORBITAL_CARRY_RADIUS = 168000
const STAR_ORBITAL_OMEGA = 0.0008
// Stations/settlements +50% on prior 11.25 scale; collision.js matches.
const STATION_SCALE = 16.875
const PROBE_RANGE = 150
const MINING_TOAST_DURATION_S = 1.6
const FACTION_TOAST_DURATION_S = 4
// Title-screen-style chromatic glitch for floating HUD text (no soft fades).
const HUD_GLITCH_EXIT_MS = 420
const HUD_GLITCH_STYLE = `
.hud-glitch-text {
  position: relative; display: inline-block; max-width: 100%;
}
.hud-glitch-text::before,
.hud-glitch-text::after {
  content: attr(data-text);
  position: absolute; left: 0; top: 0; width: 100%;
  color: inherit; font: inherit; letter-spacing: inherit;
  white-space: inherit; text-align: inherit; text-shadow: inherit;
  opacity: 0; pointer-events: none; overflow: hidden;
}
.hud-glitch-text::before {
  clip-path: polygon(0 0, 100% 0, 100% 42%, 0 42%);
  filter: hue-rotate(-55deg);
  animation: hudGlitchTop 5.8s steps(1) infinite;
}
.hud-glitch-text::after {
  clip-path: polygon(0 58%, 100% 58%, 100% 100%, 0 100%);
  filter: hue-rotate(160deg);
  animation: hudGlitchBottom 5.8s steps(1) infinite;
}
@keyframes hudGlitchTop {
  0%, 90%, 100% { opacity: 0; transform: translate(0, 0); }
  91% { opacity: 0.9; transform: translate(-4px, -1px); }
  92% { opacity: 0.85; transform: translate(5px, 1px); }
  93% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(3px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}
@keyframes hudGlitchBottom {
  0%, 90%, 100% { opacity: 0; transform: translate(0, 0); }
  91% { opacity: 0.9; transform: translate(5px, 1px); }
  92% { opacity: 0.85; transform: translate(-4px, -1px); }
  93% { opacity: 0; transform: translate(0, 0); }
  96% { opacity: 0.7; transform: translate(-3px, 0); }
  97% { opacity: 0; transform: translate(0, 0); }
}
.hud-glitch-enter {
  animation: hudGlitchEnter 0.42s steps(2) both;
}
@keyframes hudGlitchEnter {
  0% { opacity: 0; transform: skewX(12deg) translateX(-7px); filter: blur(1px); }
  18% { opacity: 1; transform: skewX(-9deg) translateX(5px); filter: blur(0); }
  36% { opacity: 0.25; transform: skewX(6deg) translateX(-4px); }
  52% { opacity: 1; transform: skewX(-3deg) translateX(2px); }
  68% { opacity: 0.55; transform: skewX(2deg) translateX(-1px); }
  100% { opacity: 1; transform: none; filter: none; }
}
.hud-glitch-exit {
  animation: hudGlitchExit 0.4s steps(2) both;
}
@keyframes hudGlitchExit {
  0% { opacity: 1; transform: none; }
  22% { opacity: 1; transform: skewX(-11deg) translateX(6px); }
  44% { opacity: 0.15; transform: skewX(9deg) translateX(-9px); }
  62% { opacity: 0.8; transform: skewX(-5deg) translateX(3px); }
  100% { opacity: 0; transform: skewX(7deg) translateX(12px); filter: blur(1px); }
}
`
let hudGlitchStyleInjected = false
function ensureHudGlitchStyle() {
  if (hudGlitchStyleInjected) return
  const style = document.createElement('style')
  style.textContent = HUD_GLITCH_STYLE
  document.head.appendChild(style)
  hudGlitchStyleInjected = true
}

const hudGlitchHideTimers = new WeakMap()

function ensureHudGlitchSpan(el) {
  if (!el) return null
  ensureHudGlitchStyle()
  let span = el.querySelector(':scope > .hud-glitch-text')
  if (!span) {
    span = document.createElement('span')
    span.className = 'hud-glitch-text'
    while (el.firstChild) span.appendChild(el.firstChild)
    el.appendChild(span)
  }
  return span
}

function setHudGlitchText(el, text) {
  const span = ensureHudGlitchSpan(el)
  if (!span) return
  span.textContent = text
  span.dataset.text = text
}

function showHudGlitch(el) {
  if (!el) return
  ensureHudGlitchStyle()
  clearTimeout(hudGlitchHideTimers.get(el))
  el.style.display = 'block'
  el.style.opacity = '1'
  const span = ensureHudGlitchSpan(el)
  if (!span) return
  span.classList.remove('hud-glitch-exit', 'hud-glitch-enter')
  // Restart enter animation.
  void span.offsetWidth
  span.classList.add('hud-glitch-enter')
}

function hideHudGlitch(el) {
  if (!el || el.style.display === 'none') return
  const span = ensureHudGlitchSpan(el)
  if (!span) {
    el.style.display = 'none'
    return
  }
  span.classList.remove('hud-glitch-enter', 'hud-glitch-exit')
  void span.offsetWidth
  span.classList.add('hud-glitch-exit')
  clearTimeout(hudGlitchHideTimers.get(el))
  const t = setTimeout(() => {
    el.style.display = 'none'
    span.classList.remove('hud-glitch-exit')
  }, HUD_GLITCH_EXIT_MS)
  hudGlitchHideTimers.set(el, t)
}

const AMBIENT_SPAWN_INTERVAL_S = 90
const AMBIENT_NPC_CAP = 3
const RADAR_RANGE = 1500
const IMPACT_FLASH_TTL = 0.25
// Wind-up long enough for "Hyperdrive engaged" TTS + charge SFX, then tunnel.
const JUMP_WINDUP_S = 2.35
const JUMP_STREAK_S = 1.85
const JUMP_DURATION_S = JUMP_WINDUP_S + JUMP_STREAK_S
const BASE_FOV = 60
// Supercruise FOV (degrees) — wider than base for speed read.
const CRUISE_FOV = 100

const CROSSHAIR_DISTANCE = 80

// Approach + bay glide; three-phase so approach / hang-align / park all read.
const DOCK_ANIM_DURATION_S = 4.4
// Extra clearance beyond the body's collision shell for the exterior hang
// point — the old flat 18 was deep *inside* station/planet radii (~100–200+).
const DOCK_EXTERIOR_MARGIN = 28
const UNDOCK_BACKOFF_MARGIN = 70
const DOCK_FLASH_FADE_S = 0.65
const HYPERSPACE_FLASH_COLOR = '#eaffff'
const DOCK_FLASH_COLOR = '#4fc3d9'
// Min standoff past the collision shell when the dock bubble is large enough
// (stations/settlements have +2000m). Avoids bouncing off the body on drop-out.
const SUPERCRUISE_ARRIVAL_MIN_CLEAR = 220
// How far inside the dock shell to still count as "in range" after SC drop.
const SUPERCRUISE_DOCK_INNER_SLACK = 120
// A dedicated coordinate region for the docking-bay interior, far enough
// from any system-local coordinates (which top out around 2200) that it can
// never overlap real flight space.
const DOCKING_BAY_ORIGIN = new THREE.Vector3(2_000_000, 0, 0)
const BAY_ENTRY_OFFSET = new THREE.Vector3(0, 0, -55)
const BAY_PARK_OFFSET = new THREE.Vector3(0, 0, 20)
// Probe flight: fly out → scan 10s → return → yield results.
const PROBE_OUTBOUND_S = 2.6
const PROBE_SCAN_S = 10
const PROBE_RETURN_S = 2.4
const PROBE_SCAN_STANDOFF = 18

const appEl = document.getElementById('app')
const { scene, camera, renderer } = createScene(appEl)
const starfield = createStarfield()
scene.add(starfield)
const motionFx = createMotionEffects(appEl)
scene.add(motionFx.group)
const hyperspaceTunnel = createHyperspaceTunnel()
scene.add(hyperspaceTunnel.group)
const nebula = createNebula()
scene.add(nebula)

const keys = createInputState()
const mouseAim = createMouseAimState()
const EMPTY_KEYS = new Set()
// flightModeWanted = player intends to be in mouse-aim flight (Space / undock).
// flightMode = actually receiving mouse aim (pointer is locked). Tabbing out
// drops the lock and clears flightMode, but keeps wanted so focus/click can
// re-acquire without needing another Space press.
let flightMode = false
let flightModeWanted = false
let laserFireHeld = false
let missileFireHeld = false
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

function canUseFlightMode() {
  if (!gameState || paused || navMapOpen || inventoryOpen || missionsOpen || jumpEffect) return false
  // Parked at the docking UI: no flight. Mid undock animation is fine —
  // pointer lock is requested on the Undock click (needs a live gesture).
  if (docked && !dockEffect) return false
  return true
}

function exitFlightMode() {
  flightModeWanted = false
  flightMode = false
  setChaseFreeLook(false)
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
}

// The mirror of exitFlightMode — called whenever a menu/popup that forced
// the mouse free (pause, nav map, docking, a probe result alert) closes
// again, so the player lands back in flight controls without having to
// press Space themselves. Same fire-and-forget pointer-lock request/catch
// pattern as the Space keydown handler below; if the browser refuses it
// (e.g. too long after the last user gesture), flightMode drops but
// flightModeWanted stays so a later focus/click can re-acquire.
function reenterFlightMode() {
  flightModeWanted = true
  if (!canUseFlightMode()) {
    flightMode = false
    return
  }
  flightMode = true
  if (document.pointerLockElement === renderer.domElement) return
  renderer.domElement.requestPointerLock().catch((err) => {
    console.error('Pointer lock request failed:', err)
    flightMode = false
  })
}

// After alt-tab / OS focus steal, Chromium drops pointer lock. Keep the
// player's intent (flightModeWanted) and re-request on focus or any click
// on the canvas — focus alone is often rejected as a non-gesture.
function tryRestoreFlightMode() {
  if (!flightModeWanted || !canUseFlightMode()) return
  if (document.pointerLockElement === renderer.domElement) {
    flightMode = true
    return
  }
  flightMode = true
  renderer.domElement.requestPointerLock().catch(() => {
    flightMode = false
  })
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {
    if (flightModeWanted) flightMode = true
  } else {
    flightMode = false
    if (crosshairEl) crosshairEl.style.display = 'none'
    if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  }
})

window.addEventListener('blur', () => {
  keys.clear()
  laserFireHeld = false
  missileFireHeld = false
  setChaseFreeLook(false)
})

window.addEventListener('focus', () => {
  tryRestoreFlightMode()
})

// Alt + mouse: orbit chase cam around the ship; release Alt snaps back to seat.
function isAltKey(code) {
  return code === 'AltLeft' || code === 'AltRight'
}
window.addEventListener('keydown', (e) => {
  if (!isAltKey(e.code)) return
  if (!gameState || paused || docked || jumpEffect || navMapOpen || inventoryOpen || missionsOpen) return
  e.preventDefault()
  setChaseFreeLook(true)
})
window.addEventListener('keyup', (e) => {
  if (!isAltKey(e.code)) return
  setChaseFreeLook(false)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tryRestoreFlightMode()
})

renderer.domElement.addEventListener('click', () => {
  // Click is a reliable user gesture for re-locking after tabbing out.
  if (flightModeWanted && canUseFlightMode() && document.pointerLockElement !== renderer.domElement) {
    tryRestoreFlightMode()
  }
})

// Chase-camera zoom (works with or without pointer lock). Scroll up = closer.
window.addEventListener('wheel', (e) => {
  if (!gameState || docked || dockEffect || jumpEffect || paused || navMapOpen || inventoryOpen || missionsOpen) return
  e.preventDefault()
  adjustChaseZoom(e.deltaY)
}, { passive: false })

let gameState = null
let playerShipClass = null
let playerMesh = null
let thrusterEffects = null
let damageEffects = null
let oreScoopEffects = null
let hud = null
let dockingUI = null
let pauseMenu = null
let navMap = null
let inventoryUI = null
let missionsUI = null
let dockPromptEl = null
let probePromptEl = null
let probeResultsEl = null
let probeResultsUntil = 0
let wreckPromptEl = null
let miningToastEl = null
let miningToastUntil = 0
let craftToastEl = null
let craftToastHideTimer = null
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
let cruiseIndicatorEl = null
let jumpFlashEl = null
let jumpEffect = null
let dockEffect = null
let dockedApproach = null
let interiorMesh = null
const npcMeshes = new Map()
const bodyMeshes = new Map()
const wreckMeshes = new Map()
// Moons orbit their parent planet; planets slowly orbit the star (origin).
// See loadBodiesForCurrentSystem + the per-frame update near updateStarMesh.
// Keyed by body id. Positions are mutated in place so moon parent refs stay live.
const moonOrbits = new Map()
const planetOrbits = new Map()
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
  planetOrbits.clear()
  currentTarget = null

  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  starMesh = buildStarMesh(currentSystem)
  scene.add(starMesh)
  // Whisper of local-sun hue on the starfield (and a dimmer scene backdrop).
  applySystemStarAmbient()
  for (const body of currentSystem.bodies) {
    const mesh = buildBodyMesh(body)
    mesh.position.fromArray(body.position)
    bodyMeshes.set(body.id, mesh)
    scene.add(mesh)

    if (body.kind === 'planet') {
      const hash = hashStringForOrbit(body.id)
      const r = Math.hypot(body.position[0], body.position[2])
      // Solar orbit (20% of prior — slowed 80% with planet/moon spin pass).
      planetOrbits.set(body.id, {
        body,
        radius: Math.max(r, 1),
        angle0: Math.atan2(body.position[2], body.position[0]),
        y: body.position[1],
        speed: 0.00012 + ((hash % 1000) / 1000) * 0.00018
      })
    }

    // Stations that orbit the star (no parent body).
    if (body.kind === 'station' && body.orbitsStar) {
      const hash = hashStringForOrbit(body.id)
      const r = Math.hypot(body.position[0], body.position[2])
      planetOrbits.set(body.id, {
        body,
        radius: Math.max(r, 1),
        angle0: Math.atan2(body.position[2], body.position[0]),
        y: body.position[1],
        speed: 0.0008 + ((hash % 1000) / 1000) * 0.0012
      })
    }

    // Moons and stations orbiting a planet/moon.
    if ((body.kind === 'moon' || body.kind === 'station') && body.parentId) {
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
          // Moons: 20% of prior orbit rate (slowed 80%). Stations unchanged.
          speed: body.kind === 'moon'
            ? 0.0016 + ((hash % 1000) / 1000) * 0.0024
            : 0.004 + ((hash % 1000) / 1000) * 0.006
        })
      }
    }

    // Settlements ride their host planet's surface offset and stand upright
    // on the local radial (local +Y = outward normal).
    if (body.kind === 'settlement' && body.parentId && body.surfaceOffset) {
      moonOrbits.set(body.id, {
        body,
        parentPosition: null, // resolved each frame from parentId
        parentId: body.parentId,
        surfaceOffset: body.surfaceOffset,
        isSurface: true
      })
      const mesh = bodyMeshes.get(body.id)
      if (mesh) orientSettlementOnSurface(mesh, body.surfaceOffset)
    }
  }
}

// Settlement meshes are built "upright" in local +Y; rotate so that axis
// points along the surface normal (away from the host center).
const _settlementUp = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
function orientSettlementOnSurface(mesh, surfaceOffset) {
  _settlementUp.set(surfaceOffset[0], surfaceOffset[1], surfaceOffset[2])
  if (_settlementUp.lengthSq() < 1e-8) return
  _settlementUp.normalize()
  mesh.quaternion.setFromUnitVectors(_worldUp, _settlementUp)
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
let missionsOpen = false
let cruising = false
// Edge-detected in animate() to fire the supercruise engage/disengage voice
// callout exactly once per transition, regardless of whether cruising flips
// via the KeyC handler (manual) or the cruising block below (auto-arrival/
// combat-interrupt) — one check covers every trigger source.
let wasCruising = false
// Active probe flight: { phase, elapsed, body, mesh, launchPos, scanPos, ... }
let probeEffect = null
let nextAmbientSpawnAt = 0

let menuStarMesh = null
let menuAnimT = 0

// Real multi-stars (see render/starMesh.js) are thousands of units across
// post-STAR_SIZE_SCALE — far too big for this tiny fixed-camera stage. Rather
// than a hardcoded shrink factor (which would need re-tuning every time
// STAR_SIZE_SCALE changes, as happened once already), the built mesh is
// measured with a bounding sphere and normalized to a fixed on-screen size —
// self-adjusting regardless of how big the underlying game-scale stars get.
// The scale still applies to the same pre-scale local coordinates
// updateStarMesh already animates in (orbit radius, spark positions, etc.),
// so nothing about that logic needs to know it's being shown shrunk down.
const MENU_STAR_DISPLAY_RADIUS = 26
// Star at origin, dead screen-center — title sits above it, menu over it.
const MENU_STAR_CENTER = new THREE.Vector3(0, 0, 0)

function startMenuBackground() {
  if (menuStarMesh) return
  // Neutral starfield on the title; in-system sun hue is applied on loadBodies.
  setStarfieldStarTint(starfield, null)
  scene.background = new THREE.Color(0x05070d)
  // Same trinary path as Whispers (forceType + starType so components/rings match).
  menuStarMesh = buildStarMesh({ id: 'menu-whispers-trinary', starType: 'trinary' }, 'trinary')
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
const MENU_ORBIT_HEIGHT = 10

function updateMenuBackground(dt) {
  if (!menuStarMesh) return
  menuAnimT += dt
  updateStarMesh(menuStarMesh, menuAnimT, dt, camera)
  // Lazy orbit; lookAt keeps the trinary centered under the UI.
  const angle = (menuAnimT / MENU_ORBIT_PERIOD_S) * Math.PI * 2
  camera.position.set(
    MENU_STAR_CENTER.x + Math.cos(angle) * MENU_ORBIT_RADIUS,
    MENU_STAR_CENTER.y + MENU_ORBIT_HEIGHT,
    MENU_STAR_CENTER.z + Math.sin(angle) * MENU_ORBIT_RADIUS
  )
  camera.lookAt(MENU_STAR_CENTER)
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

function onProjectileHit({ position, rockPosition, destroyed, mined }) {
  const flash = buildImpactFlash(mined ? 0xc2a35c : destroyed ? 0xff8a3d : 0xffcc66)
  flash.position.fromArray(position)
  if (mined?.destroyed) flash.scale.setScalar(1.4) // depleted rock exploding reads bigger than a regular mining ping
  scene.add(flash)
  impactFlashes.push({ mesh: flash, ttl: IMPACT_FLASH_TTL })

  if (mined) {
    audio.playMiningPing()
    if (mined.destroyed) audio.playExplosion()
    // Scoop trail only when ore actually entered the hold.
    if (mined.scooped) {
      const from = rockPosition ?? position
      oreScoopEffects?.burst(new THREE.Vector3(...from), 5 + Math.floor(Math.random() * 4))
      setHudGlitchText(
        miningToastEl,
        mined.destroyed
          ? `${getGood(mined.goodId).name} deposit depleted!`
          : `Mined 1 ${getGood(mined.goodId).name}`
      )
      showHudGlitch(miningToastEl)
      miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
    } else if (mined.destroyed) {
      setHudGlitchText(miningToastEl, `${getGood(mined.goodId).name} deposit depleted!`)
      showHudGlitch(miningToastEl)
      miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
    }
    // Full hold + not destroyed: silent strip (no toast spam).
  } else if (destroyed) {
    audio.playExplosion()
  } else {
    audio.playHit()
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
  if (oreScoopEffects) scene.remove(oreScoopEffects.group)
  oreScoopEffects = null
  for (const mesh of npcMeshes.values()) scene.remove(mesh)
  npcMeshes.clear()
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  bodyMeshes.clear()
  moonOrbits.clear()
  planetOrbits.clear()
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
  missionsUI?.element.remove()
  dockPromptEl?.remove()
  probePromptEl?.remove()
  probeResultsEl?.remove()
  probeResultsEl = null
  probeResultsUntil = 0
  wreckPromptEl?.remove()
  miningToastEl?.remove()
  craftToastEl?.remove()
  craftToastEl = null
  clearTimeout(craftToastHideTimer)
  craftToastHideTimer = null
  factionToastEl?.remove()
  truceWasActive = false
  waypointEl?.remove()
  crosshairEl?.remove()
  targetIndicatorEl?.remove()
  currentTarget = null
  cruiseIndicatorEl?.remove()
  jumpFlashEl?.remove()
  if (interiorMesh) scene.remove(interiorMesh)
  audio.setThrustState(null)
  audio.setSupercruiseActive(false)
  audio.stopAmbientMusic()
  camera.fov = BASE_FOV
  camera.updateProjectionMatrix()
  resetChaseZoom()
  docked = false
  paused = false
  navMapOpen = false
  inventoryOpen = false
  missionsOpen = false
  cruising = false
  wasCruising = false
  jumpEffect = null
  hyperspaceTunnel.stop()
  audio.stopHyperspaceAudio()
  dockEffect = null
  dockedApproach = null
  clearProbeEffect()
  exitFlightMode()
}

function clearProbeEffect() {
  if (probeEffect?.mesh) scene.remove(probeEffect.mesh)
  probeEffect = null
  audio.setProbeScanActive(false)
}

/** Swap the visible player hull when classId changes (shipyard Activate). */
function rebuildPlayerShipMesh() {
  if (!gameState) return
  playerShipClass = getShipClass(gameState.player.ship.classId)
  if (playerMesh) {
    scene.remove(playerMesh)
    playerMesh = null
  }
  playerMesh = buildShipMesh(playerShipClass)
  scene.add(playerMesh)
  syncMeshToEntity(playerMesh, gameState.player.ship)
}

function startSession(newGameState, { enterFlightMode = false } = {}) {
  clearSession()
  stopMenuBackground()
  gameState = newGameState
  ensureBlueprintMaps(gameState)
  // Offline craft completions from deserialize (wall-clock) — toast after HUD exists.
  const offlineCraftDone = gameState._craftingJustCompleted ?? []
  delete gameState._craftingJustCompleted
  rebuildPlayerShipMesh()
  thrusterEffects = createThrusterEffects()
  scene.add(thrusterEffects.group)
  damageEffects = createDamageEffects()
  scene.add(damageEffects.group)
  oreScoopEffects = createOreScoopEffects()
  scene.add(oreScoopEffects.group)

  for (const npc of gameState.npcs) {
    const mesh = buildShipMesh(getShipClass(npc.shipClassId))
    npcMeshes.set(npc.id, mesh)
    scene.add(mesh)
  }
  loadBodiesForCurrentSystem()

  hud = createHud(appEl)
  dockingUI = createDockingUI(appEl, gameState, Math.random, {
    onCraftStarted: (msg) => {
      showCraftToast(msg, 5000)
      audio.playCraftStart()
    },
    // Bought ships only become active via Storage activate — rebuild the
    // visual hull so a Corsair doesn't keep looking like a Bravia.
    onPlayerShipChanged: () => rebuildPlayerShipMesh()
  })
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
  missionsUI = createMissionsUI(appEl, gameState)

  // Floating HUD copy: readable drop-shadow text, no dark pill/box behind it.
  const FLOAT_TEXT_SHADOW =
    '0 0 4px rgba(0,0,0,0.95),0 1px 3px rgba(0,0,0,0.95),0 0 14px rgba(0,0,0,0.75),0 0 8px rgba(0,0,0,0.6)'
  const floatText = (extra = '') =>
    `font-family:monospace;background:transparent;border:none;box-shadow:none;padding:0;text-shadow:${FLOAT_TEXT_SHADOW};filter:drop-shadow(0 2px 3px rgba(0,0,0,0.85));${extra}`

  dockPromptEl = document.createElement('div')
  dockPromptEl.id = 'dock-prompt'
  dockPromptEl.style.cssText =
    `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);color:#cfe3ff;display:none;${floatText('font-size:13px;letter-spacing:0.5px;')}`
  appEl.appendChild(dockPromptEl)

  probePromptEl = document.createElement('div')
  probePromptEl.id = 'probe-prompt'
  probePromptEl.style.cssText =
    `position:fixed;bottom:120px;left:50%;transform:translateX(-50%);color:#cfe3ff;display:none;${floatText('font-size:13px;letter-spacing:0.5px;')}`
  appEl.appendChild(probePromptEl)

  // Floating multi-line probe return readout (not a blocking alert dialog).
  probeResultsEl = document.createElement('div')
  probeResultsEl.id = 'probe-results'
  probeResultsEl.style.cssText = [
    'position:fixed',
    'top:18%',
    'left:50%',
    'transform:translateX(-50%)',
    'max-width:min(520px,90vw)',
    'text-align:center',
    'font-size:13px',
    'line-height:1.5',
    'letter-spacing:0.4px',
    'color:#cfe3ff',
    'display:none',
    'pointer-events:none',
    'z-index:40',
    floatText()
  ].join(';')
  appEl.appendChild(probeResultsEl)

  wreckPromptEl = document.createElement('div')
  wreckPromptEl.id = 'wreck-prompt'
  wreckPromptEl.style.cssText =
    `position:fixed;bottom:240px;left:50%;transform:translateX(-50%);color:#ff8a3d;display:none;${floatText('font-size:13px;letter-spacing:0.5px;')}`
  wreckPromptEl.textContent = 'Press F to salvage wreck'
  appEl.appendChild(wreckPromptEl)

  miningToastEl = document.createElement('div')
  miningToastEl.id = 'mining-toast'
  miningToastEl.style.cssText =
    `position:fixed;bottom:160px;left:50%;transform:translateX(-50%);color:#e0c878;display:none;${floatText('font-size:13px;letter-spacing:0.4px;text-align:center;max-width:min(640px,92vw);')}`
  appEl.appendChild(miningToastEl)

  // Craft start/complete floating text — top-center, above docking UI (z-index 50).
  // Wall-clock hide so it works while docked (simTime freezes in the bay).
  craftToastEl = document.createElement('div')
  craftToastEl.id = 'craft-toast'
  craftToastEl.style.cssText =
    `position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:60;pointer-events:none;display:none;max-width:min(720px,90vw);text-align:center;color:#a8f0c8;${floatText('font-size:13px;letter-spacing:0.4px;')}`
  appEl.appendChild(craftToastEl)

  factionToastEl = document.createElement('div')
  factionToastEl.id = 'faction-toast'
  factionToastEl.style.cssText =
    `position:fixed;bottom:200px;left:50%;transform:translateX(-50%);color:#7fe0a0;display:none;${floatText('font-size:13px;letter-spacing:0.4px;text-align:center;max-width:min(640px,92vw);')}`
  appEl.appendChild(factionToastEl)

  waypointEl = document.createElement('div')
  waypointEl.id = 'waypoint-indicator'
  waypointEl.style.cssText = 'position:fixed;pointer-events:none;display:none;'
  waypointEl.innerHTML = `
    <div class="wp-arrow" style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:16px solid #7fe0a0;margin:0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.9));"></div>
    <div class="wp-label" style="margin-top:4px;color:#7fe0a0;font-size:11px;white-space:nowrap;text-align:center;${floatText()}"></div>
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
    <div class="target-box" style="position:absolute;inset:0;border:2px solid #cfe3ff;filter:drop-shadow(0 0 3px rgba(0,0,0,0.85));"></div>
    <div class="target-label" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;color:#cfe3ff;font-size:11px;white-space:nowrap;text-align:center;${floatText()}"></div>
  `
  appEl.appendChild(targetIndicatorEl)

  // Below the HUD system-name banner (top center) so the two never overlap.
  // Glitch enter/exit + sparse continuous chromatic slices (title-screen style).
  cruiseIndicatorEl = document.createElement('div')
  cruiseIndicatorEl.id = 'cruise-indicator'
  cruiseIndicatorEl.style.cssText =
    `position:fixed;top:62px;left:50%;transform:translateX(-50%);color:#7fe0a0;display:none;${floatText('font-size:13px;letter-spacing:2.5px;font-weight:600;')}`
  setHudGlitchText(cruiseIndicatorEl, 'SUPERCRUISE ENGAGED')
  appEl.appendChild(cruiseIndicatorEl)

  // Reused for both the hyperspace punch and the dock/undock transition —
  // background color is set explicitly wherever each effect triggers.
  jumpFlashEl = document.createElement('div')
  jumpFlashEl.id = 'jump-flash'
  jumpFlashEl.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;display:none;'
  appEl.appendChild(jumpFlashEl)

  nextAmbientSpawnAt = gameState.simTime + AMBIENT_SPAWN_INTERVAL_S
  audio.startAmbientMusic()

  if (offlineCraftDone.length) toastCraftCompleted(offlineCraftDone)

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

// Only stations and settlements are dockable — never bare planets/moons.
function isDockable(body) {
  return body.kind === 'station' || body.kind === 'settlement'
}

// The collision shell around a body (its physical radius + the ship's own)
// can exceed the flat DOCK_RANGE for large planets/ships, which would make
// docking physically unreachable — widen the range per body so it's always
// comfortably outside that shell. Stations/settlements get an extra 2000m.
function dockRangeFor(body) {
  const bodyRadius = collisionRadiusFor(body) ?? 0
  const base = Math.max(DOCK_RANGE, bodyRadius + getShipCollisionRadius(playerShipClass) + DOCK_RANGE_COLLISION_MARGIN)
  if (body.kind === 'station' || body.kind === 'settlement') return base + DOCK_RANGE_STATION_EXTRA
  return base
}

/**
 * Where supercruise should drop out around a waypoint body.
 * Further out than the collision shell (no bounce) but still inside dockRange
 * so F-to-dock still works; ship stays facing the objective on drop.
 */
function supercruiseArrivalRangeFor(body) {
  const bodyRadius = collisionRadiusFor(body) ?? 0
  const shipR = getShipCollisionRadius(playerShipClass)
  const shell = bodyRadius + shipR
  const dockR = dockRangeFor(body)
  const span = Math.max(0, dockR - shell)
  // Large dock bubble (stations): sit well out, ~70% of the way from shell → dock edge.
  // Tiny bubble (planets): as far out as dock still allows.
  let preferred
  if (span > SUPERCRUISE_ARRIVAL_MIN_CLEAR * 2) {
    preferred = shell + Math.max(SUPERCRUISE_ARRIVAL_MIN_CLEAR, span * 0.72)
  } else {
    preferred = Math.max(shell + 12, dockR - SUPERCRUISE_DOCK_INNER_SLACK)
  }
  // Clamp into (shell, dockR) so we never clip the body or overshoot dock range.
  const minR = shell + Math.min(SUPERCRUISE_ARRIVAL_MIN_CLEAR, Math.max(12, span * 0.35))
  const maxR = Math.max(minR, dockR - 25)
  return Math.min(maxR, Math.max(minR, preferred))
}

// Special waypoint id for the system star (local origin) — not a real body.
const SYSTEM_STAR_WAYPOINT_ID = 'system-star'

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
  const weaponMsg = loot.weapons
    ? `${parts || partsMsg ? ' and ' : ''}${Object.entries(loot.weapons).map(([id, qty]) => {
        try {
          return `${qty}× ${getWeapon(id).name}`
        } catch {
          return `${qty}× weapon`
        }
      }).join(', ')}`
    : ''
  const bpMsg = loot.blueprints
    ? `${parts || partsMsg || weaponMsg ? ' and ' : ''}${Object.entries(loot.blueprints).map(([id, qty]) => {
        try {
          return `${qty}× ${getBlueprint(id).name}`
        } catch {
          return `${qty}× blueprint`
        }
      }).join(', ')}`
    : ''
  setHudGlitchText(miningToastEl, `Salvaged ${parts}${partsMsg}${weaponMsg}${bpMsg} from the wreck`)
  showHudGlitch(miningToastEl)
  miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
}

function flashToast(text, durationS = MINING_TOAST_DURATION_S) {
  if (!miningToastEl || !gameState) return
  setHudGlitchText(miningToastEl, text)
  showHudGlitch(miningToastEl)
  miningToastUntil = gameState.simTime + durationS
}

function showCraftToast(text, durationMs = 5500) {
  if (!craftToastEl) return
  setHudGlitchText(craftToastEl, text)
  showHudGlitch(craftToastEl)
  clearTimeout(craftToastHideTimer)
  craftToastHideTimer = setTimeout(() => {
    hideHudGlitch(craftToastEl)
  }, durationMs)
}

function toastCraftCompleted(jobs) {
  if (!jobs.length) return
  audio.playCraftComplete()
  // One floating line — last job if several finished the same tick (rare).
  const job = jobs[jobs.length - 1]
  let item = job.blueprintId
  try {
    item = getBlueprint(job.blueprintId).itemName
  } catch { /* */ }
  const extra = jobs.length > 1 ? ` (+${jobs.length - 1} more)` : ''
  showCraftToast(
    `Assembly complete: ${item} ready at ${job.stationName} (${job.systemName})${extra}`,
    6500
  )
}

function isProbeable(body) {
  return body.kind === 'planet' || body.kind === 'moon' || body.kind === 'asteroidField'
}

function probeScanRadius(body) {
  if (body.kind === 'star') return STAR_TARGET_RADIUS
  return collisionRadiusFor(body) ?? 20
}

// Same capture shell as applyOrbitalCarry (radius + margin).
function isInOrbitOfBody(body) {
  if (!body || (body.kind !== 'planet' && body.kind !== 'moon')) return false
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const bodyPos = new THREE.Vector3().fromArray(body.position)
  const capture = (collisionRadiusFor(body) ?? 0) + ORBITAL_CARRY_MARGIN
  return shipPos.distanceTo(bodyPos) < capture
}

// Matches solar co-orbit band in applyOrbitalCarry.
function isInSolarOrbit() {
  const [x, , z] = gameState.player.ship.position
  const r = Math.hypot(x, z)
  return r >= 3000 && r <= STAR_ORBITAL_CARRY_RADIUS
}

function makeStarProbeBody() {
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  // Per-system probe key so exhausting one sun doesn't block every system star,
  // and counts stay stable (not a shared global 'system-star' bucket).
  const starProbeId = `${gameState.player.currentSystemId}:${SYSTEM_STAR_WAYPOINT_ID}`
  return {
    id: starProbeId,
    name: `${currentSystem?.name ?? 'System'} Star`,
    kind: 'star',
    position: [0, 0, 0]
  }
}

// Close-range probe (belts / flyby): surface distance for large worlds.
function findNearbyProbeableBody() {
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  let nearest = null
  let nearestDist = Infinity
  for (const body of currentSystem.bodies) {
    if (!isProbeable(body)) continue
    const dist = playerPos.distanceTo(new THREE.Vector3().fromArray(body.position))
    const surfaceDist = Math.max(0, dist - (collisionRadiusFor(body) ?? 0))
    if (surfaceDist < PROBE_RANGE && surfaceDist < nearestDist) {
      nearest = body
      nearestDist = surfaceDist
    }
  }
  return nearest
}

// Prefer: Tab-target planet/moon/star while in its orbit. Else nearby belt/body.
function getProbeLaunchTarget() {
  if (currentTarget?.kind === 'star' && isInSolarOrbit()) {
    return { body: makeStarProbeBody(), viaOrbit: true }
  }
  if (currentTarget?.kind === 'body') {
    const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    const body = currentSystem.bodies.find((b) => b.id === currentTarget.id)
    if (body && (body.kind === 'planet' || body.kind === 'moon') && isInOrbitOfBody(body)) {
      return { body, viaOrbit: true }
    }
  }
  const nearby = findNearbyProbeableBody()
  return nearby ? { body: nearby, viaOrbit: false } : null
}

// Launch a tiny probe mesh that flies to the body, scans for PROBE_SCAN_S,
// returns, then yields results (missions / survey data). Instant results
// felt weightless; the flight + 10s scan sells "actually surveying".
// Cap: MAX_PROBE_ATTEMPTS per body — further launches get a floating denial.
// Attempts are reserved at launch (not return) so aborted probes still consume a slot.
function probeBody(body) {
  if (probeEffect) return

  // Ensure the map exists even on older in-memory states / partial loads.
  gameState.probeCounts ??= {}
  if (!canProbeBody(gameState, body.id)) {
    showFloatingProbeResults([PROBE_EXHAUSTED_MESSAGE])
    return
  }

  const n = recordProbeAttempt(gameState, body.id)

  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const bodyPos = new THREE.Vector3().fromArray(body.position)
  const toShip = shipPos.clone().sub(bodyPos)
  if (toShip.lengthSq() < 1e-6) toShip.set(0, 0, 1)
  else toShip.normalize()
  const bodyRadius = probeScanRadius(body)
  const scanPos = bodyPos.clone().addScaledVector(toShip, bodyRadius + PROBE_SCAN_STANDOFF)

  // Eject slightly ahead of the ship nose so the probe doesn't spawn inside hull.
  const shipQuat = new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
  const launchPos = shipPos.clone().add(new THREE.Vector3(0, 0, 4).applyQuaternion(shipQuat))

  const mesh = buildProbeMesh()
  mesh.position.copy(launchPos)
  mesh.quaternion.copy(quatFacing(launchPos, scanPos))
  scene.add(mesh)

  probeEffect = {
    phase: 'outbound',
    elapsed: 0,
    body,
    mesh,
    launchPos: launchPos.clone(),
    scanPos,
    bodyPos,
    returnStart: null,
    // Snapshot attempt # at launch for mission-first-probe / messages.
    attemptNumber: n
  }
  audio.playProbeLaunch()
  flashToast(`Probe launched toward ${body.name}… (${n}/${MAX_PROBE_ATTEMPTS})`, 2.2)
}

function showFloatingProbeResults(messages) {
  if (!probeResultsEl || !messages.length) return
  // Single glitch line (joined) so enter/exit + chromatic slices match other HUD text.
  setHudGlitchText(probeResultsEl, messages.join('\n'))
  const span = probeResultsEl.querySelector('.hud-glitch-text')
  if (span) span.style.whiteSpace = 'pre-line'
  showHudGlitch(probeResultsEl)
  // Stay long enough to read multi-line mission results; dismiss with glitch (no fade).
  const hold = Math.min(14, 5.5 + messages.length * 1.4)
  probeResultsUntil = (gameState?.simTime ?? 0) + hold
}

function finishProbeResults(body, attemptNumber = null) {
  // Attempt was already reserved at launch — do not double-count here.
  const attempt = attemptNumber ?? probeAttemptCount(gameState, body.id)
  const wasMissionTarget = isActiveMissionProbeTarget(gameState, body.id)
  // First probe on a mission target always delivers the mission outcome.
  const missionFirstProbe = wasMissionTarget && attempt === 1

  const probeMissionHere = body.kind !== 'star' && gameState.missions.active.find(
    (m) => m.type === 'probe' && !m.objectiveComplete && m.target.bodyId === body.id
  )
  markBodyProbed(gameState, body.id)
  // Investigation resolves on the probe itself (intel / hostile / lead further),
  // not from merely being listed in probedBodyIds. Stars are never investigation targets.
  // Mission targets resolve on this first hit (resolveInvestigationProbe is idempotent
  // once objectiveComplete / retargeted).
  const investigation = body.kind === 'star'
    ? null
    : resolveInvestigationProbe(gameState, body.id, Math.random)
  updateMissionProgress(gameState)

  // Random survey data; first mission probe always rolls a find (mission "result").
  const result = launchProbe(gameState, playerShipClass, Math.random, {
    forceFind: missionFirstProbe
  })

  const messages = []
  if (investigation?.kind === 'intel') {
    const giver = findBody(gameState.galaxy, investigation.mission.giverStationId)
    messages.push(`Investigation data recovered. Return to ${giver?.name ?? 'the mission giver'} to turn it in.`)
  } else if (investigation?.kind === 'hostile') {
    messages.push('Probe stirred a hostile contact! Eliminate them to finish the investigation.')
  } else if (investigation?.kind === 'lead') {
    messages.push(`The signal traces further — new fix on ${investigation.bodyName} in ${investigation.systemName}.`)
  }
  if (probeMissionHere) {
    const giver = findBody(gameState.galaxy, probeMissionHere.giverStationId)
    messages.push(`Survey mission data acquired! Return to ${giver?.name ?? 'the mission giver'} to turn it in.`)
  }
  if (result.found && result.stored) messages.push(`Probe found valuable survey data at ${body.name}! Added to cargo — sell it at any station.`)
  else if (result.found) messages.push(`Probe found valuable survey data at ${body.name}, but your cargo hold is full!`)
  else if (!investigation && !probeMissionHere && !result.blueprint) {
    messages.push(`Probe found nothing of interest at ${body.name}.`)
  }
  if (result.blueprint) {
    messages.push(`Rare find: ${result.blueprint.name}! Stored in ship blueprints — craft at a station Industry bay.`)
  }

  if (attempt >= MAX_PROBE_ATTEMPTS) {
    messages.push(PROBE_EXHAUSTED_MESSAGE)
  }

  // Floating HUD text — never a blocking dialog (keeps pointer lock / flight).
  showFloatingProbeResults(messages)
}

function updateProbeEffect(dt) {
  if (!probeEffect) return
  probeEffect.elapsed += dt
  const { mesh, body } = probeEffect

  // Keep scan hold point tracking the body if it orbits while we wait.
  const liveBodyPos = new THREE.Vector3().fromArray(body.position)
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const toShip = shipPos.clone().sub(liveBodyPos)
  if (toShip.lengthSq() < 1e-6) toShip.set(0, 0, 1)
  else toShip.normalize()
  const bodyRadius = probeScanRadius(body)
  const liveScanPos = liveBodyPos.clone().addScaledVector(toShip, bodyRadius + PROBE_SCAN_STANDOFF)
  probeEffect.scanPos = liveScanPos
  probeEffect.bodyPos = liveBodyPos

  if (probeEffect.phase === 'outbound') {
    const t = Math.min(1, probeEffect.elapsed / PROBE_OUTBOUND_S)
    const lt = easeInOutCubic(t)
    mesh.position.copy(probeEffect.launchPos).lerp(liveScanPos, lt)
    const face = quatFacing(probeEffect.launchPos, liveScanPos)
    updateProbeMesh(mesh, dt, { scanning: false, baseQuat: face })
    if (t >= 1) {
      probeEffect.phase = 'scanning'
      probeEffect.elapsed = 0
      audio.setProbeScanActive(true)
      flashToast(`Scanning ${body.name}…`, PROBE_SCAN_S)
    }
  } else if (probeEffect.phase === 'scanning') {
    mesh.position.copy(liveScanPos)
    // Face the body (+Z toward center) so the nose beam paints the surface.
    const face = quatFacing(liveScanPos, liveBodyPos)
    const scanDist = mesh.position.distanceTo(liveBodyPos)
    // Cap beam visual length; huge worlds would stretch a unit cylinder forever.
    const beamCap = body.kind === 'star' ? 80 : 40
    updateProbeMesh(mesh, dt, { scanning: true, scanDist: Math.min(scanDist, beamCap), baseQuat: face })
    if (probeEffect.elapsed >= PROBE_SCAN_S) {
      probeEffect.phase = 'returning'
      probeEffect.elapsed = 0
      probeEffect.returnStart = mesh.position.clone()
      audio.setProbeScanActive(false)
      audio.playProbeReturn()
      flashToast('Probe returning…', 2.2)
    }
  } else if (probeEffect.phase === 'returning') {
    const t = Math.min(1, probeEffect.elapsed / PROBE_RETURN_S)
    const lt = easeInOutCubic(t)
    // Home on the ship's live position (player may have drifted).
    const home = shipPos.clone().add(
      new THREE.Vector3(0, 0, 3).applyQuaternion(
        new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
      )
    )
    mesh.position.copy(probeEffect.returnStart).lerp(home, lt)
    const face = quatFacing(probeEffect.returnStart, home)
    updateProbeMesh(mesh, dt, { scanning: false, baseQuat: face })
    if (t >= 1) {
      const finishedBody = body
      const attemptNumber = probeEffect.attemptNumber
      clearProbeEffect()
      finishProbeResults(finishedBody, attemptNumber)
    }
  }
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
  const missionBodies = missionMarkedBodyIds(gameState, currentSystem.id)
  const waypointBodyId = gameState.player.waypointBodyId
  for (const body of currentSystem.bodies) {
    const rel = new THREE.Vector3().fromArray(body.position).sub(shipPos)
    const isWaypoint = body.id === waypointBodyId
    // Selected waypoint always paints on radar; other bodies stay range-limited.
    if (!isWaypoint && rel.length() > RADAR_RANGE) continue
    rel.applyQuaternion(shipQuatInverse)
    let kind = 'body'
    if (isWaypoint) kind = 'waypoint'
    else if (missionBodies.has(body.id)) kind = 'mission'
    contacts.push({ x: -rel.x, z: rel.z, kind })
  }

  // Free-space mission waypoint (bounty hunt marker) when no body is set —
  // always shown so a tracked target isn't lost past radar range.
  if (gameState.player.waypointPosition && !gameState.player.waypointBodyId) {
    const rel = new THREE.Vector3().fromArray(gameState.player.waypointPosition).sub(shipPos)
    rel.applyQuaternion(shipQuatInverse)
    contacts.push({ x: -rel.x, z: rel.z, kind: 'mission' })
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
    flashToast('Cannot engage hyperdrive while in combat')
    return
  }
  if (cruising) {
    flashToast('Drop supercruise before engaging hyperdrive')
    return
  }
  if (targetSystemId === gameState.player.currentSystemId) {
    flashToast('Already in that system')
    return
  }
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!canJumpTo(currentSystem, targetSystemId)) {
    flashToast('Out of hyperspace range — jump via a neighboring system first')
    return
  }
  navMapOpen = false
  navMap.hide()
  // Probe can't follow a hyperspace jump — abort mid-survey cleanly.
  clearProbeEffect()
  // Jump is launched from a button click — arm flight intent and grab
  // pointer lock *now* (user gesture). reenterFlightMode at jump end cannot
  // always re-lock after the multi-second animation (no live gesture left).
  flightModeWanted = true
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock().catch(() => {})
  }
  jumpEffect = { elapsed: 0, targetSystemId, jumped: false }
  jumpFlashEl.style.background = HYPERSPACE_FLASH_COLOR
  jumpFlashEl.style.display = 'block'
  hyperspaceTunnel.start()
  audio.playHyperspace()
  audio.announce('Hyperdrive engaged')
}

function updateJumpEffect(dt) {
  syncChaseCamera(camera, gameState.player.ship)
  jumpEffect.elapsed += dt
  const e = jumpEffect.elapsed

  if (e < JUMP_WINDUP_S) {
    // Charge phase: FOV creep + tunnel fades in while speech/windup play.
    const w = e / JUMP_WINDUP_S
    const throb = 0.5 + 0.5 * Math.sin(e * 10)
    camera.fov = BASE_FOV + w * 28 + throb * w * 8
    camera.updateProjectionMatrix()
    // Keep flash light so the SW tunnel is visible through it.
    jumpFlashEl.style.opacity = String(Math.min(0.35, w * 0.28 + throb * 0.05))
    // Tunnel builds late in the wind-up (stars stretch into the corridor).
    hyperspaceTunnel.update(dt, Math.max(0, w - 0.35) / 0.65, camera)
  } else {
    // Full hyperdrive tunnel; system swap mid-corridor.
    const s = (e - JUMP_WINDUP_S) / JUMP_STREAK_S
    const punch = Math.sin(Math.min(1, s) * Math.PI)
    camera.fov = BASE_FOV + 30 + punch * 55
    camera.updateProjectionMatrix()
    jumpFlashEl.style.opacity = String(Math.min(0.55, 0.15 + punch * 0.45))
    // Peak strength mid-tunnel, ease out at the end.
    const tunnelStr = s < 0.15 ? s / 0.15 : s > 0.85 ? (1 - s) / 0.15 : 1
    hyperspaceTunnel.update(dt, Math.min(1, 0.75 + tunnelStr * 0.25), camera)

    if (!jumpEffect.jumped && s >= 0.4) {
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
        hyperspaceTunnel.stop()
        audio.playHyperspaceArrival()
        jumpFlashEl.style.display = 'none'
        camera.fov = BASE_FOV
        camera.updateProjectionMatrix()
        // Jump started from nav (which exits flight) — restore on abort too.
        reenterFlightMode()
        return
      }
    }
  }

  if (jumpEffect && jumpEffect.elapsed >= JUMP_DURATION_S) {
    jumpEffect = null
    hyperspaceTunnel.stop()
    jumpFlashEl.style.display = 'none'
    audio.playHyperspaceArrival()
    audio.announce('Hyperdrive disengaged')
    camera.fov = BASE_FOV
    camera.updateProjectionMatrix()
    // Re-assert sun-facing at jump end (hyperspaceJump already set this at
    // mid-tunnel swap; belt-and-suspenders if anything nudged orientation).
    const ship = gameState.player.ship
    ship.quaternion = quatFacing(
      new THREE.Vector3().fromArray(ship.position),
      new THREE.Vector3(0, 0, 0)
    ).toArray()
    if (playerMesh) syncMeshToEntity(playerMesh, ship)
    // Nav map opens with exitFlightMode and handleJump hides the map without
    // its onClose path — re-arm mouse-aim so the player isn't stuck free-look.
    reenterFlightMode()
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

// Smoothstep-ish ease so docking approaches decelerate into the hang point
// instead of a robotic linear slide.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Hang point just outside the body's collision shell, on the approach line.
function dockExteriorPoint(body, shipPos) {
  const bodyPos = new THREE.Vector3(...body.position)
  const approachDir = bodyPos.clone().sub(shipPos)
  if (approachDir.lengthSq() < 1e-6) approachDir.set(0, 0, 1)
  else approachDir.normalize()
  const bodyRadius = collisionRadiusFor(body) ?? 0
  const standoff = bodyRadius + getShipCollisionRadius(playerShipClass) + DOCK_EXTERIOR_MARGIN
  const exteriorPoint = bodyPos.clone().addScaledVector(approachDir, -standoff)
  return { bodyPos, approachDir, exteriorPoint, standoff }
}

// Docking/undocking is a scripted multi-phase animation:
//   approach hang → brief align settle → flash into bay → park glide.
// Undocking reverses: unpark → flash out → back away. dockedApproach
// remembers the original approach so the reverse trip lines up.
function beginDocking(body) {
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const { bodyPos, approachDir, exteriorPoint } = dockExteriorPoint(body, shipPos)

  // Align hang: slightly closer than exterior, nose locked on bay.
  const alignPoint = exteriorPoint.clone().lerp(bodyPos, 0.12)
  const facingQuat = quatFacing(exteriorPoint, bodyPos)
  // Slight bank into the approach so the glide feels less robotic.
  const bankedFacing = facingQuat.clone().multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.22)
  )
  const alignQuat = quatFacing(alignPoint, bodyPos)

  dockedApproach = { body, exteriorPoint, approachDir }
  dockEffect = {
    undocking: false,
    elapsed: 0,
    body,
    swapped: false,
    thrusterPulsed: false,
    baySettled: false,
    fromPos: shipPos.clone(),
    fromQuat: new THREE.Quaternion().fromArray(gameState.player.ship.quaternion),
    exteriorPoint,
    alignPoint,
    facingQuat: bankedFacing,
    alignQuat
  }
  gameState.player.ship.velocity = [0, 0, 0]
  audio.setThrustState(null)
  // Drop supercruise cleanly (sound + flag) — dockEffect early-returns from
  // animate() so the usual edge-detect path won't run this frame.
  if (cruising || wasCruising) {
    cruising = false
    wasCruising = false
    hideHudGlitch(cruiseIndicatorEl)
    hud?.setCruiseGlitch(false)
    gameState.player.ship.velocity = [0, 0, 0]
    gameState.player.ship.throttle = 0
    motionFx.stopCruiseStreaks()
    thrusterEffects?.stopCruiseStreaks()
    updateStarfieldMotion(starfield, 0, false)
    audio.setSupercruiseActive(false)
    audio.announce('Supercruise disengaged')
  }
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
  const backAwayPoint = exteriorPoint.clone().addScaledVector(
    approachDir,
    -(getShipCollisionRadius(playerShipClass) + UNDOCK_BACKOFF_MARGIN)
  )
  dockEffect = {
    undocking: true,
    elapsed: 0,
    body,
    swapped: false,
    thrusterPulsed: false,
    exteriorPoint,
    awayQuat: quatFacing(exteriorPoint, backAwayPoint),
    backAwayPoint
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
  // Exterior half is slightly longer than bay half so the approach reads.
  const approachEnd = DOCK_ANIM_DURATION_S * 0.42
  const alignEnd = DOCK_ANIM_DURATION_S * 0.55
  const swapAt = alignEnd
  const flashWindow = DOCK_FLASH_FADE_S

  if (!dockEffect.undocking) {
    if (dockEffect.elapsed < approachEnd) {
      // Phase 1: banked glide to hang point outside the shell.
      const lt = easeInOutCubic(dockEffect.elapsed / approachEnd)
      gameState.player.ship.position = dockEffect.fromPos.clone().lerp(dockEffect.exteriorPoint, lt).toArray()
      gameState.player.ship.quaternion = dockEffect.fromQuat.clone().slerp(dockEffect.facingQuat, lt).toArray()
      if (!dockEffect.thrusterPulsed && dockEffect.elapsed > 0.15) {
        dockEffect.thrusterPulsed = true
        audio.playDockThrusterPulse()
      }
    } else if (dockEffect.elapsed < alignEnd) {
      // Phase 2: nose settle / slight nudge toward bay before the cut.
      const lt = easeInOutCubic((dockEffect.elapsed - approachEnd) / (alignEnd - approachEnd))
      gameState.player.ship.position = dockEffect.exteriorPoint.clone().lerp(dockEffect.alignPoint, lt).toArray()
      gameState.player.ship.quaternion = dockEffect.facingQuat.clone().slerp(dockEffect.alignQuat, lt).toArray()
    } else {
      // Phase 3: flash into bay, then ease into the park slot with a soft settle.
      if (!dockEffect.swapped) {
        dockEffect.swapped = true
        swapToInterior()
        gameState.player.ship.position = DOCKING_BAY_ORIGIN.clone().add(BAY_ENTRY_OFFSET).toArray()
        gameState.player.ship.quaternion = [0, 0, 0, 1] // bay local +Z into the bay
        audio.playDockThrusterPulse()
      }
      const bayT = Math.min(1, (dockEffect.elapsed - swapAt) / (DOCK_ANIM_DURATION_S - swapAt))
      const lt = easeInOutCubic(bayT)
      const entry = DOCKING_BAY_ORIGIN.clone().add(BAY_ENTRY_OFFSET)
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      gameState.player.ship.position = entry.lerp(park, lt).toArray()
      // Soft roll-out of residual bank as we settle into the pad.
      const settleRoll = (1 - lt) * 0.12
      gameState.player.ship.quaternion = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(0, 0, 1), settleRoll)
        .toArray()
      if (!dockEffect.baySettled && bayT > 0.85) {
        dockEffect.baySettled = true
      }
    }
  } else {
    const half = DOCK_ANIM_DURATION_S / 2
    if (dockEffect.elapsed < half) {
      const lt = easeInOutCubic(dockEffect.elapsed / half)
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      const entry = DOCKING_BAY_ORIGIN.clone().add(BAY_ENTRY_OFFSET)
      gameState.player.ship.position = park.clone().lerp(entry, lt).toArray()
      // Pitch up slightly as we leave the pad.
      const pitch = lt * 0.18
      gameState.player.ship.quaternion = new THREE.Quaternion()
        .setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch)
        .toArray()
    } else {
      if (!dockEffect.swapped) {
        dockEffect.swapped = true
        swapToExterior()
        gameState.player.ship.position = dockEffect.exteriorPoint.toArray()
        gameState.player.ship.quaternion = dockEffect.awayQuat.toArray()
        audio.playDockThrusterPulse()
      }
      const lt = easeInOutCubic(Math.min(1, (dockEffect.elapsed - half) / half))
      gameState.player.ship.position = dockEffect.exteriorPoint.clone().lerp(dockEffect.backAwayPoint, lt).toArray()
      // Level out while backing away.
      const level = dockEffect.awayQuat.clone()
      gameState.player.ship.quaternion = level.toArray()
      if (!dockEffect.thrusterPulsed && lt > 0.2) {
        dockEffect.thrusterPulsed = true
        audio.playDockThrusterPulse()
      }
    }
  }

  syncMeshToEntity(playerMesh, gameState.player.ship)
  // Chase camera a touch closer during dock so the bay sequence fills the frame.
  syncChaseCamera(camera, gameState.player.ship)

  // Bright flash centered on the scene swap, fading out over flashWindow.
  const sinceSwap = dockEffect.elapsed - swapAt
  if (dockEffect.undocking) {
    const half = DOCK_ANIM_DURATION_S / 2
    const uSince = dockEffect.elapsed - half
    if (uSince >= 0 && uSince < flashWindow) {
      jumpFlashEl.style.opacity = String(Math.max(0, 1 - uSince / flashWindow))
    } else if (uSince >= flashWindow) {
      jumpFlashEl.style.opacity = '0'
    } else {
      const untilSwap = half - dockEffect.elapsed
      jumpFlashEl.style.opacity = untilSwap < 0.2 ? String(1 - untilSwap / 0.2) : '0'
    }
  } else if (sinceSwap >= 0 && sinceSwap < flashWindow) {
    jumpFlashEl.style.opacity = String(Math.max(0, 1 - sinceSwap / flashWindow))
  } else if (sinceSwap >= flashWindow) {
    jumpFlashEl.style.opacity = '0'
  } else {
    // Soft ramp-up into the swap so the cut isn't a hard pop.
    const untilSwap = swapAt - dockEffect.elapsed
    jumpFlashEl.style.opacity = untilSwap < 0.22 ? String(1 - untilSwap / 0.22) : '0'
  }

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
  if (e.code === 'KeyF' && !docked && !dockEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    const body = findNearbyDockableBody()
    if (body) {
      beginDocking(body)
    } else {
      const wreck = findNearbyWreck()
      if (wreck) lootNearbyWreck(wreck)
    }
  } else if (e.code === 'KeyP' && !docked && !dockEffect && !probeEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    // Orbit + Tab-target planet/moon/star, or close-range belt/body flyby.
    const launch = getProbeLaunchTarget()
    if (launch) probeBody(launch.body)
  } else if (e.code === 'F5') {
    e.preventDefault()
    doSave()
  } else if (e.code === 'Escape' && !docked && !navMapOpen && !inventoryOpen && !missionsOpen) {
    paused = !paused
    audio.setThrustState(null)
    if (paused) {
      exitFlightMode()
      pauseMenu.show()
    } else {
      pauseMenu.hide()
      reenterFlightMode()
    }
  } else if (e.code === 'KeyM' && !docked && !paused && !inventoryOpen && !missionsOpen) {
    navMapOpen = !navMapOpen
    audio.setThrustState(null)
    if (navMapOpen) {
      exitFlightMode()
      navMap.show({
        onJump: handleJump,
        onClose: () => { navMapOpen = false; reenterFlightMode() },
        supercruiseActive: cruising,
        inCombat: !!gameState.inCombat
      })
    } else {
      navMap.hide()
      reenterFlightMode()
    }
  } else if (e.code === 'KeyC' && !docked && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    if (cruising) {
      cruising = false
    } else if (!getActiveWaypoint()) {
      flashToast('Set a waypoint first (Navigation, Ctrl+Tab on a body, or J for missions)')
    } else if (gameState.inCombat) {
      flashToast('Cannot engage supercruise while in combat')
    } else {
      cruising = true
      gameState.player.ship.supercruiseElapsed = 0
    }
  } else if (e.code === 'Space' && !docked && !dockEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    // If locked in flight, Space exits. If wanted-but-lost (tab-out) or off,
    // Space (re)enters — so tabbing out then Space re-acquires cleanly.
    if (flightMode && document.pointerLockElement === renderer.domElement) {
      exitFlightMode()
    } else {
      reenterFlightMode()
    }
  } else if (e.code === 'Tab' && !docked && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Tab: set waypoint on body under the crosshair.
      setWaypointFromCrosshair()
    } else if (e.shiftKey) {
      // Shift+Tab: clear lock (plain Tab still cycles).
      currentTarget = null
      if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
    } else {
      cycleTarget()
    }
  } else if (e.code === 'KeyI' && !docked && !navMapOpen && !paused && !missionsOpen) {
    inventoryOpen = !inventoryOpen
    audio.setThrustState(null)
    if (inventoryOpen) {
      exitFlightMode()
      inventoryUI.show(() => { inventoryOpen = false; reenterFlightMode() })
    } else {
      inventoryUI.hide()
      reenterFlightMode()
    }
  } else if (e.code === 'KeyJ' && !docked && !navMapOpen && !paused && !inventoryOpen) {
    missionsOpen = !missionsOpen
    audio.setThrustState(null)
    if (missionsOpen) {
      exitFlightMode()
      missionsUI.show(() => { missionsOpen = false; reenterFlightMode() })
    } else {
      missionsUI.hide()
      reenterFlightMode()
    }
  }
})

// Tab-targeting range matches radar for ships/wrecks/rocks. Celestial bodies
// (planets, moons, stations, settlements, star) use distance-to-surface so a
// large world stays lockable without needing to be inside its shell.
const TARGET_RANGE = RADAR_RANGE
// Rough star shell for range checks (real star mesh radii vary by type/scale;
// this only gates "near enough to tab-lock", not collision).
// Rough star shell for Tab-target range (tracks 6× sun scale; was 2200).
const STAR_TARGET_RADIUS = 13200

const TARGETABLE_BODY_KINDS = new Set(['planet', 'moon', 'station', 'settlement'])

function asteroidWorldPosition(field, rock) {
  return [field.position[0] + rock.position[0], field.position[1] + rock.position[1], field.position[2] + rock.position[2]]
}

// Aliens are always hostile to the player; pirates are too, except while
// truced against a shared alien threat (see combat.js's truceActive) — used
// for both the radar dot color and the target-indicator reticle tint.
function isHostileToPlayer(npc) {
  return npc.faction === 'alien' || (npc.faction === 'pirate' && !truceActive(gameState))
}

function bodyKindLabel(kind) {
  if (kind === 'asteroidField') return 'belt'
  return kind
}

function getTargetableEntities() {
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const entities = []

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(npc.position))
    if (dist <= TARGET_RANGE) entities.push({ kind: 'npc', id: npc.id, position: npc.position, dist, radius: 0 })
  }

  for (const wreck of gameState.wrecks) {
    const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(wreck.position))
    if (dist <= TARGET_RANGE) entities.push({ kind: 'wreck', id: wreck.id, position: wreck.position, dist, radius: 0 })
  }

  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)

  // System star (always at local origin).
  {
    const starPos = [0, 0, 0]
    const dist = shipPos.distanceTo(new THREE.Vector3(...starPos))
    const surfaceDist = Math.max(0, dist - STAR_TARGET_RADIUS)
    if (surfaceDist <= TARGET_RANGE) {
      entities.push({
        kind: 'star',
        id: SYSTEM_STAR_WAYPOINT_ID,
        position: starPos,
        dist: surfaceDist,
        radius: STAR_TARGET_RADIUS,
        name: `${currentSystem?.name ?? 'System'} Star`
      })
    }
  }

  for (const body of currentSystem.bodies) {
    if (TARGETABLE_BODY_KINDS.has(body.kind)) {
      const bodyPos = new THREE.Vector3().fromArray(body.position)
      const dist = shipPos.distanceTo(bodyPos)
      const radius = collisionRadiusFor(body) ?? 0
      // Surface distance: large planets stay targetable from outside the shell.
      const surfaceDist = Math.max(0, dist - radius)
      if (surfaceDist <= TARGET_RANGE) {
        entities.push({
          kind: 'body',
          id: body.id,
          position: body.position,
          dist: surfaceDist,
          radius,
          bodyKind: body.kind,
          name: body.name
        })
      }
    } else if (body.kind === 'asteroidField') {
      getAsteroidRocks(body).forEach((rock, index) => {
        if (!isRockAlive(gameState, body.id, index)) return
        const position = asteroidWorldPosition(body, rock)
        const dist = shipPos.distanceTo(new THREE.Vector3(...position))
        if (dist <= TARGET_RANGE) entities.push({ kind: 'asteroid', fieldId: body.id, index, position, dist, radius: 0 })
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

// How well the ship's forward boresight lines up with an entity. Small targets
// use a pure cone; large bodies also score high if the aim ray clips their shell
// (looking at a planet's limb still locks the planet).
function aimScore(entity, shipPos, forward) {
  const pos = new THREE.Vector3().fromArray(entity.position)
  const to = pos.clone().sub(shipPos)
  const dist = to.length()
  if (dist < 1e-4) return 1
  const dir = to.clone().multiplyScalar(1 / dist)
  let score = dir.dot(forward)
  const radius = entity.radius ?? 0
  if (radius > 2) {
    const along = to.dot(forward)
    if (along > 0) {
      const missSq = Math.max(0, to.lengthSq() - along * along)
      if (missSq <= radius * radius) score = Math.max(score, 0.995)
    }
  }
  return score
}

// Bodies that can be locked as a navigation waypoint via Ctrl+Tab (fields as
// a whole, not individual rocks — rocks are combat/mining targets only).
const WAYPOINTABLE_BODY_KINDS = new Set(['planet', 'moon', 'station', 'settlement', 'asteroidField'])

// Ctrl+Tab: set (or clear) a waypoint on whatever body is under the crosshair.
// No range limit — any body in the system whose aim cone / limb is under the
// reticle counts (distant planets included). Combat Tab targeting still uses TARGET_RANGE.
function setWaypointFromCrosshair() {
  if (!gameState) return
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
  )
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  const candidates = []

  // System star at origin — always eligible; aimScore decides if it's under reticle.
  candidates.push({
    id: SYSTEM_STAR_WAYPOINT_ID,
    position: [0, 0, 0],
    radius: STAR_TARGET_RADIUS,
    name: `${currentSystem?.name ?? 'System'} Star`
  })

  for (const body of currentSystem.bodies) {
    if (!WAYPOINTABLE_BODY_KINDS.has(body.kind)) continue
    const radius = collisionRadiusFor(body) ?? (body.kind === 'asteroidField' ? (body.radius ?? 80) : 0)
    candidates.push({
      id: body.id,
      position: body.position,
      radius,
      name: body.name
    })
  }

  // Prefer strongest aim; limb-hit on large shells scores ~0.995 (see aimScore).
  // Threshold only filters "not actually under the crosshair" — never distance.
  let best = null
  let bestScore = 0.9
  for (const c of candidates) {
    const score = aimScore(c, shipPos, forward)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }

  if (!best) {
    flashToast('No body under crosshair — aim at a planet, moon, star, station, settlement, or belt')
    return
  }

  if (gameState.player.waypointBodyId === best.id) {
    gameState.player.waypointBodyId = null
    gameState.player.waypointPosition = null
    flashToast(`Waypoint cleared: ${best.name}`)
    return
  }

  gameState.player.waypointBodyId = best.id
  gameState.player.waypointPosition = best.id === SYSTEM_STAR_WAYPOINT_ID ? [0, 0, 0] : null
  flashToast(`Waypoint set: ${best.name}`)
}

// Primary star tint for VFX (cruise tunnel). Binary uses the larger component
// (first entry in starMesh.userData.stars — see buildStarMesh).
function getCurrentStarColor() {
  const primary = starMesh?.userData?.stars?.[0]?.color
  return primary?.clone?.() ?? primary ?? null
}

/** Subtle starfield + scene-background tint from the system sun. */
function applySystemStarAmbient() {
  const starColor = getCurrentStarColor()
  setStarfieldStarTint(starfield, starColor)
  if (starColor) {
    const bg = starColor.clone().lerp(new THREE.Color(0x05070d), 0.94)
    bg.multiplyScalar(0.42)
    scene.background = bg
  } else {
    scene.background = new THREE.Color(0x05070d)
    setStarfieldStarTint(starfield, null)
  }
}

// Host shells that contain the active waypoint (surface settlements etc.) —
// tunnel must not fling the player to the far side of the parent planet.
function cruiseTunnelIgnoreIds(wp, bodies) {
  if (!wp || !bodies?.length) return null
  const ids = new Set()
  for (const body of bodies) {
    if (ignoreBodyAsCruiseObstacle(body, wp.position, wp.bodyId, wp.arrivalRange)) {
      ids.add(body.id)
    }
  }
  return ids.size ? ids : null
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
    let bestScore = 0.94 // roughly a 20deg cone around the crosshair
    for (const e of entities) {
      const score = aimScore(e, shipPos, forward)
      if (score > bestScore) {
        bestScore = score
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
// Reticle amber tint for asteroids (updateTargetIndicator).
function resolveTarget() {
  if (!currentTarget) return null
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (currentTarget.kind === 'npc') {
    const npc = gameState.npcs.find((n) => n.id === currentTarget.id && !n.destroyed)
    if (!npc) return null
    const shipClass = getShipClass(npc.shipClassId)
    return { position: npc.position, name: shipClass.name, hostile: isHostileToPlayer(npc), hullPct: Math.max(0, npc.hull / shipClass.stats.hull), isAsteroid: false, reticle: 'hostile' }
  }
  if (currentTarget.kind === 'wreck') {
    const wreck = gameState.wrecks.find((w) => w.id === currentTarget.id)
    return wreck ? { position: wreck.position, name: 'Wreck', hostile: false, hullPct: null, isAsteroid: false, reticle: 'wreck' } : null
  }
  if (currentTarget.kind === 'asteroid') {
    const field = currentSystem.bodies.find((b) => b.id === currentTarget.fieldId)
    if (!field) return null
    const rock = getAsteroidRocks(field)[currentTarget.index]
    if (!rock || !isRockAlive(gameState, field.id, currentTarget.index)) return null
    return { position: asteroidWorldPosition(field, rock), name: `${rockDisplayName(currentSystem)} (${field.name})`, hostile: false, hullPct: null, isAsteroid: true, reticle: 'asteroid' }
  }
  if (currentTarget.kind === 'star') {
    return {
      position: [0, 0, 0],
      name: `${currentSystem?.name ?? 'System'} Star`,
      hostile: false,
      hullPct: null,
      isAsteroid: false,
      reticle: 'star',
      kindLabel: 'star'
    }
  }
  // Free-space nav point (e.g. after supercruise drop on a mission marker).
  if (currentTarget.kind === 'navpoint') {
    if (!currentTarget.position) return null
    return {
      position: currentTarget.position,
      name: currentTarget.name || 'Destination',
      hostile: false,
      hullPct: null,
      isAsteroid: false,
      reticle: 'nav',
      kindLabel: 'nav'
    }
  }
  if (currentTarget.kind !== 'body') return null
  const body = currentSystem.bodies.find((b) => b.id === currentTarget.id)
  if (!body) return null
  return {
    position: body.position,
    name: body.name,
    hostile: false,
    hullPct: null,
    isAsteroid: false,
    reticle: body.kind === 'station' || body.kind === 'settlement' ? 'facility' : 'world',
    kindLabel: bodyKindLabel(body.kind)
  }
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
  // Reticle tint by target class.
  const color = target.hostile
    ? '#e05a5a'
    : target.reticle === 'asteroid'
      ? '#ffb347'
      : target.reticle === 'star'
        ? '#ffd27a'
        : target.reticle === 'facility'
          ? '#7fe6ff'
          : target.reticle === 'world'
            ? '#9ad0ff'
            : target.reticle === 'wreck'
              ? '#c0a070'
              : target.reticle === 'nav'
                ? '#7fe0a0'
                : '#cfe3ff'
  targetIndicatorEl.querySelector('.target-box').style.borderColor = color
  const label = targetIndicatorEl.querySelector('.target-label')
  label.style.color = color
  const dist = new THREE.Vector3().fromArray(gameState.player.ship.position).distanceTo(new THREE.Vector3(...target.position))
  const kindBit = target.kindLabel ? ` · ${target.kindLabel}` : ''
  label.textContent = target.hullPct !== null
    ? `${target.name} · ${Math.round(dist)}m · ${Math.round(target.hullPct * 100)}%`
    : `${target.name}${kindBit} · ${Math.round(dist)}m`
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
  // Camera matrices must match the seat we just placed (see syncChaseCamera).
  camera.updateMatrixWorld(true)
  const projected = aimPoint.project(camera)
  if (projected.z > 1) return

  // Whole pixels — subpixel left/top churn reads as a shaky reticle.
  const x = Math.round((projected.x * 0.5 + 0.5) * window.innerWidth)
  const y = Math.round((-projected.y * 0.5 + 0.5) * window.innerHeight)
  crosshairEl.style.left = `${x}px`
  crosshairEl.style.top = `${y}px`
}

/** After SC drops the waypoint, lock Tab-target on the destination for a reticle. */
function setTargetFromSupercruiseArrival(wp) {
  if (!wp) return
  if (wp.bodyId === SYSTEM_STAR_WAYPOINT_ID) {
    currentTarget = { kind: 'star', id: SYSTEM_STAR_WAYPOINT_ID }
    return
  }
  if (wp.bodyId) {
    currentTarget = { kind: 'body', id: wp.bodyId }
    return
  }
  // Free-space marker (e.g. bounty hunt) — fixed point, not a body.
  if (wp.position) {
    currentTarget = {
      kind: 'navpoint',
      id: 'sc-arrival',
      position: [...wp.position],
      name: wp.name || 'Destination'
    }
  }
}

// Body waypoint, system star, or free-space mission marker (bounty location).
function getActiveWaypoint() {
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (gameState.player.waypointBodyId === SYSTEM_STAR_WAYPOINT_ID) {
    return {
      position: [0, 0, 0],
      name: `${currentSystem?.name ?? 'System'} Star`,
      bodyId: SYSTEM_STAR_WAYPOINT_ID,
      isMission: false,
      // Star has no dock bubble — keep a wide clear standoff from the corona.
      arrivalRange: 15000 + getShipCollisionRadius(playerShipClass) + SUPERCRUISE_ARRIVAL_MIN_CLEAR
    }
  }
  if (gameState.player.waypointBodyId) {
    const body = currentSystem.bodies.find((b) => b.id === gameState.player.waypointBodyId)
    if (body) {
      const missionBodies = missionMarkedBodyIds(gameState, currentSystem.id)
      return {
        position: body.position,
        name: body.name,
        bodyId: body.id,
        isMission: missionBodies.has(body.id),
        arrivalRange: supercruiseArrivalRangeFor(body)
      }
    }
  }
  if (gameState.player.waypointPosition) {
    return {
      position: gameState.player.waypointPosition,
      name: 'Mission Target',
      bodyId: null,
      isMission: true,
      arrivalRange: 80
    }
  }
  return null
}

// After bodies move on their orbits, co-move the ship if it's bound in their
// gravity well. Thrusters still apply in inertial space, so the player can
// burn out of capture range.
function applyOrbitalCarry(sysBodies, prevPositions, dt) {
  if (docked || dockEffect || jumpEffect || !gameState) return
  const ship = gameState.player.ship
  const shipPos = new THREE.Vector3().fromArray(ship.position)

  let best = null
  let bestDist = Infinity
  for (const body of sysBodies) {
    if (body.kind !== 'planet' && body.kind !== 'moon' && body.kind !== 'station') continue
    const prev = prevPositions.get(body.id)
    if (!prev) continue
    const bodyPos = new THREE.Vector3().fromArray(body.position)
    const dist = shipPos.distanceTo(bodyPos)
    const capture = (collisionRadiusFor(body) ?? 0) + ORBITAL_CARRY_MARGIN
    if (dist >= capture || dist >= bestDist) continue
    bestDist = dist
    best = {
      dx: body.position[0] - prev[0],
      dy: body.position[1] - prev[1],
      dz: body.position[2] - prev[2]
    }
  }

  if (best) {
    ship.position[0] += best.dx
    ship.position[1] += best.dy
    ship.position[2] += best.dz
    return
  }

  // Solar co-orbit: rotate around system origin (star) when near enough and
  // not bound to a planet/moon/station. Deep core is skipped.
  const x = ship.position[0]
  const z = ship.position[2]
  const r = Math.hypot(x, z)
  // Skip deep core (inside/near the star) and beyond the co-orbit band.
  if (r < 3000 || r > STAR_ORBITAL_CARRY_RADIUS) return
  const a = STAR_ORBITAL_OMEGA * dt
  const c = Math.cos(a)
  const s = Math.sin(a)
  ship.position[0] = x * c - z * s
  ship.position[2] = x * s + z * c
}

function updateWaypointIndicator() {
  const wp = getActiveWaypoint()
  if (!wp) {
    waypointEl.style.display = 'none'
    return
  }

  const color = wp.isMission ? '#ff8a3d' : '#7fe0a0'
  const targetPos = new THREE.Vector3(...wp.position)
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const distance = shipPos.distanceTo(targetPos)

  // Camera-space direction (Three: look = -Z). Don't use project().z for
  // "behind" — points past camera.far look behind even when in front, which
  // hid far waypoints in large systems.
  const camLocal = targetPos.clone().applyMatrix4(camera.matrixWorldInverse)
  const behind = camLocal.z >= 0
  const w = window.innerWidth
  const h = window.innerHeight
  const cx = w / 2
  const cy = h / 2
  const margin = 60

  // Screen-space offset from center using view direction (works at any range).
  let dirX = camLocal.x
  let dirY = -camLocal.y // screen Y is down
  if (behind) {
    dirX = -dirX
    dirY = -dirY
  }
  if (Math.abs(dirX) < 1e-6 && Math.abs(dirY) < 1e-6) {
    dirX = 0.0001
    dirY = behind ? 1 : -1
  }

  // On-screen only when in front and inside the view frustum (NDC).
  const projected = targetPos.clone().project(camera)
  const onScreen =
    !behind &&
    projected.x >= -1 &&
    projected.x <= 1 &&
    projected.y >= -1 &&
    projected.y <= 1

  let dx
  let dy
  if (onScreen) {
    dx = (projected.x * 0.5 + 0.5) * w - cx
    dy = (-projected.y * 0.5 + 0.5) * h - cy
  } else {
    // Clamp to screen edge in the direction of the target.
    const sx = (w / 2 - margin) / Math.abs(dirX)
    const sy = (h / 2 - margin) / Math.abs(dirY)
    const edge = Math.min(sx, sy)
    dx = dirX * edge
    dy = dirY * edge
  }

  const angle = Math.atan2(dy, dx) + Math.PI / 2
  waypointEl.style.left = `${cx + dx}px`
  waypointEl.style.top = `${cy + dy}px`
  waypointEl.style.transform = 'translate(-50%, -50%)'
  waypointEl.style.display = 'block'
  const arrow = waypointEl.querySelector('.wp-arrow')
  arrow.style.transform = `rotate(${angle}rad)`
  arrow.style.borderBottomColor = color
  const label = waypointEl.querySelector('.wp-label')
  label.style.color = color
  const distLabel = distance >= 10000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`
  label.textContent = `${wp.name} · ${distLabel}`
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
  updateStarfield(starfield, now / 1000)

  if (!gameState) {
    motionFx.hide()
    updateMenuBackground(dt)
    renderer.render(scene, camera)
    return
  }

  // Wall-clock industry jobs (run even while docked / in menus / mid-jump UI).
  {
    const done = updateCraftingJobs(gameState, Date.now())
    if (done.length) toastCraftCompleted(done)
  }

  if (jumpEffect) {
    motionFx.hide()
    updateJumpEffect(dt)
    renderer.render(scene, camera)
    return
  }

  // Checked before the `docked` early-return below: docked stays true for
  // the whole undocking animation (it only flips false once the animation
  // completes), so this branch must run regardless of `docked`.
  if (dockEffect) {
    motionFx.hide()
    updateDockEffect(dt)
    // Bay activity runs as soon as the interior is swapped in.
    if (interiorMesh?.parent) updateStationInterior(interiorMesh, dt)
    renderer.render(scene, camera)
    return
  }

  if (docked || paused || navMapOpen || inventoryOpen || missionsOpen) {
    audio.setStrafeActive(false)
    motionFx.hide()
    updateStarfieldMotion(starfield, 0, false)
    // Keep the hangar alive behind the docking UI (loaders, drones, lights).
    if (docked && interiorMesh?.parent) {
      updateStationInterior(interiorMesh, dt)
      // Gentle camera drift so the bay doesn't feel frozen while menus are open.
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      const t = performance.now() * 0.00015
      camera.position.set(
        park.x + Math.sin(t) * 4,
        park.y + 10 + Math.sin(t * 0.7) * 1.2,
        park.z - 28 + Math.cos(t * 0.5) * 2
      )
      camera.lookAt(park.x, park.y + 1, park.z + 4)
    }
    renderer.render(scene, camera)
    return
  }

  gameState.simTime += dt

  // Probe flight runs in normal play (ship can still fly while it works).
  if (probeEffect) updateProbeEffect(dt)

  let thrustState = null
  if (cruising) {
    const wp = getActiveWaypoint()
    if (!wp || gameState.inCombat) {
      cruising = false
    } else {
      const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
      const shipRadius = getShipCollisionRadius(playerShipClass)
      // Steer around other bodies on the way; destination body is not avoided
      // so arrival still works (see supercruise.aimAroundObstacles).
      if (updateSupercruise(
        gameState.player.ship,
        playerShipClass,
        wp.position,
        dt,
        wp.arrivalRange,
        currentSystem.bodies,
        shipRadius,
        wp.bodyId
      )) {
        cruising = false
        // Kill residual cruise speed immediately so we don't coast into the shell.
        gameState.player.ship.velocity = [0, 0, 0]
        gameState.player.ship.throttle = 0
        // Keep a reticle on the destination after the waypoint is cleared.
        setTargetFromSupercruiseArrival(wp)
        // Clear nav lock on arrival — you're already there.
        gameState.player.waypointBodyId = null
        gameState.player.waypointPosition = null
        // Snap facing onto the destination so you're lined up to dock/approach.
        const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
        const targetPos = new THREE.Vector3(...wp.position)
        if (shipPos.distanceToSquared(targetPos) > 1e-4) {
          gameState.player.ship.quaternion = quatFacing(shipPos, targetPos).toArray()
        }
      }
    }
    audio.setThrustState(null)
  } else {
    // Alt free-look consumes mouse deltas so the ship doesn't turn with the pan.
    if (isChaseFreeLook() && flightMode) {
      addChaseFreeLookDelta(mouseAim.dx, mouseAim.dy)
      mouseAim.dx = 0
      mouseAim.dy = 0
    }
    updateFlight(gameState.player.ship, playerShipClass, flightMode ? keys : EMPTY_KEYS, mouseAim, dt)
    thrustState = !flightMode ? null : keys.has('KeyW') ? 'accel' : keys.has('KeyS') ? 'brake' : null
    audio.setThrustState(thrustState)
  }
  // Edge-detect engage/disengage so sample spool-down + voice callout both
  // fire on auto-arrival, combat interrupt, and manual KeyC alike.
  audio.setSupercruiseActive(cruising)
  if (cruising !== wasCruising) {
    if (cruising) {
      // Spool ramp starts at 0 every engage (see supercruise.SUPERCRUISE_RAMP_UP_S).
      gameState.player.ship.supercruiseElapsed = 0
    } else {
      // Drop all residual cruise speed so normal flight doesn't inherit a huge v.
      gameState.player.ship.velocity = [0, 0, 0]
      gameState.player.ship.throttle = 0
      gameState.player.ship.supercruiseElapsed = 0
      // Kill cyan velocity streaks / starfield stretch immediately (don't wait a frame).
      motionFx.stopCruiseStreaks()
      thrusterEffects?.stopCruiseStreaks()
      updateStarfieldMotion(starfield, 0, false)
    }
    audio.announce(cruising ? 'Supercruise engaged' : 'Supercruise disengaged')
    if (cruising) {
      setHudGlitchText(cruiseIndicatorEl, 'SUPERCRUISE ENGAGED')
      showHudGlitch(cruiseIndicatorEl)
      hud?.setCruiseGlitch(true)
    } else {
      hideHudGlitch(cruiseIndicatorEl)
      hud?.setCruiseGlitch(false)
    }
    wasCruising = cruising
  }

  const currentBodies = getSystem(gameState.galaxy, gameState.player.currentSystemId).bodies
  const shipRadius = getShipCollisionRadius(playerShipClass)
  if (cruising) {
    // Tunnel through non-destination bodies with warp FX instead of bouncing.
    // Also skip host shells that contain the waypoint (settlement on a planet).
    const wp = getActiveWaypoint()
    const tunnel = trySupercruiseTunnel(
      gameState.player.ship,
      currentBodies,
      shipRadius,
      wp?.bodyId ?? null,
      cruiseTunnelIgnoreIds(wp, currentBodies)
    )
    if (tunnel) {
      thrusterEffects?.playTunnelBurst(tunnel.from, tunnel.to)
      audio.playSupercruiseTunnel()
    }
  } else {
    resolveBodyCollisions(gameState.player.ship, currentBodies, shipRadius)
  }

  const shipSpeed = Math.hypot(...gameState.player.ship.velocity)
  const motion = motionFx.update(dt, {
    speed: shipSpeed,
    refSpeed: playerShipClass.stats.speed,
    cruising,
    throttle: cruising ? 1 : (gameState.player.ship.throttle ?? 0),
    shipPos: gameState.player.ship.position,
    shipQuat: gameState.player.ship.quaternion,
    camera,
    starColor: cruising ? getCurrentStarColor() : null
  })
  // Skybox stays unwarped; cruise uses motionFx full-screen star tunnel.
  updateStarfieldMotion(starfield, motion.intensity, cruising)
  // Speed FOV: mild in normal flight; cruise uses a fixed +5% FOV only.
  // Snap when close so continuous FOV lerp doesn't jitter projected HUD reticles.
  const targetFov = cruising ? CRUISE_FOV : BASE_FOV + motion.fovBoost
  if (Math.abs(camera.fov - targetFov) < 0.03) {
    if (camera.fov !== targetFov) {
      camera.fov = targetFov
      camera.updateProjectionMatrix()
    }
  } else {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4)
    camera.updateProjectionMatrix()
  }
  // SUPERCRUISE ENGAGED: shown/hidden with glitch enter/exit on wasCruising edge.
  // Player mesh + chase cam are re-synced after orbital carry (see below).
  syncMeshToEntity(playerMesh, gameState.player.ship)
  const strafeX = cruising ? 0 : (gameState.player.ship.strafeX ?? 0)
  const strafeY = cruising ? 0 : (gameState.player.ship.strafeY ?? 0)
  audio.setStrafeActive(!cruising && flightMode && (strafeX !== 0 || strafeY !== 0))
  thrusterEffects.update(dt, {
    accelActive: thrustState === 'accel',
    brakeActive: thrustState === 'brake',
    cruiseActive: cruising,
    strafeX,
    strafeY,
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

  // Normal weapons only — lasers mine asteroids on hit (see combat.js).
  if (flightMode && !cruising) {
    if (laserFireHeld) fireProjectile(gameState, gameState.player.ship, playerShipClass, 'player', onWeaponFired, 'laser')
    if (missileFireHeld) fireProjectile(gameState, gameState.player.ship, playerShipClass, 'player', onWeaponFired, 'missile')
  }
  oreScoopEffects?.update(dt, new THREE.Vector3().fromArray(gameState.player.ship.position))

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    updateNpcAI(npc, gameState, dt, onWeaponFired)
    // Shown once, the frame an NPC commits to a suicide run (see combat.js's
    // RAM_CHANCE) — ramQuote is set exactly once, alongside aiState, so this
    // flag just guards against re-showing it every subsequent frame.
    if (npc.aiState === 'ram' && !npc.ramAnnounced) {
      npc.ramAnnounced = true
      factionToastEl.style.color = '#e05a5a'
      setHudGlitchText(factionToastEl, npc.ramQuote)
      showHudGlitch(factionToastEl)
      factionToastUntil = gameState.simTime + FACTION_TOAST_DURATION_S
    }
  }
  updateProjectiles(gameState, dt, onProjectileHit)
  updateCombatFlag(gameState)
  // Player shields: 1% of max every 10s while out of combat (see combat.js).
  regenShields(gameState.player.ship, playerShipClass, gameState.simTime, dt, {
    player: true,
    inCombat: gameState.inCombat
  })
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
      factionToastEl.style.color = '#7fe0a0'
      setHudGlitchText(factionToastEl, 'The pirates thank you for the assist, and hyperspace away.')
      showHudGlitch(factionToastEl)
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
  // Neutral-only ambient traffic:
  //  - home system until the player breaks peace (see combat.js)
  //  - Whispers (outer rim landmark) permanently — mission NPCs still spawn
  const atPeacefulHome = gameState.player.currentSystemId === gameState.player.startingSystemId && !gameState.flags.startingSystemPeaceBroken
  const forceNeutralAmbient = atPeacefulHome || !!spawnSystem.noAmbientHostiles
  if (gameState.simTime > nextAmbientSpawnAt && gameState.npcs.filter((n) => !n.destroyed).length < ambientCap) {
    gameState.npcs.push(spawnEncounterNear(Math.random, gameState.player.ship.position, gameState.galaxy, core, forceNeutralAmbient))
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
  const sysBodies = getSystem(gameState.galaxy, gameState.player.currentSystemId).bodies
  // Snapshot body positions so the ship can co-move with orbital deltas.
  const prevBodyPositions = new Map()
  for (const body of sysBodies) {
    prevBodyPositions.set(body.id, [body.position[0], body.position[1], body.position[2]])
  }

  // Planets (+ star-orbit stations) first so children can follow.
  for (const orbit of planetOrbits.values()) {
    const angle = orbit.angle0 + gameState.simTime * orbit.speed
    orbit.body.position[0] = orbit.radius * Math.cos(angle)
    orbit.body.position[1] = orbit.y
    orbit.body.position[2] = orbit.radius * Math.sin(angle)
    const mesh = bodyMeshes.get(orbit.body.id)
    if (mesh) mesh.position.fromArray(orbit.body.position)
  }
  // Moons / orbiting stations, then surface settlements (fixed offset on parent).
  for (const orbit of moonOrbits.values()) {
    if (orbit.isSurface) {
      const parent = sysBodies.find((b) => b.id === orbit.parentId)
      if (!parent) continue
      const o = orbit.surfaceOffset
      orbit.body.position[0] = parent.position[0] + o[0]
      orbit.body.position[1] = parent.position[1] + o[1]
      orbit.body.position[2] = parent.position[2] + o[2]
    } else {
      const parentPos = orbit.parentPosition
      const angle = orbit.angle0 + gameState.simTime * orbit.speed
      orbit.body.position[0] = parentPos[0] + orbit.radius * Math.cos(angle)
      orbit.body.position[1] = parentPos[1] + orbit.y
      orbit.body.position[2] = parentPos[2] + orbit.radius * Math.sin(angle)
    }
    const mesh = bodyMeshes.get(orbit.body.id)
    if (mesh) {
      mesh.position.fromArray(orbit.body.position)
      if (orbit.isSurface) orientSettlementOnSurface(mesh, orbit.surfaceOffset)
    }
  }
  applyOrbitalCarry(sysBodies, prevBodyPositions, dt)

  // Chase cam + mesh after orbital carry so crosshair projection matches the
  // final ship pose this frame (syncing earlier left a one-frame wobble).
  syncMeshToEntity(playerMesh, gameState.player.ship)
  syncChaseCamera(camera, gameState.player.ship, { cruising })

  // Tidally locked moons face their parent; others keep spinning via updateStationMesh.
  for (const [id, mesh] of bodyMeshes) {
    if (!mesh.userData.tidallyLocked || !mesh.userData.parentId) continue
    const parent = sysBodies.find((b) => b.id === mesh.userData.parentId)
    if (!parent) continue
    const body = sysBodies.find((b) => b.id === id)
    if (!body) continue
    const dx = parent.position[0] - body.position[0]
    const dz = parent.position[2] - body.position[2]
    mesh.rotation.y = Math.atan2(dx, dz)
  }
  const shipVelocity = new THREE.Vector3().fromArray(gameState.player.ship.velocity)
  const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(gameState.player.ship.quaternion))
  const speed = shipVelocity.length()
  const forwardSpeed = shipVelocity.dot(shipForward)
  const hudSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  hud.update(gameState.player.ship, playerShipClass, speed, forwardSpeed, hudSystem?.name ?? null)
  hud.updateRadar(computeRadarContacts(), RADAR_RANGE, gameState.simTime)

  const nearbyBody = findNearbyDockableBody()
  dockPromptEl.style.display = nearbyBody ? 'block' : 'none'
  if (nearbyBody) dockPromptEl.textContent = `Dock with ${nearbyBody.name}`

  const probeLaunch = !probeEffect ? getProbeLaunchTarget() : null
  probePromptEl.style.display = probeLaunch ? 'block' : 'none'
  if (probeLaunch) {
    const left = MAX_PROBE_ATTEMPTS - probeAttemptCount(gameState, probeLaunch.body.id)
    if (left <= 0) {
      probePromptEl.textContent = `Probes exhausted at ${probeLaunch.body.name}`
    } else {
      const base = probeLaunch.viaOrbit
        ? `Press P to probe ${probeLaunch.body.name} (in orbit)`
        : `Press P to launch a probe at ${probeLaunch.body.name}`
      probePromptEl.textContent = `${base} · ${left} left`
    }
  }

  // Only shown when there's no dockable body in range too, matching the
  // KeyF handler's own dock-takes-priority-over-loot fallback.
  wreckPromptEl.style.display = !nearbyBody && findNearbyWreck() ? 'block' : 'none'

  if (
    miningToastEl.style.display === 'block' &&
    gameState.simTime > miningToastUntil &&
    !miningToastEl.querySelector('.hud-glitch-exit')
  ) {
    hideHudGlitch(miningToastEl)
  }
  if (
    factionToastEl.style.display === 'block' &&
    gameState.simTime > factionToastUntil &&
    !factionToastEl.querySelector('.hud-glitch-exit')
  ) {
    hideHudGlitch(factionToastEl)
  }
  if (
    probeResultsEl &&
    probeResultsEl.style.display === 'block' &&
    gameState.simTime > probeResultsUntil &&
    !probeResultsEl.querySelector('.hud-glitch-exit')
  ) {
    hideHudGlitch(probeResultsEl)
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
