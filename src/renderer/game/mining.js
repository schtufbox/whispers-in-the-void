import { coreFraction } from '../procgen/galaxy.js'
import { MINED_ORE_GOOD_IDS } from '../data/goods.js'

const MINE_YIELD = 1

// Ore tier is picked by how far the current system sits from the galaxy's
// core — systems near the center only yield raw ore, while systems out
// toward the rim can yield increasingly rare (and valuable) ore types.
export function oreTierForSystem(system) {
  const t = coreFraction(system)
  const index = Math.min(MINED_ORE_GOOD_IDS.length - 1, Math.floor(t * MINED_ORE_GOOD_IDS.length))
  return MINED_ORE_GOOD_IDS[index]
}

// Mined ore lives in its own hold, capped by the ship class's miningCapacity —
// entirely separate from the general cargo hold and its capacity.
export function mineAsteroidField(gameState, shipClass, system) {
  const goodId = oreTierForSystem(system)
  const hold = gameState.player.ship.miningHold
  const used = Object.values(hold).reduce((a, b) => a + b, 0)
  if (used >= shipClass.stats.miningCapacity) return { goodId, mined: false }

  hold[goodId] = (hold[goodId] ?? 0) + MINE_YIELD
  return { goodId, mined: true }
}
