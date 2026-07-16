import { mulberry32, pick } from '../procgen/prng.js'
import {
  generateGalaxy,
  SYSTEM_ARRIVAL_POSITION,
  coreFraction,
  ensureStartingSystemFacilities,
  WHISPERS_SYSTEM_NAME
} from '../procgen/galaxy.js'
import { starTypeForSystem, isExoticStarType } from '../procgen/starType.js'
import { getShipClass } from '../data/shipClasses.js'
import { seedMissionsForGalaxy } from '../data/missionTemplates.js'
import { defaultLoadoutFor } from '../data/weapons.js'
import { defaultAccessoriesFor } from '../data/accessories.js'
import { quatFacingSun } from './hyperspace.js'

// Dev convenience: start new games in the outer-rim Whispers system.
// Flip to true only while testing Whispers; normal play starts near the core.
const START_IN_WHISPERS = false

// The player starts nearer the galactic core than the edge — picked from
// among the 10% of systems closest to it, rather than an arbitrary system.
// Binaries are excluded so a new game always opens on a single sun (menu
// flyby still forces a binary; that's separate).
function pickStartingSystem(galaxy, rng) {
  if (START_IN_WHISPERS) {
    const whispers = galaxy.systems.find((s) => s.name === WHISPERS_SYSTEM_NAME)
    if (whispers) return whispers
  }
  const sorted = [...galaxy.systems].sort((a, b) => coreFraction(a) - coreFraction(b))
  const nearCoreCount = Math.max(1, Math.floor(sorted.length * 0.1))
  const nearCore = sorted.slice(0, nearCoreCount)
  const nonExotic = nearCore.filter((s) => !isExoticStarType(starTypeForSystem(s)))
  if (nonExotic.length) return pick(rng, nonExotic)
  // Extremely unlikely (~1/8 of systems are binary); fall back galaxy-wide
  // rather than accept a binary/trinary start.
  const anySimple = sorted.filter((s) => !isExoticStarType(starTypeForSystem(s)))
  return pick(rng, anySimple.length ? anySimple : nearCore)
}

export function createGameState({ characterName, shipInstanceName, shipClassId, seed }) {
  const galaxy = generateGalaxy(seed)
  const shipClass = getShipClass(shipClassId)
  // Separate rng streams (seed+1, seed+2) keep mission generation and
  // starting-system choice independent of galaxy layout generation, without
  // needing to expose galaxy.js's internal rng.
  const startingSystem = pickStartingSystem(galaxy, mulberry32(seed + 2))
  // Home system always has a station and two settlements to dock at.
  ensureStartingSystemFacilities(startingSystem, mulberry32(seed + 3), galaxy._nextBodyId ?? 0)
  // Missions after facilities so starting-system boards get seeded too.
  const missionRng = mulberry32(seed + 1)
  const availableMissions = seedMissionsForGalaxy(missionRng, galaxy)

  const gameState = {
    version: 1,
    seed,
    createdAt: new Date().toISOString(),
    player: {
      name: characterName,
      credits: 1500,
      reputation: 0,
      currentSystemId: startingSystem.id,
      // Remembered separately from currentSystemId (which changes as the
      // player travels) so main.js's ambient spawner can tell "am I back
      // home" apart from "am I just passing through some other system" —
      // see the starting-system peace flag below.
      startingSystemId: startingSystem.id,
      waypointBodyId: null,
      // Free-space waypoint (e.g. bounty hunt marker) — cleared when a body
      // waypoint is set. Not required for normal body navigation.
      waypointPosition: null,
      // Galaxy-map plotted hyperspace chain: remaining system ids to visit
      // (destination last). Null when no route. Advanced on each jump.
      plottedRoute: null,
      // Docked at this body id (station/settlement); null when flying.
      // Exterior hang point + approach dir let undock after load line up.
      dockedBodyId: null,
      dockedExteriorPosition: null,
      dockedApproachDir: null,
      ship: {
        classId: shipClassId,
        instanceName: shipInstanceName,
        hull: shipClass.stats.hull,
        shields: shipClass.stats.shields,
        armor: shipClass.stats.armor,
        cargo: {},
        miningHold: {},
        shipParts: 0,
        // Every hardpoint starts mounted with its category's free base
        // weapon (see data/weapons.js) — the same stats combat.js's old
        // fixed presets used, so an untouched loadout plays identically.
        equippedWeapons: defaultLoadoutFor(shipClass),
        // Optional modules (Autopilot, …) — empty array when class has 0 slots.
        equippedAccessories: defaultAccessoriesFor(shipClass),
        // Salvaged hardpoint weapons from wrecks — equip or sell at a shipyard.
        spareWeapons: {},
        // Rare industry blueprints (ships/weapons) — craft at station Industry.
        blueprints: {},
        position: [...SYSTEM_ARRIVAL_POSITION],
        velocity: [0, 0, 0],
        // Same sun-facing orientation as post-hyperspace arrival.
        quaternion: quatFacingSun(SYSTEM_ARRIVAL_POSITION)
      }
    },
    galaxy,
    economyOverrides: {},
    // Per-body market depth: how many units of each good the bay has for sale.
    // Lazy-seeded on first trade access (see game/economy.js getMarketAvailable).
    marketStock: {},
    missions: { available: availableMissions, active: [] },
    visitedBodyIds: [],
    probedBodyIds: [],
    // How many times each body (or system star id) has been fully probed.
    // Cap is MAX_PROBE_ATTEMPTS in game/probe.js.
    probeCounts: {},
    // Per-station storage — cargo/ore/ship-parts left behind, and ships owned
    // but not currently active — keyed by body id (see game/economy.js's
    // storage-related functions). Never crosses to a different station.
    stationStorage: {},
    // Active industry jobs (wall-clock; persist across save/load).
    craftingJobs: [],
    npcs: [],
    projectiles: [],
    // Wrecks left behind by destroyed ships (game/wrecks.js) — ephemeral like
    // npcs/projectiles, never persisted (see game/save.js).
    wrecks: [],
    // Per-rock mining state (remaining ore, destroyedAt simTime), keyed by
    // "fieldId:index" — persisted so fields can respawn while offline.
    asteroids: {},
    inCombat: false,
    // Seconds of campaign time; driven by wall clock (see game/gameClock.js).
    simTime: 0,
    // Date.now() origin such that simTime ≈ (now - simClockOriginMs) / 1000.
    simClockOriginMs: Date.now(),
    // startingSystemPeaceBroken flips permanently true the moment the player
    // fires on a non-hostile ship while home (see combat.js's
    // updateProjectiles) — until then, the starting system spawns only
    // neutral traffic, never pirates/aliens (see main.js's ambient spawner).
    flags: { alive: true, startingSystemPeaceBroken: false }
  }

  return gameState
}
