import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oreTierForSystem, mineRock, isRockAlive, rockDisplayName } from './mining.js'
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

test('mining scoops until the hold is full, but still depletes the rock afterward', () => {
  const shipClass = { stats: { miningCapacity: 2 } }
  const gameState = { simTime: 0, player: { ship: { miningHold: {} } } }
  const system = systemAtRadius(0)

  assert.deepEqual(mineRock(gameState, shipClass, system, 'field-1', 0), {
    goodId: 'raw_ore', mined: true, scooped: true, destroyed: false
  })
  assert.deepEqual(mineRock(gameState, shipClass, system, 'field-1', 0), {
    goodId: 'raw_ore', mined: true, scooped: true, destroyed: false
  })
  assert.equal(gameState.player.ship.miningHold.raw_ore, 2)

  // Hold full: rock still loses ore, nothing is scooped.
  const full = mineRock(gameState, shipClass, system, 'field-1', 0)
  assert.equal(full.mined, true)
  assert.equal(full.scooped, false)
  assert.equal(gameState.player.ship.miningHold.raw_ore, 2, 'a full hold should not exceed capacity')
})

test('a rock holds 10-200 ore, depletes, explodes, and stops being mineable until it respawns', () => {
  const shipClass = { stats: { miningCapacity: 100000 } }
  const gameState = { simTime: 0, player: { ship: { miningHold: {} } } }
  const system = systemAtRadius(0)

  let destroyedAt = null
  let mined = 0
  let destroyed = false
  while (!destroyed) {
    const result = mineRock(gameState, shipClass, system, 'field-2', 3)
    assert.equal(result.mined, true)
    assert.equal(result.scooped, true)
    mined++
    destroyed = result.destroyed
    if (destroyed) destroyedAt = gameState.simTime
    assert.ok(mined <= 200, 'rock should deplete within the documented 10-200 ore range')
  }
  assert.ok(mined >= 10 && mined <= 200)

  assert.equal(isRockAlive(gameState, 'field-2', 3), false, 'a depleted rock is not alive/mineable')
  assert.deepEqual(mineRock(gameState, shipClass, system, 'field-2', 3), {
    goodId: 'raw_ore', mined: false, scooped: false, destroyed: false
  })

  gameState.simTime = destroyedAt + 24 * 3600 + 1 // past even the longest possible respawn delay
  assert.equal(isRockAlive(gameState, 'field-2', 3), true, 'the rock respawns after its delay elapses')
  assert.deepEqual(mineRock(gameState, shipClass, system, 'field-2', 3), {
    goodId: 'raw_ore', mined: true, scooped: true, destroyed: false
  })
})

test('full mining hold can still exhaust a rock to destruction', () => {
  const shipClass = { stats: { miningCapacity: 0 } }
  const gameState = { simTime: 0, player: { ship: { miningHold: {} } } }
  const system = systemAtRadius(0)
  let hits = 0
  let destroyed = false
  while (!destroyed && hits < 250) {
    const r = mineRock(gameState, shipClass, system, 'field-full', 1)
    assert.equal(r.mined, true)
    assert.equal(r.scooped, false)
    destroyed = r.destroyed
    hits++
  }
  assert.equal(destroyed, true)
  assert.equal(Object.keys(gameState.player.ship.miningHold).length, 0)
})

test('rockDisplayName names the deposit after the ore it yields', () => {
  assert.equal(rockDisplayName(systemAtRadius(0)), 'Raw Ore Deposit')
})
