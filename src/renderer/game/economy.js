import { GOODS, getGood } from '../data/goods.js'
import { getShipClass } from '../data/shipClasses.js'
import { findBody } from '../procgen/galaxy.js'

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

export function purchaseShip(gameState, newClassId, instanceName) {
  const newClass = getShipClass(newClassId)
  if (gameState.player.credits < newClass.price) throw new Error('Not enough credits')

  gameState.player.credits -= newClass.price
  const oldShip = gameState.player.ship
  gameState.player.ship = {
    classId: newClassId,
    instanceName,
    hull: newClass.stats.hull,
    shields: newClass.stats.shields,
    armor: newClass.stats.armor,
    cargo: {},
    miningHold: {},
    position: oldShip.position,
    velocity: [0, 0, 0],
    quaternion: oldShip.quaternion
  }
}

export { GOODS }
