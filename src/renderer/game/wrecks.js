import { GOODS, MINED_ORE_GOOD_IDS, SHIP_PARTS_GOOD_ID, SURVEY_DATA_GOOD_ID } from '../data/goods.js'
import { WEAPONS, BASE_WEAPON_ID } from '../data/weapons.js'
import { getShipClass } from '../data/shipClasses.js'

let wreckCounter = 0

// Only ordinary trade goods drop from a wreck — mined ore, ship parts, and
// probe-only survey data are excluded.
const LOOTABLE_GOODS = GOODS.filter(
  (g) => !MINED_ORE_GOOD_IDS.includes(g.id) && g.id !== SHIP_PARTS_GOOD_ID && g.id !== SURVEY_DATA_GOOD_ID
)
const SHIP_PART_DROP_CHANCE = 0.15
// Rare salvageable hardpoint weapon (non-base), equippable at a shipyard.
export const WEAPON_DROP_CHANCE = 0.12
// ~30 minutes of simTime (gameState.simTime accumulates real dt, so this is
// wall-clock-equivalent, not affected by frame rate).
export const WRECK_DESPAWN_S = 1800

function rollWeaponDrop(rng, shipClassId) {
  if (rng() >= WEAPON_DROP_CHANCE) return null
  if (!shipClassId) return null
  let shipClass
  try {
    shipClass = getShipClass(shipClassId)
  } catch {
    return null
  }
  const mountTypes = new Set(
    (shipClass.hardpoints ?? []).map((hp) => (hp.type === 'missile' ? 'missile' : 'laser'))
  )
  if (!mountTypes.size) return null
  // Paid weapons only — free pulse laser / rocket pod aren't salvage finds.
  const candidates = WEAPONS.filter((w) => w.price > 0 && mountTypes.has(w.category))
  if (!candidates.length) return null
  return candidates[Math.floor(rng() * candidates.length)].id
}

// Loot is rolled once at spawn time (not re-rolled per loot attempt) — small
// amounts of a single standard trade good, plus rare ship parts / weapons.
// shipClassId (optional) sizes weapon drops off the destroyed NPC's mounts.
export function spawnWreck(position, simTime, rng = Math.random, shipClassId = null) {
  const good = LOOTABLE_GOODS[Math.floor(rng() * LOOTABLE_GOODS.length)]
  const loot = { cargo: { [good.id]: 1 + Math.floor(rng() * 3) } }
  if (rng() < SHIP_PART_DROP_CHANCE) loot.shipParts = 1
  const weaponId = rollWeaponDrop(rng, shipClassId)
  if (weaponId) loot.weapons = { [weaponId]: 1 }
  return { id: `wreck-${wreckCounter++}`, position: [...position], spawnedAt: simTime, loot }
}

// Called once per frame from main.js — cheap given how few wrecks exist at
// once, and simplest way to make "left behind, eventually despawns" true
// without a separate timer per wreck.
export function pruneWrecks(gameState) {
  gameState.wrecks = gameState.wrecks.filter((w) => gameState.simTime - w.spawnedAt < WRECK_DESPAWN_S)
}

// Adds as much of the wreck's loot as fits in the ship's cargo hold (ship
// parts and spare weapons have no cargo cap) and removes the wreck.
export function lootWreck(gameState, shipClass, wreckId) {
  const wreck = gameState.wrecks.find((w) => w.id === wreckId)
  if (!wreck) throw new Error('Wreck no longer there')

  const ship = gameState.player.ship
  let used = Object.values(ship.cargo).reduce((a, b) => a + b, 0)
  for (const [goodId, qty] of Object.entries(wreck.loot.cargo ?? {})) {
    const room = Math.max(0, shipClass.stats.cargoCapacity - used)
    const take = Math.min(qty, room)
    if (take > 0) {
      ship.cargo[goodId] = (ship.cargo[goodId] ?? 0) + take
      used += take
    }
  }
  if (wreck.loot.shipParts) ship.shipParts = (ship.shipParts ?? 0) + wreck.loot.shipParts

  ship.spareWeapons ??= {}
  for (const [weaponId, qty] of Object.entries(wreck.loot.weapons ?? {})) {
    ship.spareWeapons[weaponId] = (ship.spareWeapons[weaponId] ?? 0) + qty
  }

  gameState.wrecks = gameState.wrecks.filter((w) => w.id !== wreckId)
  return wreck.loot
}
