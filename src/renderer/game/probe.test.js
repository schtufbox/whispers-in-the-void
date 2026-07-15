import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  launchProbe,
  SURVEY_DATA_GOOD_ID,
  canProbeBody,
  recordProbeAttempt,
  isActiveMissionProbeTarget,
  MAX_PROBE_ATTEMPTS,
  PROBE_EXHAUSTED_MESSAGE
} from './probe.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'

function freshShip() {
  return { cargo: {} }
}

test('a lucky roll finds survey data and stores it in cargo', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const gameState = { player: { ship: freshShip() } }
  const result = launchProbe(gameState, shipClass, () => 0)
  assert.deepEqual(result, { found: true, stored: true })
  assert.equal(gameState.player.ship.cargo[SURVEY_DATA_GOOD_ID], 1)
})

test('an unlucky roll finds nothing and leaves cargo untouched', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const gameState = { player: { ship: freshShip() } }
  const result = launchProbe(gameState, shipClass, () => 0.5)
  assert.deepEqual(result, { found: false, stored: false })
  assert.deepEqual(gameState.player.ship.cargo, {})
})

test('a find is lost if the cargo hold is already full', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const gameState = { player: { ship: { cargo: { ore: shipClass.stats.cargoCapacity } } } }
  const result = launchProbe(gameState, shipClass, () => 0)
  assert.deepEqual(result, { found: true, stored: false })
  assert.equal(gameState.player.ship.cargo[SURVEY_DATA_GOOD_ID], undefined)
})

test('each body can be probed at most MAX_PROBE_ATTEMPTS times', () => {
  const gameState = { probeCounts: {} }
  assert.equal(canProbeBody(gameState, 'body-1'), true)
  for (let i = 0; i < MAX_PROBE_ATTEMPTS; i++) recordProbeAttempt(gameState, 'body-1')
  assert.equal(gameState.probeCounts['body-1'], MAX_PROBE_ATTEMPTS)
  assert.equal(canProbeBody(gameState, 'body-1'), false)
  assert.equal(canProbeBody(gameState, 'body-2'), true)
  assert.match(PROBE_EXHAUSTED_MESSAGE, /never will/i)
})

test('forceFind always yields a survey-data find when cargo has room', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const gameState = { player: { ship: freshShip() } }
  // Unlucky rng would normally miss — forceFind overrides for mission first probe.
  const result = launchProbe(gameState, shipClass, () => 0.99, { forceFind: true })
  assert.deepEqual(result, { found: true, stored: true })
})

test('isActiveMissionProbeTarget detects open probe and investigation targets', () => {
  const gameState = {
    missions: {
      active: [
        { type: 'probe', objectiveComplete: false, target: { bodyId: 'a' } },
        { type: 'investigation', objectiveComplete: false, target: { kind: 'body', bodyId: 'b' } },
        { type: 'probe', objectiveComplete: true, target: { bodyId: 'c' } }
      ]
    }
  }
  assert.equal(isActiveMissionProbeTarget(gameState, 'a'), true)
  assert.equal(isActiveMissionProbeTarget(gameState, 'b'), true)
  assert.equal(isActiveMissionProbeTarget(gameState, 'c'), false)
  assert.equal(isActiveMissionProbeTarget(gameState, 'x'), false)
})
