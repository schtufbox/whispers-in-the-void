import * as THREE from 'three'
import { createScene } from './render/scene.js'
import { createStarfield, updateStarfield, setStarfieldStarTint } from './render/starfield.js'
import { createMotionEffects, updateStarfieldMotion } from './render/motionFx.js'
import { createHyperspaceTunnel } from './render/hyperspaceTunnel.js'
import { createNebula, updateNebula } from './render/nebula.js'
import { buildShipMesh } from './render/shipMesh.js'
import { buildStationMeshForBody, updateStationMesh } from './render/stationMesh.js'
import { preloadStationModels, stationModelsReady } from './render/stationModels.js'
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
  snapChaseCamera,
  resetChaseCameraState,
  getShipAimPoint,
  AIM_LOOK_AHEAD,
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
import { fireProjectile, updateProjectiles, prunePlayerLasersOffBoresight, updateNpcAI, updateCombatFlag, regenShields, getShipCollisionRadius, truceActive } from './game/combat.js'
import { resolveBodyCollisions, trySupercruiseTunnel, collisionRadiusFor, exteriorRadiusFor } from './game/collision.js'
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
  probeSurveyReport,
  probeExhaustedMessage,
  MAX_PROBE_ATTEMPTS
} from './game/probe.js'
import { saveGame as persistSaveGame, loadGame as persistLoadGame, hasSave } from './game/save.js'
import { hyperspaceJump } from './game/hyperspace.js'
import { getSystem, findBody, findSystemOfBody, coreFraction, canJumpTo } from './procgen/galaxy.js'
import { createHud } from './ui/hud.js'
import { createDockingUI } from './ui/dockingUI.js'
import { createMenu } from './ui/menu.js'
import { createPauseMenu } from './ui/pauseMenu.js'
import { createNavMap } from './ui/navMap.js'
import { createInventoryUI } from './ui/inventoryUI.js'
import { createMissionsUI } from './ui/missionsUI.js'
import { createDeathScreen } from './ui/deathScreen.js'
import { gameConfirm, gameNotice } from './ui/gameDialog.js'
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
// Free-model stations are normalized to ~26–30 local units, then this
// multiplies them into world space. Large behemoths next to ships.
const STATION_SCALE = 190
// Settlements stay small surface bases (pre-behemoth station scale × 0.55).
const SETTLEMENT_SCALE = 16.875 * 0.55
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
// Ship/wreck/rock radar contacts (planets/waypoint may still paint farther).
const RADAR_RANGE = 100000
const IMPACT_FLASH_TTL = 0.25
// Wind-up long enough for "Hyperdrive engaged" TTS + charge SFX, then tunnel.
const JUMP_WINDUP_S = 2.35
// Corridor phase (+8s vs prior 1.85) so the star tunnel has time to read.
const JUMP_STREAK_S = 9.85
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

// Ortho HUD in NDC (-1..1). Circle must be scaled by aspect or it looks
// squashed wide on landscape viewports (equal NDC ≠ equal pixels).
const hudScene = new THREE.Scene()
const hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
const _hudReticleMat = new THREE.MeshBasicMaterial({
  color: 0x7fe0a0,
  transparent: true,
  opacity: 0.92,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide
})
// Unit ring; updateCrosshair sets scale for a round ~16px reticle.
const hudReticleRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 1, 48), _hudReticleMat)
const hudReticleDot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), _hudReticleMat.clone())
hudReticleRing.position.z = -1
hudReticleDot.position.z = -1
hudScene.add(hudReticleRing, hudReticleDot)
hudReticleRing.visible = false
hudReticleDot.visible = false

// Escape while pointer-locked often only unlocks the cursor (keydown may not
// fire). Suppress auto-pause when we exit lock ourselves (menus / Space).
let suppressPointerUnlockPause = false
// Same Esc can unlock then deliver keydown — ignore the keydown unpause.
let pauseOpenedAtMs = 0

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

/** True when the player may shoot (free-flying, no menus / dock / cruise). */
function canPlayerFire() {
  return !!(
    gameState &&
    playerShipClass &&
    !docked &&
    !dockEffect &&
    !cruising &&
    !paused &&
    !navMapOpen &&
    !inventoryOpen &&
    !missionsOpen &&
    !jumpEffect
  )
}

const _playerAimPoint = new THREE.Vector3()

/** Fire once if allowed. Cooldowns live on the ship; safe to call every frame while held. */
function tryPlayerFire(weaponTypeFilter) {
  if (!canPlayerFire()) return
  try {
    // Seat first so click-to-fire between frames matches the reticle this frame.
    syncChaseCamera(camera, gameState.player.ship, { cruising })
    // Same world point the HUD reticle projects (ship boresight).
    getShipAimPoint(gameState.player.ship, _playerAimPoint, AIM_LOOK_AHEAD)
    fireProjectile(
      gameState,
      gameState.player.ship,
      playerShipClass,
      'player',
      onWeaponFired,
      weaponTypeFilter,
      null,
      _playerAimPoint.toArray()
    )
    // Pointerdown path doesn't wait for the late animate() mesh pass.
    syncProjectileMeshesNow()
  } catch (err) {
    console.error('fire failed:', err)
  }
}

/** Create meshes for any projectiles spawned after the mid-frame mesh pass. */
function syncProjectileMeshesNow() {
  for (const proj of gameState.projectiles) {
    let mesh = projectileMeshes.get(proj.id)
    if (!mesh) {
      mesh = buildProjectileMesh(proj.weaponId, proj.weaponType)
      projectileMeshes.set(proj.id, mesh)
      scene.add(mesh)
    }
    syncMeshToEntity(mesh, proj)
  }
  for (const [id, mesh] of projectileMeshes) {
    if (!gameState.projectiles.some((p) => p.id === id)) {
      scene.remove(mesh)
      projectileMeshes.delete(id)
    }
  }
}

// Capture on document so pointer-lock / Electron still delivers buttons.
// Fire immediately on press (click between frames used to never see held=true).
function onFirePointerDown(e) {
  if (e.button === 0) {
    laserFireHeld = true
    tryPlayerFire('laser')
  } else if (e.button === 2) {
    missileFireHeld = true
    tryPlayerFire('missile')
  }
}
function onFirePointerUp(e) {
  if (e.button === 0) laserFireHeld = false
  else if (e.button === 2) missileFireHeld = false
}
document.addEventListener('pointerdown', onFirePointerDown, true)
document.addEventListener('pointerup', onFirePointerUp, true)
document.addEventListener('pointercancel', () => {
  laserFireHeld = false
  missileFireHeld = false
}, true)
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
  if (targetDirEl) targetDirEl.style.display = 'none'
  if (document.pointerLockElement === renderer.domElement) {
    suppressPointerUnlockPause = true
    document.exitPointerLock()
    requestAnimationFrame(() => {
      suppressPointerUnlockPause = false
    })
  }
}

/** Pause / unpause. Keeps flight intent so Resume re-locks the pointer. */
function setGamePaused(next) {
  if (!gameState || !!next === paused) return
  if (dockEffect || navMapOpen || inventoryOpen || missionsOpen) return
  paused = !!next
  audio.setThrustState(null)
  if (paused) {
    // Don't clear flightModeWanted — Resume should return to mouse-aim.
    flightMode = false
    setChaseFreeLook(false)
    if (crosshairEl) crosshairEl.style.display = 'none'
    if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
    if (targetDirEl) targetDirEl.style.display = 'none'
    if (document.pointerLockElement === renderer.domElement) {
      suppressPointerUnlockPause = true
      document.exitPointerLock()
      requestAnimationFrame(() => {
        suppressPointerUnlockPause = false
      })
    }
    pauseOpenedAtMs = performance.now()
    pauseMenu?.show()
  } else {
    pauseMenu?.hide()
    if (!docked) reenterFlightMode()
  }
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
    if (flightModeWanted && !paused) flightMode = true
    return
  }
  flightMode = false
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (targetDirEl) targetDirEl.style.display = 'none'
  // Escape while locked often only releases the cursor (no keydown). Open pause
  // so one Esc is enough; ignore unlocks we triggered ourselves.
  if (
    !suppressPointerUnlockPause &&
    gameState &&
    !paused &&
    flightModeWanted &&
    !docked &&
    !dockEffect &&
    !navMapOpen &&
    !inventoryOpen &&
    !missionsOpen
  ) {
    setGamePaused(true)
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
  // Alt+Enter is fullscreen (main process) — never arm free-look for that chord.
  if (e.altKey && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter')) {
    setChaseFreeLook(false)
    return
  }
  if (!isAltKey(e.code)) return
  if (!gameState || paused || docked || jumpEffect || navMapOpen || inventoryOpen || missionsOpen) return
  e.preventDefault()
  setChaseFreeLook(true)
})
window.addEventListener('keyup', (e) => {
  if (!isAltKey(e.code)) return
  setChaseFreeLook(false)
})
// Fullscreen toggle often drops the Alt keyup while free-look is still on.
if (typeof window.electronAPI?.onFullscreenChanged === 'function') {
  window.electronAPI.onFullscreenChanged(() => setChaseFreeLook(false))
}

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
// Persistent classification panel (left of ship / left screen) — first probe only.
let probeScanPanelEl = null
let wreckPromptEl = null
let miningToastEl = null
let miningToastUntil = 0
let craftToastEl = null
let craftToastHideTimer = null
let saveToastEl = null
let saveToastHideTimer = null
// Directional red edge vignette when player is hit by enemy fire.
let damageVignetteEl = null
const damageVignette = { left: 0, right: 0, top: 0, bottom: 0 }
const DAMAGE_VIGNETTE_DECAY = 1.85 // intensity units per second
const DAMAGE_VIGNETTE_PULSE = 0.72
const _vignetteRel = new THREE.Vector3()
const _vignetteInvQ = new THREE.Quaternion()
let factionToastEl = null
let factionToastUntil = 0
// Edge-detects "aliens just got wiped out/left while pirates were truced" —
// see the ambient-spawn block in animate() for the actual thank-you/cleanup.
let truceWasActive = false
let waypointEl = null
let crosshairEl = null
// In-scene reticle at the combat aim point (same WebGL pass as lasers — no DOM/CSS skew).
let combatReticle3d = null
let targetIndicatorEl = null
// Small arrow near the ship on-screen, pointing toward the Tab target.
let targetDirEl = null
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

function buildBodyMesh(body, system = null) {
  if (body.kind === 'planet' || body.kind === 'moon') return buildPlanetMesh(body)
  // Pass system so belt rocks tint by ore tier (coreFraction → raw/rich/exotic/quantum).
  if (body.kind === 'asteroidField') return buildAsteroidFieldMesh(body, system)
  const mesh = buildStationMeshForBody(body)
  // Settlements keep a modest pre-behemoth size; only orbital stations are huge.
  const baseScale = body.kind === 'settlement' ? SETTLEMENT_SCALE : STATION_SCALE
  // Reuses the existing per-body hash (see hashStringForOrbit below) for a
  // touch of +/-15% size variety, so stations aren't all uniformly sized.
  const variance = 0.85 + (hashStringForOrbit(body.id) % 1000) / 1000 * 0.3
  mesh.scale.setScalar(baseScale * variance)
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
    const mesh = buildBodyMesh(body, currentSystem)
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

function showGameSavedToast(durationMs = 2200) {
  if (!saveToastEl) return
  setHudGlitchText(saveToastEl, 'GAME SAVED')
  showHudGlitch(saveToastEl)
  clearTimeout(saveToastHideTimer)
  saveToastHideTimer = setTimeout(() => {
    hideHudGlitch(saveToastEl)
  }, durationMs)
}

/**
 * Pulse red vignette on screen edges toward the hit (camera-relative).
 * @param {number[]} worldPos - impact position
 * @param {number[]} [inboundDir] - optional world direction of the incoming shot
 */
function pulseDamageVignette(worldPos, inboundDir = null) {
  if (!damageVignetteEl || !gameState) return
  // Prefer inbound shot direction (where fire came from); else impact vs ship.
  if (inboundDir && inboundDir.length === 3) {
    _vignetteRel.set(inboundDir[0], inboundDir[1], inboundDir[2])
  } else {
    _vignetteRel
      .fromArray(worldPos)
      .sub(new THREE.Vector3().fromArray(gameState.player.ship.position))
  }
  if (_vignetteRel.lengthSq() < 1e-8) {
    // Head-on unknown — light all sides slightly.
    damageVignette.left = Math.min(1, damageVignette.left + DAMAGE_VIGNETTE_PULSE * 0.45)
    damageVignette.right = Math.min(1, damageVignette.right + DAMAGE_VIGNETTE_PULSE * 0.45)
    damageVignette.top = Math.min(1, damageVignette.top + DAMAGE_VIGNETTE_PULSE * 0.35)
    damageVignette.bottom = Math.min(1, damageVignette.bottom + DAMAGE_VIGNETTE_PULSE * 0.35)
    return
  }
  // Camera space: +X right, +Y up, -Z forward (matches what the player sees).
  _vignetteInvQ.copy(camera.quaternion).invert()
  _vignetteRel.applyQuaternion(_vignetteInvQ)
  const ax = Math.abs(_vignetteRel.x)
  const ay = Math.abs(_vignetteRel.y)
  // Bias toward the dominant screen axis; still bleed a little onto the other.
  const pulse = DAMAGE_VIGNETTE_PULSE
  if (ax >= ay * 0.55) {
    if (_vignetteRel.x > 0) damageVignette.right = Math.min(1, damageVignette.right + pulse)
    else damageVignette.left = Math.min(1, damageVignette.left + pulse)
  }
  if (ay >= ax * 0.55) {
    if (_vignetteRel.y > 0) damageVignette.top = Math.min(1, damageVignette.top + pulse)
    else damageVignette.bottom = Math.min(1, damageVignette.bottom + pulse)
  }
  // Nearly head-on (into the screen): bottom + slight sides (cockpit bashed).
  if (ax < 0.35 && ay < 0.35) {
    damageVignette.bottom = Math.min(1, damageVignette.bottom + pulse * 0.55)
    damageVignette.left = Math.min(1, damageVignette.left + pulse * 0.25)
    damageVignette.right = Math.min(1, damageVignette.right + pulse * 0.25)
  }
}

function updateDamageVignette(dt) {
  if (!damageVignetteEl) return
  const decay = DAMAGE_VIGNETTE_DECAY * dt
  for (const side of ['left', 'right', 'top', 'bottom']) {
    damageVignette[side] = Math.max(0, damageVignette[side] - decay)
    const el = damageVignetteEl.querySelector(`.dv-edge.${side}`)
    if (el) el.style.opacity = String(Math.min(1, damageVignette[side]))
  }
}

/** Write live docking / flight pose into player so serialize captures it. */
function snapshotPlayerPoseForSave() {
  if (!gameState) return
  if (docked && dockedApproach?.body) {
    gameState.player.dockedBodyId = dockedApproach.body.id
    gameState.player.dockedExteriorPosition = dockedApproach.exteriorPoint.toArray()
    gameState.player.dockedApproachDir = dockedApproach.approachDir.toArray()
    // Bay coords stay on the ship while docked (restored into the bay on load).
  } else {
    gameState.player.dockedBodyId = null
    gameState.player.dockedExteriorPosition = null
    gameState.player.dockedApproachDir = null
  }
}

function doSave() {
  snapshotPlayerPoseForSave()
  return persistSaveGame(gameState).then(
    () => {
      audio.playSaveChime()
      showGameSavedToast()
    },
    (err) => gameNotice('Save failed', err.message)
  )
}

function onWeaponFired(weaponId) {
  audio.playWeaponFire(weaponId)
}

function onProjectileHit({ position, rockPosition, destroyed, mined, hitPlayer, inboundDir }) {
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

  // Red edge vignette toward the side of the screen the fire came from.
  if (hitPlayer) pulseDamageVignette(position, inboundDir)
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
  probeScanPanelEl?.remove()
  probeScanPanelEl = null
  wreckPromptEl?.remove()
  miningToastEl?.remove()
  craftToastEl?.remove()
  craftToastEl = null
  clearTimeout(craftToastHideTimer)
  craftToastHideTimer = null
  saveToastEl?.remove()
  saveToastEl = null
  clearTimeout(saveToastHideTimer)
  saveToastHideTimer = null
  damageVignetteEl?.remove()
  damageVignetteEl = null
  damageVignette.left = damageVignette.right = damageVignette.top = damageVignette.bottom = 0
  factionToastEl?.remove()
  truceWasActive = false
  waypointEl?.remove()
  crosshairEl?.remove()
  if (combatReticle3d) {
    scene.remove(combatReticle3d)
    combatReticle3d = null
  }
  targetIndicatorEl?.remove()
  targetDirEl?.remove()
  targetDirEl = null
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
  resetChaseCameraState()
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
  // Kenney free-model stations (3 types). Preload GLBs; rebuild bodies when
  // ready so free models replace any procedural fallbacks from first paint.
  const sessionToken = gameState
  loadBodiesForCurrentSystem()
  preloadStationModels().then(() => {
    if (gameState !== sessionToken) return
    if (stationModelsReady()) loadBodiesForCurrentSystem()
  })

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
      setGamePaused(false)
    },
    onSave: () => doSave(),
    onRestart: async () => {
      const ok = await gameConfirm(
        'Return to Menu',
        'Return to main menu?\nUnsaved progress will be lost.',
        { okLabel: 'Return', cancelLabel: 'Cancel', danger: true }
      )
      if (!ok) return
      pauseMenu.hide()
      returnToMenu()
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

  // First-probe classification dossier — left of the chase-camera ship, stays open until closed.
  probeScanPanelEl = document.createElement('div')
  probeScanPanelEl.id = 'probe-scan-panel'
  probeScanPanelEl.innerHTML = `
    <div class="psp-header">
      <span class="psp-title">Probe Scan</span>
      <button type="button" class="psp-close" aria-label="Close">×</button>
    </div>
    <div class="psp-body"></div>
  `
  const pspStyle = document.createElement('style')
  pspStyle.textContent = `
#probe-scan-panel {
  position: fixed; left: 18px; top: 50%; transform: translateY(-50%);
  width: min(320px, 34vw); max-height: min(70vh, 520px);
  display: none; flex-direction: column;
  z-index: 42; pointer-events: auto;
  font-family: monospace; color: #cfe3ff;
  background: linear-gradient(135deg, rgba(12,20,36,0.94), rgba(7,12,22,0.9));
  border: 1px solid rgba(111,216,242,0.45); border-left: 3px solid #6fd8f2;
  box-shadow: 0 0 22px rgba(79,195,217,0.22), inset 0 0 20px rgba(79,195,217,0.05);
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
}
#probe-scan-panel .psp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 8px; border-bottom: 1px solid rgba(111,216,242,0.25);
}
#probe-scan-panel .psp-title {
  font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
  color: #7fe6ff; text-shadow: 0 0 6px rgba(79,195,217,0.55);
}
#probe-scan-panel .psp-close {
  background: rgba(224,90,90,0.12); border: 1px solid rgba(224,90,90,0.45);
  color: #ffb3b3; width: 28px; height: 26px; cursor: pointer;
  font-family: monospace; font-size: 16px; line-height: 1; padding: 0;
}
#probe-scan-panel .psp-close:hover { background: rgba(224,90,90,0.25); }
#probe-scan-panel .psp-body {
  padding: 10px 14px 14px; overflow-y: auto; font-size: 12px; line-height: 1.45;
}
#probe-scan-panel .psp-body .psp-line { margin: 0 0 6px; opacity: 0.95; }
#probe-scan-panel .psp-body .psp-line.kicker {
  color: #ffe08a; letter-spacing: 0.5px; margin-bottom: 10px;
}
`
  document.head.appendChild(pspStyle)
  probeScanPanelEl.querySelector('.psp-close').addEventListener('click', () => {
    probeScanPanelEl.style.display = 'none'
  })
  appEl.appendChild(probeScanPanelEl)

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

  // Above pause menu (z 60) — yellow glitch "GAME SAVED" confirmation.
  saveToastEl = document.createElement('div')
  saveToastEl.id = 'save-toast'
  saveToastEl.style.cssText =
    `position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:70;pointer-events:none;display:none;text-align:center;color:#ffd246;${floatText('font-size:16px;letter-spacing:3px;font-weight:600;')}`
  appEl.appendChild(saveToastEl)

  // Combat: red edge vignettes for incoming fire direction (screen-relative).
  damageVignetteEl = document.createElement('div')
  damageVignetteEl.id = 'damage-vignette'
  damageVignetteEl.innerHTML = `
    <div class="dv-edge left"></div>
    <div class="dv-edge right"></div>
    <div class="dv-edge top"></div>
    <div class="dv-edge bottom"></div>
  `
  const dvStyle = document.createElement('style')
  dvStyle.textContent = `
#damage-vignette {
  position: fixed; inset: 0; pointer-events: none; z-index: 9;
}
#damage-vignette .dv-edge {
  position: absolute; opacity: 0;
  transition: opacity 0.04s linear;
}
#damage-vignette .dv-edge.left {
  left: 0; top: 0; bottom: 0; width: 32%;
  background: linear-gradient(to right,
    rgba(160, 12, 22, 0.78) 0%,
    rgba(120, 8, 16, 0.35) 45%,
    transparent 100%);
}
#damage-vignette .dv-edge.right {
  right: 0; top: 0; bottom: 0; width: 32%;
  background: linear-gradient(to left,
    rgba(160, 12, 22, 0.78) 0%,
    rgba(120, 8, 16, 0.35) 45%,
    transparent 100%);
}
#damage-vignette .dv-edge.top {
  top: 0; left: 0; right: 0; height: 26%;
  background: linear-gradient(to bottom,
    rgba(160, 12, 22, 0.7) 0%,
    rgba(120, 8, 16, 0.3) 50%,
    transparent 100%);
}
#damage-vignette .dv-edge.bottom {
  bottom: 0; left: 0; right: 0; height: 26%;
  background: linear-gradient(to top,
    rgba(160, 12, 22, 0.7) 0%,
    rgba(120, 8, 16, 0.3) 50%,
    transparent 100%);
}
`
  document.head.appendChild(dvStyle)
  appEl.appendChild(damageVignetteEl)

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

  // Direction cue anchored near the projected ship (not on the target itself).
  // Hidden when nothing is Tab-targeted.
  targetDirEl = document.createElement('div')
  targetDirEl.id = 'target-dir-indicator'
  targetDirEl.style.cssText =
    'position:fixed;pointer-events:none;display:none;transform:translate(-50%,-50%);z-index:6;'
  targetDirEl.innerHTML = `
    <div class="tdir-arrow" style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #cfe3ff;filter:drop-shadow(0 0 3px rgba(0,0,0,0.9)) drop-shadow(0 0 6px rgba(127,224,255,0.45));"></div>
  `
  appEl.appendChild(targetDirEl)

  // Drive status (supercruise / hyperdrive) — below system + optional nearest-body
  // banner (that block can grow to ~100px tall). Glitch enter/exit + chromatic slices.
  cruiseIndicatorEl = document.createElement('div')
  cruiseIndicatorEl.id = 'cruise-indicator'
  cruiseIndicatorEl.style.cssText =
    `position:fixed;top:118px;left:50%;transform:translateX(-50%);color:#ffd246;display:none;${floatText('font-size:13px;letter-spacing:2.5px;font-weight:600;')}`
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

  // Restore free-flight pose or re-dock at the station saved in the file.
  restoreSessionLocation()

  // Brand-new games enter flight mode; loads keep docked/space state from save
  // and do not force pointer lock.
  if (enterFlightMode && !docked) reenterFlightMode()
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
// comfortably outside that shell. Stations/settlements get an extra 2000m,
// and the bubble must also reach outside visual bulk so undock exit stays
// re-dockable without diving back into the mesh.
function dockRangeFor(body) {
  const bodyRadius = collisionRadiusFor(body) ?? 0
  const shipR = getShipCollisionRadius(playerShipClass)
  const base = Math.max(DOCK_RANGE, bodyRadius + shipR + DOCK_RANGE_COLLISION_MARGIN)
  if (body.kind === 'station' || body.kind === 'settlement') {
    const visual = exteriorRadiusFor(body) ?? bodyRadius
    const outsideVisual = visual + shipR + DOCK_RANGE_COLLISION_MARGIN + 80
    return Math.max(base + DOCK_RANGE_STATION_EXTRA, outsideVisual)
  }
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

// Surface-distance window for the top-center "Nearest Body" HUD line.
// Wide enough to catch approach before dock/probe range; uses shell radius so
// huge planets don't stay "far" until you're already on the crust.
const NEAREST_BODY_HUD_RANGE = 3500
const HUD_NEAREST_KINDS = new Set(['planet', 'moon', 'station', 'settlement'])

/** Closest planet / moon / station / settlement / star within surface range. */
function findNearestHudBody() {
  if (!gameState) return null
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!currentSystem) return null

  let nearest = null
  let nearestSurface = Infinity

  for (const body of currentSystem.bodies) {
    if (!HUD_NEAREST_KINDS.has(body.kind)) continue
    const dist = playerPos.distanceTo(new THREE.Vector3().fromArray(body.position))
    const surfaceDist = Math.max(0, dist - (collisionRadiusFor(body) ?? 0))
    if (surfaceDist < NEAREST_BODY_HUD_RANGE && surfaceDist < nearestSurface) {
      nearest = body
      nearestSurface = surfaceDist
    }
  }

  // System sun at local origin (not a body in the list).
  const starDist = playerPos.length()
  const starSurface = Math.max(0, starDist - STAR_TARGET_RADIUS)
  if (starSurface < NEAREST_BODY_HUD_RANGE && starSurface < nearestSurface) {
    nearest = {
      id: SYSTEM_STAR_WAYPOINT_ID,
      name: `${currentSystem.name} Star`,
      kind: 'star'
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
    showFloatingProbeResults([probeExhaustedMessage(body.name)])
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
    // Snapshot at launch — scan phase completes the mission before return, so
    // finishProbeResults cannot re-detect "open mission target" on the way back.
    attemptNumber: n,
    missionTargetAtLaunch: isActiveMissionProbeTarget(gameState, body.id)
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

function showProbeScanPanel(lines) {
  if (!probeScanPanelEl || !lines?.length) return
  const bodyEl = probeScanPanelEl.querySelector('.psp-body')
  bodyEl.innerHTML = lines
    .map((line, i) => `<div class="psp-line${i === 0 ? ' kicker' : ''}">${escapeHtmlProbe(line)}</div>`)
    .join('')
  probeScanPanelEl.style.display = 'flex'
}

// Tiny local escape so the panel can show probe text without importing UI helpers early.
function escapeHtmlProbe(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function finishProbeResults(body, attemptNumber = null, missionTargetAtLaunch = null) {
  // Attempt was already reserved at launch — do not double-count here.
  const attempt = attemptNumber ?? probeAttemptCount(gameState, body.id)
  // Prefer launch snapshot: scan phase may already have completed the mission.
  const wasMissionTarget =
    missionTargetAtLaunch != null
      ? !!missionTargetAtLaunch
      : isActiveMissionProbeTarget(gameState, body.id)
  // First probe on a mission body resolves the contract; later probes are normal loot only.
  const missionFirstProbe = wasMissionTarget && attempt === 1
  // Classification dossier only on the first probe of this body (attempt 1).
  const showClassification = attempt === 1

  // Idempotent if already marked at end of scan phase — completes probe/exploration on first hit.
  markBodyProbed(gameState, body.id)
  // Investigation outcome only on the first probe of an open investigation body.
  // Stars are never investigation targets; re-probes skip mission resolution.
  // Note: if scan already markBodyProbed'd, investigation body phase may still be open
  // until we resolve it here (investigation is not completed by markBodyProbed).
  let investigation = null
  if (body.kind !== 'star' && missionFirstProbe) {
    investigation = resolveInvestigationProbe(gameState, body.id, Math.random)
  }
  updateMissionProgress(gameState)

  // Standard loot roll every attempt (no forced find).
  const result = launchProbe(gameState, playerShipClass, Math.random, {
    forceFind: false
  })

  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)

  // Classification → left persistent panel (first probe only).
  if (showClassification) {
    showProbeScanPanel(probeSurveyReport(body, system))
  }

  // Floating center HUD: mission beat (first hit only) + loot / exhausted.
  const messages = []
  if (missionFirstProbe) {
    if (investigation?.kind === 'intel') {
      const giver = findBody(gameState.galaxy, investigation.mission.giverStationId)
      messages.push(`Investigation data recovered. Return to ${giver?.name ?? 'the mission giver'} to turn it in.`)
    } else if (investigation?.kind === 'hostile') {
      messages.push('Probe stirred a hostile contact! Eliminate them to finish the investigation.')
    } else if (investigation?.kind === 'lead') {
      messages.push(`The signal traces further — new fix on ${investigation.bodyName} in ${investigation.systemName}.`)
    } else {
      // Probe / exploration survey contracts complete via markBodyProbed.
      const surveyMission = body.kind !== 'star' && gameState.missions.active.find(
        (m) =>
          (m.type === 'probe' || m.type === 'exploration') &&
          String(m.target?.bodyId) === String(body.id) &&
          m.objectiveComplete
      )
      if (surveyMission) {
        const giver = findBody(gameState.galaxy, surveyMission.giverStationId)
        const label = surveyMission.type === 'exploration' ? 'Exploration survey' : 'Survey mission'
        messages.push(`${label} complete! Return to ${giver?.name ?? 'the mission giver'} to turn it in.`)
      }
    }
  }

  // Standard loot lines (any attempt, including 2nd/3rd after mission is done).
  if (result.found && result.stored) {
    messages.push(`Probe found valuable survey data at ${body.name}! Added to cargo — sell it at any station.`)
  } else if (result.found) {
    messages.push(`Probe found valuable survey data at ${body.name}, but your cargo hold is full!`)
  } else if (!result.blueprint) {
    messages.push('No Data Found')
  }
  if (result.blueprint) {
    messages.push(`Rare find: ${result.blueprint.name}! Stored in ship blueprints — craft at a station Industry bay.`)
  }
  if (attempt >= MAX_PROBE_ATTEMPTS) {
    messages.push(probeExhaustedMessage(body.name))
  }

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
      // Count the survey as soon as the scan finishes — not only after the
      // probe docks back — so jump/dock/abort mid-return can't strand a probe
      // mission in "in progress" after a successful scan.
      if (!probeEffect.surveyLogged) {
        probeEffect.surveyLogged = true
        markBodyProbed(gameState, body.id)
        updateMissionProgress(gameState)
      }
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
      const missionTargetAtLaunch = probeEffect.missionTargetAtLaunch
      clearProbeEffect()
      finishProbeResults(finishedBody, attemptNumber, missionTargetAtLaunch)
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
  if (docked || dockEffect) {
    flashToast('Undock before engaging hyperdrive')
    return
  }
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
  setHudGlitchText(cruiseIndicatorEl, 'HYPERDRIVE ENGAGED')
  showHudGlitch(cruiseIndicatorEl)
}

function updateJumpEffect(dt) {
  syncChaseCamera(camera, gameState.player.ship)
  // Keep the hull in the right place so depth-tested tunnel FX stay behind it.
  if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
  jumpEffect.elapsed += dt
  const e = jumpEffect.elapsed

  if (e < JUMP_WINDUP_S) {
    // Charge phase: FOV creep + tunnel fades in while speech/windup play.
    const w = e / JUMP_WINDUP_S
    const throb = 0.5 + 0.5 * Math.sin(e * 10)
    camera.fov = BASE_FOV + w * 28 + throb * w * 8
    camera.updateProjectionMatrix()
    // Light flash only — heavy wash hid the star tunnel and the ship.
    jumpFlashEl.style.opacity = String(Math.min(0.18, w * 0.14 + throb * 0.03))
    // Tunnel builds late in the wind-up (stars stretch into the corridor).
    hyperspaceTunnel.update(dt, Math.max(0, w - 0.35) / 0.65, camera, getCrosshairAimWorld())
  } else {
    // Full hyperdrive tunnel; system swap mid-corridor.
    const s = (e - JUMP_WINDUP_S) / JUMP_STREAK_S
    const punch = Math.sin(Math.min(1, s) * Math.PI)
    camera.fov = BASE_FOV + 30 + punch * 55
    camera.updateProjectionMatrix()
    // Soft mid-tunnel punch — keep ship + corridor readable.
    jumpFlashEl.style.opacity = String(Math.min(0.28, 0.08 + punch * 0.2))
    // Peak strength mid-tunnel, ease out at the end.
    const tunnelStr = s < 0.15 ? s / 0.15 : s > 0.85 ? (1 - s) / 0.15 : 1
    hyperspaceTunnel.update(dt, Math.min(1, 0.75 + tunnelStr * 0.25), camera, getCrosshairAimWorld())

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
        gameNotice('Hyperspace failed', err.message)
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
    setHudGlitchText(cruiseIndicatorEl, 'HYPERDRIVE DISENGAGED')
    showHudGlitch(cruiseIndicatorEl)
    hideHudGlitch(cruiseIndicatorEl)
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
  // Catch up mission flags (e.g. probe already in probedBodyIds) before the
  // board renders Turn In / In progress.
  updateMissionProgress(gameState)
  // Shields regenerate on their own anyway (see combat.js's regenShields) —
  // docking just tops them off instantly and for free, since only hull/armor
  // repair costs credits in the shipyard.
  gameState.player.ship.shields = playerShipClass.stats.shields
  gameState.player.dockedBodyId = body.id
  if (dockedApproach) {
    gameState.player.dockedExteriorPosition = dockedApproach.exteriorPoint.toArray()
    gameState.player.dockedApproachDir = dockedApproach.approachDir.toArray()
  }
  dockPromptEl.style.display = 'none'
  dockingUI.show(body, () => beginUndocking())
}

function clearDockedSaveFields() {
  if (!gameState) return
  gameState.player.dockedBodyId = null
  gameState.player.dockedExteriorPosition = null
  gameState.player.dockedApproachDir = null
}

/**
 * After load: put the player back in space at their saved pose, or re-enter
 * the docking bay + UI at the station/settlement they saved at.
 */
function restoreSessionLocation() {
  if (!gameState) return
  const bodyId = gameState.player.dockedBodyId
  if (bodyId) {
    const body = findBody(gameState.galaxy, bodyId)
    const bodySystem = findSystemOfBody(gameState.galaxy, bodyId)
    if (
      body &&
      bodySystem &&
      bodySystem.id === gameState.player.currentSystemId &&
      (body.kind === 'station' || body.kind === 'settlement')
    ) {
      let exteriorPoint
      let approachDir
      if (
        Array.isArray(gameState.player.dockedExteriorPosition) &&
        gameState.player.dockedExteriorPosition.length === 3
      ) {
        exteriorPoint = new THREE.Vector3(...gameState.player.dockedExteriorPosition)
      } else {
        exteriorPoint = dockExteriorPoint(
          body,
          new THREE.Vector3().fromArray(
            // Fallback hang: approach from system arrival side of the body.
            gameState.player.ship.position?.[0] > 1e5
              ? [0, 400, -800]
              : gameState.player.ship.position
          )
        ).exteriorPoint
      }
      if (
        Array.isArray(gameState.player.dockedApproachDir) &&
        gameState.player.dockedApproachDir.length === 3
      ) {
        approachDir = new THREE.Vector3(...gameState.player.dockedApproachDir)
        if (approachDir.lengthSq() < 1e-8) approachDir.set(0, 0, 1)
        else approachDir.normalize()
      } else {
        approachDir = new THREE.Vector3(...body.position).sub(exteriorPoint)
        if (approachDir.lengthSq() < 1e-8) approachDir.set(0, 0, 1)
        else approachDir.normalize()
      }
      dockedApproach = { body, exteriorPoint, approachDir }
      swapToInterior()
      gameState.player.ship.position = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET).toArray()
      gameState.player.ship.quaternion = [0, 0, 0, 1]
      gameState.player.ship.velocity = [0, 0, 0]
      gameState.player.ship.throttle = 0
      if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
      exitFlightMode()
      flightModeWanted = false
      dock(body)
      return
    }
    // Stale dock id — fall through to free flight at saved pose.
    clearDockedSaveFields()
  }

  docked = false
  dockedApproach = null
  // Space: ship.position / quaternion / velocity already restored from save.
  if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
}

// Smoothstep-ish ease so docking approaches decelerate into the hang point
// instead of a robotic linear slide.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Hang point just outside the body's flight collision shell, on the approach
// line. Dock approach uses this (tight shell so you can fly in close). Undock
// recomputes a farther hang via undockExteriorPoint so the ship clears mesh.
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

// Undock hang: outside station/settlement *visual* bulk along the stored
// approach direction. Flight collision (500m stations) is intentionally smaller
// than the mesh so you can dock close — but leaving must clear geometry.
function undockExteriorPoint(body, approachDir) {
  const bodyPos = new THREE.Vector3(...body.position)
  const dir = approachDir.clone()
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1)
  else dir.normalize()
  const bodyRadius = exteriorRadiusFor(body) ?? collisionRadiusFor(body) ?? 0
  const standoff = bodyRadius + getShipCollisionRadius(playerShipClass) + DOCK_EXTERIOR_MARGIN
  const exteriorPoint = bodyPos.clone().addScaledVector(dir, -standoff)
  return { bodyPos, approachDir: dir, exteriorPoint, standoff }
}

// Docking/undocking is a scripted multi-phase animation:
//   approach hang → brief align settle → flash into bay → park glide.
// Undocking reverses: unpark → flash out → back away. dockedApproach
// remembers the original approach so the reverse trip lines up.
function beginDocking(body) {
  // Docking freezes the flight loop — resolve or abort any in-flight probe so
  // survey missions don't stay "in progress" after a completed scan.
  if (probeEffect) {
    if (probeEffect.surveyLogged || probeEffect.phase === 'returning') {
      const b = probeEffect.body
      const attemptNumber = probeEffect.attemptNumber
      const missionTargetAtLaunch = probeEffect.missionTargetAtLaunch
      clearProbeEffect()
      finishProbeResults(b, attemptNumber, missionTargetAtLaunch)
    } else {
      clearProbeEffect()
      flashToast('Probe aborted — docking')
    }
  }

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
    setHudGlitchText(cruiseIndicatorEl, 'SUPERCRUISE DISENGAGED')
    showHudGlitch(cruiseIndicatorEl)
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
  const { approachDir, body } = dockedApproach
  // Recompute hang from current body pose + visual bulk shell. Dock approach
  // hang used the tight flight collision and sits inside station mesh.
  const { exteriorPoint } = undockExteriorPoint(body, approachDir)
  dockedApproach.exteriorPoint = exteriorPoint
  // Always normalize — loaded saves may have slightly off-unit approach dirs.
  const awayDir = approachDir.clone()
  if (awayDir.lengthSq() < 1e-8) awayDir.set(0, 0, 1)
  else awayDir.normalize()
  const backAwayPoint = exteriorPoint.clone().addScaledVector(
    awayDir,
    -(getShipCollisionRadius(playerShipClass) + UNDOCK_BACKOFF_MARGIN)
  )
  // Face along the back-away vector (out of the station).
  const awayQuat = quatFacing(exteriorPoint, backAwayPoint)
  awayQuat.normalize()
  dockEffect = {
    undocking: true,
    elapsed: 0,
    body,
    swapped: false,
    thrusterPulsed: false,
    exteriorPoint,
    awayQuat,
    backAwayPoint
  }
  jumpFlashEl.style.background = DOCK_FLASH_COLOR
  jumpFlashEl.style.opacity = '0'
  jumpFlashEl.style.display = 'block'
  audio.playUndock()
  // Wipe chase-cam / mouse state left over from the bay or a prior free-look
  // (load-from-docked is especially prone to a skewed seat vs boresight).
  resetChaseCameraState()
  mouseAim.dx = 0
  mouseAim.dy = 0
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
        gameState.player.ship.quaternion = dockEffect.awayQuat.clone().normalize().toArray()
        audio.playDockThrusterPulse()
        // Leaving the bay: hard-reset chase seat so the interior camera pose
        // (2e6 world) cannot leave a lateral skew vs ship boresight/crosshair.
        mouseAim.dx = 0
        mouseAim.dy = 0
        if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
        snapChaseCamera(camera, gameState.player.ship)
      }
      const lt = easeInOutCubic(Math.min(1, (dockEffect.elapsed - half) / half))
      gameState.player.ship.position = dockEffect.exteriorPoint.clone().lerp(dockEffect.backAwayPoint, lt).toArray()
      // Level out while backing away — keep a unit quat for boresight/camera.
      gameState.player.ship.quaternion = dockEffect.awayQuat.clone().normalize().toArray()
      if (!dockEffect.thrusterPulsed && lt > 0.2) {
        dockEffect.thrusterPulsed = true
        audio.playDockThrusterPulse()
      }
    }
  }

  syncMeshToEntity(playerMesh, gameState.player.ship)
  // During exterior undock we already snapped once; keep hard snaps so the
  // seat can't lerp from the bay. Dock approach still uses normal chase.
  if (dockEffect.undocking && dockEffect.swapped) {
    snapChaseCamera(camera, gameState.player.ship, { resetState: false })
  } else {
    syncChaseCamera(camera, gameState.player.ship)
  }

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
      // Ensure a clean unit orientation for boresight/camera after undock
      // (especially load-from-docked where awayQuat is rebuilt from save).
      const q = new THREE.Quaternion().fromArray(gameState.player.ship.quaternion).normalize()
      gameState.player.ship.quaternion = q.toArray()
      mouseAim.dx = 0
      mouseAim.dy = 0
      if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
      // Final hard reset: bay → space handoff must leave a neutral chase seat.
      snapChaseCamera(camera, gameState.player.ship)
      dockEffect = null
      docked = false
      dockedApproach = null
      clearDockedSaveFields()
      // Re-place reticle immediately on the bolt path (don't wait a frame).
      if (flightMode) updateCrosshair()
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
  if (e.code === 'KeyF' && !docked && !dockEffect && !cruising && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    const body = findNearbyDockableBody()
    if (body) {
      beginDocking(body)
    } else {
      const wreck = findNearbyWreck()
      if (wreck) lootNearbyWreck(wreck)
    }
  } else if (e.code === 'KeyP' && !docked && !dockEffect && !cruising && !probeEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen) {
    // Orbit + Tab-target planet/moon/star, or close-range belt/body flyby.
    const launch = getProbeLaunchTarget()
    if (launch) probeBody(launch.body)
  } else if (e.code === 'F5') {
    e.preventDefault()
    doSave()
  } else if (e.code === 'Escape' && !dockEffect && !navMapOpen && !inventoryOpen && !missionsOpen) {
    // One Esc: pause. Pointer-lock may unlock first (pointerlockchange opens
    // pause); ignore a same-tick keydown so we don't immediately unpause.
    e.preventDefault()
    if (paused && performance.now() - pauseOpenedAtMs < 200) return
    setGamePaused(!paused)
  } else if (e.code === 'KeyM' && !paused && !inventoryOpen && !missionsOpen && !dockEffect) {
    // Map is available in flight and while docked (plan jumps from a bay).
    navMapOpen = !navMapOpen
    audio.setThrustState(null)
    if (navMapOpen) {
      exitFlightMode()
      navMap.show({
        onJump: handleJump,
        onClose: () => {
          navMapOpen = false
          if (!docked) reenterFlightMode()
        },
        supercruiseActive: cruising,
        inCombat: !!gameState.inCombat
      })
    } else {
      navMap.hide()
      if (!docked) reenterFlightMode()
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
      if (targetDirEl) targetDirEl.style.display = 'none'
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
  } else if (e.code === 'KeyJ' && !navMapOpen && !paused && !inventoryOpen && !dockEffect) {
    // Missions tracker is available in flight and while docked.
    missionsOpen = !missionsOpen
    audio.setThrustState(null)
    if (missionsOpen) {
      exitFlightMode()
      missionsUI.show(() => {
        missionsOpen = false
        if (!docked) reenterFlightMode()
      })
    } else {
      missionsUI.hide()
      if (!docked) reenterFlightMode()
    }
  }
})

// Tab-lock range for ships/wrecks/rocks/bodies (surface dist for celestials).
// Radar draws farther so contacts appear before they are lockable.
const TARGET_RANGE = 60000
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

function targetReticleColor(target) {
  if (target.hostile) return '#e05a5a'
  if (target.reticle === 'asteroid') return '#ffb347'
  if (target.reticle === 'star') return '#ffd27a'
  if (target.reticle === 'facility') return '#7fe6ff'
  if (target.reticle === 'world') return '#9ad0ff'
  if (target.reticle === 'wreck') return '#c0a070'
  if (target.reticle === 'nav') return '#7fe0a0'
  return '#cfe3ff'
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
  const color = targetReticleColor(target)
  targetIndicatorEl.querySelector('.target-box').style.borderColor = color
  const label = targetIndicatorEl.querySelector('.target-label')
  label.style.color = color
  const dist = new THREE.Vector3().fromArray(gameState.player.ship.position).distanceTo(new THREE.Vector3(...target.position))
  const kindBit = target.kindLabel ? ` · ${target.kindLabel}` : ''
  label.textContent = target.hullPct !== null
    ? `${target.name} · ${Math.round(dist)}m · ${Math.round(target.hullPct * 100)}%`
    : `${target.name}${kindBit} · ${Math.round(dist)}m`
}

// Arrow sitting next to the ship's screen position, aimed at the current
// Tab target. Off when nothing is locked — complement to the on-target reticle.
// Distance from the projected ship to the direction chevron (px).
// Higher = further from dead-center / the hull silhouette.
const TARGET_DIR_OFFSET_PX = 96

function updateTargetDirectionIndicator() {
  if (!targetDirEl) return
  const target = resolveTarget()
  if (!target || !gameState || docked) {
    targetDirEl.style.display = 'none'
    return
  }

  camera.updateMatrixWorld(true)
  const shipWorld = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const targetWorld = new THREE.Vector3(...target.position)

  // Camera-space direction to target (works when target is off-screen / behind).
  const camLocal = targetWorld.clone().applyMatrix4(camera.matrixWorldInverse)
  let dirX = camLocal.x
  let dirY = -camLocal.y // screen Y down
  // Points behind the camera: flip so the arrow still points "that way" on rim.
  if (camLocal.z >= 0) {
    dirX = -dirX
    dirY = -dirY
  }
  if (Math.abs(dirX) < 1e-6 && Math.abs(dirY) < 1e-6) {
    dirX = 0
    dirY = -1
  }
  const len = Math.hypot(dirX, dirY) || 1
  dirX /= len
  dirY /= len

  // Anchor on the ship's projected screen position (chase cam: lower-center).
  const shipProj = shipWorld.clone().project(camera)
  const w = window.innerWidth
  const h = window.innerHeight
  // If ship is somehow behind the camera (shouldn't be in chase), fall back.
  if (shipProj.z > 1) {
    targetDirEl.style.display = 'none'
    return
  }
  const sx = (shipProj.x * 0.5 + 0.5) * w
  const sy = (-shipProj.y * 0.5 + 0.5) * h

  targetDirEl.style.left = `${Math.round(sx + dirX * TARGET_DIR_OFFSET_PX)}px`
  targetDirEl.style.top = `${Math.round(sy + dirY * TARGET_DIR_OFFSET_PX)}px`
  targetDirEl.style.display = 'block'
  const color = targetReticleColor(target)
  const arrow = targetDirEl.querySelector('.tdir-arrow')
  // Triangle points "up" (border-bottom); +π/2 maps atan2 screen dir to that.
  arrow.style.transform = `rotate(${Math.atan2(dirY, dirX) + Math.PI / 2}rad)`
  arrow.style.borderBottomColor = color
}

// Shared with chase cam + guns: ship +Z × AIM_LOOK_AHEAD (see sceneSync).
const _boresightAim = new THREE.Vector3()
const _boresightFwd = new THREE.Vector3()
const _boresightQuat = new THREE.Quaternion()

function getShipForwardWorld(out = _boresightFwd) {
  const ship = gameState.player.ship
  _boresightQuat.fromArray(ship.quaternion).normalize()
  out.set(0, 0, 1).applyQuaternion(_boresightQuat)
  if (out.lengthSq() < 1e-8) out.set(0, 0, 1)
  else out.normalize()
  return out
}

/** Tunnel FX / short helpers — same axis as combat aim, shorter distance. */
function getCrosshairAimWorld(out = _boresightAim) {
  out.fromArray(gameState.player.ship.position)
  return out.addScaledVector(getShipForwardWorld(_boresightFwd), CROSSHAIR_DISTANCE)
}

/**
 * Reticle always marks the projected combat aim point (same point guns use).
 * Scale X/Y separately so the ring is round in pixels (not NDC-squashed).
 */
function updateCrosshair() {
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (combatReticle3d) combatReticle3d.visible = false
  // Hide while Alt free-look frames the hull (reticle would sit on the ship).
  const on = !!(flightMode && gameState && !docked && !paused && !isChaseFreeLook())
  hudReticleRing.visible = on
  hudReticleDot.visible = on
  if (!on) return

  // ~16px outer radius in screen pixels → NDC half-extents (aspect-correct).
  const w = Math.max(1, renderer.domElement.clientWidth)
  const h = Math.max(1, renderer.domElement.clientHeight)
  const outerPx = 8
  const sx = (outerPx / w) * 2
  const sy = (outerPx / h) * 2
  hudReticleRing.scale.set(sx, sy, 1)
  hudReticleDot.scale.set(sx, sy, 1)

  camera.updateMatrixWorld(true)
  getShipAimPoint(gameState.player.ship, _boresightAim, AIM_LOOK_AHEAD)
  const p = _boresightAim.project(camera)
  if (Number.isFinite(p.x) && Number.isFinite(p.y) && p.z <= 1) {
    hudReticleRing.position.set(p.x, p.y, -1)
    hudReticleDot.position.set(p.x, p.y, -1)
  } else {
    hudReticleRing.position.set(0, 0, -1)
    hudReticleDot.position.set(0, 0, -1)
  }
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
    // Player munitions co-move so the trail doesn't shear off the reticle
    // while the ship is carried with a planet/moon (no projectile gravity).
    for (const p of gameState.projectiles) {
      if (p.ownerId !== 'player') continue
      p.position[0] += best.dx
      p.position[1] += best.dy
      p.position[2] += best.dz
    }
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
  for (const p of gameState.projectiles) {
    if (p.ownerId !== 'player') continue
    const px = p.position[0]
    const pz = p.position[2]
    p.position[0] = px * c - pz * s
    p.position[2] = px * s + pz * c
    const vx = p.velocity[0]
    const vz = p.velocity[2]
    p.velocity[0] = vx * c - vz * s
    p.velocity[2] = vx * s + vz * c
  }
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
    if (targetDirEl) targetDirEl.style.display = 'none'
    updateStarfieldMotion(starfield, 0, false)
    // Keep probes advancing while menus/docked so a survey isn't frozen mid-scan
    // (opening J/M/I or docking mid-flight used to stall mission completion).
    if (probeEffect && !docked) {
      gameState.simTime += dt
      updateProbeEffect(dt)
    }
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
  // Alt free-look works in normal flight and supercruise — consume mouse so
  // it never steers the ship while panning the camera.
  if (isChaseFreeLook() && (flightMode || cruising)) {
    addChaseFreeLookDelta(mouseAim.dx, mouseAim.dy)
    mouseAim.dx = 0
    mouseAim.dy = 0
  }
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
    updateFlight(gameState.player.ship, playerShipClass, flightMode ? keys : EMPTY_KEYS, mouseAim, dt)
    thrustState = !flightMode ? null : keys.has('KeyW') ? 'accel' : keys.has('KeyS') ? 'brake' : null
    audio.setThrustState(thrustState)
    // Drop laser bolts from the last turn so a stationary burst isn't buried
    // under ~1s of off-boresight trail (ttl 1.2s otherwise).
    prunePlayerLasersOffBoresight(gameState)
  }
  // Keep mesh + chase seat in sync with the post-flight pose *before* weapons
  // and reticles so undock/load can't leave a one-frame cam/gun skew.
  if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
  syncChaseCamera(camera, gameState.player.ship, { cruising, dt })

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
      // Brief yellow callout (same style as engage), then glitch-out.
      setHudGlitchText(cruiseIndicatorEl, 'SUPERCRUISE DISENGAGED')
      showHudGlitch(cruiseIndicatorEl)
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
      // Visual only — no tunnel whoosh SFX (felt weird punching through worlds).
      thrusterEffects?.playTunnelBurst(tunnel.from, tunnel.to)
    }
  } else {
    // Belts: collide with individual rocks only (not the field bounding shell).
    resolveBodyCollisions(gameState.player.ship, currentBodies, shipRadius, {
      isRockAlive: (fieldId, index) => isRockAlive(gameState, fieldId, index)
    })
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
    starColor: cruising ? getCurrentStarColor() : null,
    // Corridor vanishes through the crosshair aim point (ship forward).
    aimWorld: cruising ? getCrosshairAimWorld() : null
  })
  // Skybox stays unwarped; cruise uses motionFx full-screen star tunnel.
  updateStarfieldMotion(starfield, motion.intensity, cruising)
  // Speed FOV: mild in normal flight; cruise uses a fixed +5% FOV only.
  // Snap when close / nearly stopped so FOV settle doesn't smear projected aim.
  const targetFov = cruising ? CRUISE_FOV : BASE_FOV + motion.fovBoost
  const fovErr = Math.abs(camera.fov - targetFov)
  if (fovErr < 0.08 || (!cruising && shipSpeed < 2 && motion.fovBoost < 0.05)) {
    if (camera.fov !== targetFov) {
      camera.fov = targetFov
      camera.updateProjectionMatrix()
    }
  } else {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6)
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

  oreScoopEffects?.update(dt, new THREE.Vector3().fromArray(gameState.player.ship.position))

  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    updateNpcAI(npc, gameState, dt, onWeaponFired, (fromPos) => {
      pulseDamageVignette(fromPos)
    })
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
  updateDamageVignette(dt)
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
    gameState.npcs.push(
      spawnEncounterNear(
        Math.random,
        gameState.player.ship.position,
        gameState.galaxy,
        core,
        forceNeutralAmbient,
        spawnSystem.bodies
      )
    )
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

  // Chase cam + mesh after orbital carry so gun boresight and reticle share
  // the final ship pose this frame.
  syncMeshToEntity(playerMesh, gameState.player.ship)
  syncChaseCamera(camera, gameState.player.ship, { cruising, dt })

  // Fire after final pose + camera; mesh-sync again so new bolts draw this frame.
  if (laserFireHeld) tryPlayerFire('laser')
  if (missileFireHeld) tryPlayerFire('missile')
  syncProjectileMeshesNow()

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
  const nearestHudBody = findNearestHudBody()
  hud.update(
    gameState.player.ship,
    playerShipClass,
    speed,
    forwardSpeed,
    hudSystem?.name ?? null,
    nearestHudBody?.name ?? null
  )
  hud.updateRadar(computeRadarContacts(), RADAR_RANGE, gameState.simTime)

  // Dock / probe / wreck prompts are normal-space only — in supercruise you
  // skim past shells so constantly, that those toasts just spam the HUD.
  const nearbyBody = !cruising ? findNearbyDockableBody() : null
  dockPromptEl.style.display = nearbyBody ? 'block' : 'none'
  if (nearbyBody) dockPromptEl.textContent = `Dock with ${nearbyBody.name}`

  const probeLaunch = !cruising && !probeEffect ? getProbeLaunchTarget() : null
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
  wreckPromptEl.style.display = !cruising && !nearbyBody && findNearbyWreck() ? 'block' : 'none'

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
  updateTargetDirectionIndicator()

  renderer.render(scene, camera)
  // HUD reticle on top in true framebuffer NDC (same space as camera.project).
  if (hudReticleRing.visible) {
    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(hudScene, hudCamera)
    renderer.autoClear = prevAutoClear
  }

  if (gameState.player.ship.hull <= 0) handlePlayerDeath()
}
animate()

// Kick station GLB preload early so New Game / Load often hit ready models.
preloadStationModels()

startMenuBackground()
hasSave().then((exists) => menu.show(exists))
