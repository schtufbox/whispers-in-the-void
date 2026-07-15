import { SURVEY_DATA_GOOD_ID } from '../data/goods.js'

export const PROBE_FIND_CHANCE = 0.08
export { SURVEY_DATA_GOOD_ID }

// A find still respects cargo capacity like any other good, so a full hold
// can miss out on a discovery rather than silently exceeding capacity.
export function launchProbe(gameState, shipClass, rng) {
  if (rng() >= PROBE_FIND_CHANCE) return { found: false, stored: false }

  const cargo = gameState.player.ship.cargo
  const used = Object.values(cargo).reduce((a, b) => a + b, 0)
  if (used >= shipClass.stats.cargoCapacity) return { found: true, stored: false }

  cargo[SURVEY_DATA_GOOD_ID] = (cargo[SURVEY_DATA_GOOD_ID] ?? 0) + 1
  return { found: true, stored: true }
}
