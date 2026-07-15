import { pick, range, intRange } from '../procgen/prng.js'
import { SHIP_CLASSES } from '../data/shipClasses.js'
import { generateHumanName } from '../procgen/names.js'
import { collisionRadiusFor } from './collision.js'

let npcCounter = 0

// Sorted once so pirate difficulty can be picked as a position in this list
// rather than re-sorting per spawn.
const SHIP_CLASSES_BY_PRICE = [...SHIP_CLASSES].sort((a, b) => a.price - b.price)
// Fraction of the roster a pirate is drawn from around its difficulty band —
// wide enough that pirates at any given distance from the core still vary,
// rather than every pirate at a given coreFraction flying the same hull.
const PIRATE_DIFFICULTY_BAND_FRACTION = 0.3

// Approximate half-length of a typical NPC hull + safety pad outside body shells.
export const NPC_SPAWN_SHIP_RADIUS = 14
export const NPC_SPAWN_CLEARANCE = 80

// Pirates fly cheaper/weaker hulls near the galactic core and pricier/
// stronger ones toward the rim — coreFraction is the same 0-1 "how far
// toward the rim" value spawnEncounterNear already uses for alien odds.
function pickPirateShipClass(rng, coreFraction) {
  const bandSize = Math.max(1, Math.floor(SHIP_CLASSES_BY_PRICE.length * PIRATE_DIFFICULTY_BAND_FRACTION))
  const maxStart = SHIP_CLASSES_BY_PRICE.length - bandSize
  const start = Math.round(coreFraction * maxStart)
  return SHIP_CLASSES_BY_PRICE[start + intRange(rng, 0, bandSize - 1)]
}

/** True if `position` sits inside any body collision shell (+ ship + clearance). */
export function positionOverlapsBodies(
  position,
  bodies,
  shipRadius = NPC_SPAWN_SHIP_RADIUS,
  clearance = NPC_SPAWN_CLEARANCE
) {
  for (const body of bodies ?? []) {
    const bodyR = collisionRadiusFor(body)
    if (bodyR == null) continue
    const need = bodyR + shipRadius + clearance
    const d = Math.hypot(
      position[0] - body.position[0],
      position[1] - body.position[1],
      position[2] - body.position[2]
    )
    if (d < need) return true
  }
  return false
}

/**
 * Iteratively push a point outside every solid body shell in the system.
 * Used as a final safety net for bounty hints, ambient spawns, probe hostiles.
 */
export function clearPositionOfBodies(
  position,
  bodies,
  shipRadius = NPC_SPAWN_SHIP_RADIUS,
  clearance = NPC_SPAWN_CLEARANCE
) {
  const pos = [position[0], position[1], position[2]]
  for (let iter = 0; iter < 16; iter++) {
    let moved = false
    for (const body of bodies ?? []) {
      const bodyR = collisionRadiusFor(body)
      if (bodyR == null) continue
      const need = bodyR + shipRadius + clearance
      const dx = pos[0] - body.position[0]
      const dy = pos[1] - body.position[1]
      const dz = pos[2] - body.position[2]
      const d = Math.hypot(dx, dy, dz)
      if (d >= need) continue
      if (d < 1e-6) {
        // Buried at exact center — kick along +X.
        pos[0] = body.position[0] + need
        pos[1] = body.position[1]
        pos[2] = body.position[2]
      } else {
        const s = need / d
        pos[0] = body.position[0] + dx * s
        pos[1] = body.position[1] + dy * s
        pos[2] = body.position[2] + dz * s
      }
      moved = true
    }
    if (!moved) break
  }
  return pos
}

/**
 * Random point outside a host body's shell (and optionally clear of all
 * system bodies). Used for bounty locationHints and similar.
 */
export function spawnPointNearBody(rng, body, allBodies = null, opts = {}) {
  const shipRadius = opts.shipRadius ?? NPC_SPAWN_SHIP_RADIUS
  const clearance = opts.clearance ?? NPC_SPAWN_CLEARANCE
  const shell = collisionRadiusFor(body) ?? 80
  const minDist = shell + shipRadius + clearance
  const maxDist = minDist + (opts.extraRange ?? 240)
  const checkBodies = allBodies?.length ? allBodies : [body]

  for (let i = 0; i < 40; i++) {
    const dist = range(rng, minDist, maxDist)
    const theta = rng() * Math.PI * 2
    const phi = Math.acos(2 * rng() - 1)
    const pos = [
      body.position[0] + dist * Math.sin(phi) * Math.cos(theta),
      body.position[1] + dist * Math.cos(phi) * 0.4,
      body.position[2] + dist * Math.sin(phi) * Math.sin(theta)
    ]
    if (!positionOverlapsBodies(pos, checkBodies, shipRadius, clearance)) return pos
  }
  return clearPositionOfBodies(
    [body.position[0] + minDist + 80, body.position[1], body.position[2]],
    checkBodies,
    shipRadius,
    clearance
  )
}

export function spawnNpcWithClass(rng, { shipClassId, position, faction = 'pirate', species = null, bodies = null }) {
  const shipClass = SHIP_CLASSES.find((c) => c.id === shipClassId)
  const pilotName = species ?? generateHumanName(rng)
  const clearPos = bodies?.length
    ? clearPositionOfBodies(position, bodies)
    : [...position]
  return {
    id: `npc-${npcCounter++}`,
    shipClassId: shipClass.id,
    pilotName,
    faction,
    isAlien: species !== null,
    position: clearPos,
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

export function spawnNpc(rng, { position, faction = 'pirate', species = null, coreFraction = 0, bodies = null }) {
  const shipClass = faction === 'pirate' ? pickPirateShipClass(rng, coreFraction) : pick(rng, SHIP_CLASSES)
  return spawnNpcWithClass(rng, {
    shipClassId: shipClass.id,
    position,
    faction,
    species,
    bodies
  })
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

// forceNeutral (used for the player's starting system before its peace is
// ever broken — see main.js) skips the pirate/alien rolls entirely and
// always spawns a trader, so ambient traffic still occurs there but never a
// hostile encounter.
// bodies: system bodies to stay outside of (planets, stations, …).
export function spawnEncounterNear(
  rng,
  playerPosition,
  galaxy,
  coreFraction = 0,
  forceNeutral = false,
  bodies = null
) {
  let position = null
  for (let attempt = 0; attempt < 36; attempt++) {
    const dist = range(rng, MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE)
    const theta = rng() * Math.PI * 2
    const phi = Math.acos(2 * rng() - 1)
    const candidate = [
      playerPosition[0] + dist * Math.sin(phi) * Math.cos(theta),
      playerPosition[1] + dist * Math.cos(phi) * 0.3,
      playerPosition[2] + dist * Math.sin(phi) * Math.sin(theta)
    ]
    if (!bodies?.length || !positionOverlapsBodies(candidate, bodies)) {
      position = candidate
      break
    }
  }
  if (!position) {
    position = clearPositionOfBodies(
      [
        playerPosition[0] + MAX_SPAWN_DISTANCE,
        playerPosition[1],
        playerPosition[2]
      ],
      bodies ?? []
    )
  } else if (bodies?.length) {
    position = clearPositionOfBodies(position, bodies)
  }

  if (forceNeutral) return spawnNpc(rng, { position, faction: 'trader', bodies })
  const alienChance = coreFraction * ALIEN_MAX_CHANCE
  const roll = rng()
  if (roll < PIRATE_CHANCE) return spawnNpc(rng, { position, faction: 'pirate', coreFraction, bodies })
  if (roll < PIRATE_CHANCE + alienChance && galaxy.species.length) {
    return spawnNpc(rng, {
      position,
      faction: 'alien',
      species: pick(rng, galaxy.species),
      bodies
    })
  }
  return spawnNpc(rng, { position, faction: 'trader', bodies })
}
