import { pick, range, intRange } from '../procgen/prng.js'
import { SHIP_CLASSES } from '../data/shipClasses.js'
import { generateHumanName } from '../procgen/names.js'

let npcCounter = 0

// Sorted once so pirate difficulty can be picked as a position in this list
// rather than re-sorting per spawn.
const SHIP_CLASSES_BY_PRICE = [...SHIP_CLASSES].sort((a, b) => a.price - b.price)
// Fraction of the roster a pirate is drawn from around its difficulty band —
// wide enough that pirates at any given distance from the core still vary,
// rather than every pirate at a given coreFraction flying the same hull.
const PIRATE_DIFFICULTY_BAND_FRACTION = 0.3

// Pirates fly cheaper/weaker hulls near the galactic core and pricier/
// stronger ones toward the rim — coreFraction is the same 0-1 "how far
// toward the rim" value spawnEncounterNear already uses for alien odds.
function pickPirateShipClass(rng, coreFraction) {
  const bandSize = Math.max(1, Math.floor(SHIP_CLASSES_BY_PRICE.length * PIRATE_DIFFICULTY_BAND_FRACTION))
  const maxStart = SHIP_CLASSES_BY_PRICE.length - bandSize
  const start = Math.round(coreFraction * maxStart)
  return SHIP_CLASSES_BY_PRICE[start + intRange(rng, 0, bandSize - 1)]
}

export function spawnNpcWithClass(rng, { shipClassId, position, faction = 'pirate', species = null }) {
  const shipClass = SHIP_CLASSES.find((c) => c.id === shipClassId)
  const pilotName = species ?? generateHumanName(rng)
  return {
    id: `npc-${npcCounter++}`,
    shipClassId: shipClass.id,
    pilotName,
    faction,
    isAlien: species !== null,
    position: [...position],
    velocity: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    hull: shipClass.stats.hull,
    shields: shipClass.stats.shields,
    armor: shipClass.stats.armor,
    aiState: 'patrol',
    patrolTarget: null,
    lastHitAt: -Infinity,
    lastFireAt: -Infinity,
    destroyed: false
  }
}

export function spawnNpc(rng, { position, faction = 'pirate', species = null, coreFraction = 0 }) {
  const shipClass = faction === 'pirate' ? pickPirateShipClass(rng, coreFraction) : pick(rng, SHIP_CLASSES)
  return spawnNpcWithClass(rng, { shipClassId: shipClass.id, position, faction, species })
}

// Spawn distance is kept just beyond typical combat engagement range (see
// ATTACK_RANGE in combat.js) so a new contact shows up on radar first,
// rather than an instant point-blank ambush.
const MIN_SPAWN_DISTANCE = 260
const MAX_SPAWN_DISTANCE = 420
const PIRATE_CHANCE = 0.25
// Alien activity is zero at the galactic core and rises toward the rim (see
// procgen/galaxy.js's coreFraction) — the caller passes coreFraction(system),
// so this stays decoupled from the galaxy/system shape.
const ALIEN_MAX_CHANCE = 0.4

export function spawnEncounterNear(rng, playerPosition, galaxy, coreFraction = 0) {
  const dist = range(rng, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE)
  const theta = rng() * Math.PI * 2
  const phi = Math.acos(2 * rng() - 1)
  const position = [
    playerPosition[0] + dist * Math.sin(phi) * Math.cos(theta),
    playerPosition[1] + dist * Math.cos(phi) * 0.3,
    playerPosition[2] + dist * Math.sin(phi) * Math.sin(theta)
  ]
  const alienChance = coreFraction * ALIEN_MAX_CHANCE
  const roll = rng()
  if (roll < PIRATE_CHANCE) return spawnNpc(rng, { position, faction: 'pirate', coreFraction })
  if (roll < PIRATE_CHANCE + alienChance && galaxy.species.length) {
    return spawnNpc(rng, { position, faction: 'alien', species: pick(rng, galaxy.species) })
  }
  return spawnNpc(rng, { position, faction: 'trader' })
}
