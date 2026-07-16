import { ensureBountyNpcsForSystem, updateMissionProgress } from './missions.js'
import { getShipClass } from '../data/shipClasses.js'
import { defaultLoadoutFor } from '../data/weapons.js'
import { defaultAccessoriesFor, normalizeAccessories } from '../data/accessories.js'
import { ensureBlueprintMaps, updateCraftingJobs } from './crafting.js'
import { applyOfflineTime, reanchorGameClock } from './gameClock.js'

export function serializeGameState(gameState) {
  // Snapshot clock at save so load can apply offline wall time.
  const nowMs = Date.now()
  if (gameState.simClockOriginMs != null) {
    gameState.simTime = Math.max(0, (nowMs - gameState.simClockOriginMs) / 1000)
  }
  return {
    version: gameState.version,
    seed: gameState.seed,
    createdAt: gameState.createdAt,
    player: gameState.player,
    galaxy: gameState.galaxy,
    economyOverrides: gameState.economyOverrides,
    marketStock: gameState.marketStock ?? {},
    missions: gameState.missions,
    visitedBodyIds: gameState.visitedBodyIds,
    probedBodyIds: gameState.probedBodyIds,
    probeCounts: gameState.probeCounts ?? {},
    stationStorage: gameState.stationStorage,
    // Wall-clock industry jobs — must persist so crafts finish offline.
    craftingJobs: gameState.craftingJobs ?? [],
    // Campaign clock + rock depletion (respawn after offline hours).
    simTime: gameState.simTime ?? 0,
    savedAtWallMs: nowMs,
    asteroids: gameState.asteroids ?? {},
    flags: gameState.flags
  }
}

export function deserializeGameState(data) {
  // probedBodyIds falls back to [] for saves written before probe missions existed.
  // probeCounts falls back to {} for older saves (re-probes start from 0).
  // wrecks/npcs/projectiles stay ephemeral. Asteroids + simTime persist so
  // belts and other sim-clock systems catch up after offline time.
  const gameState = {
    ...data,
    npcs: [],
    projectiles: [],
    wrecks: [],
    asteroids: data.asteroids ?? {},
    inCombat: false,
    simTime: data.simTime ?? 0,
    probedBodyIds: data.probedBodyIds ?? [],
    probeCounts: data.probeCounts ?? {},
    craftingJobs: data.craftingJobs ?? [],
    marketStock: data.marketStock ?? {}
  }
  // miningHold falls back to {} for saves written before mining existed.
  gameState.player.ship.miningHold ??= {}
  gameState.player.ship.shipParts ??= 0
  // equippedWeapons falls back for saves written before weapons were
  // swappable — every hardpoint just defaults to its category's free base
  // weapon, matching how it already behaved.
  const activeClass = getShipClass(gameState.player.ship.classId)
  gameState.player.ship.equippedWeapons ??= defaultLoadoutFor(activeClass)
  // Pre-accessory saves: pad/truncate to the class's current slot count.
  gameState.player.ship.equippedAccessories = normalizeAccessories(
    gameState.player.ship.equippedAccessories ?? defaultAccessoriesFor(activeClass),
    activeClass
  ).equipped
  gameState.player.ship.spareWeapons ??= {}
  gameState.player.ship.blueprints ??= {}
  gameState.stationStorage ??= {}
  for (const storage of Object.values(gameState.stationStorage)) {
    if (!storage) continue
    storage.accessories ??= {}
    storage.weapons ??= {}
    for (const parked of storage.ships ?? []) {
      try {
        const cls = getShipClass(parked.classId)
        parked.equippedAccessories = normalizeAccessories(
          parked.equippedAccessories ?? defaultAccessoriesFor(cls),
          cls
        ).equipped
      } catch {
        parked.equippedAccessories ??= []
      }
    }
  }
  ensureBlueprintMaps(gameState)
  // All stations always have a full shipyard (ships + armoury). Older saves
  // only rolled ~60% of stations with hasShipyard — force true on load.
  for (const system of gameState.galaxy?.systems ?? []) {
    for (const body of system.bodies ?? []) {
      if (body.kind === 'station') body.hasShipyard = true
    }
  }
  // startingSystemId/startingSystemPeaceBroken fall back for saves written
  // before the starting-system peace existed — null just means that save
  // never gets the "no hostiles at home" protection, which is harmless.
  gameState.player.startingSystemId ??= null
  gameState.player.waypointPosition ??= null
  gameState.player.plottedRoute ??= null
  // Pre-docking-save fields: null = was flying when saved.
  gameState.player.dockedBodyId ??= null
  gameState.player.dockedExteriorPosition ??= null
  gameState.player.dockedApproachDir ??= null
  // Keep last pose arrays valid if an older/corrupt save omitted them.
  const ship = gameState.player.ship
  if (!Array.isArray(ship.position) || ship.position.length !== 3) {
    ship.position = [0, 400, 0]
  }
  if (!Array.isArray(ship.velocity) || ship.velocity.length !== 3) {
    ship.velocity = [0, 0, 0]
  }
  if (!Array.isArray(ship.quaternion) || ship.quaternion.length !== 4) {
    ship.quaternion = [0, 0, 0, 1]
  }
  ship.throttle ??= 0
  // Weapon cooldowns are absolute simTime timestamps. After offline catch-up
  // they would still be in the past if we kept them — clear so guns work
  // immediately on load (same as pre-persist-clock behaviour).
  ship.hardpointCooldowns = {}
  // lastHitAt is also simTime-relative (shield regen delay); drop it so regen
  // isn't stuck waiting for a pre-save combat timestamp.
  delete ship.lastHitAt
  gameState.flags.startingSystemPeaceBroken ??= false

  const nowMs = Date.now()
  // Advance campaign clock by real time since save (asteroid respawns, etc.).
  const offlineS = applyOfflineTime(gameState, nowMs, data.savedAtWallMs ?? null)
  gameState._offlineSecondsApplied = offlineS
  reanchorGameClock(gameState, nowMs)

  // Resolve any crafts that finished while the save was offline (wall-clock).
  // Toasts for those completions are fired by main.js after load.
  gameState._craftingJustCompleted = updateCraftingJobs(gameState, nowMs)

  // Encounter/NPC state is never persisted (see plan). Only the current
  // system's bounty target needs to exist right away; other systems'
  // bounties re-materialize the same way when the player jumps there.
  ensureBountyNpcsForSystem(gameState, gameState.player.currentSystemId, Math.random)
  // Re-sync probe/exploration objectives against visited/probed lists.
  updateMissionProgress(gameState)
  return gameState
}

export async function saveGame(gameState) {
  if (gameState.inCombat) throw new Error('Cannot save while in combat')
  await window.electronAPI.saveGame(serializeGameState(gameState))
}

export async function loadGame() {
  const data = await window.electronAPI.loadGame()
  return data ? deserializeGameState(data) : null
}

export function hasSave() {
  return window.electronAPI.hasSave()
}

export function deleteSave() {
  return window.electronAPI.deleteSave()
}
