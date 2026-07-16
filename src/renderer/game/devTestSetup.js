// Temporary dev/test loadout. Flip DEV_TEST_SETUP to false for normal New Game.
// When true, the intro menu still appears; starting a New Game applies cheats.
import { createGameState } from './state.js'
import { getShipClass } from '../data/shipClasses.js'
import { allBlueprints } from '../data/blueprints.js'
import { defaultLoadoutFor } from '../data/weapons.js'
import { defaultAccessoriesFor, EXTRA_ORE_STORAGE_ID } from '../data/accessories.js'

/** When true, New Game uses the test ship + resources (menu still boots normally).
 *  Not wired into main.js — normal starter always. Keep false / unused for local experiments. */
export const DEV_TEST_SETUP = false

// Corvette: laser + missile hardpoints, 2 accessory slots (autopilot + ore storage).
// (No dedicated "Corsair" class — instance is named Corsair for the test run.)
const DEV_SHIP_CLASS_ID = 'corvette'

/**
 * @param {{ characterName?: string, shipInstanceName?: string, seed?: number }} [opts]
 */
export function createDevTestGameState(opts = {}) {
  const gameState = createGameState({
    characterName: opts.characterName || 'Test Pilot',
    shipInstanceName: opts.shipInstanceName || 'Corsair',
    shipClassId: DEV_SHIP_CLASS_ID,
    seed: opts.seed ?? Math.floor(Math.random() * 1e9)
  })
  applyDevTestLoadout(gameState, opts)
  return gameState
}

/**
 * @param {object} gameState
 * @param {{ shipInstanceName?: string }} [opts]
 */
export function applyDevTestLoadout(gameState, opts = {}) {
  const shipClass = getShipClass(DEV_SHIP_CLASS_ID)
  const ship = gameState.player.ship

  ship.classId = DEV_SHIP_CLASS_ID
  ship.instanceName = opts.shipInstanceName || 'Corsair'

  ship.hull = shipClass.stats.hull
  ship.shields = shipClass.stats.shields
  ship.armor = shipClass.stats.armor

  // Strongest laser + strongest missile on each hardpoint.
  ship.equippedWeapons = defaultLoadoutFor(shipClass)
  for (const hp of shipClass.hardpoints) {
    if (hp.type === 'laser') ship.equippedWeapons[hp.id] = 'plasma_cannon'
    else if (hp.type === 'missile') ship.equippedWeapons[hp.id] = 'torpedo'
  }

  // Autopilot + Extra Ore Storage (Corvette has 2 slots).
  ship.equippedAccessories = defaultAccessoriesFor(shipClass)
  if (ship.equippedAccessories.length >= 1) ship.equippedAccessories[0] = 'autopilot'
  if (ship.equippedAccessories.length >= 2) ship.equippedAccessories[1] = EXTRA_ORE_STORAGE_ID

  ship.spareWeapons ??= {}
  ship.blueprints ??= {}
  ship.cargo ??= {}
  ship.miningHold ??= {}
  ship.shipParts = Math.max(ship.shipParts ?? 0, 50)

  gameState.player.credits = 99_999_999
  // Mining hold starts empty — mine belts for ore (no free ore cheat).
  ship.miningHold = {}

  // Every craftable blueprint on the ship (store to bay to assemble).
  for (const bp of allBlueprints()) {
    ship.blueprints[bp.id] = Math.max(ship.blueprints[bp.id] ?? 0, 1)
  }

  // Free flight — normal New Game arrival pose from createGameState.
  gameState.player.dockedBodyId = null
  gameState.player.dockedExteriorPosition = null
  gameState.player.dockedApproachDir = null

  return gameState
}
