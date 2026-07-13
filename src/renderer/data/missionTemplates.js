import { pick, intRange } from '../procgen/prng.js'
import { systemsWithinJumps } from '../procgen/galaxy.js'

let missionCounter = 0

const BOUNTY_TARGET_CLASSES = ['raider_mk1', 'interceptor', 'corvette', 'scout']
// A mission planted in a different system than where it's picked up should
// still be a reasonable trip, not an arbitrary trek across the galaxy.
const MAX_MISSION_JUMP_DISTANCE = 4

// Bounty targets always spawn in the giver's own system, so accepting one
// never requires a hyperspace jump just to reach the fight. Exploration and
// investigation missions may point at a different system, giving hyperspace
// travel an actual reason to exist — but capped to a handful of jumps away.
function pickTargetSystem(rng, galaxy, giverSystem) {
  if (rng() < 0.5) return giverSystem
  const reachable = systemsWithinJumps(galaxy, giverSystem.id, MAX_MISSION_JUMP_DISTANCE)
  return pick(rng, reachable)
}

export function generateBountyMission(rng, galaxy, giverSystemId, giverStationId) {
  const giverSystem = galaxy.systems.find((s) => s.id === giverSystemId)
  const locationBody = pick(rng, giverSystem.bodies)
  return {
    id: `m-${missionCounter++}`,
    type: 'bounty',
    title: `Eliminate hostile near ${locationBody.name}`,
    giverStationId,
    giverSystemId,
    reward: intRange(rng, 1500, 5000),
    status: 'available',
    objectiveComplete: false,
    target: { kind: 'npcShip', shipClassId: pick(rng, BOUNTY_TARGET_CLASSES), systemId: giverSystemId, locationHint: locationBody.position, npcId: null }
  }
}

export function generateExplorationMission(rng, galaxy, giverSystemId, giverStationId) {
  const giverSystem = galaxy.systems.find((s) => s.id === giverSystemId)
  const targetSystem = pickTargetSystem(rng, galaxy, giverSystem)
  const planets = targetSystem.bodies.filter((b) => b.kind === 'planet')
  const targetBody = pick(rng, planets.length ? planets : targetSystem.bodies)
  return {
    id: `m-${missionCounter++}`,
    type: 'exploration',
    title: `Survey ${targetBody.name} in the ${targetSystem.name} system`,
    giverStationId,
    giverSystemId,
    reward: intRange(rng, 800, 2500),
    status: 'available',
    objectiveComplete: false,
    target: { kind: 'body', systemId: targetSystem.id, bodyId: targetBody.id }
  }
}

export function generateInvestigationMission(rng, galaxy, giverSystemId, giverStationId) {
  const giverSystem = galaxy.systems.find((s) => s.id === giverSystemId)
  const targetSystem = pickTargetSystem(rng, galaxy, giverSystem)
  const targetBody = pick(rng, targetSystem.bodies)
  return {
    id: `m-${missionCounter++}`,
    type: 'investigation',
    title: `Investigate the signal near ${targetBody.name} in ${targetSystem.name}`,
    giverStationId,
    giverSystemId,
    reward: intRange(rng, 1200, 3500),
    status: 'available',
    objectiveComplete: false,
    target: { kind: 'body', systemId: targetSystem.id, bodyId: targetBody.id }
  }
}

const PROBEABLE_KINDS = ['planet', 'moon', 'asteroidField']

export function generateProbeMission(rng, galaxy, giverSystemId, giverStationId) {
  const giverSystem = galaxy.systems.find((s) => s.id === giverSystemId)
  const targetSystem = pickTargetSystem(rng, galaxy, giverSystem)
  const probeable = targetSystem.bodies.filter((b) => PROBEABLE_KINDS.includes(b.kind))
  const targetBody = pick(rng, probeable.length ? probeable : targetSystem.bodies)
  return {
    id: `m-${missionCounter++}`,
    type: 'probe',
    title: `Probe ${targetBody.name} in the ${targetSystem.name} system for survey data`,
    giverStationId,
    giverSystemId,
    reward: intRange(rng, 1000, 3000),
    status: 'available',
    objectiveComplete: false,
    target: { kind: 'body', systemId: targetSystem.id, bodyId: targetBody.id }
  }
}

const GENERATORS = [generateBountyMission, generateExplorationMission, generateInvestigationMission, generateProbeMission]

export function seedMissionsForGalaxy(rng, galaxy) {
  const missions = []
  for (const system of galaxy.systems) {
    for (const body of system.bodies) {
      if (!body.hasMissions) continue
      const count = intRange(rng, 1, 3)
      for (let i = 0; i < count; i++) {
        missions.push(pick(rng, GENERATORS)(rng, galaxy, system.id, body.id))
      }
    }
  }
  return missions
}
