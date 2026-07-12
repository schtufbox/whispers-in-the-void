import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oreTierForSystem, mineAsteroidField } from './mining.js'
import { GALAXY_MAX_RADIUS } from '../procgen/galaxy.js'
import { MINED_ORE_GOOD_IDS } from '../data/goods.js'

function systemAtRadius(radius) {
  return { galaxyPosition: [radius, 0, 0] }
}

test('systems near the galactic core only yield raw ore', () => {
  assert.equal(oreTierForSystem(systemAtRadius(0)), 'raw_ore')
})

test('systems out toward the rim yield the most valuable ore tier', () => {
  assert.equal(oreTierForSystem(systemAtRadius(GALAXY_MAX_RADIUS)), MINED_ORE_GOOD_IDS[MINED_ORE_GOOD_IDS.length - 1])
})

test('ore tier increases monotonically with distance from the core', () => {
  const tierIndex = (r) => MINED_ORE_GOOD_IDS.indexOf(oreTierForSystem(systemAtRadius(r)))
  let last = -1
  for (let r = 0; r <= GALAXY_MAX_RADIUS; r += GALAXY_MAX_RADIUS / 20) {
    const idx = tierIndex(r)
    assert.ok(idx >= last, 'tier index should never decrease as distance grows')
    last = idx
  }
})

test('mining respects the mining hold capacity and stops once full', () => {
  const shipClass = { stats: { miningCapacity: 2 } }
  const gameState = { player: { ship: { miningHold: {} } } }
  const system = systemAtRadius(0)

  assert.deepEqual(mineAsteroidField(gameState, shipClass, system), { goodId: 'raw_ore', mined: true })
  assert.deepEqual(mineAsteroidField(gameState, shipClass, system), { goodId: 'raw_ore', mined: true })
  assert.equal(gameState.player.ship.miningHold.raw_ore, 2)

  assert.deepEqual(mineAsteroidField(gameState, shipClass, system), { goodId: 'raw_ore', mined: false })
  assert.equal(gameState.player.ship.miningHold.raw_ore, 2, 'a full hold should not exceed capacity')
})
