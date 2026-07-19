import * as THREE from 'three'
import { createScene } from './render/scene.js'
import { createStarfield, updateStarfield, setStarfieldStarTint } from './render/starfield.js'
import { createMotionEffects, updateStarfieldMotion } from './render/motionFx.js'
import { createHyperspaceTunnel } from './render/hyperspaceTunnel.js'
import { createNebula, updateNebula } from './render/nebula.js'
import { buildShipMesh, updatePoliceLights } from './render/shipMesh.js'
import { buildStationMeshForBody, updateStationMesh } from './render/stationMesh.js'
import { preloadStationModels, stationModelsReady } from './render/stationModels.js'
import { buildPlanetMesh } from './render/planetMesh.js'
import { buildStarMesh, updateStarMesh } from './render/starMesh.js'
import { buildAsteroidFieldMesh, getAsteroidRocks } from './render/asteroidFieldMesh.js'
import { buildProjectileMesh, buildImpactFlash, preloadProjectileMeshes } from './render/projectileMesh.js'
import { buildStationInteriorMesh, updateStationInterior } from './render/stationInterior.js'
import { preloadInteriorModels } from './render/interiorModels.js'
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
import {
  spawnRockExplosion,
  spawnShipExplosion,
  updateRockExplosion,
  disposeRockExplosion
} from './render/rockExplosionFx.js'
import { spawnHitImpact, updateHitImpact, disposeHitImpact, preloadHitImpactFx } from './render/hitImpactFx.js'
import { createMissileTrailSystem } from './render/missileTrailFx.js'
import { createGameState } from './game/state.js'

import { advanceGameClock, reanchorGameClock } from './game/gameClock.js'
import { createInputState, createMouseAimState, updateFlight } from './game/flight.js'
import { updateSupercruise, ignoreBodyAsCruiseObstacle } from './game/supercruise.js'
import {
  spawnEncounterNear,
  spawnPoliceResponse,
  ensureStationPolicePatrols,
  spawnMiningPirateAmbush
} from './game/spawner.js'
import { playerSkillBonuses, ensureSkills, getSkillDef } from './game/skills.js'
import {
  fireProjectile,
  updateProjectiles,
  prunePlayerLasersOffBoresight,
  updateNpcAI,
  updateCombatFlag,
  prepareCombatFrame,
  regenShields,
  getShipCollisionRadius,
  truceActive,
  pruneCombatEngagement,
  playerFightingPirates
} from './game/combat.js'
import {
  ensureLawStanding,
  canDockWithLaw,
  policeHostileToPlayer,
  civiliansHostileToPlayer,
  getSystemSecurity,
  policeResponseDelayS,
  flushPendingToasts
} from './game/security.js'
import {
  resolveBodyCollisions,
  trySupercruiseTunnel,
  collisionRadiusFor,
  exteriorRadiusFor,
  rockCollisionRadius
} from './game/collision.js'
import {
  mineRock,
  isRockAlive,
  rockDisplayName,
  rockOreRemaining,
  rockOreMax,
  isFieldDepleted,
  fieldRespawnRemainingS,
  formatRespawnTime,
  rollMiningPirateAmbush
} from './game/mining.js'
import { pruneWrecks, lootWreck } from './game/wrecks.js'
import { updateCraftingJobs, ensureBlueprintMaps } from './game/crafting.js'
import { getBlueprint } from './data/blueprints.js'
import {
  markBodyVisited,
  markBodyProbed,
  updateMissionProgress,
  missionMarkedBodyIds,
  resolveInvestigationProbe,
  setMissionCompletedHandler
} from './game/missions.js'
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
import {
  getSystem,
  findBody,
  findSystemOfBody,
  coreFraction,
  canJumpTo,
  ensureSystemSecurity,
  WHISPERS_STATION_NAME
} from './procgen/galaxy.js'
import { createHud } from './ui/hud.js'
import { createDockingUI } from './ui/dockingUI.js'
import { createMenu } from './ui/menu.js'
import { createPauseMenu } from './ui/pauseMenu.js'
import { createNavMap } from './ui/navMap.js'
import { createSystemOverview } from './ui/systemOverview.js'
import { createInventoryUI } from './ui/inventoryUI.js'
import { createMissionsUI } from './ui/missionsUI.js'
import { createCharacterUI } from './ui/characterUI.js'
import { createDeathScreen } from './ui/deathScreen.js'
import { gameConfirm, gameNotice } from './ui/gameDialog.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from './data/shipClasses.js'
import { getGood } from './data/goods.js'
import { getWeapon } from './data/weapons.js'
import { shipHasAutopilot } from './data/accessories.js'
import {
  ensureDrones,
  summonDrones,
  recallDrones,
  teleportDronesToBay,
  updateDrones,
  damageDrone,
  livingDeployedDrones,
  hasDroneBays
} from './game/drones.js'
import { buildDroneMesh, updateDroneMesh, disposeDroneMesh } from './render/droneMesh.js'
import { droneBayCount } from './data/drones.js'
import * as audio from './audio.js'
import { applyLocalSoundCache, loadSoundPreference } from './preferences.js'

window.addEventListener('error', (e) => console.error('uncaught error:', e.message, e.error?.stack))

// Instant restore of last sound choice (localStorage) before title music starts;
// Electron settings.json is reconciled right after and is the long-term default.
applyLocalSoundCache()

// Docking approach range for stations/settlements (metres from body origin).
// Docking approach range for stations/settlements (metres from body origin).
const DOCK_RANGE = 4000
const DOCK_RANGE_COLLISION_MARGIN = 12
// Probe "in orbit" shells (fixed body layout — no orbital carry/drag).
// Beyond collision shell for Tab-target planet/moon orbit probes (was 900 — too tight on large worlds).
const PROBE_ORBIT_MARGIN = 12000
const STAR_ORBITAL_CARRY_RADIUS = 168000
// Stations/settlements +50% on prior 11.25 scale; collision.js matches.
// Free-model stations are normalized to ~26–30 local units, then this
// multiplies them into world space. Large behemoths next to ships.
const STATION_SCALE = 190
// Settlements stay small surface bases (pre-behemoth station scale × 0.55).
const SETTLEMENT_SCALE = 16.875 * 0.55
// Surface-distance for flyby / belt probes (was 150 — required hugging the crust).
const PROBE_RANGE = 4500
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
// Black screen fade around the mid-tunnel system swap (streak phase s = 0–1).
// Fade in before the swap (s=0.4), hold, then fade out into the arrival system.
const JUMP_BLACK_FADE_IN_START = 0.22
const JUMP_BLACK_FADE_IN_END = 0.4
const JUMP_BLACK_FADE_OUT_START = 0.48
const JUMP_BLACK_FADE_OUT_END = 0.72
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
/** Alt held for free-look; free-look only activates once the mouse moves. */
let altHeldForFreeLook = false
/** Keep suppress true for N animation frames (WebGL dispose / re-lock churn). */
function suppressUnlockPauseForFrames(frames = 3) {
  suppressPointerUnlockPause = true
  let left = Math.max(1, frames | 0)
  const tick = () => {
    left -= 1
    if (left <= 0) suppressPointerUnlockPause = false
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
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

/** True when the player may shoot (flight-mode lock, free-flying, no menus). */
function canPlayerFire() {
  return !!(
    gameState &&
    playerShipClass &&
    flightMode &&
    !docked &&
    !dockEffect &&
    !cruising &&
    !paused &&
    !navMapOpen &&
    !inventoryOpen &&
    !missionsOpen &&
    !characterOpen &&
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
    // Boresight only — lasers fly pure ship +Z (never home on a Tab-lock).
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

// Capture fire buttons independently. Do NOT sync both from e.buttons —
// under pointer-lock, pressing RMB while LMB is held often delivers a
// spurious up / buttons mask that would clear the laser (or vice versa).
// Only the specific e.button that went down/up is toggled.
function setFireButton(button, down) {
  if (button === 0) laserFireHeld = down
  else if (button === 2) missileFireHeld = down
}
function onFireButtonDown(e) {
  if (e.button !== 0 && e.button !== 2) return
  // Ignore UI targets (menus, overview) so we don't steal clicks.
  const t = e.target
  if (t && t !== document && t !== document.body && t !== renderer?.domElement) {
    if (typeof t.closest === 'function' && t.closest('button, input, select, textarea, a, #nav-map, #inventory-ui, #missions-ui, #character-ui, #system-overview.interactive, #docking-ui, #pause-menu, #menu')) {
      return
    }
  }
  setFireButton(e.button, true)
  if (!canPlayerFire()) return
  if (e.button === 0) tryPlayerFire('laser')
  if (e.button === 2) tryPlayerFire('missile')
}
function onFireButtonUp(e) {
  if (e.button !== 0 && e.button !== 2) return
  setFireButton(e.button, false)
}
// Prefer mouse events: more reliable multi-button under Electron pointer-lock
// than pointer* (which can cancel both buttons when the second is pressed).
window.addEventListener('mousedown', onFireButtonDown, true)
window.addEventListener('mouseup', onFireButtonUp, true)
// Pointer path as backup (tablets / some embeds).
document.addEventListener('pointerdown', onFireButtonDown, true)
document.addEventListener('pointerup', onFireButtonUp, true)
document.addEventListener('pointercancel', (e) => {
  // Only clear the cancelled button if reported; never wipe the other.
  if (e.button === 0 || e.button === 2) setFireButton(e.button, false)
  else if ((e.buttons ?? 0) === 0) {
    laserFireHeld = false
    missileFireHeld = false
  }
}, true)
// Right-click is used for missile fire, not the OS/browser context menu.
window.addEventListener('contextmenu', (e) => e.preventDefault())

function canUseFlightMode() {
  if (!gameState || paused || navMapOpen || inventoryOpen || missionsOpen || characterOpen || jumpEffect) return false
  // Parked at the docking UI: no flight. Mid undock animation is fine —
  // pointer lock is requested on the Undock click (needs a live gesture).
  if (docked && !dockEffect) return false
  return true
}

function exitFlightMode() {
  flightModeWanted = false
  flightMode = false
  laserFireHeld = false
  missileFireHeld = false
  altHeldForFreeLook = false
  setChaseFreeLook(false)
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (targetDirEl) targetDirEl.style.display = 'none'
  // Free mouse → overview HUD accepts waypoint clicks (EVE-style).
  if (!docked && !navMapOpen && !inventoryOpen && !missionsOpen && !characterOpen && !paused) {
    systemOverview?.setInteractive(true)
  }
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
  if (dockEffect || navMapOpen || inventoryOpen || missionsOpen || characterOpen) return
  paused = !!next
  audio.setThrustState(null)
  if (paused) {
    // Freeze campaign clock at current simTime (wall time does not advance sim while paused).
    if (gameState.simClockOriginMs != null) {
      gameState.simTime = Math.max(0, (Date.now() - gameState.simClockOriginMs) / 1000)
    }
    // Don't clear flightModeWanted — Resume should return to mouse-aim.
    flightMode = false
    laserFireHeld = false
    missileFireHeld = false
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
    // Resume: continue clock from frozen simTime (no offline jump for pause duration).
    reanchorGameClock(gameState)
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
  systemOverview?.setInteractive(false)
  if (document.pointerLockElement === renderer.domElement) return
  renderer.domElement.requestPointerLock().catch((err) => {
    console.error('Pointer lock request failed:', err)
    flightMode = false
    systemOverview?.setInteractive(true)
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
    if (flightModeWanted && !paused && !characterOpen) {
      flightMode = true
      systemOverview?.setInteractive(false)
    }
    return
  }
  flightMode = false
  laserFireHeld = false
  missileFireHeld = false
  // Overview stays visible while undocked; only clickability follows free mouse.
  // Do not open pause when we intentionally unlocked (menus / Character F1).
  if (
    !docked &&
    !navMapOpen &&
    !inventoryOpen &&
    !missionsOpen &&
    !characterOpen &&
    !paused &&
    !suppressPointerUnlockPause
  ) {
    systemOverview?.setInteractive(true)
  } else if (!docked) {
    systemOverview?.setInteractive(false)
  }
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (targetDirEl) targetDirEl.style.display = 'none'
  // Escape while locked often only releases the cursor (no keydown). Open pause
  // so one Esc is enough. Do NOT pause on alt-tab / focus loss — OS focus steal
  // also unlocks the pointer, and pausing there is annoying.
  const appStillFocused =
    document.visibilityState === 'visible' &&
    (typeof document.hasFocus !== 'function' || document.hasFocus())
  if (
    !suppressPointerUnlockPause &&
    appStillFocused &&
    gameState &&
    !paused &&
    flightModeWanted &&
    !docked &&
    !dockEffect &&
    !navMapOpen &&
    !inventoryOpen &&
    !missionsOpen &&
    !characterOpen
  ) {
    setGamePaused(true)
  }
})

// Alt + mouse: orbit chase cam around the ship; release Alt snaps back to seat.
// Important: do NOT arm free-look on bare Alt keydown — that regresses Alt+Enter
// fullscreen (free-look sticks when the OS swallows Alt keyup mid-toggle).
function isAltKey(code) {
  return code === 'AltLeft' || code === 'AltRight'
}

function clearChaseFreeLook() {
  altHeldForFreeLook = false
  setChaseFreeLook(false)
}

function isAltEnterChord(e) {
  return (
    e.altKey &&
    (e.code === 'Enter' ||
      e.code === 'NumpadEnter' ||
      e.key === 'Enter' ||
      e.key === 'Return')
  )
}

window.addEventListener('blur', () => {
  keys.clear()
  laserFireHeld = false
  missileFireHeld = false
  clearChaseFreeLook()
})

window.addEventListener('focus', () => {
  tryRestoreFlightMode()
})

window.addEventListener('keydown', (e) => {
  // Alt+Enter → fullscreen. Never free-look. Dual-path: main before-input + IPC.
  if (isAltEnterChord(e)) {
    e.preventDefault()
    e.stopPropagation()
    clearChaseFreeLook()
    window.electronAPI?.toggleFullscreen?.()
    return
  }
  if (!isAltKey(e.code)) return
  if (!gameState || paused || docked || jumpEffect || navMapOpen || inventoryOpen || missionsOpen || characterOpen) {
    clearChaseFreeLook()
    return
  }
  // Hold only — free-look engages on mouse movement in the game loop.
  altHeldForFreeLook = true
})
window.addEventListener('keyup', (e) => {
  if (!isAltKey(e.code)) return
  clearChaseFreeLook()
})
// Fullscreen transition often drops Alt keyup while free-look would stick.
if (typeof window.electronAPI?.onFullscreenChanged === 'function') {
  window.electronAPI.onFullscreenChanged(() => clearChaseFreeLook())
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tryRestoreFlightMode()
})

// Click the game view (canvas) while free-mousing → back into flight mode.
// HUD chrome uses pointer-events:none so those clicks land here; interactive
// overlays (system overview, menus) sit above the canvas and keep the mouse free.
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  if (!gameState || !canUseFlightMode()) return
  if (flightMode && document.pointerLockElement === renderer.domElement) return
  reenterFlightMode()
})

// Chase-camera zoom (works with or without pointer lock). Scroll up = closer.
window.addEventListener('wheel', (e) => {
  if (!gameState || docked || dockEffect || jumpEffect || paused || navMapOpen || inventoryOpen || missionsOpen || characterOpen) return
  e.preventDefault()
  adjustChaseZoom(e.deltaY)
}, { passive: false })

let gameState = null
let playerShipClass = null
let playerMesh = null
let thrusterEffects = null
let damageEffects = null
let oreScoopEffects = null
let missileTrail = null
let hud = null
let dockingUI = null
let pauseMenu = null
let navMap = null
let systemOverview = null
let inventoryUI = null
let missionsUI = null
let characterUI = null
/** Police backup timer: { systemId, fireAt } or null. */
let policeResponse = null
let dockPromptEl = null
let probePromptEl = null
let probeResultsEl = null
let probeResultsUntil = 0
// Floating probe scan text (left of ship); shown while in range of a scanned body.
let probeScanPanelEl = null
/** @type {Map<string, string[]>|null} */
let probeScanCache = null
let probeScanActiveBodyId = null
let wreckPromptEl = null
let miningToastEl = null
let miningToastUntil = 0
let lastOreFullToastAt = -Infinity
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
/** Full-screen black overlay for hyperspace system-change fade. */
let jumpBlackEl = null
let jumpEffect = null
let dockEffect = null
let dockedApproach = null
let interiorMesh = null
const npcMeshes = new Map()
const bodyMeshes = new Map()
const wreckMeshes = new Map()
// Surface settlements ride a fixed offset on their parent (parents themselves
// are static — no orbital motion for planets/moons/fields/stations).
const surfaceSettlements = new Map()
let starMesh = null
const projectileMeshes = new Map()
const impactFlashes = []
const rockExplosions = []
const hitImpacts = []

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
  surfaceSettlements.clear()
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

    // Bodies stay at their generated positions (fixed orbits — no animation).
    // Settlements keep a surface offset + upright orientation on the host.
    if (body.kind === 'settlement' && body.parentId && body.surfaceOffset) {
      surfaceSettlements.set(body.id, {
        body,
        parentId: body.parentId,
        surfaceOffset: body.surfaceOffset
      })
      orientSettlementOnSurface(mesh, body.surfaceOffset)
    }
  }
  // Sec 3–6: System Patrol ships loiter at every station.
  refreshStationPolicePatrols()
}

/** Spawn / top-up police patrols around stations in high-security systems. */
function refreshStationPolicePatrols() {
  if (!gameState) return
  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!system) return
  ensureSystemSecurity(system)
  ensureStationPolicePatrols(Math.random, gameState, system, getSystemSecurity(system))
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

/**
 * Pick docking-bay theme from body + current system location.
 * - SerNub's Pleasure Palace → palace (fanciest)
 * - settlements → slightly dirty
 * - core stations (coreFraction < 0.3) → polished core
 * - mid stations → decent fancy
 * - outer rim stations (coreFraction ≥ 0.9) → rusty / gritty
 */
function resolveInteriorTheme(body) {
  if (body?.name === WHISPERS_STATION_NAME) return 'palace'
  if (body?.kind === 'settlement') return 'settlement'
  if (body?.kind !== 'station') return 'settlement'
  let f = 0.5
  if (gameState) {
    const system =
      findSystemOfBody(gameState.galaxy, body.id) ||
      getSystem(gameState.galaxy, gameState.player.currentSystemId)
    if (system) f = coreFraction(system)
  }
  if (f >= 0.9) return 'outer'
  if (f < 0.3) return 'core'
  return 'mid'
}

/** Rebuild bay mesh when theme changes (station vs settlement vs rim band). */
function ensureInteriorMesh(theme = 'mid') {
  if (!interiorMesh || interiorMesh.userData.theme !== theme) {
    if (interiorMesh) {
      scene.remove(interiorMesh)
      interiorMesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.()
      })
    }
    interiorMesh = buildStationInteriorMesh({ theme })
    interiorMesh.position.copy(DOCKING_BAY_ORIGIN)
  }
  return interiorMesh
}

// Docking swaps the whole exterior scene out for the bay interior (and back).
function swapToInterior(body) {
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  for (const mesh of npcMeshes.values()) scene.remove(mesh)
  for (const mesh of projectileMeshes.values()) scene.remove(mesh)
  for (const mesh of wreckMeshes.values()) scene.remove(mesh)
  for (const flash of impactFlashes) scene.remove(flash.mesh)
  if (starMesh) scene.remove(starMesh)
  scene.add(ensureInteriorMesh(resolveInteriorTheme(body)))
}

function swapToExterior() {
  if (interiorMesh) scene.remove(interiorMesh)
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
let characterOpen = false
let cruising = false
// Edge-detected in animate() to fire the supercruise engage/disengage voice
// callout exactly once per transition, regardless of whether cruising flips
// via the KeyC handler (manual) or the cruising block below (auto-arrival/
// combat-interrupt) — one check covers every trigger source.
let wasCruising = false
// Active probe flight: { phase, elapsed, body, mesh, launchPos, scanPos, ... }
let probeEffect = null
/** @type {Map<string, THREE.Object3D>} */
const droneMeshes = new Map()
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

/** Remember who last hurt the player (for the death screen). */
function notePlayerDamagedBy(ownerId, { ram = false } = {}) {
  if (!gameState?.player || !ownerId || ownerId === 'player') return
  const npc = gameState.npcs?.find((n) => n.id === ownerId)
  if (!npc) {
    gameState.player.lastKiller = {
      pilotName: 'Unknown pilot',
      shipName: 'Unknown vessel',
      method: ram ? 'ram' : 'fire'
    }
    return
  }
  let shipName = npc.shipClassId || 'Unknown vessel'
  try {
    shipName = getShipClass(npc.shipClassId).name
  } catch {
    /* */
  }
  gameState.player.lastKiller = {
    pilotName: npc.pilotName || 'Unknown pilot',
    shipName,
    shipClassId: npc.shipClassId,
    faction: npc.faction || null,
    method: ram ? 'ram' : 'fire'
  }
}

function onProjectileHit({
  position,
  rockPosition,
  destroyed,
  mined,
  hitPlayer,
  inboundDir,
  fieldId,
  rockIndex,
  targetNpcId,
  weaponType,
  weaponId,
  ownerId
}) {
  if (hitPlayer && ownerId) notePlayerDamagedBy(ownerId, { ram: false })
  const flash = buildImpactFlash(mined ? 0xc2a35c : destroyed ? 0xff8a3d : 0xffcc66)
  flash.position.fromArray(position)
  if (mined?.destroyed) flash.scale.setScalar(2.2)
  scene.add(flash)
  impactFlashes.push({ mesh: flash, ttl: IMPACT_FLASH_TTL })

  // Sparks + laser smoke puff / missile micro-blast (skip full rock/ship death
  // frames — those already have their own big FX).
  const isMissile = weaponType === 'missile'
  const skipLightHitFx = !!(mined?.destroyed || (destroyed && !hitPlayer))
  if (!skipLightHitFx) {
    let tint = null
    try {
      if (weaponId) tint = getWeapon(weaponId).color
    } catch { /* */ }
    const hitPos = rockPosition ?? position
    const hitFx = spawnHitImpact(hitPos, isMissile ? 'missile' : 'laser', tint)
    scene.add(hitFx.group)
    hitImpacts.push(hitFx)
  }

  if (mined) {
    if (mined.destroyed) {
      // Fracture burst + beefy rock rumble (not the ship combat boom).
      const origin = rockPosition ?? position
      let rockR = 14
      if (fieldId != null && rockIndex != null) {
        const field = getSystem(gameState.galaxy, gameState.player.currentSystemId)?.bodies
          ?.find((b) => b.id === fieldId)
        const rock = field ? getAsteroidRocks(field)[rockIndex] : null
        if (rock) rockR = rockCollisionRadius(rock)
      }
      const fx = spawnRockExplosion(origin, rockR)
      scene.add(fx.group)
      rockExplosions.push(fx)
      audio.playRockExplosion()
      setHudGlitchText(miningToastEl, `${getGood(mined.goodId).name} deposit destroyed!`)
      showHudGlitch(miningToastEl)
      miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S * 1.4
      // If the whole belt is empty, show when it comes back.
      maybeToastFieldDepleted(fieldId)
    } else {
      audio.playMiningPing()
    }
    // Scoop trail only when ore actually entered the hold.
    if (mined.scooped) {
      const from = rockPosition ?? position
      oreScoopEffects?.burst(new THREE.Vector3(...from), 5 + Math.floor(Math.random() * 4))
      if (!mined.destroyed) {
        const n = mined.scoopedAmount ?? mined.amount ?? 1
        setHudGlitchText(miningToastEl, `Mined ${n} ${getGood(mined.goodId).name}`)
        showHudGlitch(miningToastEl)
        miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
      }
    } else if (!mined.destroyed) {
      // Stripped ore but hold is full — warn the pilot (throttled).
      if (gameState.simTime - lastOreFullToastAt > 1.25) {
        flashToast('Ore Hold Full')
        lastOreFullToastAt = gameState.simTime
      }
    }
    // Sec 0–3: 10% chance mining attracts a pirate (cooldown inside roll helper).
    maybeSpawnMiningPirateAmbush()
  } else if (destroyed && !hitPlayer) {
    // NPC kill via projectile — mark so mesh teardown doesn't double-play.
    const killed = targetNpcId
      ? gameState.npcs.find((n) => n.id === targetNpcId)
      : gameState.npcs.find((n) => n.destroyed && !n.deathFxPlayed)
    if (killed && !killed.deathFxPlayed) {
      killed.deathFxPlayed = true
      const r = getShipCollisionRadius(getShipClass(killed.shipClassId))
      playShipDeathFx(killed.position ?? position, r)
    } else if (!killed) {
      playShipDeathFx(position, 14)
    }
  } else if (!destroyed) {
    // Shield/armor/hull hit (player or NPC still alive).
    audio.playHit()
  }
  // Player ship destroyed: handlePlayerDeath() plays combat boom + FX.

  // Red edge vignette toward the side of the screen the fire came from.
  if (hitPlayer) pulseDamageVignette(position, inboundDir)
}

/** Hull-plate explosion for destroyed ships (NPCs / player death). */
function playShipDeathFx(position, radius = 12, { sound = true } = {}) {
  if (!position) return
  const fx = spawnShipExplosion(position, Math.max(8, radius))
  scene.add(fx.group)
  rockExplosions.push(fx)
  if (sound) audio.playExplosion()
}

/** Toast when every rock in a field is gone (and remaining time until next respawn). */
function maybeToastFieldDepleted(fieldId) {
  if (!fieldId || !gameState) return
  const field = getSystem(gameState.galaxy, gameState.player.currentSystemId)?.bodies
    ?.find((b) => b.id === fieldId && b.kind === 'asteroidField')
  if (!field) return
  const rocks = getAsteroidRocks(field)
  if (!isFieldDepleted(gameState, field.id, rocks.length)) return
  const rem = fieldRespawnRemainingS(gameState, field.id, rocks.length)
  const label = field.name || 'Asteroid field'
  flashToast(
    rem > 0
      ? `${label} depleted · respawns in ${formatRespawnTime(rem)}`
      : `${label} depleted`,
    4.5
  )
}

/** SC / approach: warn if the destination belt is fully mined out. */
function toastIfDepletedField(bodyId) {
  if (!bodyId || !gameState) return
  const field = getSystem(gameState.galaxy, gameState.player.currentSystemId)?.bodies
    ?.find((b) => b.id === bodyId && b.kind === 'asteroidField')
  if (!field) return
  const rocks = getAsteroidRocks(field)
  if (!isFieldDepleted(gameState, field.id, rocks.length)) return
  const rem = fieldRespawnRemainingS(gameState, field.id, rocks.length)
  flashToast(
    rem > 0
      ? `${field.name} depleted · respawns in ${formatRespawnTime(rem)}`
      : `${field.name} depleted`,
    4.5
  )
}

/** Sec 0–3 mining: 10% chance a pirate drops out of the dark. */
function maybeSpawnMiningPirateAmbush() {
  if (!gameState || docked || jumpEffect) return
  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!system) return
  ensureSystemSecurity(system)
  if (!rollMiningPirateAmbush(Math.random, gameState, system)) return
  const npc = spawnMiningPirateAmbush(
    Math.random,
    gameState.player.ship.position,
    coreFraction(system),
    system.bodies
  )
  gameState.npcs.push(npc)
  if (factionToastEl) {
    factionToastEl.style.color = '#e05a5a'
    setHudGlitchText(factionToastEl, 'Pirates attracted by your mining!')
    showHudGlitch(factionToastEl)
    factionToastUntil = gameState.simTime + FACTION_TOAST_DURATION_S
  }
}

const deathScreen = createDeathScreen(appEl, () => returnToMenu())
const menu = createMenu(appEl, {
  onNewGame: ({ characterName, shipInstanceName, portraitDataUrl }) => {
    const gameState = createGameState({
      characterName,
      shipInstanceName,
      portraitDataUrl: portraitDataUrl || null,
      shipClassId: STARTER_SHIP_CLASS_ID,
      seed: Math.floor(Math.random() * 1e9)
    })
    startSession(gameState, { enterFlightMode: true })
  },
  onLoadGame: async () => {
    const loaded = await persistLoadGame()
    if (loaded) startSession(loaded)
    else menu.show(await hasSave())
  }
})

function clearSession() {
  if (playerMesh) scene.remove(playerMesh)
  clearDroneMeshes()
  probeScanCache = null
  probeScanActiveBodyId = null
  if (thrusterEffects) scene.remove(thrusterEffects.group)
  thrusterEffects = null
  if (damageEffects) scene.remove(damageEffects.group)
  damageEffects = null
  if (oreScoopEffects) scene.remove(oreScoopEffects.group)
  oreScoopEffects = null
  if (missileTrail) {
    missileTrail.clear()
    scene.remove(missileTrail.group)
    missileTrail = null
  }
  for (const mesh of npcMeshes.values()) scene.remove(mesh)
  npcMeshes.clear()
  for (const mesh of bodyMeshes.values()) scene.remove(mesh)
  bodyMeshes.clear()
  surfaceSettlements.clear()
  if (starMesh) scene.remove(starMesh)
  starMesh = null
  for (const mesh of projectileMeshes.values()) scene.remove(mesh)
  projectileMeshes.clear()
  for (const mesh of wreckMeshes.values()) scene.remove(mesh)
  wreckMeshes.clear()
  for (const flash of impactFlashes) scene.remove(flash.mesh)
  impactFlashes.length = 0
  for (const fx of rockExplosions) {
    scene.remove(fx.group)
    disposeRockExplosion(fx)
  }
  rockExplosions.length = 0
  for (const fx of hitImpacts) {
    scene.remove(fx.group)
    disposeHitImpact(fx)
  }
  hitImpacts.length = 0
  hud?.element.remove()
  dockingUI?.element.remove()
  pauseMenu?.element.remove()
  navMap?.element.remove()
  systemOverview?.element.remove()
  systemOverview = null
  inventoryUI?.element.remove()
  missionsUI?.element.remove()
  characterUI?.element.remove()
  characterUI = null
  policeResponse = null
  dockPromptEl?.remove()
  probePromptEl?.remove()
  probeResultsEl?.remove()
  probeResultsEl = null
  probeResultsUntil = 0
  probeScanPanelEl?.remove()
  probeScanPanelEl = null
  probeScanCache = null
  probeScanActiveBodyId = null
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
  jumpBlackEl?.remove()
  jumpBlackEl = null
  if (interiorMesh) scene.remove(interiorMesh)
  audio.setThrustState(null)
  audio.setSupercruiseActive(false)
  audio.stopAmbientMusic()
  camera.fov = BASE_FOV
  camera.updateProjectionMatrix()
  resetChaseZoom()
  resetChaseCameraState()
  docked = false
  hud?.setDocked(false)
  paused = false
  navMapOpen = false
  inventoryOpen = false
  missionsOpen = false
  characterOpen = false
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

function clearDroneMeshes() {
  for (const mesh of droneMeshes.values()) {
    scene.remove(mesh)
    if (mesh.userData.trail?.mesh) scene.remove(mesh.userData.trail.mesh)
    disposeDroneMesh(mesh)
  }
  droneMeshes.clear()
}

function syncDroneMeshes() {
  if (!gameState) return
  const ship = gameState.player.ship
  ensureDrones(ship)
  const live = new Set()
  for (const d of ship.drones ?? []) {
    if (!d.deployed || d.destroyed || d.hull <= 0 || d.mode === 'bay') continue
    live.add(d.id)
    let mesh = droneMeshes.get(d.id)
    if (!mesh) {
      mesh = buildDroneMesh(d.typeId)
      droneMeshes.set(d.id, mesh)
      scene.add(mesh)
      if (mesh.userData.trail?.mesh) scene.add(mesh.userData.trail.mesh)
    }
    mesh.visible = true
    updateDroneMesh(mesh, d, 0)
  }
  for (const [id, mesh] of [...droneMeshes.entries()]) {
    if (live.has(id)) continue
    scene.remove(mesh)
    if (mesh.userData.trail?.mesh) scene.remove(mesh.userData.trail.mesh)
    disposeDroneMesh(mesh)
    droneMeshes.delete(id)
  }
}

function updatePlayerDrones(dt) {
  if (!gameState || docked || cruising || jumpEffect) return
  ensureDrones(gameState.player.ship)
  // Drones only engage after shots exchanged (not Tab-lock alone).
  pruneCombatEngagement(gameState)
  const targetNpcId =
    currentTarget?.kind === 'npc' ? currentTarget.id : null
  updateDrones(gameState, dt, {
    isHostileNpc: isHostileToPlayer,
    engagedNpcIds: gameState.player.combatEngagedNpcIds ?? {},
    playerTargetNpcId: targetNpcId,
    fireLaser: (drone, targetPos, weapon) => {
      // Fire as player-owned projectile from drone position toward target.
      const origin = drone.position
      const to = [
        targetPos[0] - origin[0],
        targetPos[1] - origin[1],
        targetPos[2] - origin[2]
      ]
      const len = Math.hypot(to[0], to[1], to[2]) || 1
      const dir = [to[0] / len, to[1] / len, to[2] / len]
      const speed = weapon.speed ?? 400
      let dmg = weapon.damage ?? 8
      try {
        dmg *= playerSkillBonuses(gameState).droneMult
      } catch {
        /* */
      }
      const proj = {
        id: `drone-shot-${drone.id}-${Math.floor(gameState.simTime * 1000)}-${Math.random().toString(36).slice(2, 7)}`,
        ownerId: 'player',
        weaponId: weapon.id,
        weaponType: 'laser',
        position: [...origin],
        velocity: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
        damage: dmg,
        ttl: weapon.ttl ?? 2.5,
        spawnedAt: gameState.simTime,
        fromDrone: true
      }
      gameState.projectiles.push(proj)
      try {
        audio.playWeaponFire(weapon.id)
      } catch {
        /* */
      }
    }
  })
  // Sync meshes + thruster trails
  for (const d of gameState.player.ship.drones ?? []) {
    if (!d.deployed || d.destroyed || d.mode === 'bay') {
      const m = droneMeshes.get(d.id)
      if (m) {
        scene.remove(m)
        if (m.userData.trail?.mesh) scene.remove(m.userData.trail.mesh)
        disposeDroneMesh(m)
        droneMeshes.delete(d.id)
      }
      continue
    }
    let mesh = droneMeshes.get(d.id)
    if (!mesh) {
      mesh = buildDroneMesh(d.typeId)
      droneMeshes.set(d.id, mesh)
      scene.add(mesh)
      if (mesh.userData.trail?.mesh) scene.add(mesh.userData.trail.mesh)
    }
    updateDroneMesh(mesh, d, dt)
  }
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
  ensureDrones(gameState.player.ship)
  clearDroneMeshes()
  thrusterEffects = createThrusterEffects()
  scene.add(thrusterEffects.group)
  damageEffects = createDamageEffects()
  scene.add(damageEffects.group)
  oreScoopEffects = createOreScoopEffects()
  scene.add(oreScoopEffects.group)
  missileTrail = createMissileTrailSystem()
  scene.add(missileTrail.group)

  // Warm projectile + hit FX so first combat shot/hit is not a hitch.
  try {
    preloadProjectileMeshes(Object.values(gameState.player.ship.equippedWeapons ?? {}))
  } catch {
    preloadProjectileMeshes()
  }
  try {
    preloadHitImpactFx(renderer, scene, camera)
  } catch {
    /* non-fatal */
  }
  for (const npc of gameState.npcs) {
    const mesh = buildShipMesh(getShipClass(npc.shipClassId), { lite: true })
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
  preloadInteriorModels()

  hud = createHud(appEl)
  dockingUI = createDockingUI(appEl, gameState, Math.random, {
    onCraftStarted: (msg) => {
      showCraftToast(msg, 5000)
      audio.playCraftStart()
    },
    // Bought ships only become active via Storage activate — rebuild the
    // visual hull so a class swap doesn't keep looking like the previous ship.
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
  systemOverview = createSystemOverview(appEl, gameState, {
    canSetWaypoint: () => {
      if (cruising) {
        flashToast('Unable to set a waypoint during Supercruise.')
        return false
      }
      return true
    },
    onWaypointChange: ({ name, set }) => {
      if (set) {
        audio.playWaypointSet()
        flashToast(`Waypoint set: ${name ?? 'body'}`)
      } else {
        audio.playWaypointClear()
        flashToast(name ? `Waypoint cleared: ${name}` : 'Waypoint cleared')
      }
    }
  })
  systemOverview.show()
  systemOverview.setInteractive(!flightMode)
  inventoryUI = createInventoryUI(appEl, gameState)
  missionsUI = createMissionsUI(appEl, gameState, {
    canSetWaypoint: () => {
      if (cruising) {
        flashToast('Unable to set a waypoint during Supercruise.')
        return false
      }
      return true
    }
  })
  characterUI = createCharacterUI(appEl, gameState)
  ensureLawStanding(gameState)
  const startSys = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (startSys) ensureSystemSecurity(startSys)

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

  // Probe classification as floating faded-white text on the left of the screen
  // (inset from the border). Visible only in probe range of a scanned body.
  probeScanPanelEl = document.createElement('div')
  probeScanPanelEl.id = 'probe-scan-panel'
  probeScanPanelEl.innerHTML = `<div class="psp-body"></div>`
  const pspStyle = document.createElement('style')
  pspStyle.textContent = `
#probe-scan-panel {
  position: fixed; left: 56px; top: 50%; transform: translateY(-50%);
  width: min(300px, 30vw); max-height: min(55vh, 420px);
  display: none; flex-direction: column;
  z-index: 12; pointer-events: none;
  font-family: monospace; color: rgba(255,255,255,0.78);
  background: transparent; border: none; box-shadow: none;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.45);
  text-align: left;
}
#probe-scan-panel .psp-body {
  padding: 0; overflow-y: auto; font-size: 12px; line-height: 1.45;
  scrollbar-width: none;
}
#probe-scan-panel .psp-body .psp-line { margin: 0 0 5px; opacity: 0.82; }
#probe-scan-panel .psp-body .psp-line.kicker {
  color: rgba(255,255,255,0.95); letter-spacing: 0.5px; margin-bottom: 8px;
  font-size: 12px; opacity: 0.92;
}
`
  document.head.appendChild(pspStyle)
  appEl.appendChild(probeScanPanelEl)
  // bodyId → classification lines (cached after first successful probe)
  probeScanCache = new Map()
  probeScanActiveBodyId = null

  wreckPromptEl = document.createElement('div')
  wreckPromptEl.id = 'wreck-prompt'
  wreckPromptEl.style.cssText =
    `position:fixed;bottom:240px;left:50%;transform:translateX(-50%);color:#ff8a3d;display:none;${floatText('font-size:13px;letter-spacing:0.5px;')}`
  wreckPromptEl.textContent = 'Press F to salvage wreck'
  appEl.appendChild(wreckPromptEl)

  // Just above screen-center crosshair / boresight reticle.
  miningToastEl = document.createElement('div')
  miningToastEl.id = 'mining-toast'
  miningToastEl.style.cssText =
    `position:fixed;top:calc(50% - 52px);left:50%;transform:translateX(-50%);z-index:15;pointer-events:none;color:#e0c878;display:none;${floatText('font-size:13px;letter-spacing:0.4px;text-align:center;max-width:min(640px,92vw);')}`
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
  jumpFlashEl.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;display:none;z-index:38;'
  appEl.appendChild(jumpFlashEl)

  // Opaque black veil across the system swap (fade in → hold → fade out).
  jumpBlackEl = document.createElement('div')
  jumpBlackEl.id = 'jump-black'
  jumpBlackEl.style.cssText =
    'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;display:none;z-index:39;'
  appEl.appendChild(jumpBlackEl)

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

// Dock when within DOCK_RANGE of the body centre, but never inside the
// collision shell / visual bulk (so large stations stay reachable and
// undock exits remain re-dockable without diving back into the mesh).
function dockRangeFor(body) {
  const bodyRadius = collisionRadiusFor(body) ?? 0
  const shipR = getShipCollisionRadius(playerShipClass)
  const shell = bodyRadius + shipR + DOCK_RANGE_COLLISION_MARGIN
  if (body.kind === 'station' || body.kind === 'settlement') {
    const visual = exteriorRadiusFor(body) ?? bodyRadius
    const outsideVisual = visual + shipR + DOCK_RANGE_COLLISION_MARGIN + 80
    return Math.max(DOCK_RANGE, shell, outsideVisual)
  }
  return Math.max(DOCK_RANGE, shell)
}

/**
 * Where supercruise should drop out around a waypoint body.
 * Stations/settlements: inside dockRange for F-to-dock.
 * Asteroid fields: near field centre (fraction of scatter radius), not at the edge.
 */
function supercruiseArrivalRangeFor(body) {
  const shipR = getShipCollisionRadius(playerShipClass)

  // Belts: rocks fill body.radius around the field origin — drop well inside.
  if (body.kind === 'asteroidField') {
    const fieldR = Math.max(40, body.radius ?? 120)
    return Math.max(60, Math.min(fieldR * 0.28, fieldR - 25) + shipR * 0.25)
  }

  const bodyRadius = collisionRadiusFor(body) ?? 0
  const shell = bodyRadius + shipR
  const dockR = dockRangeFor(body)
  const span = Math.max(0, dockR - shell)
  // Prefer ~half the dock bubble (or a modest clear past the shell) — never
  // near the outer dock edge, where tiny overshoot left players unable to F-dock.
  let preferred
  if (span > SUPERCRUISE_ARRIVAL_MIN_CLEAR * 2) {
    preferred = shell + Math.max(SUPERCRUISE_ARRIVAL_MIN_CLEAR, span * 0.45)
  } else {
    preferred = Math.max(shell + 12, dockR - SUPERCRUISE_DOCK_INNER_SLACK)
  }
  // Always leave a solid margin inside dock range (and outside the shell).
  const minR = shell + Math.min(SUPERCRUISE_ARRIVAL_MIN_CLEAR, Math.max(12, span * 0.25))
  const maxR = Math.max(minR, dockR - Math.max(SUPERCRUISE_DOCK_INNER_SLACK, span * 0.2))
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
  const starR = starShellRadius()
  const starSurface = Math.max(0, starDist - starR)
  if (starSurface < NEAREST_BODY_HUD_RANGE && starSurface < nearestSurface) {
    nearest = {
      id: SYSTEM_STAR_WAYPOINT_ID,
      name: currentSystem.name,
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
  const bookMsg = loot.skillbooks
    ? `${parts || partsMsg || weaponMsg || bpMsg ? ' and ' : ''}${Object.entries(loot.skillbooks)
        .map(([id, qty]) => {
          try {
            return `${qty}× ${getSkillDef(id).bookName}`
          } catch {
            return `${qty}× skillbook`
          }
        })
        .join(', ')}`
    : ''
  setHudGlitchText(
    miningToastEl,
    `Salvaged ${parts}${partsMsg}${weaponMsg}${bpMsg}${bookMsg} from the wreck`
  )
  showHudGlitch(miningToastEl)
  miningToastUntil = gameState.simTime + MINING_TOAST_DURATION_S
}


function flashToast(text, durationS = MINING_TOAST_DURATION_S) {
  if (!miningToastEl || !gameState) return
  setHudGlitchText(miningToastEl, text)
  showHudGlitch(miningToastEl)
  miningToastUntil = gameState.simTime + durationS
}

// Missions pay out on objective complete (no station turn-in).
setMissionCompletedHandler((info) => {
  audio.playMissionComplete()
  const title = info?.title || 'Contract'
  const where = info?.giverBodyName
    ? `${info.giverBodyName}${info.giverSystemName ? ` · ${info.giverSystemName}` : ''}`
    : 'mission board'
  const reward = Math.max(0, Math.floor(Number(info?.reward) || 0))
  flashToast(`Mission complete: ${title} · +${reward}cr · from ${where}`, 5.5)
})

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
  if (body.kind === 'star') return starShellRadius()
  return collisionRadiusFor(body) ?? 20
}

// Near enough to a planet/moon to probe from "orbit".
function isInOrbitOfBody(body) {
  if (!body || (body.kind !== 'planet' && body.kind !== 'moon')) return false
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const bodyPos = new THREE.Vector3().fromArray(body.position)
  const capture = (collisionRadiusFor(body) ?? 0) + PROBE_ORBIT_MARGIN
  return shipPos.distanceTo(bodyPos) < capture
}

// Near enough to the system sun for solar probe.
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
    name: currentSystem?.name ?? 'System',
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

function showProbeScanPanel(lines, bodyId = null) {
  if (!probeScanPanelEl || !lines?.length) return
  if (bodyId && probeScanCache) probeScanCache.set(String(bodyId), lines)
  const bodyEl = probeScanPanelEl.querySelector('.psp-body')
  bodyEl.innerHTML = lines
    .map((line, i) => `<div class="psp-line${i === 0 ? ' kicker' : ''}">${escapeHtmlProbe(line)}</div>`)
    .join('')
  probeScanPanelEl.style.display = 'flex'
  if (bodyId) probeScanActiveBodyId = String(bodyId)
}

/** True if ship is within probe range of body (orbit margin or surface distance). */
function isInProbeDisplayRange(body) {
  if (!body || !gameState) return false
  if (body.kind === 'star') return isInSolarOrbit()
  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const bodyPos = new THREE.Vector3().fromArray(body.position)
  const dist = shipPos.distanceTo(bodyPos)
  const shell = collisionRadiusFor(body) ?? 0
  if (body.kind === 'planet' || body.kind === 'moon') {
    return dist < shell + PROBE_ORBIT_MARGIN
  }
  // Asteroid belts: show while inside the field or near the outer edge.
  if (body.kind === 'asteroidField') {
    return dist < shell + PROBE_RANGE
  }
  return Math.max(0, dist - shell) < PROBE_RANGE
}

/** Whether this body was previously probed (persists across sessions). */
function hasBeenProbed(bodyId) {
  if (!gameState || bodyId == null) return false
  const key = String(bodyId)
  if ((gameState.probeCounts?.[key] ?? 0) > 0) return true
  if ((gameState.probeCounts?.[bodyId] ?? 0) > 0) return true
  return (gameState.probedBodyIds ?? []).some((id) => String(id) === key)
}

/**
 * Cached or regenerated survey lines for a body that was already probed.
 * Regenerates from probeSurveyReport so re-entry works after load / cache clear.
 */
function getOrRebuildProbeScanLines(body, system) {
  if (!body) return null
  const key = String(body.id)
  if (probeScanCache?.has(key)) return probeScanCache.get(key)
  if (!hasBeenProbed(body.id)) return null
  const report = probeSurveyReport(body, system)
  if (report?.length && probeScanCache) probeScanCache.set(key, report)
  return report?.length ? report : null
}

/**
 * Floating scan text on the left of the screen (inset from the border).
 * Shown only while in probe range of a body that has already been scanned;
 * hides when you leave that range and reappears when you return.
 */
function updateProbeScanFloat() {
  if (!probeScanPanelEl || !gameState || docked) {
    if (probeScanPanelEl) probeScanPanelEl.style.display = 'none'
    return
  }
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  let showBody = null
  let lines = null

  // Prefer Tab-target if scanned + in range
  if (currentTarget?.kind === 'body' && currentSystem) {
    const b = currentSystem.bodies.find((x) => x.id === currentTarget.id)
    if (b && isInProbeDisplayRange(b)) {
      const report = getOrRebuildProbeScanLines(b, currentSystem)
      if (report) {
        showBody = b
        lines = report
      }
    }
  }
  if (!showBody && currentTarget?.kind === 'star' && isInSolarOrbit()) {
    const starBody = makeStarProbeBody()
    if (isInProbeDisplayRange(starBody)) {
      const report = getOrRebuildProbeScanLines(starBody, currentSystem)
      if (report) {
        showBody = starBody
        lines = report
      }
    }
  }
  // Else any nearby scanned probeable (planet / moon / belt / star)
  if (!showBody && currentSystem) {
    // Star first if in solar orbit
    if (isInSolarOrbit()) {
      const starBody = makeStarProbeBody()
      const report = getOrRebuildProbeScanLines(starBody, currentSystem)
      if (report) {
        showBody = starBody
        lines = report
      }
    }
  }
  if (!showBody && currentSystem) {
    let best = Infinity
    for (const b of currentSystem.bodies) {
      if (!isProbeable(b)) continue
      if (!isInProbeDisplayRange(b)) continue
      const report = getOrRebuildProbeScanLines(b, currentSystem)
      if (!report) continue
      const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
      const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(b.position))
      if (dist < best) {
        best = dist
        showBody = b
        lines = report
      }
    }
  }

  if (!showBody || !lines?.length) {
    probeScanPanelEl.style.display = 'none'
    probeScanActiveBodyId = null
    return
  }

  if (probeScanActiveBodyId !== String(showBody.id)) {
    showProbeScanPanel(lines, showBody.id)
  } else {
    probeScanPanelEl.style.display = 'flex'
  }

  // Fixed left of screen — inset from border, vertically mid-view (not flush to edge).
  const leftInset = Math.max(48, Math.round(window.innerWidth * 0.045))
  probeScanPanelEl.style.left = `${leftInset}px`
  probeScanPanelEl.style.top = '50%'
  probeScanPanelEl.style.transform = 'translateY(-50%)'
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

  // Classification floating text — always cache; show while in probe range.
  const report = probeSurveyReport(body, system)
  if (report?.length) {
    if (probeScanCache) probeScanCache.set(String(body.id), report)
    // First attempt opens immediately; later re-entry also shows via updateProbeScanFloat.
    if (showClassification || isInProbeDisplayRange(body)) {
      showProbeScanPanel(report, body.id)
    }
  }

  // Floating center HUD: mission beat (first hit only) + loot / exhausted.
  const messages = []
  if (missionFirstProbe) {
    if (investigation?.kind === 'intel') {
      const giver = findBody(gameState.galaxy, investigation.mission.giverStationId)
      messages.push('Investigation data recovered — contract complete.')
    } else if (investigation?.kind === 'hostile') {
      messages.push('Probe stirred a hostile contact! Eliminate them to finish the investigation.')
    } else if (investigation?.kind === 'lead') {
      messages.push(`The signal traces further — new fix on ${investigation.bodyName} in ${investigation.systemName}.`)
    }
    // Probe / exploration auto-complete (toast handled by setMissionCompletedHandler).
  }

  // Standard loot lines (any attempt, including 2nd/3rd after mission is done).
  if (result.found && result.stored) {
    messages.push(
      `Probe found Survey Data at ${body.name}! Added to cargo — transfer to station storage (Storage tab) to sell.`
    )
  } else if (result.found) {
    messages.push(`Probe found valuable survey data at ${body.name}, but your cargo hold is full!`)
  } else if (!result.blueprint) {
    messages.push('No Data Found')
  }
  if (result.blueprint) {
    messages.push(`Rare find: ${result.blueprint.name}! Stored in ship blueprints — craft at a station Industry bay.`)
  }
  if (result.skillbook) {
    messages.push(
      `Skillbook found: ${result.skillbook.name}! Read it under Inventory → Skillbooks.`
    )
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

// Autopilot multi-hop: after each jump, wait ROUTE_AUTOPILOT_PAUSE_S then
// fire the next plotted hop until the route is empty (or cancelled).
const ROUTE_AUTOPILOT_PAUSE_S = 10
/** @type {{ pauseRemaining: number | null } | null} */
let routeAutopilot = null

function cancelRouteAutopilot(reason) {
  if (!routeAutopilot) return
  routeAutopilot = null
  if (cruiseIndicatorEl) {
    cruiseIndicatorEl.style.display = 'none'
    cruiseIndicatorEl.style.opacity = '0'
  }
  if (reason) flashToast(reason)
}

function handleJump(targetSystemId, opts = {}) {
  // Validate up front so we don't play the animation just to fail partway
  // through; hyperspaceJump re-checks these itself as the safety net.
  if (docked || dockEffect) {
    flashToast('Undock before engaging hyperdrive')
    return
  }
  if (gameState.inCombat) {
    flashToast('Cannot engage hyperdrive while in combat')
    cancelRouteAutopilot(null)
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
    cancelRouteAutopilot('Autopilot cancelled — next hop out of range')
    return
  }
  // Manual single jump cancels an in-progress route autopilot chain.
  if (opts.routeAutopilot) {
    routeAutopilot = { pauseRemaining: null }
  } else {
    routeAutopilot = null
  }
  navMapOpen = false
  navMap?.hide()
  // Probe can't follow a hyperspace jump — abort mid-survey cleanly.
  clearProbeEffect()
  clearTargetLock() // waypoint/route unchanged; clear Tab-lock for the jump
  // Jump is launched from a button click — arm flight intent and grab
  // pointer lock *now* (user gesture). reenterFlightMode at jump end cannot
  // always re-lock after the multi-second animation (no live gesture left).
  // Follow-on autopilot jumps may lack a user gesture — pointer lock is best-effort.
  flightModeWanted = true
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock().catch(() => {})
  }
  jumpEffect = { elapsed: 0, targetSystemId, jumped: false, spitPhase: false }
  jumpFlashEl.style.background = HYPERSPACE_FLASH_COLOR
  jumpFlashEl.style.display = 'block'
  setJumpBlackOpacity(0)
  hyperspaceTunnel.start()
  audio.playHyperspace()
  // Drones snap home before the corridor swallows the hull.
  try {
    teleportDronesToBay(gameState.player.ship)
    clearDroneMeshes()
  } catch { /* */ }
  audio.announce(opts.routeAutopilot ? 'Route autopilot engaged' : 'Hyperdrive engaged')
  setHudGlitchText(cruiseIndicatorEl, opts.routeAutopilot ? 'ROUTE AUTOPILOT' : 'HYPERDRIVE ENGAGED')
  showHudGlitch(cruiseIndicatorEl)
}

function updateRouteAutopilot(dt) {
  if (!routeAutopilot || routeAutopilot.pauseRemaining == null) return
  if (docked || dockEffect || jumpEffect) {
    cancelRouteAutopilot(docked || dockEffect ? 'Autopilot cancelled — docked' : null)
    return
  }
  if (gameState.inCombat) {
    cancelRouteAutopilot('Autopilot cancelled — combat')
    return
  }
  if (!shipHasAutopilot(gameState.player.ship)) {
    cancelRouteAutopilot('Autopilot cancelled — module not fitted')
    return
  }
  const rem = gameState.player.plottedRoute
  if (!Array.isArray(rem) || rem.length === 0) {
    cancelRouteAutopilot('Route complete')
    return
  }
  routeAutopilot.pauseRemaining -= dt
  // Live countdown on the cruise indicator (whole seconds remaining).
  if (routeAutopilot.pauseRemaining > 0) {
    const sec = Math.max(1, Math.ceil(routeAutopilot.pauseRemaining))
    if (routeAutopilot._lastSecShown !== sec) {
      routeAutopilot._lastSecShown = sec
      setHudGlitchText(cruiseIndicatorEl, `AUTOPILOT · ${sec}s`)
      // Keep visible without replaying full enter glitch every tick
      if (cruiseIndicatorEl) {
        cruiseIndicatorEl.style.display = 'block'
        cruiseIndicatorEl.style.opacity = '1'
      }
    }
    return
  }

  const nextId = rem[0]
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!canJumpTo(currentSystem, nextId)) {
    cancelRouteAutopilot('Autopilot cancelled — next hop out of range')
    return
  }
  // Chain continues — pauseRemaining cleared while in jump; re-armed after arrival.
  routeAutopilot.pauseRemaining = null
  routeAutopilot._lastSecShown = null
  handleJump(nextId, { routeAutopilot: true })
}

/** Smoothstep 0–1 (for black-fade ramps). */
function jumpSmoothstep(t) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

function setJumpBlackOpacity(opacity) {
  if (!jumpBlackEl) return
  const v = Math.max(0, Math.min(1, opacity))
  if (v <= 0.001) {
    jumpBlackEl.style.opacity = '0'
    jumpBlackEl.style.display = 'none'
  } else {
    jumpBlackEl.style.display = 'block'
    jumpBlackEl.style.opacity = String(v)
  }
}

/**
 * Black fade opacity for hyperspace streak phase s ∈ [0,1].
 * Fades in before the system swap (s=0.4), holds, then fades out on arrival.
 */
function jumpBlackOpacityForStreak(s) {
  if (s < JUMP_BLACK_FADE_IN_START) return 0
  if (s < JUMP_BLACK_FADE_IN_END) {
    return jumpSmoothstep(
      (s - JUMP_BLACK_FADE_IN_START) / (JUMP_BLACK_FADE_IN_END - JUMP_BLACK_FADE_IN_START)
    )
  }
  if (s < JUMP_BLACK_FADE_OUT_START) return 1
  if (s < JUMP_BLACK_FADE_OUT_END) {
    return (
      1 -
      jumpSmoothstep(
        (s - JUMP_BLACK_FADE_OUT_START) / (JUMP_BLACK_FADE_OUT_END - JUMP_BLACK_FADE_OUT_START)
      )
    )
  }
  return 0
}

function clearJumpVisuals() {
  if (jumpFlashEl) {
    jumpFlashEl.style.opacity = '0'
    jumpFlashEl.style.display = 'none'
  }
  setJumpBlackOpacity(0)
}

function updateJumpEffect(dt) {
  syncChaseCamera(camera, gameState.player.ship)
  // Keep the hull in the right place so depth-tested tunnel FX stay behind it.
  if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
  jumpEffect.elapsed += dt
  const e = jumpEffect.elapsed

  // Hull suck-in / spit-out scale (visual only — game state pose stays authoritative).
  const applyShipJumpScale = (scale, forwardPull = 0) => {
    if (!playerMesh) return
    playerMesh.scale.setScalar(Math.max(0.02, scale))
    if (forwardPull !== 0) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(playerMesh.quaternion)
      playerMesh.position.addScaledVector(fwd, forwardPull)
    }
  }

  if (e < JUMP_WINDUP_S) {
    // Charge phase: FOV creep + tunnel fades in while speech/windup play.
    const w = e / JUMP_WINDUP_S
    const throb = 0.5 + 0.5 * Math.sin(e * 10)
    camera.fov = BASE_FOV + w * 28 + throb * w * 8
    camera.updateProjectionMatrix()
    // Light flash only — heavy wash hid the star tunnel and the ship.
    jumpFlashEl.style.opacity = String(Math.min(0.18, w * 0.14 + throb * 0.03))
    // Black veil starts only in the corridor (streak) phase.
    setJumpBlackOpacity(0)
    // Tunnel builds late in the wind-up (stars stretch into the corridor).
    hyperspaceTunnel.update(dt, Math.max(0, w - 0.35) / 0.65, camera, getCrosshairAimWorld())
    // Mild pre-suck vibration
    applyShipJumpScale(1 - w * 0.08, w * 0.4)
  } else {
    // Full hyperdrive tunnel; system swap mid-corridor.
    const s = (e - JUMP_WINDUP_S) / JUMP_STREAK_S
    const punch = Math.sin(Math.min(1, s) * Math.PI)
    camera.fov = BASE_FOV + 30 + punch * 55
    camera.updateProjectionMatrix()
    // Soft mid-tunnel punch — keep ship + corridor readable under the black veil.
    jumpFlashEl.style.opacity = String(Math.min(0.28, 0.08 + punch * 0.2) * (1 - jumpBlackOpacityForStreak(s) * 0.85))
    setJumpBlackOpacity(jumpBlackOpacityForStreak(s))
    // Peak strength mid-tunnel, ease out at the end.
    const tunnelStr = s < 0.15 ? s / 0.15 : s > 0.85 ? (1 - s) / 0.15 : 1
    hyperspaceTunnel.update(dt, Math.min(1, 0.75 + tunnelStr * 0.25), camera, getCrosshairAimWorld())

    // Suck into the tunnel just before the system swap (s → 0.4).
    if (!jumpEffect.jumped) {
      const suckT = Math.min(1, s / 0.4)
      const ease = suckT * suckT
      applyShipJumpScale(1 - ease * 0.92, ease * 28)
    } else {
      // Spat out into the arrival system after the swap.
      const after = (s - 0.4) / 0.6
      const spit = Math.min(1, Math.max(0, after / 0.35))
      const ease = 1 - (1 - spit) * (1 - spit)
      applyShipJumpScale(0.08 + ease * 0.92, (1 - ease) * -12)
    }

    if (!jumpEffect.jumped && s >= 0.4) {
      jumpEffect.jumped = true
      // Hold full black across the swap so body/mesh rebuild is not visible.
      setJumpBlackOpacity(1)
      if (playerMesh) playerMesh.scale.setScalar(0.08)
      try {
        hyperspaceJump(gameState, jumpEffect.targetSystemId, Math.random)
        policeResponse = null
        for (const mesh of npcMeshes.values()) scene.remove(mesh)
        npcMeshes.clear()
        for (const mesh of bodyMeshes.values()) scene.remove(mesh)
        bodyMeshes.clear()
        if (starMesh) scene.remove(starMesh)
        starMesh = null
        for (const mesh of projectileMeshes.values()) scene.remove(mesh)
        projectileMeshes.clear()
        missileTrail?.clear()
        for (const mesh of wreckMeshes.values()) scene.remove(mesh)
        wreckMeshes.clear()
        for (const flash of impactFlashes) scene.remove(flash.mesh)
        impactFlashes.length = 0
        for (const fx of rockExplosions) {
          scene.remove(fx.group)
          disposeRockExplosion(fx)
        }
        rockExplosions.length = 0
        for (const fx of hitImpacts) {
          scene.remove(fx.group)
          disposeHitImpact(fx)
        }
        hitImpacts.length = 0
        for (const npc of gameState.npcs) {
          const mesh = buildShipMesh(getShipClass(npc.shipClassId), { lite: true })
          npcMeshes.set(npc.id, mesh)
          scene.add(mesh)
        }
        loadBodiesForCurrentSystem()
      } catch (err) {
        gameNotice('Hyperspace failed', err.message)
        jumpEffect = null
        hyperspaceTunnel.stop()
        if (playerMesh) playerMesh.scale.setScalar(1)
        audio.playHyperspaceArrival()
        clearJumpVisuals()
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
    clearJumpVisuals()
    if (playerMesh) playerMesh.scale.setScalar(1)
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
    // Schedule next hop if Jump Route autopilot is still active.
    if (routeAutopilot) {
      const rem = gameState.player.plottedRoute
      if (
        shipHasAutopilot(gameState.player.ship) &&
        Array.isArray(rem) &&
        rem.length > 0
      ) {
        routeAutopilot.pauseRemaining = ROUTE_AUTOPILOT_PAUSE_S
        routeAutopilot._lastSecShown = ROUTE_AUTOPILOT_PAUSE_S
        flashToast(
          `Autopilot: next jump in ${ROUTE_AUTOPILOT_PAUSE_S}s (${rem.length} remaining)`
        )
        setHudGlitchText(cruiseIndicatorEl, `AUTOPILOT · ${ROUTE_AUTOPILOT_PAUSE_S}s`)
        showHudGlitch(cruiseIndicatorEl)
      } else {
        routeAutopilot = null
        if (!rem?.length) flashToast('Autopilot: route complete')
      }
    }
  }
}

function dock(body) {
  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (system) ensureSystemSecurity(system)
  if (!canDockWithLaw(gameState, body, system)) {
    flashToast(
      body.kind === 'station'
        ? 'Docking refused — security standing too low for this station (Sec 3–6)'
        : 'Docking refused'
    )
    return
  }
  cancelRouteAutopilot(routeAutopilot ? 'Autopilot cancelled — docked' : null)
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
  applyDockedHud(body)
  dockingUI.show(body, () => beginUndocking())
}

/** Flight HUD off; top-left system + bay name while parked. */
function applyDockedHud(body = null) {
  if (!hud) return
  if (!docked) {
    hud.setDocked(false)
    return
  }
  const bay =
    body ||
    (gameState?.player?.dockedBodyId
      ? findBody(gameState.galaxy, gameState.player.dockedBodyId)
      : null)
  const sys = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (sys) ensureSystemSecurity(sys)
  hud.setDocked(true, {
    systemName: sys?.name ?? null,
    locationName: bay?.name ?? null,
    securityRating: getSystemSecurity(sys)
  })
  systemOverview?.hide()
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
      swapToInterior(body)
      gameState.player.ship.position = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET).toArray()
      gameState.player.ship.quaternion = [0, 0, 0, 1]
      gameState.player.ship.velocity = [0, 0, 0]
      gameState.player.ship.throttle = 0
      if (playerMesh) syncMeshToEntity(playerMesh, gameState.player.ship)
      exitFlightMode()
      flightModeWanted = false
      dock(body) // sets docked HUD (system + bay name top-left)
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
    // Phonetic TTS spelling only — HUD already shows SUPERCRUISE DISENGAGED.
    audio.announce('Supercrews disengaged')
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
    hud?.setDocked(false)
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
        swapToInterior(dockEffect.body)
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
      hud?.setDocked(false)
      systemOverview?.show()
      // Re-place reticle immediately on the bolt path (don't wait a frame).
      if (flightMode) updateCrosshair()
    }
  }
}

function handlePlayerDeath() {
  const killer = gameState.player.lastKiller ?? null
  let cause = 'Ship destroyed in combat'
  if (killer?.method === 'ram') {
    cause = `Rammed by ${killer.pilotName} flying a ${killer.shipName}`
  } else if (killer?.pilotName) {
    cause = `Destroyed by ${killer.pilotName} flying a ${killer.shipName}`
  }
  const summary = {
    characterName: gameState.player.name,
    credits: gameState.player.credits,
    reputation: gameState.player.reputation,
    cause,
    killerPilot: killer?.pilotName ?? null,
    killerShip: killer?.shipName ?? null,
    killerFaction: killer?.faction ?? null,
    killerMethod: killer?.method ?? null
  }
  // Combat boom only — no rock/ice crack. Scene is cleared next; FX is for
  // consistency if we ever delay the wipe.
  const pos = gameState.player.ship.position
  const r = getShipCollisionRadius(playerShipClass)
  playShipDeathFx(pos, r, { sound: true })
  clearSession()
  audio.playDeathMusic()
  gameState = null
  deathScreen.show(summary)
}

window.addEventListener('keydown', (e) => {
  if (!gameState) return
  if (e.code === 'KeyF' && !docked && !dockEffect && !cruising && !navMapOpen && !paused && !inventoryOpen && !missionsOpen && !characterOpen) {
    // Wreck salvage beats docking when both are in range so you can loot
    // at a station bay then dock again after the wreck is gone.
    const wreck = findNearbyWreck()
    if (wreck) {
      lootNearbyWreck(wreck)
    } else {
      const body = findNearbyDockableBody()
      if (body) beginDocking(body)
    }
  } else if (e.code === 'KeyP' && !docked && !dockEffect && !cruising && !probeEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen && !characterOpen) {
    // Orbit + Tab-target planet/moon/star, or close-range belt/body flyby.
    const launch = getProbeLaunchTarget()
    if (launch) probeBody(launch.body)
  } else if (e.code === 'F5') {
    e.preventDefault()
    doSave()
  } else if (e.code === 'Escape' && characterOpen) {
    e.preventDefault()
    closeCharacterScreen()
  } else if (e.code === 'Escape' && !dockEffect && !navMapOpen && !inventoryOpen && !missionsOpen && !characterOpen) {
    // One Esc: pause. Pointer-lock may unlock first (pointerlockchange opens
    // pause); ignore a same-tick keydown so we don't immediately unpause.
    e.preventDefault()
    if (paused && performance.now() - pauseOpenedAtMs < 200) return
    setGamePaused(!paused)
  } else if (e.code === 'KeyM' && !paused && !inventoryOpen && !missionsOpen && !characterOpen && !dockEffect) {
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
        inCombat: !!gameState.inCombat,
        docked
      })
    } else {
      navMap.hide()
      if (!docked) reenterFlightMode()
    }
  } else if (e.code === 'KeyC' && !docked && !navMapOpen && !paused && !inventoryOpen && !missionsOpen && !characterOpen) {
    if (cruising) {
      cruising = false
    } else if (!getActiveWaypoint()) {
      flashToast('Set a waypoint first (Navigation, Ctrl+Tab on a body, or J for missions)')
    } else if (gameState.inCombat) {
      flashToast('Cannot engage supercruise while in combat')
    } else {
      // Drones ride the hyperplane home before SC engages.
      teleportDronesToBay(gameState.player.ship)
      clearDroneMeshes()
      clearTargetLock() // keep waypoint; drop combat/tab lock for cruise
      cruising = true
      gameState.player.ship.supercruiseElapsed = 0
    }
  } else if (
    (e.code === 'KeyG' || e.code === 'KeyH') &&
    !docked &&
    !dockEffect &&
    !navMapOpen &&
    !paused &&
    !inventoryOpen &&
    !missionsOpen &&
    !characterOpen &&
    !jumpEffect &&
    !cruising
  ) {
    if (!hasDroneBays(gameState.player.ship)) {
      flashToast('No drone bays on this hull')
    } else if (e.code === 'KeyG') {
      const r = summonDrones(gameState)
      if (!r.ok) flashToast(r.reason || 'Cannot launch drones')
      else {
        flashToast(`Drones launching (${r.launched})`)
        syncDroneMeshes()
      }
    } else {
      const r = recallDrones(gameState)
      if (!r.ok) flashToast('No drones to recall')
      else flashToast('Drones returning to bay')
      // Meshes stay until return animation finishes (updatePlayerDrones).
    }
  } else if (e.code === 'Space' && !docked && !dockEffect && !navMapOpen && !paused && !inventoryOpen && !missionsOpen && !characterOpen) {
    // If locked in flight, Space exits. If wanted-but-lost (tab-out) or off,
    // Space (re)enters — so tabbing out then Space re-acquires cleanly.
    if (flightMode && document.pointerLockElement === renderer.domElement) {
      exitFlightMode()
    } else {
      reenterFlightMode()
    }
  } else if (e.code === 'Tab' && !docked && !navMapOpen && !paused && !inventoryOpen && !missionsOpen && !characterOpen) {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Tab: set waypoint on body under the crosshair.
      setWaypointFromCrosshair()
    } else if (e.shiftKey) {
      // Shift+Tab: clear lock (plain Tab still cycles).
      clearTargetLock()
    } else {
      cycleTarget()
    }
  } else if (e.code === 'KeyI' && !navMapOpen && !paused && !missionsOpen && !characterOpen && !dockEffect) {
    // Inventory is available in flight and while docked (same as Map / Missions).
    inventoryOpen = !inventoryOpen
    audio.setThrustState(null)
    if (inventoryOpen) {
      exitFlightMode()
      inventoryUI.show(() => {
        inventoryOpen = false
        if (!docked) reenterFlightMode()
      })
    } else {
      inventoryUI.hide()
      if (!docked) reenterFlightMode()
    }
  } else if (e.code === 'KeyJ' && !navMapOpen && !paused && !inventoryOpen && !characterOpen && !dockEffect) {
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
  } else if (e.code === 'F1') {
    // Character screen anytime in-session (flight, docked, cruise).
    e.preventDefault()
    e.stopPropagation()
    if (!gameState || paused) return
    // Use both flag and DOM so a desynced state cannot turn F1 into flight toggle.
    if (characterOpen || characterUI?.isOpen?.()) closeCharacterScreen()
    else openCharacterScreen()
  }
})

/** Cancels a pending post-close reenterFlightMode when F1 opens again quickly. */
let characterFlightRestoreToken = 0

/**
 * Open Character (F1). Soft-unlocks the pointer without clearing flight intent,
 * and keeps unlock→pause suppressed the whole time the screen is open so a
 * delayed pointerlockchange cannot open the pause menu.
 */
function openCharacterScreen() {
  if (!gameState || paused || !characterUI) return
  // Cancel any delayed re-lock from a previous close — that was stealing the
  // second F1 open and making it look like flight-mode toggle only.
  characterFlightRestoreToken += 1

  // Already visibly open — leave as-is (close is handled by F1 caller).
  if (characterOpen && characterUI.isOpen?.()) {
    characterUI.refresh?.()
    return
  }

  // Close competing overlays so F1 always works.
  if (navMapOpen) {
    navMap?.hide()
    navMapOpen = false
  }
  if (inventoryOpen) {
    inventoryUI?.hide()
    inventoryOpen = false
  }
  if (missionsOpen) {
    missionsUI?.hide()
    missionsOpen = false
  }

  characterOpen = true
  audio.setThrustState(null)
  // Soft unlock: free the mouse but keep flightModeWanted so close re-locks.
  // Holding suppress the entire time character is open blocks auto-pause.
  suppressPointerUnlockPause = true
  flightMode = false
  laserFireHeld = false
  missileFireHeld = false
  setChaseFreeLook(false)
  if (crosshairEl) crosshairEl.style.display = 'none'
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (targetDirEl) targetDirEl.style.display = 'none'
  // Overview stays visible while undocked; only disable clicks under the modal.
  systemOverview?.setInteractive(false)
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock()
  }

  try {
    characterUI.show(() => {
      // Close button / backdrop click.
      closeCharacterScreen()
    })
  } catch (err) {
    console.error('Character screen failed to open:', err)
    characterOpen = false
    suppressUnlockPauseForFrames(2)
  }
  // If show did not actually display, clear the flag so the next F1 retries open.
  if (!characterUI.isOpen?.()) {
    characterOpen = false
  }
}

/**
 * Close Character (F1 / Esc / Close). Silent-hide so onClose does not re-enter,
 * then restore flight after portrait WebGL dispose settles.
 */
function closeCharacterScreen() {
  if (!characterOpen && !characterUI?.isOpen?.()) return
  characterOpen = false
  // Stay suppressed through dispose + pointer re-lock (otherwise unlock
  // after reenterFlightMode opens the pause menu).
  suppressPointerUnlockPause = true
  characterUI?.hide({ silent: true })
  // Overview remains shown (undocked); animate loop restores interactivity.

  if (!docked && !cruising && !paused && !navMapOpen && !inventoryOpen && !missionsOpen && !jumpEffect) {
    const token = ++characterFlightRestoreToken
    // Next frame: portrait WebGL is fully torn down before we re-lock.
    requestAnimationFrame(() => {
      if (token !== characterFlightRestoreToken) return
      if (characterOpen || paused || docked) {
        suppressUnlockPauseForFrames(2)
        return
      }
      reenterFlightMode()
      suppressUnlockPauseForFrames(4)
    })
  } else {
    characterFlightRestoreToken += 1
    suppressUnlockPauseForFrames(2)
  }
}

// Tab-lock range for ships/wrecks/rocks/bodies (surface dist for celestials).
// Radar draws farther so contacts appear before they are lockable.
const TARGET_RANGE = 60000
// Fallback star shell when mesh isn't built yet (giants are far larger — see starShellRadius).
const STAR_TARGET_RADIUS = 13200
// Clear past the primary photosphere when dropping SC at the system sun.
const STAR_SUPERCRUISE_STANDOFF = 3500

/** Photosphere + corona reach for the local sun (binary companions included). */
function starShellRadius() {
  const stars = starMesh?.userData?.stars
  if (!stars?.length) return STAR_TARGET_RADIUS
  let shell = 0
  for (const s of stars) {
    const core = s.radius ?? 0
    // Outer corona ~1.9–2.3× core (see starMesh corona scales).
    const corona = core * 2.15
    const orbitR = s.orbit?.radius ?? 0
    shell = Math.max(shell, orbitR + corona)
  }
  return Math.max(STAR_TARGET_RADIUS, shell)
}

/**
 * SC arrival for the system star — outside the *primary* photosphere/corona.
 * Does not use the full binary envelope (that made arrival ~90km+ and SC crawl).
 */
function starSupercruiseArrivalRange() {
  const shipR = getShipCollisionRadius(playerShipClass)
  const primary = starMesh?.userData?.stars?.[0]
  // Primary is always the largest / origin component (see buildStarMesh).
  const coreR = primary?.radius ?? STAR_TARGET_RADIUS * 0.45
  // ~corona1 scale past the photosphere, plus a fixed standoff.
  return coreR * 1.35 + shipR + STAR_SUPERCRUISE_STANDOFF
}

const TARGETABLE_BODY_KINDS = new Set(['planet', 'moon', 'station', 'settlement'])

function asteroidWorldPosition(field, rock) {
  return [field.position[0] + rock.position[0], field.position[1] + rock.position[1], field.position[2] + rock.position[2]]
}

// Aliens are always hostile to the player; pirates are too, except while
// truced against a shared alien threat (see combat.js's truceActive) — used
// for both the radar dot color and the target-indicator reticle tint.
// Police SOS at law ≤2 (sec 1–6); civilians SOS at law ≤0 in sec 3–6.
// Anyone you've exchanged fire with also counts as hostile.
function isHostileToPlayer(npc) {
  if (!npc || npc.destroyed) return false
  if (npc.faction === 'alien') return true
  if (npc.faction === 'pirate' && !truceActive(gameState)) return true
  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (system) ensureSystemSecurity(system)
  if (npc.faction === 'police') {
    return policeHostileToPlayer(gameState, system) || !!gameState.player.combatEngagedNpcIds?.[npc.id]
  }
  if (npc.faction === 'trader' || !npc.faction) {
    return (
      civiliansHostileToPlayer(gameState, system) ||
      !!gameState.player.combatEngagedNpcIds?.[npc.id]
    )
  }
  return !!gameState.player.combatEngagedNpcIds?.[npc.id]
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
    const starR = starShellRadius()
    const dist = shipPos.distanceTo(new THREE.Vector3(...starPos))
    const surfaceDist = Math.max(0, dist - starR)
    if (surfaceDist <= TARGET_RANGE) {
      entities.push({
        kind: 'star',
        id: SYSTEM_STAR_WAYPOINT_ID,
        position: starPos,
        dist: surfaceDist,
        radius: starR,
        name: currentSystem?.name ?? 'System'
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
    radius: starShellRadius(),
    name: currentSystem?.name ?? 'System'
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

  // Clearing the current waypoint is always allowed; setting a new one is not
  // during supercruise (would redirect the SC autopilot mid-flight).
  if (gameState.player.waypointBodyId === best.id) {
    gameState.player.waypointBodyId = null
    gameState.player.waypointPosition = null
    audio.playWaypointClear()
    flashToast(`Waypoint cleared: ${best.name}`)
    return
  }

  if (cruising) {
    flashToast('Unable to set a waypoint during Supercruise.')
    return
  }

  gameState.player.waypointBodyId = best.id
  gameState.player.waypointPosition = best.id === SYSTEM_STAR_WAYPOINT_ID ? [0, 0, 0] : null
  audio.playWaypointSet()
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

/** Clear Tab-lock target only — does not touch waypoints / plotted routes. */
function clearTargetLock() {
  currentTarget = null
  if (targetIndicatorEl) targetIndicatorEl.style.display = 'none'
  if (targetDirEl) targetDirEl.style.display = 'none'
}

// Tab targeting: anything under the crosshair always wins first. If that
// object is already locked (or nothing is under the reticle), cycle by
// distance to the next entity, wrapping around.
function cycleTarget() {
  const entities = getTargetableEntities()
  if (entities.length === 0) {
    currentTarget = null
    return
  }

  const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
    new THREE.Quaternion().fromArray(gameState.player.ship.quaternion)
  )
  // Strongest aim under a ~20° cone around boresight / crosshair.
  let underCrosshair = null
  let bestScore = 0.94
  for (const e of entities) {
    const score = aimScore(e, shipPos, forward)
    if (score > bestScore) {
      bestScore = score
      underCrosshair = e
    }
  }

  // Priority: always lock under-crosshair if it isn't the current target.
  if (underCrosshair && !sameTarget(underCrosshair, currentTarget)) {
    currentTarget = toTargetRef(underCrosshair)
    return
  }

  const stillValid = currentTarget && entities.some((e) => sameTarget(e, currentTarget))
  if (!stillValid) {
    // Nothing under reticle and no valid lock — clear (don't surprise-lock farthest hostiles).
    currentTarget = null
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
    const maxHull = shipClass.stats.hull
    const maxShields = shipClass.stats.shields
    const maxArmor = shipClass.stats.armor
    const faction = npc.faction || 'unknown'
    return {
      position: npc.position,
      name: shipClass.name,
      pilotName: npc.pilotName || null,
      faction,
      hostile: isHostileToPlayer(npc),
      hullPct: Math.max(0, npc.hull / maxHull),
      shields: npc.shields ?? 0,
      maxShields,
      armor: npc.armor ?? 0,
      maxArmor,
      hull: npc.hull ?? 0,
      maxHull,
      isAsteroid: false,
      reticle: 'hostile'
    }
  }
  if (currentTarget.kind === 'wreck') {
    const wreck = gameState.wrecks.find((w) => w.id === currentTarget.id)
    return wreck
      ? {
          position: wreck.position,
          name: 'Wreck',
          hostile: false,
          hullPct: null,
          isAsteroid: false,
          reticle: 'wreck',
          kindLabel: 'wreck'
        }
      : null
  }
  if (currentTarget.kind === 'asteroid') {
    const field = currentSystem.bodies.find((b) => b.id === currentTarget.fieldId)
    if (!field) return null
    const rock = getAsteroidRocks(field)[currentTarget.index]
    if (!rock || !isRockAlive(gameState, field.id, currentTarget.index)) return null
    const oreLeft = rockOreRemaining(gameState, field.id, currentTarget.index)
    const oreMax = rockOreMax(field.id, currentTarget.index)
    return {
      position: asteroidWorldPosition(field, rock),
      name: `${rockDisplayName(currentSystem)} (${field.name})`,
      hostile: false,
      hullPct: null,
      oreLeft,
      oreMax,
      isAsteroid: true,
      reticle: 'asteroid',
      kindLabel: 'asteroid'
    }
  }
  if (currentTarget.kind === 'star') {
    return {
      position: [0, 0, 0],
      name: currentSystem?.name ?? 'System',
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
  if (target.hullPct !== null) {
    label.textContent = `${target.name} · ${Math.round(dist)}m · ${Math.round(target.hullPct * 100)}%`
  } else if (target.isAsteroid && target.oreLeft != null) {
    // Show remaining ore so you know when the rock will explode.
    const maxBit = target.oreMax != null ? `/${target.oreMax}` : ''
    label.textContent = `${target.name} · ${Math.round(dist)}m · ${target.oreLeft}${maxBit} ore`
  } else {
    label.textContent = `${target.name}${kindBit} · ${Math.round(dist)}m`
  }
}

// Arrow sitting next to the ship's screen position, aimed at the current
// Tab target. Off when nothing is locked — complement to the on-target reticle.
// Distance from the projected ship to the direction chevron (px).
// Higher = further from dead-center / the hull silhouette.
const TARGET_DIR_OFFSET_PX = 96
const _tdirShip = new THREE.Vector3()
const _tdirTarget = new THREE.Vector3()
const _tdirTo = new THREE.Vector3()
const _tdirRight = new THREE.Vector3()
const _tdirUp = new THREE.Vector3()
const _tdirShipProj = new THREE.Vector3()

function updateTargetDirectionIndicator() {
  if (!targetDirEl) return
  const target = resolveTarget()
  if (!target || !gameState || docked) {
    targetDirEl.style.display = 'none'
    return
  }

  // Must match the camera used for project() this frame (chase seat already synced).
  camera.updateMatrixWorld(true)
  _tdirShip.fromArray(gameState.player.ship.position)
  _tdirTarget.fromArray(target.position)

  // World direction ship → target (not camera → target: chase offset made the
  // old camLocal-position approach point the wrong way, especially off-boresight
  // and in free-look).
  _tdirTo.subVectors(_tdirTarget, _tdirShip)
  if (_tdirTo.lengthSq() < 1e-10) {
    targetDirEl.style.display = 'none'
    return
  }
  _tdirTo.normalize()

  // Camera world axes (column-major matrixWorld).
  const me = camera.matrixWorld.elements
  _tdirRight.set(me[0], me[1], me[2])
  _tdirUp.set(me[4], me[5], me[6])
  if (_tdirRight.lengthSq() < 1e-10 || _tdirUp.lengthSq() < 1e-10) {
    targetDirEl.style.display = 'none'
    return
  }
  _tdirRight.normalize()
  _tdirUp.normalize()

  // Screen: +X right, +Y down (CSS). Camera +Y is up → flip.
  let dirX = _tdirTo.dot(_tdirRight)
  let dirY = -_tdirTo.dot(_tdirUp)
  // Nearly along the view axis — (x,y) vanishes; keep a stable “ahead” cue.
  if (Math.abs(dirX) < 1e-5 && Math.abs(dirY) < 1e-5) {
    dirX = 0
    dirY = -1
  }
  const len = Math.hypot(dirX, dirY) || 1
  dirX /= len
  dirY /= len

  // Anchor on the ship's projected screen position (chase cam: lower-center).
  _tdirShipProj.copy(_tdirShip).project(camera)
  const w = window.innerWidth
  const h = window.innerHeight
  // NDC z outside ~[-1,1] can mean behind / clipped — still place using center
  // fallback so the chevron remains usable during extreme free-look.
  let sx
  let sy
  if (!Number.isFinite(_tdirShipProj.x) || !Number.isFinite(_tdirShipProj.y)) {
    sx = w * 0.5
    sy = h * 0.62
  } else {
    sx = (_tdirShipProj.x * 0.5 + 0.5) * w
    sy = (-_tdirShipProj.y * 0.5 + 0.5) * h
    // Clamp so the cue stays on-screen if projection goes wild.
    sx = Math.max(24, Math.min(w - 24, sx))
    sy = Math.max(24, Math.min(h - 24, sy))
  }

  targetDirEl.style.left = `${Math.round(sx + dirX * TARGET_DIR_OFFSET_PX)}px`
  targetDirEl.style.top = `${Math.round(sy + dirY * TARGET_DIR_OFFSET_PX)}px`
  targetDirEl.style.display = 'block'
  const color = targetReticleColor(target)
  const arrow = targetDirEl.querySelector('.tdir-arrow')
  // Triangle points "up" (border-bottom); +π/2 maps atan2(screenY_down, screenX) to it.
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
      name: currentSystem?.name ?? 'System',
      bodyId: SYSTEM_STAR_WAYPOINT_ID,
      isMission: false,
      // Drop SC outside the photosphere / corona (not inside the sun).
      arrivalRange: starSupercruiseArrivalRange()
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

const _wpTarget = new THREE.Vector3()
const _wpShip = new THREE.Vector3()
const _wpCamLocal = new THREE.Vector3()
const _wpProj = new THREE.Vector3()

function updateWaypointIndicator() {
  const wp = getActiveWaypoint()
  if (!wp || !waypointEl) {
    if (waypointEl) waypointEl.style.display = 'none'
    return
  }

  const color = wp.isMission ? '#ff8a3d' : '#7fe0a0'
  _wpTarget.fromArray(wp.position)
  _wpShip.fromArray(gameState.player.ship.position)
  const distance = _wpShip.distanceTo(_wpTarget)

  // Behind test in camera space (Three: look = -Z). Don't use project().z —
  // points past camera.far looked "behind" even when in front (hid far WPs).
  camera.updateMatrixWorld(true)
  _wpCamLocal.copy(_wpTarget).applyMatrix4(camera.matrixWorldInverse)
  const behind = _wpCamLocal.z >= 0
  _wpProj.copy(_wpTarget).project(camera)

  const w = window.innerWidth
  const h = window.innerHeight
  const cx = w / 2
  const cy = h / 2
  const margin = 60

  // Screen-pixel direction from view center toward waypoint.
  // Scale NDC by (w,h) so diagonals are aspect-correct (raw NDC unit vectors
  // treat the viewport as square and skew edge placement on widescreen).
  // Behind: project() already flips via negative w; camLocal fallback flips
  // explicitly and applies projection scale for the same aspect correction.
  let dirX
  let dirY
  if (Number.isFinite(_wpProj.x) && Number.isFinite(_wpProj.y)) {
    dirX = _wpProj.x * w
    dirY = -_wpProj.y * h // NDC +Y up → screen Y down
  } else {
    // Rare non-finite project: camera-local lateral × projection scale.
    const pe = camera.projectionMatrix.elements
    dirX = _wpCamLocal.x * pe[0] * w
    dirY = -_wpCamLocal.y * pe[5] * h
    if (behind) {
      dirX = -dirX
      dirY = -dirY
    }
  }
  if (Math.abs(dirX) < 1e-8 && Math.abs(dirY) < 1e-8) {
    dirX = 0
    dirY = behind ? 1 : -1
  }

  const onScreen =
    !behind &&
    Number.isFinite(_wpProj.x) &&
    Number.isFinite(_wpProj.y) &&
    _wpProj.x >= -1 &&
    _wpProj.x <= 1 &&
    _wpProj.y >= -1 &&
    _wpProj.y <= 1

  let dx
  let dy
  if (onScreen) {
    // Sit on the projected waypoint (center of view → marker offset).
    dx = (_wpProj.x * 0.5 + 0.5) * w - cx
    dy = (-_wpProj.y * 0.5 + 0.5) * h - cy
  } else {
    // Clamp to screen edge along the aspect-correct screen direction.
    const len = Math.hypot(dirX, dirY) || 1
    dirX /= len
    dirY /= len
    const sx = (w / 2 - margin) / Math.max(1e-6, Math.abs(dirX))
    const sy = (h / 2 - margin) / Math.max(1e-6, Math.abs(dirY))
    const edge = Math.min(sx, sy)
    dx = dirX * edge
    dy = dirY * edge
  }

  // Triangle points up; +π/2 maps atan2(screenY_down, screenX) like target cue.
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

  // Campaign clock tracks real time while not on the pause menu (asteroids, etc.).
  if (!paused) advanceGameClock(gameState)

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
    cancelRouteAutopilot(routeAutopilot ? 'Autopilot cancelled — docked' : null)
    motionFx.hide()
    updateDockEffect(dt)
    // Bay activity runs as soon as the interior is swapped in.
    if (interiorMesh?.parent) updateStationInterior(interiorMesh, dt)
    renderer.render(scene, camera)
    return
  }

  // Only the pause menu freezes the sim. Map / Inventory / Missions leave the
  // world running (flight input stays off while those UIs hold the cursor).
  if (paused) {
    audio.setStrafeActive(false)
    motionFx.hide()
    if (targetDirEl) targetDirEl.style.display = 'none'
    updateStarfieldMotion(starfield, 0, false)
    if (docked && interiorMesh?.parent) {
      // Hangar still ticks visually under the pause overlay.
      updateStationInterior(interiorMesh, dt)
    }
    renderer.render(scene, camera)
    return
  }

  if (docked) {
    cancelRouteAutopilot(routeAutopilot ? 'Autopilot cancelled — docked' : null)
    audio.setStrafeActive(false)
    motionFx.hide()
    if (targetDirEl) targetDirEl.style.display = 'none'
    updateStarfieldMotion(starfield, 0, false)
    applyDockedHud()
    // Keep the hangar alive behind station services (loaders, drones, lights).
    if (interiorMesh?.parent) {
      updateStationInterior(interiorMesh, dt)
      const park = DOCKING_BAY_ORIGIN.clone().add(BAY_PARK_OFFSET)
      const t = performance.now() * 0.00015
      camera.position.set(
        park.x + Math.sin(t) * 4,
        park.y + 10 + Math.sin(t * 0.7) * 1.2,
        park.z - 28 + Math.cos(t * 0.5) * 2
      )
      camera.lookAt(park.x, park.y + 1, park.z + 4)
    }
    // Clock already advanced above; no flight / combat while parked.
    renderer.render(scene, camera)
    return
  }

  // Multi-hop Jump Route: 10s pause after each arrival, then auto-jump next hop.
  updateRouteAutopilot(dt)

  // Probe flight runs in normal play (ship can still fly while it works).
  if (probeEffect) updateProbeEffect(dt)
  updateProbeScanFloat()
  updatePlayerDrones(dt)

  let thrustState = null
  // Alt free-look works in normal flight and supercruise — consume mouse so
  // it never steers the ship while panning the camera.
  // Engage only once Alt is held AND the mouse actually moves (not bare Alt).
  if (altHeldForFreeLook && (flightMode || cruising)) {
    if (!isChaseFreeLook() && (mouseAim.dx !== 0 || mouseAim.dy !== 0)) {
      setChaseFreeLook(true)
    }
    if (isChaseFreeLook()) {
      addChaseFreeLookDelta(mouseAim.dx, mouseAim.dy)
      mouseAim.dx = 0
      mouseAim.dy = 0
    }
  } else if (isChaseFreeLook()) {
    // Failsafe if alt flag was cleared without setChaseFreeLook(false).
    setChaseFreeLook(false)
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
      const skillB = playerSkillBonuses(gameState)
      if (updateSupercruise(
        gameState.player.ship,
        playerShipClass,
        wp.position,
        dt,
        wp.arrivalRange,
        currentSystem.bodies,
        shipRadius,
        wp.bodyId,
        {
          speedMult: skillB.speedMult,
          cruiseMult: skillB.cruiseMult,
          turnMult: skillB.turnMult
        }
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
        // Arriving at a fully mined belt — show respawn countdown.
        toastIfDepletedField(wp.bodyId)
      }
    }
    audio.setThrustState(null)
  } else {
    {
      const skillB = playerSkillBonuses(gameState)
      updateFlight(
        gameState.player.ship,
        playerShipClass,
        flightMode ? keys : EMPTY_KEYS,
        mouseAim,
        dt,
        { speedMult: skillB.speedMult, turnMult: skillB.turnMult }
      )
    }
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
    // TTS says "supercrews" so speech synthesis hits the right phonetics;
    // on-screen HUD text stays SUPERCRUISE …
    audio.announce(cruising ? 'Supercrews engaged' : 'Supercrews disengaged')
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

  // One security / faction pass for the whole AI loop (avoids combat hitch).
  const combatFrame = prepareCombatFrame(gameState)
  for (const npc of gameState.npcs) {
    if (npc.destroyed) continue
    updateNpcAI(
      npc,
      gameState,
      dt,
      onWeaponFired,
      (fromPos) => {
        notePlayerDamagedBy(npc.id, { ram: true })
        pulseDamageVignette(fromPos)
      },
      combatFrame
    )
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
  updateCombatFlag(gameState, combatFrame)
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
  // Station police don't count toward ambient traffic cap (they're fixtures).
  const ambientCount = gameState.npcs.filter(
    (n) => !n.destroyed && n.faction !== 'police'
  ).length
  if (gameState.simTime > nextAmbientSpawnAt && ambientCount < ambientCap) {
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
    // Occasionally replace killed station patrols in Sec 3–6.
    refreshStationPolicePatrols()
  }

  for (const npc of gameState.npcs) {
    let mesh = npcMeshes.get(npc.id)
    if (!mesh && !npc.destroyed) {
      // lite: skip EdgesGeometry overlays (main hitch when contacts mesh mid-fight)
      mesh = buildShipMesh(getShipClass(npc.shipClassId), { lite: true })
      npcMeshes.set(npc.id, mesh)
      scene.add(mesh)
    }
    if (!mesh) continue
    if (npc.destroyed) {
      // First frame we see a dead NPC: ship fragment burst (covers projectile
      // kills already flagged in onProjectileHit via deathFxPlayed, and rams).
      if (!npc.deathFxPlayed) {
        npc.deathFxPlayed = true
        const r = getShipCollisionRadius(getShipClass(npc.shipClassId))
        playShipDeathFx(npc.position, r)
      }
      scene.remove(mesh)
      npcMeshes.delete(npc.id)
      continue
    }
    syncMeshToEntity(mesh, npc)
    // Animate emergency lights on any mesh that has police livery (faction or flag).
    if (npc.faction === 'police' || mesh.userData?.policeLights) {
      updatePoliceLights(mesh, gameState.simTime)
    }
  }

  // Police response: when fighting pirates in a secured system, backup arrives
  // after a delay based on security rating (higher = faster).
  {
    const sys = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    if (sys) ensureSystemSecurity(sys)
    const sec = getSystemSecurity(sys)
    const livePolice = gameState.npcs.filter((n) => !n.destroyed && n.faction === 'police').length
    const fightingPirates = playerFightingPirates(gameState)
    if (sec <= 0 || !fightingPirates) {
      // Cancel pending response if fight ends or you're in lawless space.
      if (policeResponse && (!fightingPirates || sec <= 0 || policeResponse.systemId !== sys?.id)) {
        policeResponse = null
      }
    } else if (livePolice === 0) {
      if (!policeResponse || policeResponse.systemId !== sys.id) {
        const delay = policeResponseDelayS(sec)
        if (Number.isFinite(delay)) {
          policeResponse = { systemId: sys.id, fireAt: gameState.simTime + delay }
        }
      } else if (gameState.simTime >= policeResponse.fireAt) {
        const playerPos = gameState.player.ship.position
        const angle = Math.random() * Math.PI * 2
        const dist = 180 + Math.random() * 80
        const spawnPos = [
          playerPos[0] + Math.cos(angle) * dist,
          playerPos[1] + (Math.random() - 0.5) * 40,
          playerPos[2] + Math.sin(angle) * dist
        ]
        const count = sec >= 4 ? 2 : 1
        for (let i = 0; i < count; i++) {
          const offset = i === 0 ? [0, 0, 0] : [(Math.random() - 0.5) * 40, 10, (Math.random() - 0.5) * 40]
          const pos = [spawnPos[0] + offset[0], spawnPos[1] + offset[1], spawnPos[2] + offset[2]]
          gameState.npcs.push(spawnPoliceResponse(Math.random, { position: pos, bodies: sys.bodies }))
        }
        policeResponse = null
        flashToast(count > 1 ? 'System Patrol inbound (2)' : 'System Patrol inbound')
      }
    } else {
      policeResponse = null
    }
  }

  // Law standing change toasts (innocent attacks / pirate kills).
  for (const msg of flushPendingToasts(gameState)) {
    flashToast(msg, 3.2)
  }

  const liveProjectileIds = new Set()
  const liveMissileIds = new Set()
  for (const proj of gameState.projectiles) {
    liveProjectileIds.add(proj.id)
    let mesh = projectileMeshes.get(proj.id)
    if (!mesh) {
      mesh = buildProjectileMesh(proj.weaponId, proj.weaponType)
      projectileMeshes.set(proj.id, mesh)
      scene.add(mesh)
    }
    syncMeshToEntity(mesh, proj)
    if (proj.weaponType === 'missile' && missileTrail) {
      liveMissileIds.add(proj.id)
      let scale = 1
      try {
        const dmg = getWeapon(proj.weaponId).damage
        scale = 0.85 + Math.min(0.55, dmg / 100)
      } catch { /* */ }
      missileTrail.track(
        proj.id,
        proj.position,
        proj.quaternion,
        proj.velocity,
        dt,
        scale
      )
    }
  }
  for (const [id, mesh] of projectileMeshes) {
    if (!liveProjectileIds.has(id)) {
      scene.remove(mesh)
      projectileMeshes.delete(id)
      missileTrail?.release(id)
    }
  }
  missileTrail?.prune(liveMissileIds)
  missileTrail?.update(dt)

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
  for (let i = rockExplosions.length - 1; i >= 0; i--) {
    const fx = rockExplosions[i]
    if (!updateRockExplosion(fx, dt)) {
      scene.remove(fx.group)
      disposeRockExplosion(fx)
      rockExplosions.splice(i, 1)
    }
  }
  for (let i = hitImpacts.length - 1; i >= 0; i--) {
    const fx = hitImpacts[i]
    if (!updateHitImpact(fx, dt)) {
      scene.remove(fx.group)
      disposeHitImpact(fx)
      hitImpacts.splice(i, 1)
    }
  }

  if (starMesh) updateStarMesh(starMesh, gameState.simTime, dt, camera)
  // Axial spin for planets/moons (spinSpeed) + station beacons; fixed world positions.
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
  // Fixed layout: bodies keep generated positions. Settlements stay on host surface.
  for (const entry of surfaceSettlements.values()) {
    const parent = sysBodies.find((b) => b.id === entry.parentId)
    if (!parent) continue
    const o = entry.surfaceOffset
    entry.body.position[0] = parent.position[0] + o[0]
    entry.body.position[1] = parent.position[1] + o[1]
    entry.body.position[2] = parent.position[2] + o[2]
    const mesh = bodyMeshes.get(entry.body.id)
    if (mesh) {
      mesh.position.fromArray(entry.body.position)
      orientSettlementOnSurface(mesh, entry.surfaceOffset)
    }
  }

  syncMeshToEntity(playerMesh, gameState.player.ship)
  syncChaseCamera(camera, gameState.player.ship, { cruising, dt })

  // Fire after final pose + camera; mesh-sync again so new bolts draw this frame.
  // Independent: hold LMB + RMB to fire lasers and missiles at the same time.
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

  // System overview: always visible while undocked (not a toggle with F1 / menus).
  // Clickable only when the mouse is free and no modal is eating input.
  if (!docked) {
    systemOverview?.show()
    const overviewClickable =
      !flightMode &&
      !paused &&
      !navMapOpen &&
      !inventoryOpen &&
      !missionsOpen &&
      !characterOpen &&
      !jumpEffect &&
      !dockEffect
    systemOverview?.setInteractive(overviewClickable)
    // Distances only — full rebuild would cancel pointer events mid-click.
    systemOverview?.update()
  } else {
    systemOverview?.hide()
  }
  const shipVelocity = new THREE.Vector3().fromArray(gameState.player.ship.velocity)
  const shipForward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(gameState.player.ship.quaternion))
  const speed = shipVelocity.length()
  const forwardSpeed = shipVelocity.dot(shipForward)
  const hudSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (hudSystem) ensureSystemSecurity(hudSystem)
  const nearestHudBody = findNearestHudBody()
  hud.update(
    gameState.player.ship,
    playerShipClass,
    speed,
    forwardSpeed,
    hudSystem?.name ?? null,
    nearestHudBody?.name ?? null,
    getSystemSecurity(hudSystem)
  )
  // Tab-target detail panel between system name and radar.
  {
    const t = resolveTarget()
    if (!t) {
      hud.updateTarget(null)
    } else {
      const shipPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
      const dist = shipPos.distanceTo(new THREE.Vector3().fromArray(t.position))
      const metaParts = []
      if (t.pilotName) metaParts.push(t.pilotName)
      if (t.faction) metaParts.push(t.faction)
      if (t.kindLabel) metaParts.push(t.kindLabel)
      if (t.isAsteroid) metaParts.push('asteroid')
      metaParts.push(`${Math.round(dist)} m`)
      hud.updateTarget({
        name: t.name,
        hostile: !!t.hostile,
        meta: metaParts.join(' · '),
        shields: t.shields,
        maxShields: t.maxShields,
        armor: t.armor,
        maxArmor: t.maxArmor,
        hull: t.hull,
        maxHull: t.maxHull,
        oreLeft: t.oreLeft,
        oreMax: t.oreMax
      })
    }
  }
  hud.updateRadar(computeRadarContacts(), RADAR_RANGE, gameState.simTime)

  // Dock / probe / wreck prompts are normal-space only — in supercruise you
  // skim past shells so constantly, that those toasts just spam the HUD.
  // Lootable wrecks override docking when both are in range (KeyF salvages first).
  const nearbyWreck = !cruising ? findNearbyWreck() : null
  const nearbyBody = !cruising && !nearbyWreck ? findNearbyDockableBody() : null
  wreckPromptEl.style.display = nearbyWreck ? 'block' : 'none'
  if (nearbyWreck) {
    wreckPromptEl.textContent = 'Press F to salvage wreck'
  }

  dockPromptEl.style.display = nearbyBody ? 'block' : 'none'
  if (nearbyBody) {
    const dockSys = getSystem(gameState.galaxy, gameState.player.currentSystemId)
    if (dockSys) ensureSystemSecurity(dockSys)
    if (!canDockWithLaw(gameState, nearbyBody, dockSys)) {
      dockPromptEl.textContent = `${nearbyBody.name} — docking refused (security standing)`
    } else {
      dockPromptEl.textContent = `Dock with ${nearbyBody.name}`
    }
  }

  const probeLaunch = !cruising && !probeEffect ? getProbeLaunchTarget() : null
  probePromptEl.style.display = probeLaunch ? 'block' : 'none'
  if (probeLaunch) {
    const left = MAX_PROBE_ATTEMPTS - probeAttemptCount(gameState, probeLaunch.body.id)
    if (left <= 0) {
      probePromptEl.textContent = probeExhaustedMessage(probeLaunch.body.name)
    } else {
      const base = probeLaunch.viaOrbit
        ? `Press P to probe ${probeLaunch.body.name} (in orbit)`
        : `Press P to launch a probe at ${probeLaunch.body.name}`
      probePromptEl.textContent = `${base} · ${left} left`
    }
  }

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

// Kick station + interior GLB preload early so New Game / Load hit ready models.
preloadStationModels()
preloadInteriorModels().then(() => {
  // If already docked on a procedural-only bay, rebuild with kit props.
  if (!gameState || !docked || !interiorMesh) return
  const bodyId = gameState.player.dockedBodyId
  const body = bodyId ? findBody(gameState.galaxy, bodyId) : null
  if (!body) return
  const theme = resolveInteriorTheme(body)
  if (interiorMesh.parent) scene.remove(interiorMesh)
  interiorMesh = null
  scene.add(ensureInteriorMesh(theme))
})

// Intro/menu — apply saved sound default, then title screen.
// Display mode is already applied by the main process on window create.
void loadSoundPreference().finally(() => {
  startMenuBackground()
  hasSave().then((exists) => menu.show(exists))
})
