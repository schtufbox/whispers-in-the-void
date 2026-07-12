import { mulberry32, pick } from '../procgen/prng.js'
import { generateGalaxy, SYSTEM_ARRIVAL_POSITION, coreFraction } from '../procgen/galaxy.js'
import { getShipClass } from '../data/shipClasses.js'
import { seedMissionsForGalaxy } from '../data/missionTemplates.js'

// The player starts nearer the galactic core than the edge — picked from
// among the 10% of systems closest to it, rather than an arbitrary system.
function pickStartingSystem(galaxy, rng) {
  const sorted = [...galaxy.systems].sort((a, b) => coreFraction(a) - coreFraction(b))
  const nearCoreCount = Math.max(1, Math.floor(sorted.length * 0.1))
  return pick(rng, sorted.slice(0, nearCoreCount))
}

export function createGameState({ characterName, shipInstanceName, shipClassId, seed }) {
  const galaxy = generateGalaxy(seed)
  const shipClass = getShipClass(shipClassId)
  // Separate rng streams (seed+1, seed+2) keep mission generation and
  // starting-system choice independent of galaxy layout generation, without
  // needing to expose galaxy.js's internal rng.
  const missionRng = mulberry32(seed + 1)
  const availableMissions = seedMissionsForGalaxy(missionRng, galaxy)
  const startingSystem = pickStartingSystem(galaxy, mulberry32(seed + 2))

  return {
    version: 1,
    seed,
    createdAt: new Date().toISOString(),
    player: {
      name: characterName,
      credits: 1000,
      reputation: 0,
      currentSystemId: startingSystem.id,
      waypointBodyId: null,
      ship: {
        classId: shipClassId,
        instanceName: shipInstanceName,
        hull: shipClass.stats.hull,
        shields: shipClass.stats.shields,
        armor: shipClass.stats.armor,
        cargo: {},
        miningHold: {},
        position: [...SYSTEM_ARRIVAL_POSITION],
        velocity: [0, 0, 0],
        quaternion: [0, 0, 0, 1]
      }
    },
    galaxy,
    economyOverrides: {},
    missions: { available: availableMissions, active: [] },
    visitedBodyIds: [],
    probedBodyIds: [],
    npcs: [],
    projectiles: [],
    inCombat: false,
    simTime: 0,
    flags: { alive: true }
  }
}
