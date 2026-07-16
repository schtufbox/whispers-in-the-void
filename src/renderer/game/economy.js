import { GOODS, getGood, SHIP_PARTS_GOOD_ID, isBuyableTradeGood } from '../data/goods.js'
import { getShipClass } from '../data/shipClasses.js'
import { findBody, findSystemOfBody } from '../procgen/galaxy.js'
import { getWeapon, BASE_WEAPON_ID, defaultLoadoutFor } from '../data/weapons.js'

const TRADE_PRICE_NUDGE_FACTOR = 0.002

export function getPrice(gameState, bodyId, goodId) {
  const body = findBody(gameState.galaxy, bodyId)
  const good = getGood(goodId)
  let price = good.basePrice
  for (const tag of body.economyTags) {
    const mult = good.tagMultipliers[tag]
    if (mult) price *= 1 + mult
  }
  const override = gameState.economyOverrides[bodyId]?.[goodId] ?? 0
  return Math.max(1, Math.round(price + override))
}

function nudgePrice(gameState, bodyId, goodId, quantityDelta) {
  const good = getGood(goodId)
  if (!gameState.economyOverrides[bodyId]) gameState.economyOverrides[bodyId] = {}
  const current = gameState.economyOverrides[bodyId][goodId] ?? 0
  gameState.economyOverrides[bodyId][goodId] = current + quantityDelta * good.basePrice * TRADE_PRICE_NUDGE_FACTOR
}

function cargoLoad(cargo) {
  return Object.values(cargo).reduce((a, b) => a + b, 0)
}

export function buyGood(gameState, bodyId, goodId, quantity) {
  if (!isBuyableTradeGood(goodId)) throw new Error('This good cannot be bought here — obtain it by probing')
  const shipClass = getShipClass(gameState.player.ship.classId)
  const cargo = gameState.player.ship.cargo
  if (cargoLoad(cargo) + quantity > shipClass.stats.cargoCapacity) throw new Error('Not enough cargo space')
  const cost = getPrice(gameState, bodyId, goodId) * quantity
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  gameState.player.credits -= cost
  cargo[goodId] = (cargo[goodId] ?? 0) + quantity
  nudgePrice(gameState, bodyId, goodId, quantity)
}

export function sellGood(gameState, bodyId, goodId, quantity) {
  const cargo = gameState.player.ship.cargo
  if ((cargo[goodId] ?? 0) < quantity) throw new Error('Not enough cargo to sell')

  const proceeds = getPrice(gameState, bodyId, goodId) * quantity
  cargo[goodId] -= quantity
  if (cargo[goodId] <= 0) delete cargo[goodId]
  gameState.player.credits += proceeds
  nudgePrice(gameState, bodyId, goodId, -quantity)
}

// Mined ore lives in its own hold (game/mining.js), never the general cargo
// hold, so selling it is a separate path from sellGood.
export function sellMinedOre(gameState, bodyId, goodId, quantity) {
  const hold = gameState.player.ship.miningHold
  if ((hold[goodId] ?? 0) < quantity) throw new Error('Not enough ore to sell')

  const proceeds = getPrice(gameState, bodyId, goodId) * quantity
  hold[goodId] -= quantity
  if (hold[goodId] <= 0) delete hold[goodId]
  gameState.player.credits += proceeds
  nudgePrice(gameState, bodyId, goodId, -quantity)
}

// The mirror of sellMinedOre — lets a player buy ore at one market to haul
// and resell wherever it's pricier, same as regular cargo goods, just capped
// by miningCapacity instead of cargoCapacity.
export function buyMinedOre(gameState, bodyId, goodId, quantity) {
  const shipClass = getShipClass(gameState.player.ship.classId)
  const hold = gameState.player.ship.miningHold
  const used = Object.values(hold).reduce((a, b) => a + b, 0)
  if (used + quantity > shipClass.stats.miningCapacity) throw new Error('Not enough mining hold space')
  const cost = getPrice(gameState, bodyId, goodId) * quantity
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  gameState.player.credits -= cost
  hold[goodId] = (hold[goodId] ?? 0) + quantity
  nudgePrice(gameState, bodyId, goodId, quantity)
}

// Shields already regenerate on their own over time (see combat.js's
// regenShields) — only hull and armor persist damage indefinitely, so
// repairing just tops those back up. Cost scales with both how damaged the
// ship is (missing points) and how big it is (hull.length relative to the
// starter ship, so a Hauler costs meaningfully more per point than a Bravia
// Mk2) — a flat per-point rate treated every ship class alike, which didn't
// hold up once ship sizes started to vary a lot. Settlements charge a surcharge
// on top since their parts supply is more limited than a full station's.
const REPAIR_COST_PER_POINT = 5
const REPAIR_SIZE_REFERENCE_LENGTH = 22 // bravia_mk2's hull.length — keeps its rate at exactly the old flat 5cr/point
const SETTLEMENT_REPAIR_SURCHARGE = 0.05

export function repairCost(gameState, body = null) {
  const shipClass = getShipClass(gameState.player.ship.classId)
  const ship = gameState.player.ship
  const missing = shipClass.stats.hull - ship.hull + (shipClass.stats.armor - ship.armor)
  const sizeFactor = shipClass.hull.length / REPAIR_SIZE_REFERENCE_LENGTH
  let cost = missing * REPAIR_COST_PER_POINT * sizeFactor
  if (body?.kind === 'settlement') cost *= 1 + SETTLEMENT_REPAIR_SURCHARGE
  return Math.max(0, Math.round(cost))
}

export function repairShip(gameState, body = null) {
  const shipClass = getShipClass(gameState.player.ship.classId)
  const cost = repairCost(gameState, body)
  if (cost === 0) throw new Error('Ship is already fully repaired')
  if (gameState.player.credits < cost) throw new Error('Not enough credits to repair')

  gameState.player.credits -= cost
  gameState.player.ship.hull = shipClass.stats.hull
  gameState.player.ship.armor = shipClass.stats.armor
}

// Per-station storage — cargo/ore/ship-parts/weapons left behind, and ships
// owned but not currently flown, all keyed by body id (never retrievable at
// a different station, per its own design). Created lazily on first use.
// `weapons` is patched onto older entries too (`??=`, not part of the
// initial default) since it was added after storage entries already existed
// for some players — same pattern as the other per-field fallbacks below.
function storageFor(gameState, bodyId) {
  const storage = (gameState.stationStorage[bodyId] ??= {
    cargo: {},
    miningHold: {},
    shipParts: 0,
    ships: [],
    weapons: {},
    blueprints: {}
  })
  storage.weapons ??= {}
  storage.blueprints ??= {}
  return storage
}

function mergeInto(target, source) {
  for (const [id, qty] of Object.entries(source)) target[id] = (target[id] ?? 0) + qty
}

// A newly bought ship is placed into storage at the station it was bought
// from, not made active automatically — see activateStoredShip below for the
// only way a stored ship (new or previously owned) actually becomes the
// player's active ship.
export function purchaseShip(gameState, bodyId, newClassId, instanceName) {
  const newClass = getShipClass(newClassId)
  if (gameState.player.credits < newClass.price) throw new Error('Not enough credits')

  gameState.player.credits -= newClass.price
  storageFor(gameState, bodyId).ships.push({
    classId: newClassId,
    instanceName,
    hull: newClass.stats.hull,
    shields: newClass.stats.shields,
    armor: newClass.stats.armor,
    cargo: {},
    miningHold: {},
    shipParts: 0,
    equippedWeapons: defaultLoadoutFor(newClass),
    spareWeapons: {},
    blueprints: {}
  })
}

// Renaming only happens after a ship is already owned — a fresh purchase
// just takes the class's stock name (see ui/dockingUI.js's buy-ship
// handler) — since asking for a name at the moment of purchase was the
// exact thing being removed here.
export function renameActiveShip(gameState, newName) {
  const trimmed = newName?.trim()
  if (!trimmed) throw new Error('Ship name cannot be empty')
  gameState.player.ship.instanceName = trimmed
}

export function renameStoredShip(gameState, bodyId, index, newName) {
  const trimmed = newName?.trim()
  if (!trimmed) throw new Error('Ship name cannot be empty')
  const stored = storageFor(gameState, bodyId).ships[index]
  if (!stored) throw new Error('No such stored ship')
  stored.instanceName = trimmed
}

// Swaps the player's active ship for one sitting in storage at this same
// station — the ship that was active takes its place in that storage slot,
// so nothing is ever lost, just parked.
export function activateStoredShip(gameState, bodyId, index) {
  const storage = storageFor(gameState, bodyId)
  const stored = storage.ships[index]
  if (!stored) throw new Error('No such stored ship')
  const current = gameState.player.ship

  storage.ships.splice(index, 1)
  // Park the ship we were flying — keep loadout/cargo/BPs so nothing is lost.
  storage.ships.push({
    classId: current.classId,
    instanceName: current.instanceName,
    hull: current.hull,
    shields: current.shields,
    armor: current.armor,
    cargo: current.cargo,
    miningHold: current.miningHold,
    shipParts: current.shipParts,
    equippedWeapons: current.equippedWeapons ?? {},
    spareWeapons: current.spareWeapons ?? {},
    blueprints: current.blueprints ?? {}
  })
  const storedClass = getShipClass(stored.classId)
  gameState.player.ship = {
    classId: stored.classId,
    instanceName: stored.instanceName,
    hull: stored.hull,
    shields: stored.shields,
    armor: stored.armor,
    cargo: stored.cargo ?? {},
    miningHold: stored.miningHold ?? {},
    shipParts: stored.shipParts ?? 0,
    equippedWeapons: stored.equippedWeapons ?? defaultLoadoutFor(storedClass),
    spareWeapons: stored.spareWeapons ?? {},
    blueprints: stored.blueprints ?? {},
    // Stay where we are in the bay; only the hull/stats change.
    position: [...current.position],
    velocity: [0, 0, 0],
    quaternion: [...current.quaternion],
    throttle: current.throttle ?? 0
  }
}

// Selling a stored ship (rather than the active one, which is never for
// sale) removes it permanently for a fraction of its list price.
const STORED_SHIP_RESALE_FRACTION = 0.5

export function sellStoredShip(gameState, bodyId, index) {
  const storage = storageFor(gameState, bodyId)
  const stored = storage.ships[index]
  if (!stored) throw new Error('No such stored ship')
  storage.ships.splice(index, 1)
  gameState.player.credits += Math.round(getShipClass(stored.classId).price * STORED_SHIP_RESALE_FRACTION)
}

// Whole-hold transfers (not per-good) between the active ship and this
// station's storage — simplest useful shape for "leave stuff behind, pick it
// up later", without needing a per-good deposit/withdraw quantity picker.
export function storeCargo(gameState, bodyId) {
  const storage = storageFor(gameState, bodyId)
  mergeInto(storage.cargo, gameState.player.ship.cargo)
  gameState.player.ship.cargo = {}
}

export function retrieveCargo(gameState, bodyId) {
  const shipClass = getShipClass(gameState.player.ship.classId)
  const storage = storageFor(gameState, bodyId)
  const used = cargoLoad(gameState.player.ship.cargo)
  const incoming = cargoLoad(storage.cargo)
  if (used + incoming > shipClass.stats.cargoCapacity) throw new Error('Not enough cargo space to retrieve everything')
  mergeInto(gameState.player.ship.cargo, storage.cargo)
  storage.cargo = {}
}

export function storeOre(gameState, bodyId) {
  const storage = storageFor(gameState, bodyId)
  mergeInto(storage.miningHold, gameState.player.ship.miningHold)
  gameState.player.ship.miningHold = {}
}

export function retrieveOre(gameState, bodyId) {
  const shipClass = getShipClass(gameState.player.ship.classId)
  const storage = storageFor(gameState, bodyId)
  const used = cargoLoad(gameState.player.ship.miningHold)
  const incoming = cargoLoad(storage.miningHold)
  if (used + incoming > shipClass.stats.miningCapacity) throw new Error('Not enough mining hold space to retrieve everything')
  mergeInto(gameState.player.ship.miningHold, storage.miningHold)
  storage.miningHold = {}
}

export function storeShipParts(gameState, bodyId) {
  const storage = storageFor(gameState, bodyId)
  storage.shipParts += gameState.player.ship.shipParts
  gameState.player.ship.shipParts = 0
}

export function retrieveShipParts(gameState, bodyId) {
  const storage = storageFor(gameState, bodyId)
  gameState.player.ship.shipParts += storage.shipParts
  storage.shipParts = 0
}

// A rare consumable bought at the small fraction of stations/settlements
// that happen to stock it (see hasShipParts in procgen/galaxy.js) — held as
// a simple count on the ship, not a cargo slot, and used in space via
// useShipPart to patch up hull/armor without needing to dock.
export function buyShipParts(gameState, bodyId, quantity) {
  const body = findBody(gameState.galaxy, bodyId)
  if (!body?.hasShipParts) throw new Error('Ship parts are not stocked here')
  const cost = getPrice(gameState, bodyId, SHIP_PARTS_GOOD_ID) * quantity
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  gameState.player.credits -= cost
  gameState.player.ship.shipParts += quantity
}

// One part patches up a flat 10% of the ship's max hull and armor — usable
// anywhere, unlike repairShip, which needs a station/settlement's crew.
const SHIP_PART_REPAIR_FRACTION = 0.1

export function useShipPart(gameState) {
  const ship = gameState.player.ship
  if ((ship.shipParts ?? 0) <= 0) throw new Error('No ship parts to use')
  const shipClass = getShipClass(ship.classId)
  ship.hull = Math.min(shipClass.stats.hull, ship.hull + shipClass.stats.hull * SHIP_PART_REPAIR_FRACTION)
  ship.armor = Math.min(shipClass.stats.armor, ship.armor + shipClass.stats.armor * SHIP_PART_REPAIR_FRACTION)
  ship.shipParts -= 1
}

// Weapons (see data/weapons.js) are bought into this station's storage, not
// straight onto the ship — the only way one actually gets flown is
// equipWeapon below, mirroring how a bought ship sits in storage.ships until
// activateStoredShip swaps it in.
export function buyWeapon(gameState, bodyId, weaponId) {
  const weapon = getWeapon(weaponId)
  if (gameState.player.credits < weapon.price) throw new Error('Not enough credits')
  gameState.player.credits -= weapon.price
  const storage = storageFor(gameState, bodyId)
  storage.weapons[weaponId] = (storage.weapons[weaponId] ?? 0) + 1
}

const WEAPON_RESALE_FRACTION = 0.5

export function sellStoredWeapon(gameState, bodyId, weaponId) {
  const storage = storageFor(gameState, bodyId)
  if (!(storage.weapons[weaponId] > 0)) throw new Error('No such weapon in storage')
  storage.weapons[weaponId] -= 1
  if (storage.weapons[weaponId] <= 0) delete storage.weapons[weaponId]
  gameState.player.credits += Math.round(getWeapon(weaponId).price * WEAPON_RESALE_FRACTION)
}

// Swaps whatever's equipped at this hardpoint for a weapon sitting in this
// station's storage *or* the ship's spareWeapons (wreck salvage). The weapon
// that was equipped goes into station storage (never destroyed).
export function equipWeapon(gameState, bodyId, hardpointId, weaponId) {
  const ship = gameState.player.ship
  const shipClass = getShipClass(ship.classId)
  const hardpoint = shipClass.hardpoints.find((hp) => hp.id === hardpointId)
  if (!hardpoint) throw new Error('No such hardpoint')
  const mountType = hardpoint.type === 'missile' ? 'missile' : 'laser'
  const weapon = getWeapon(weaponId)
  if (weapon.category !== mountType) throw new Error('That weapon does not fit this hardpoint')

  const storage = storageFor(gameState, bodyId)
  ship.spareWeapons ??= {}
  ship.equippedWeapons ??= {}
  const previousId = ship.equippedWeapons[hardpointId] ?? BASE_WEAPON_ID[mountType]
  if (previousId === weaponId) return

  const fromStorage = (storage.weapons[weaponId] ?? 0) > 0
  const fromSpare = (ship.spareWeapons[weaponId] ?? 0) > 0
  if (!fromStorage && !fromSpare) throw new Error('That weapon is not available here')

  if (fromStorage) {
    storage.weapons[weaponId] -= 1
    if (storage.weapons[weaponId] <= 0) delete storage.weapons[weaponId]
  } else {
    ship.spareWeapons[weaponId] -= 1
    if (ship.spareWeapons[weaponId] <= 0) delete ship.spareWeapons[weaponId]
  }
  storage.weapons[previousId] = (storage.weapons[previousId] ?? 0) + 1
  ship.equippedWeapons[hardpointId] = weaponId
}

// Sell a salvaged spare weapon from the ship (shipyard only in the UI).
export function sellCarriedWeapon(gameState, weaponId) {
  const ship = gameState.player.ship
  ship.spareWeapons ??= {}
  if (!(ship.spareWeapons[weaponId] > 0)) throw new Error('No such weapon on board')
  ship.spareWeapons[weaponId] -= 1
  if (ship.spareWeapons[weaponId] <= 0) delete ship.spareWeapons[weaponId]
  gameState.player.credits += Math.round(getWeapon(weaponId).price * WEAPON_RESALE_FRACTION)
}

// Move all spare weapons into this station's storage (optional stash).
export function storeCarriedWeapons(gameState, bodyId) {
  const ship = gameState.player.ship
  ship.spareWeapons ??= {}
  const storage = storageFor(gameState, bodyId)
  for (const [weaponId, qty] of Object.entries(ship.spareWeapons)) {
    if (qty <= 0) continue
    storage.weapons[weaponId] = (storage.weapons[weaponId] ?? 0) + qty
  }
  ship.spareWeapons = {}
}

/** True if a station/settlement storage entry holds anything of value. */
export function storageHasAssets(storage) {
  if (!storage) return false
  if ((storage.ships?.length ?? 0) > 0) return true
  if ((storage.shipParts ?? 0) > 0) return true
  const qtyMaps = [storage.cargo, storage.miningHold, storage.weapons, storage.blueprints]
  for (const map of qtyMaps) {
    if (!map) continue
    for (const qty of Object.values(map)) {
      if (qty > 0) return true
    }
  }
  return false
}

/**
 * System ids (other than the player's current system) where the player has
 * parked ships, stored cargo/ore/parts/weapons/blueprints, or an in-progress
 * craft job. Used by the galaxy map green asset rings.
 */
export function playerAssetSystemIds(gameState) {
  const ids = new Set()
  const currentId = gameState.player?.currentSystemId
  const galaxy = gameState.galaxy
  if (!galaxy) return ids

  for (const [bodyId, storage] of Object.entries(gameState.stationStorage ?? {})) {
    if (!storageHasAssets(storage)) continue
    const system = findSystemOfBody(galaxy, bodyId)
    if (!system || system.id === currentId) continue
    ids.add(system.id)
  }

  // In-progress crafts (finished jobs are removed by updateCraftingJobs).
  for (const job of gameState.craftingJobs ?? []) {
    if (!job?.bodyId) continue
    const system = findSystemOfBody(galaxy, job.bodyId)
    if (!system || system.id === currentId) continue
    ids.add(system.id)
  }

  return ids
}

export { GOODS }
