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

// Mines one unit from a specific rock — identified the same way Tab-
// targeting already does, by (fieldId, index) — rather than the whole field,
// since ore is now a finite, depletable, per-rock resource instead of an
// unlimited field-wide tap. destroyed=true the instant this hit empties it,
// so the caller (game/combat.js, main.js's mining-beam tick) can trigger the
// "explosion" (VFX/sound, hiding the mesh) exactly once.
export function mineRock(gameState, shipClass, system, fieldId, index) {
  const goodId = oreTierForSystem(system)
  const hold = gameState.player.ship.miningHold
  const used = Object.values(hold).reduce((a, b) => a + b, 0)
  if (used >= shipClass.stats.miningCapacity) return { goodId, mined: false, destroyed: false }
  if (!isRockAlive(gameState, fieldId, index)) return { goodId, mined: false, destroyed: false }

  const state = rockState(gameState, fieldId, index)
  hold[goodId] = (hold[goodId] ?? 0) + MINE_YIELD
  state.ore -= MINE_YIELD
  const destroyed = state.ore <= 0
  if (destroyed) state.destroyedAt = gameState.simTime
  return { goodId, mined: true, destroyed }
}
