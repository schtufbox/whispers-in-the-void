import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPrice, buyGood, sellGood, sellMinedOre, purchaseShip } from './economy.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'

function makeGameState() {
  return {
    player: {
      credits: 1000,
      ship: { classId: STARTER_SHIP_CLASS_ID, cargo: {}, miningHold: {}, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
    },
    galaxy: {
      systems: [
        {
          id: 'sys-0',
          bodies: [
            { id: 'agri-world', economyTags: ['agricultural'] },
            { id: 'industrial-world', economyTags: ['industrial'] }
          ]
        }
      ]
    },
    economyOverrides: {}
  }
}

test('the same good is cheaper where its tag matches a discount multiplier', () => {
  const gameState = makeGameState()
  const agriPrice = getPrice(gameState, 'agri-world', 'grain')
  const industrialPrice = getPrice(gameState, 'industrial-world', 'grain')
  assert.ok(agriPrice < industrialPrice, 'grain should be cheaper on an agricultural world than an industrial one')
})

test('buying then selling round-trips credits and cargo (minus the price nudge)', () => {
  const gameState = makeGameState()
  const startCredits = gameState.player.credits
  buyGood(gameState, 'agri-world', 'grain', 5)
  assert.equal(gameState.player.ship.cargo.grain, 5)
  assert.ok(gameState.player.credits < startCredits)

  sellGood(gameState, 'agri-world', 'grain', 5)
  assert.equal(gameState.player.ship.cargo.grain, undefined)
})

test('buyGood rejects purchases beyond cargo capacity or available credits', () => {
  const gameState = makeGameState()
  assert.throws(() => buyGood(gameState, 'agri-world', 'grain', 100000))
  gameState.player.credits = 0
  assert.throws(() => buyGood(gameState, 'agri-world', 'grain', 1))
})

test('purchaseShip swaps the player ship and deducts credits', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000
  purchaseShip(gameState, 'scout', 'Wanderer')
  assert.equal(gameState.player.ship.classId, 'scout')
  assert.equal(gameState.player.ship.instanceName, 'Wanderer')
  assert.ok(gameState.player.credits < 50000)
  assert.deepEqual(gameState.player.ship.miningHold, {}, 'the new ship should have its own empty mining hold')
})

test('sellMinedOre pays out from the mining hold, separate from regular cargo', () => {
  const gameState = makeGameState()
  gameState.player.ship.miningHold.raw_ore = 5
  const startCredits = gameState.player.credits

  sellMinedOre(gameState, 'agri-world', 'raw_ore', 3)
  assert.equal(gameState.player.ship.miningHold.raw_ore, 2)
  assert.ok(gameState.player.credits > startCredits)

  assert.throws(() => sellMinedOre(gameState, 'agri-world', 'raw_ore', 10))
})
