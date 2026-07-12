import { test } from 'node:test'
import assert from 'node:assert/strict'
import { launchProbe, SURVEY_DATA_GOOD_ID } from './probe.js'
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
