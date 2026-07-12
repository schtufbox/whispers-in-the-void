import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPrice, buyGood, sellGood, sellMinedOre, purchaseShip, repairCost, repairShip } from './economy.js'
import { STARTER_SHIP_CLASS_ID, getShipClass } from '../data/shipClasses.js'

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

test('repairCost is zero for a fully-healthy ship and positive for a damaged one', () => {
  const gameState = makeGameState()
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  gameState.player.ship.hull = shipClass.stats.hull
  gameState.player.ship.armor = shipClass.stats.armor
  assert.equal(repairCost(gameState), 0)

  gameState.player.ship.hull = shipClass.stats.hull - 10
  gameState.player.ship.armor = shipClass.stats.armor - 2
  assert.ok(repairCost(gameState) > 0)
})

test('repairShip restores hull/armor to max and deducts credits; throws if already full or unaffordable', () => {
  const gameState = makeGameState()
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  gameState.player.ship.hull = shipClass.stats.hull - 20
  gameState.player.ship.armor = shipClass.stats.armor - 5
  gameState.player.credits = 1000

  const cost = repairCost(gameState)
  repairShip(gameState)
  assert.equal(gameState.player.ship.hull, shipClass.stats.hull)
  assert.equal(gameState.player.ship.armor, shipClass.stats.armor)
  assert.equal(gameState.player.credits, 1000 - cost)

  assert.throws(() => repairShip(gameState), /already fully repaired/)

  gameState.player.ship.hull -= 50
  gameState.player.credits = 0
  assert.throws(() => repairShip(gameState), /Not enough credits/)
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
