import { SURVEY_DATA_GOOD_ID } from '../data/goods.js'
import {
  PROBE_BLUEPRINT_DROP_CHANCE,
  tryRollBlueprintDrop,
  grantShipBlueprint
} from './crafting.js'
import { getBlueprint } from '../data/blueprints.js'

export const PROBE_FIND_CHANCE = 0.08
export const MAX_PROBE_ATTEMPTS = 3
export const PROBE_EXHAUSTED_MESSAGE =
  "If you didn't find anything by now, you never will...."
export { SURVEY_DATA_GOOD_ID }

export function probeAttemptCount(gameState, bodyId) {
  if (!bodyId) return 0
  return gameState.probeCounts?.[bodyId] ?? 0
}

export function canProbeBody(gameState, bodyId) {
  if (!bodyId) return false
  return probeAttemptCount(gameState, bodyId) < MAX_PROBE_ATTEMPTS
}

// Call once per launch (not per return) so aborted probes still consume a slot.
export function recordProbeAttempt(gameState, bodyId) {
  if (!bodyId) return 0
  if (!gameState.probeCounts || typeof gameState.probeCounts !== 'object') {
    gameState.probeCounts = {}
  }
  const key = String(bodyId)
  gameState.probeCounts[key] = (gameState.probeCounts[key] ?? 0) + 1
  return gameState.probeCounts[key]
}

// True when this body is the open objective of an active probe/investigation mission
// (those always resolve their mission outcome on the first successful probe).
export function isActiveMissionProbeTarget(gameState, bodyId) {
  return gameState.missions.active.some(
    (m) =>
      !m.objectiveComplete &&
      ((m.type === 'probe' && m.target?.bodyId === bodyId) ||
        (m.type === 'investigation' && m.target?.kind === 'body' && m.target?.bodyId === bodyId))
  )
}

// A find still respects cargo capacity like any other good, so a full hold
// can miss out on a discovery rather than silently exceeding capacity.
// forceFind: used so a mission-target first probe always yields its result path
// (caller still handles mission logic separately; this only affects survey data).
export function launchProbe(gameState, shipClass, rng, { forceFind = false } = {}) {
  // Independent ultra-rare blueprint find (does not require survey-data roll).
  const blueprintId = tryRollBlueprintDrop(rng, PROBE_BLUEPRINT_DROP_CHANCE)
  let blueprint = null
  if (blueprintId) {
    grantShipBlueprint(gameState, blueprintId)
    try {
      blueprint = getBlueprint(blueprintId)
    } catch {
      blueprint = { name: 'Unknown Blueprint' }
    }
  }

  if (!forceFind && rng() >= PROBE_FIND_CHANCE) {
    return { found: false, stored: false, blueprint }
  }

  const cargo = gameState.player.ship.cargo
  const used = Object.values(cargo).reduce((a, b) => a + b, 0)
  if (used >= shipClass.stats.cargoCapacity) {
    return { found: true, stored: false, blueprint }
  }

  cargo[SURVEY_DATA_GOOD_ID] = (cargo[SURVEY_DATA_GOOD_ID] ?? 0) + 1
  return { found: true, stored: true, blueprint }
}
