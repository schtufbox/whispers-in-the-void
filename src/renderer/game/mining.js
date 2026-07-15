import { mulberry32, intRange, range } from '../procgen/prng.js'
import { coreFraction } from '../procgen/galaxy.js'
import { MINED_ORE_GOOD_IDS, getGood } from '../data/goods.js'

const MINE_YIELD = 1

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function rockKey(fieldId, index) {
  return `${fieldId}:${index}`
}

// Deterministic per-rock seed (same hashString(id) convention as
// render/asteroidFieldMesh.js's own rock scatter) — only used to roll the
// rock's max ore/respawn delay, not its remaining ore, which is mutable
// state that has to live in gameState instead (see rockState below).
function rockSeed(fieldId, index) {
  return hashString(rockKey(fieldId, index))
}

const ORE_MIN = 10
const ORE_MAX = 200

function rollMaxOre(fieldId, index) {
  return intRange(mulberry32(rockSeed(fieldId, index)), ORE_MIN, ORE_MAX)
}

// ~12-24hrs of accumulated simTime — same "active-play-time" convention as
// game/wrecks.js's WRECK_DESPAWN_S, not wall-clock time.
const RESPAWN_MIN_S = 12 * 3600
const RESPAWN_MAX_S = 24 * 3600

function rollRespawnDelay(fieldId, index) {
  // +1 on the seed so this doesn't roll the exact same sequence as
  // rollMaxOre off the same rock.
  return range(mulberry32(rockSeed(fieldId, index) + 1), RESPAWN_MIN_S, RESPAWN_MAX_S)
}

// Lazily creates a rock's mutable mining state on first touch — same
// lazy-create-on-first-use pattern as game/economy.js's storageFor. Ore
// depletion/respawn is ephemeral like npcs/wrecks (see game/wrecks.js and
// game/save.js), not persisted, so it never needs to survive a save/load
// boundary (gameState.simTime itself resets to 0 on load anyway).
function rockState(gameState, fieldId, index) {
  gameState.asteroids ??= {}
  const key = rockKey(fieldId, index)
  return (gameState.asteroids[key] ??= { ore: rollMaxOre(fieldId, index), destroyedAt: null })
}

// A depleted rock "explodes" (see game/combat.js/main.js) and stops being
// targetable/mineable until its own randomly-rolled respawn delay passes,
// at which point it comes back at full ore — as if it had never been
// touched, rather than resuming some partial state.
export function isRockAlive(gameState, fieldId, index) {
  const state = rockState(gameState, fieldId, index)
  if (state.destroyedAt == null) return true
  if (gameState.simTime - state.destroyedAt < rollRespawnDelay(fieldId, index)) return false
  state.ore = rollMaxOre(fieldId, index)
  state.destroyedAt = null
  return true
}

// Ore tier is picked by how far the current system sits from the galaxy's
// core — systems near the center only yield raw ore, while systems out
// toward the rim can yield increasingly rare (and valuable) ore types. Every
// rock in a field shares its system's tier (mining any of them already gave
// the same ore regardless of which rock), so this also doubles as the name
// every rock in that field displays (see rockDisplayName).
export function oreTierForSystem(system) {
  const t = coreFraction(system)
  const index = Math.min(MINED_ORE_GOOD_IDS.length - 1, Math.floor(t * MINED_ORE_GOOD_IDS.length))
  return MINED_ORE_GOOD_IDS[index]
}

export function rockDisplayName(system) {
  return `${getGood(oreTierForSystem(system)).name} Deposit`
}

// Hits a specific rock with a mining weapon. Ore is always stripped from the
// rock (so a full hold still lets you exhaust and explode it); scoop into the
// mining hold only when there is free capacity.
//
// mined: rock took a mining hit (ore reduced)
// scooped: 1 unit landed in the hold
// destroyed: this hit emptied the rock
export function mineRock(gameState, shipClass, system, fieldId, index) {
  const goodId = oreTierForSystem(system)
  if (!isRockAlive(gameState, fieldId, index)) {
    return { goodId, mined: false, scooped: false, destroyed: false }
  }

  const state = rockState(gameState, fieldId, index)
  state.ore -= MINE_YIELD
  const destroyed = state.ore <= 0
  if (destroyed) state.destroyedAt = gameState.simTime

  const hold = gameState.player.ship.miningHold
  const used = Object.values(hold).reduce((a, b) => a + b, 0)
  let scooped = false
  if (used < shipClass.stats.miningCapacity) {
    hold[goodId] = (hold[goodId] ?? 0) + MINE_YIELD
    scooped = true
  }

  return { goodId, mined: true, scooped, destroyed }
}
