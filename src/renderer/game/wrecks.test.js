import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnWreck, pruneWrecks, lootWreck, WRECK_DESPAWN_S } from './wrecks.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'

test('spawnWreck rolls a small cargo drop, and rarely a ship part', () => {
  const wreck = spawnWreck([1, 2, 3], 0, () => 0.99) // high roll: last good, no ship part
  assert.deepEqual(wreck.position, [1, 2, 3])
  assert.equal(Object.keys(wreck.loot.cargo).length, 1)
  assert.equal(wreck.loot.shipParts, undefined)

  const luckyWreck = spawnWreck([0, 0, 0], 0, () => 0.01) // low roll: first good, ship part drops
  assert.equal(luckyWreck.loot.shipParts, 1)
})

test('pruneWrecks removes wrecks older than WRECK_DESPAWN_S', () => {
  const gameState = { simTime: WRECK_DESPAWN_S + 1, wrecks: [{ id: 'a', spawnedAt: 0 }, { id: 'b', spawnedAt: WRECK_DESPAWN_S + 0.5 }] }
  pruneWrecks(gameState)
  assert.deepEqual(gameState.wrecks.map((w) => w.id), ['b'])
})

test('lootWreck adds loot to cargo (capped by cargoCapacity) and removes the wreck', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const gameState = {
    player: { ship: { classId: STARTER_SHIP_CLASS_ID, cargo: {}, shipParts: 0 } },
    wrecks: [{ id: 'w-1', position: [0, 0, 0], spawnedAt: 0, loot: { cargo: { grain: 2 }, shipParts: 1 } }]
  }
  lootWreck(gameState, shipClass, 'w-1')
  assert.equal(gameState.player.ship.cargo.grain, 2)
  assert.equal(gameState.player.ship.shipParts, 1)
  assert.equal(gameState.wrecks.length, 0)

  assert.throws(() => lootWreck(gameState, shipClass, 'w-1'), /no longer there/)
})
