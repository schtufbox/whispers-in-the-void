import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getPrice, buyGood, sellGood, sellMinedOre, purchaseShip, repairCost, repairShip,
  activateStoredShip, sellStoredShip, storeCargo, retrieveCargo, useShipPart,
  renameActiveShip, renameStoredShip, buyWeapon, sellStoredWeapon, equipWeapon
} from './economy.js'
import { STARTER_SHIP_CLASS_ID, getShipClass } from '../data/shipClasses.js'
import { BASE_WEAPON_ID } from '../data/weapons.js'

function makeGameState() {
  return {
    player: {
      credits: 1000,
      ship: { classId: STARTER_SHIP_CLASS_ID, cargo: {}, miningHold: {}, shipParts: 0, position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
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
    economyOverrides: {},
    stationStorage: {}
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

test('purchaseShip stores the new ship at that station rather than making it active', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000
  purchaseShip(gameState, 'agri-world', 'scout', 'Wanderer')
  assert.equal(gameState.player.ship.classId, STARTER_SHIP_CLASS_ID, 'buying alone should not swap the active ship')
  assert.ok(gameState.player.credits < 50000)
  const stored = gameState.stationStorage['agri-world'].ships
  assert.equal(stored.length, 1)
  assert.equal(stored[0].classId, 'scout')
  assert.equal(stored[0].instanceName, 'Wanderer')
})

test('activateStoredShip swaps the active ship with one in storage, and sellStoredShip removes it for credits', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000
  purchaseShip(gameState, 'agri-world', 'scout', 'Wanderer')

  activateStoredShip(gameState, 'agri-world', 0)
  assert.equal(gameState.player.ship.classId, 'scout', 'the stored ship should now be active')
  const stored = gameState.stationStorage['agri-world'].ships
  assert.equal(stored.length, 1)
  assert.equal(stored[0].classId, STARTER_SHIP_CLASS_ID, 'the old active ship should now be the one in storage')

  const creditsBeforeSale = gameState.player.credits
  sellStoredShip(gameState, 'agri-world', 0)
  assert.equal(gameState.stationStorage['agri-world'].ships.length, 0)
  assert.ok(gameState.player.credits > creditsBeforeSale, 'selling a stored ship should pay out credits')
})

test('storeCargo/retrieveCargo round-trip cargo through per-station storage', () => {
  const gameState = makeGameState()
  gameState.player.ship.cargo = { grain: 5 }
  storeCargo(gameState, 'agri-world')
  assert.deepEqual(gameState.player.ship.cargo, {}, 'cargo should leave the ship once stored')
  assert.equal(gameState.stationStorage['agri-world'].cargo.grain, 5)

  retrieveCargo(gameState, 'agri-world')
  assert.equal(gameState.player.ship.cargo.grain, 5)
  assert.deepEqual(gameState.stationStorage['agri-world'].cargo, {}, 'storage should be emptied once retrieved')
})

test('renameActiveShip and renameStoredShip rename ships (and reject blank names)', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000
  purchaseShip(gameState, 'agri-world', 'scout', 'Scout')

  renameActiveShip(gameState, '  Nova Runner  ')
  assert.equal(gameState.player.ship.instanceName, 'Nova Runner', 'should trim whitespace')
  assert.throws(() => renameActiveShip(gameState, '   '), /cannot be empty/)

  renameStoredShip(gameState, 'agri-world', 0, 'Backup Ship')
  assert.equal(gameState.stationStorage['agri-world'].ships[0].instanceName, 'Backup Ship')
  assert.throws(() => renameStoredShip(gameState, 'agri-world', 5, 'X'), /No such stored ship/)
})

test('useShipPart heals 10% of max hull/armor and consumes one part', () => {
  const gameState = makeGameState()
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  gameState.player.ship.hull = 0
  gameState.player.ship.armor = 0
  gameState.player.ship.shipParts = 2

  useShipPart(gameState)
  assert.ok(Math.abs(gameState.player.ship.hull - shipClass.stats.hull * 0.1) < 1e-6)
  assert.ok(Math.abs(gameState.player.ship.armor - shipClass.stats.armor * 0.1) < 1e-6)
  assert.equal(gameState.player.ship.shipParts, 1)

  gameState.player.ship.shipParts = 0
  assert.throws(() => useShipPart(gameState), /No ship parts/)
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

test('buyWeapon deducts credits and adds one to station storage; sellStoredWeapon reverses it for a resale cut', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000

  buyWeapon(gameState, 'agri-world', 'beam_laser')
  assert.equal(gameState.stationStorage['agri-world'].weapons.beam_laser, 1)
  assert.ok(gameState.player.credits < 50000)

  const creditsBeforeSale = gameState.player.credits
  sellStoredWeapon(gameState, 'agri-world', 'beam_laser')
  assert.equal(gameState.stationStorage['agri-world'].weapons.beam_laser, undefined)
  assert.ok(gameState.player.credits > creditsBeforeSale)

  assert.throws(() => sellStoredWeapon(gameState, 'agri-world', 'beam_laser'), /No such weapon/)
})

test('equipWeapon swaps a hardpoint\'s weapon with one in storage, returning the old one to storage', () => {
  const gameState = makeGameState()
  gameState.player.credits = 50000
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID) // one laser hardpoint: fwd1
  const hardpointId = shipClass.hardpoints[0].id

  buyWeapon(gameState, 'agri-world', 'burst_laser')
  equipWeapon(gameState, 'agri-world', hardpointId, 'burst_laser')

  assert.equal(gameState.player.ship.equippedWeapons[hardpointId], 'burst_laser')
  assert.equal(gameState.stationStorage['agri-world'].weapons.burst_laser, undefined, 'the equipped weapon should leave storage')
  assert.equal(gameState.stationStorage['agri-world'].weapons[BASE_WEAPON_ID.laser], 1, 'the previously equipped base weapon should return to storage')

  // Equipping a weapon that doesn't fit the hardpoint's mount category throws.
  buyWeapon(gameState, 'agri-world', 'rocket_pod')
  assert.throws(() => equipWeapon(gameState, 'agri-world', hardpointId, 'rocket_pod'), /does not fit/)

  // Equipping something not in storage or salvage throws.
  assert.throws(() => equipWeapon(gameState, 'agri-world', hardpointId, 'plasma_cannon'), /not available/)
})
