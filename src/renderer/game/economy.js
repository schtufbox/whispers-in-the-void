import {
  GOODS,
  getGood,
  SHIP_PARTS_GOOD_ID,
  SURVEY_DATA_GOOD_ID,
  MINED_ORE_GOOD_IDS,
  isBuyableTradeGood
} from '../data/goods.js'
import { getShipClass } from '../data/shipClasses.js'
import { findBody, findSystemOfBody, coreFraction } from '../procgen/galaxy.js'
import { getWeapon, BASE_WEAPON_ID, defaultLoadoutFor } from '../data/weapons.js'
import {
  getAccessory,
  defaultAccessoriesFor,
  normalizeAccessories,
  accessorySlotCount,
  effectiveMiningCapacity
} from '../data/accessories.js'
import { repairDrones, ensureDrones, teleportDronesToBay } from './drones.js'

const TRADE_PRICE_NUDGE_FACTOR = 0.002
/** At full rim (coreFraction 1), rare ores are this fraction cheaper. */
const RIM_RARE_ORE_DISCOUNT = 0.2
/** When bay stock is empty vs baseline, price can rise by up to this fraction. */
const SCARCITY_PRICE_CAP = 0.4

const LOW_GRADE_ORE_IDS = new Set(['raw_ore', 'rich_ore'])
const RARE_ORE_IDS = new Set(['exotic_ore', 'quantum_ore'])

// Core systems: deep low-grade ore shelves, thin rare. Rim: reverse.
const ORE_STOCK_CORE = { raw_ore: 160, rich_ore: 105, exotic_ore: 10, quantum_ore: 2 }
const ORE_STOCK_RIM = { raw_ore: 14, rich_ore: 22, exotic_ore: 90, quantum_ore: 58 }

function stockHash(bodyId, goodId) {
  let h = 2166136261
  const s = `${bodyId}\0${goodId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Initial market depth for a body/good (before player trades).
 * @param {object|null} system — used for rim/core ore depth (coreFraction)
 */
export function defaultMarketStock(body, goodId, system = null) {
  if (!body) return 0
  if (goodId === SURVEY_DATA_GOOD_ID) return 0
  if (goodId === SHIP_PARTS_GOOD_ID) return body.hasShipParts ? 6 : 0

  const rim = system?.galaxyPosition ? coreFraction(system) : 0
  const h = stockHash(body.id, goodId)

  if (MINED_ORE_GOOD_IDS.includes(goodId)) {
    const core = ORE_STOCK_CORE[goodId] ?? 20
    const rimDepth = ORE_STOCK_RIM[goodId] ?? 20
    let base = Math.round(core * (1 - rim) + rimDepth * rim)
    if (body.kind === 'settlement') base = Math.round(base * 0.55)
    const jitter = (h % 17) - 8
    return Math.max(0, base + jitter)
  }

  // Trade goods: wide per-bay variance. Local production deepens stock;
  // demand tags thin it (they also raise price in getPrice).
  const good = getGood(goodId)
  let base = 35 + (h % 100) // 35–134
  for (const tag of body.economyTags ?? []) {
    const mult = good.tagMultipliers?.[tag]
    if (mult == null) continue
    if (mult < 0) base += Math.round(80 * -mult)
    else if (mult > 0) {
      // High demand → scarce shelves
      base = Math.max(2, Math.round(base * (1 - 0.6 * Math.min(1.2, mult))))
    }
  }
  if (body.kind === 'settlement') base = Math.round(base * 0.45)
  return Math.max(0, base)
}

function marketStockMap(gameState, bodyId) {
  gameState.marketStock ??= {}
  return (gameState.marketStock[bodyId] ??= {})
}

/**
 * Units this station/settlement currently has for sale.
 * First access seeds from economy + rim position; thereafter tracks buy/sell.
 */
export function getMarketAvailable(gameState, bodyId, goodId) {
  const map = marketStockMap(gameState, bodyId)
  if (map[goodId] === undefined) {
    const body = findBody(gameState.galaxy, bodyId)
    const system = findSystemOfBody(gameState.galaxy, bodyId)
    map[goodId] = defaultMarketStock(body, goodId, system)
  }
  return Math.max(0, Math.floor(map[goodId] ?? 0))
}

function consumeMarketStock(gameState, bodyId, goodId, qty) {
  const available = getMarketAvailable(gameState, bodyId, goodId)
  if (available < qty) throw new Error('Not enough stock available at this bay')
  marketStockMap(gameState, bodyId)[goodId] = available - qty
}

function restockMarket(gameState, bodyId, goodId, qty) {
  const available = getMarketAvailable(gameState, bodyId, goodId)
  marketStockMap(gameState, bodyId)[goodId] = available + qty
}

/**
 * Unit price at this bay. Economy tags set baseline demand/supply.
 * Thin stock raises price (they'll charge more when short). Outer rim:
 * rare ores ~20% cheaper; low-grade ore stays cheap (no rim markup).
 */
export function getPrice(gameState, bodyId, goodId) {
  const body = findBody(gameState.galaxy, bodyId)
  const system = findSystemOfBody(gameState.galaxy, bodyId)
  const good = getGood(goodId)
  let price = good.basePrice

  for (const tag of body?.economyTags ?? []) {
    const mult = good.tagMultipliers?.[tag]
    if (mult) price *= 1 + mult
  }

  // Rim ore pricing — rare ores discount toward the rim; low-grade stays low.
  if (MINED_ORE_GOOD_IDS.includes(goodId) && system?.galaxyPosition) {
    const rim = coreFraction(system)
    if (RARE_ORE_IDS.has(goodId)) {
      price *= 1 - RIM_RARE_ORE_DISCOUNT * rim
    }
    // Low-grade: slight core industrial demand only via tags; no rim inflation.
    if (LOW_GRADE_ORE_IDS.has(goodId) && rim > 0.55) {
      // Keep rim low-grade soft: mild extra soft floor toward basePrice
      price = Math.min(price, good.basePrice * 1.05)
    }
  }

  // Scarcity premium: empty shelves → pay/charge more (up to SCARCITY_PRICE_CAP).
  const baseline = defaultMarketStock(body, goodId, system)
  if (baseline > 0) {
    const available = getMarketAvailable(gameState, bodyId, goodId)
    const scarcity = Math.max(0, Math.min(1, 1 - available / baseline))
    price *= 1 + scarcity * SCARCITY_PRICE_CAP
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
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const available = getMarketAvailable(gameState, bodyId, goodId)
  if (available < qty) throw new Error('Not enough stock available at this bay')
  // Purchases go into station storage — player transfers to ship separately.
  const cost = getPrice(gameState, bodyId, goodId) * qty
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  consumeMarketStock(gameState, bodyId, goodId, qty)
  gameState.player.credits -= cost
  const storage = storageFor(gameState, bodyId)
  storage.cargo[goodId] = (storage.cargo[goodId] ?? 0) + qty
  nudgePrice(gameState, bodyId, goodId, qty)
}

// Sell from station storage cargo (haul goods off the ship first via Storage).
export function sellGood(gameState, bodyId, goodId, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const storage = storageFor(gameState, bodyId)
  const cargo = storage.cargo
  if ((cargo[goodId] ?? 0) < qty) throw new Error('Not enough in station storage to sell')

  const proceeds = getPrice(gameState, bodyId, goodId) * qty
  cargo[goodId] -= qty
  if (cargo[goodId] <= 0) delete cargo[goodId]
  gameState.player.credits += proceeds
  restockMarket(gameState, bodyId, goodId, qty)
  nudgePrice(gameState, bodyId, goodId, -qty)
}

// Sell ore from station storage mining bay (transfer from ship on Industry first).
export function sellMinedOre(gameState, bodyId, goodId, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const storage = storageFor(gameState, bodyId)
  const hold = storage.miningHold
  if ((hold[goodId] ?? 0) < qty) throw new Error('Not enough ore in station storage to sell')

  const proceeds = getPrice(gameState, bodyId, goodId) * qty
  hold[goodId] -= qty
  if (hold[goodId] <= 0) delete hold[goodId]
  gameState.player.credits += proceeds
  restockMarket(gameState, bodyId, goodId, qty)
  nudgePrice(gameState, bodyId, goodId, -qty)
}

// Buy ore into station storage (haul to ship via Industry / transfer).
export function buyMinedOre(gameState, bodyId, goodId, quantity) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const available = getMarketAvailable(gameState, bodyId, goodId)
  if (available < qty) throw new Error('Not enough stock available at this bay')
  const cost = getPrice(gameState, bodyId, goodId) * qty
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  consumeMarketStock(gameState, bodyId, goodId, qty)
  gameState.player.credits -= cost
  const storage = storageFor(gameState, bodyId)
  storage.miningHold[goodId] = (storage.miningHold[goodId] ?? 0) + qty
  nudgePrice(gameState, bodyId, goodId, qty)
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
  // Drones may still need repair even if the hull is full.
  const dronesNeed = (gameState.player.ship.drones ?? []).some(
    (d) => d.destroyed || d.hull < (d.maxHull ?? d.hull) || d.armor < (d.maxArmor ?? d.armor)
  )
  if (cost === 0 && !dronesNeed) throw new Error('Ship is already fully repaired')
  if (cost > 0 && gameState.player.credits < cost) throw new Error('Not enough credits to repair')

  if (cost > 0) {
    gameState.player.credits -= cost
    gameState.player.ship.hull = shipClass.stats.hull
    gameState.player.ship.armor = shipClass.stats.armor
  }
  // Station repair also restores combat drones (ship parts do not).
  repairDrones(gameState.player.ship)
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
    accessories: {},
    blueprints: {}
  })
  storage.weapons ??= {}
  storage.accessories ??= {}
  storage.blueprints ??= {}
  return storage
}

function returnAccessoriesToStorage(storage, accessoryIds) {
  for (const id of accessoryIds) {
    if (!id) continue
    storage.accessories[id] = (storage.accessories[id] ?? 0) + 1
  }
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
  const hull = {
    classId: newClassId,
    instanceName,
    hull: newClass.stats.hull,
    shields: newClass.stats.shields,
    armor: newClass.stats.armor,
    cargo: {},
    miningHold: {},
    shipParts: 0,
    equippedWeapons: defaultLoadoutFor(newClass),
    equippedAccessories: defaultAccessoriesFor(newClass),
    spareWeapons: {},
    blueprints: {},
    drones: []
  }
  ensureDrones(hull, newClass)
  storageFor(gameState, bodyId).ships.push(hull)
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
  const currentClass = getShipClass(current.classId)
  const parkedAcc = normalizeAccessories(current.equippedAccessories, currentClass)
  teleportDronesToBay(current)
  // Park the ship we were flying — keep loadout/cargo/BPs/drones so nothing is lost.
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
    equippedAccessories: parkedAcc.equipped,
    spareWeapons: current.spareWeapons ?? {},
    blueprints: current.blueprints ?? {},
    drones: current.drones ?? []
  })
  returnAccessoriesToStorage(storage, parkedAcc.excess)

  const storedClass = getShipClass(stored.classId)
  const storedAcc = normalizeAccessories(
    stored.equippedAccessories ?? defaultAccessoriesFor(storedClass),
    storedClass
  )
  returnAccessoriesToStorage(storage, storedAcc.excess)
  const nextShip = {
    classId: stored.classId,
    instanceName: stored.instanceName,
    hull: stored.hull,
    shields: stored.shields,
    armor: stored.armor,
    cargo: stored.cargo ?? {},
    miningHold: stored.miningHold ?? {},
    shipParts: stored.shipParts ?? 0,
    equippedWeapons: stored.equippedWeapons ?? defaultLoadoutFor(storedClass),
    equippedAccessories: storedAcc.equipped,
    spareWeapons: stored.spareWeapons ?? {},
    blueprints: stored.blueprints ?? {},
    drones: stored.drones ?? [],
    // Stay where we are in the bay; only the hull/stats change.
    position: [...current.position],
    velocity: [0, 0, 0],
    quaternion: [...current.quaternion],
    throttle: current.throttle ?? 0
  }
  ensureDrones(nextShip, storedClass)
  teleportDronesToBay(nextShip)
  gameState.player.ship = nextShip
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
  const ship = gameState.player.ship
  const shipClass = getShipClass(ship.classId)
  const storage = storageFor(gameState, bodyId)
  const used = cargoLoad(ship.miningHold)
  const incoming = cargoLoad(storage.miningHold)
  if (used + incoming > effectiveMiningCapacity(ship, shipClass)) {
    throw new Error('Not enough ore hold space to retrieve everything')
  }
  mergeInto(ship.miningHold, storage.miningHold)
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

/**
 * Per-item storage transfer for drag-and-drop (Storage tab).
 * direction: 'toStation' | 'toShip'
 * kind: 'cargo' | 'ore' | 'parts'
 * Returns { moved, requested, capacityLimited }.
 * capacityLimited true when ship hold couldn't take the full amount.
 */
export function transferStorageItem(gameState, bodyId, kind, itemId, quantity, direction) {
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) return { moved: 0, requested: 0, capacityLimited: false }

  const ship = gameState.player.ship
  const shipClass = getShipClass(ship.classId)
  const storage = storageFor(gameState, bodyId)

  if (kind === 'parts') {
    if (direction === 'toStation') {
      const available = ship.shipParts ?? 0
      const moved = Math.min(qty, available)
      ship.shipParts = available - moved
      storage.shipParts = (storage.shipParts ?? 0) + moved
      return { moved, requested: qty, capacityLimited: false }
    }
    const available = storage.shipParts ?? 0
    const moved = Math.min(qty, available)
    storage.shipParts = available - moved
    ship.shipParts = (ship.shipParts ?? 0) + moved
    return { moved, requested: qty, capacityLimited: false }
  }

  if (kind === 'cargo') {
    if (direction === 'toStation') {
      const available = ship.cargo[itemId] ?? 0
      const moved = Math.min(qty, available)
      if (moved <= 0) return { moved: 0, requested: qty, capacityLimited: false }
      ship.cargo[itemId] = available - moved
      if (ship.cargo[itemId] <= 0) delete ship.cargo[itemId]
      storage.cargo[itemId] = (storage.cargo[itemId] ?? 0) + moved
      return { moved, requested: qty, capacityLimited: false }
    }
    const available = storage.cargo[itemId] ?? 0
    const used = cargoLoad(ship.cargo)
    const free = Math.max(0, shipClass.stats.cargoCapacity - used)
    const moved = Math.min(qty, available, free)
    const capacityLimited = moved < Math.min(qty, available)
    if (moved > 0) {
      storage.cargo[itemId] = available - moved
      if (storage.cargo[itemId] <= 0) delete storage.cargo[itemId]
      ship.cargo[itemId] = (ship.cargo[itemId] ?? 0) + moved
    }
    return { moved, requested: qty, capacityLimited }
  }

  if (kind === 'ore') {
    if (direction === 'toStation') {
      const available = ship.miningHold[itemId] ?? 0
      const moved = Math.min(qty, available)
      if (moved <= 0) return { moved: 0, requested: qty, capacityLimited: false }
      ship.miningHold[itemId] = available - moved
      if (ship.miningHold[itemId] <= 0) delete ship.miningHold[itemId]
      storage.miningHold[itemId] = (storage.miningHold[itemId] ?? 0) + moved
      return { moved, requested: qty, capacityLimited: false }
    }
    const available = storage.miningHold[itemId] ?? 0
    const used = cargoLoad(ship.miningHold)
    const free = Math.max(0, effectiveMiningCapacity(ship, shipClass) - used)
    const moved = Math.min(qty, available, free)
    const capacityLimited = moved < Math.min(qty, available)
    if (moved > 0) {
      storage.miningHold[itemId] = available - moved
      if (storage.miningHold[itemId] <= 0) delete storage.miningHold[itemId]
      ship.miningHold[itemId] = (ship.miningHold[itemId] ?? 0) + moved
    }
    return { moved, requested: qty, capacityLimited }
  }

  throw new Error(`Unknown storage kind: ${kind}`)
}

// A rare consumable bought at the small fraction of stations/settlements
// that happen to stock it (see hasShipParts in procgen/galaxy.js) — held as
// a simple count on the ship, not a cargo slot, and used in space via
// useShipPart to patch up hull/armor without needing to dock.
export function buyShipParts(gameState, bodyId, quantity) {
  const body = findBody(gameState.galaxy, bodyId)
  if (!body?.hasShipParts) throw new Error('Ship parts are not stocked here')
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const cost = getPrice(gameState, bodyId, SHIP_PARTS_GOOD_ID) * qty
  if (gameState.player.credits < cost) throw new Error('Not enough credits')

  gameState.player.credits -= cost
  // Into station bay — transfer to ship when needed.
  const storage = storageFor(gameState, bodyId)
  storage.shipParts = (storage.shipParts ?? 0) + qty
}

// One part patches up a flat 10% of the ship's max hull and armor — usable
// anywhere, unlike repairShip, which needs a station/settlement's crew.
const SHIP_PART_REPAIR_FRACTION = 0.1

export function useShipPart(gameState) {
  const ship = gameState.player.ship
  if ((ship.shipParts ?? 0) <= 0) throw new Error('No ship parts to use')
  const shipClass = getShipClass(ship.classId)
  // Already full — do not consume a part.
  if (ship.hull >= shipClass.stats.hull && ship.armor >= shipClass.stats.armor) {
    throw new Error('No repair needed')
  }
  ship.hull = Math.min(shipClass.stats.hull, ship.hull + shipClass.stats.hull * SHIP_PART_REPAIR_FRACTION)
  ship.armor = Math.min(shipClass.stats.armor, ship.armor + shipClass.stats.armor * SHIP_PART_REPAIR_FRACTION)
  ship.shipParts -= 1
}

// Weapons (see data/weapons.js) are bought into this station's storage, not
// straight onto the ship — the only way one actually gets flown is
// equipWeapon below, mirroring how a bought ship sits in storage.ships until
// activateStoredShip swaps it in.
export function buyWeapon(gameState, bodyId, weaponId, quantity = 1) {
  const weapon = getWeapon(weaponId)
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const cost = weapon.price * qty
  if (gameState.player.credits < cost) throw new Error('Not enough credits')
  gameState.player.credits -= cost
  const storage = storageFor(gameState, bodyId)
  storage.weapons[weaponId] = (storage.weapons[weaponId] ?? 0) + qty
}

const WEAPON_RESALE_FRACTION = 0.5

export function sellStoredWeapon(gameState, bodyId, weaponId, quantity = 1) {
  const storage = storageFor(gameState, bodyId)
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  if ((storage.weapons[weaponId] ?? 0) < qty) throw new Error('No such weapon in storage')
  storage.weapons[weaponId] -= qty
  if (storage.weapons[weaponId] <= 0) delete storage.weapons[weaponId]
  gameState.player.credits += Math.round(getWeapon(weaponId).price * WEAPON_RESALE_FRACTION) * qty
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
export function sellCarriedWeapon(gameState, weaponId, quantity = 1) {
  const ship = gameState.player.ship
  ship.spareWeapons ??= {}
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  if ((ship.spareWeapons[weaponId] ?? 0) < qty) throw new Error('No such weapon on board')
  ship.spareWeapons[weaponId] -= qty
  if (ship.spareWeapons[weaponId] <= 0) delete ship.spareWeapons[weaponId]
  gameState.player.credits += Math.round(getWeapon(weaponId).price * WEAPON_RESALE_FRACTION) * qty
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

// Accessories (see data/accessories.js) buy into station storage, then equip
// into ship.equippedAccessories slots from the Shipyard Loadout panel.
export function buyAccessory(gameState, bodyId, accessoryId, quantity = 1) {
  const accessory = getAccessory(accessoryId)
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  const cost = accessory.price * qty
  if (gameState.player.credits < cost) throw new Error('Not enough credits')
  gameState.player.credits -= cost
  const storage = storageFor(gameState, bodyId)
  storage.accessories[accessoryId] = (storage.accessories[accessoryId] ?? 0) + qty
}

const ACCESSORY_RESALE_FRACTION = 0.5

export function sellStoredAccessory(gameState, bodyId, accessoryId, quantity = 1) {
  const storage = storageFor(gameState, bodyId)
  const qty = Math.max(0, Math.floor(Number(quantity) || 0))
  if (qty < 1) throw new Error('Invalid quantity')
  if ((storage.accessories[accessoryId] ?? 0) < qty) throw new Error('No such accessory in storage')
  storage.accessories[accessoryId] -= qty
  if (storage.accessories[accessoryId] <= 0) delete storage.accessories[accessoryId]
  gameState.player.credits += Math.round(getAccessory(accessoryId).price * ACCESSORY_RESALE_FRACTION) * qty
}

/**
 * Fit or clear an accessory slot on the active ship.
 * accessoryId null/'' unequips the slot (module returns to station storage).
 */
export function equipAccessory(gameState, bodyId, slotIndex, accessoryId) {
  const ship = gameState.player.ship
  const shipClass = getShipClass(ship.classId)
  const slots = accessorySlotCount(shipClass)
  const idx = Number(slotIndex)
  if (!Number.isInteger(idx) || idx < 0 || idx >= slots) throw new Error('No such accessory slot')

  const storage = storageFor(gameState, bodyId)
  const normalized = normalizeAccessories(ship.equippedAccessories, shipClass)
  returnAccessoriesToStorage(storage, normalized.excess)
  ship.equippedAccessories = normalized.equipped

  const wantId = accessoryId || null
  const previousId = ship.equippedAccessories[idx] ?? null
  if (previousId === wantId) return

  if (wantId) {
    getAccessory(wantId) // validate id
    // One of each accessory type per ship (no double Autopilot, etc.).
    if (ship.equippedAccessories.some((id, i) => id === wantId && i !== idx)) {
      throw new Error('That accessory is already fitted on this ship')
    }
    if (!((storage.accessories[wantId] ?? 0) > 0)) throw new Error('That accessory is not available here')
    storage.accessories[wantId] -= 1
    if (storage.accessories[wantId] <= 0) delete storage.accessories[wantId]
  }

  if (previousId) {
    storage.accessories[previousId] = (storage.accessories[previousId] ?? 0) + 1
  }
  ship.equippedAccessories[idx] = wantId
}

/** True if a station/settlement storage entry holds anything of value. */
export function storageHasAssets(storage) {
  if (!storage) return false
  if ((storage.ships?.length ?? 0) > 0) return true
  if ((storage.shipParts ?? 0) > 0) return true
  const qtyMaps = [storage.cargo, storage.miningHold, storage.weapons, storage.accessories, storage.blueprints]
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
