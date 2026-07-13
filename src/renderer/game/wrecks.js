import { GOODS, MINED_ORE_GOOD_IDS, SHIP_PARTS_GOOD_ID } from '../data/goods.js'

let wreckCounter = 0

// Only ordinary trade goods drop from a wreck — mined ore and ship parts
// each have their own handling below, not a per-good roll from this table.
const LOOTABLE_GOODS = GOODS.filter((g) => !MINED_ORE_GOOD_IDS.includes(g.id) && g.id !== SHIP_PARTS_GOOD_ID)
const SHIP_PART_DROP_CHANCE = 0.15
// ~30 minutes of simTime (gameState.simTime accumulates real dt, so this is
// wall-clock-equivalent, not affected by frame rate).
export const WRECK_DESPAWN_S = 1800

// Loot is rolled once at spawn time (not re-rolled per loot attempt) — small
// amounts of a single standard trade good, plus a rare chance at a ship part.
export function spawnWreck(position, simTime, rng = Math.random) {
  const good = LOOTABLE_GOODS[Math.floor(rng() * LOOTABLE_GOODS.length)]
  const loot = { cargo: { [good.id]: 1 + Math.floor(rng() * 3) } }
  if (rng() < SHIP_PART_DROP_CHANCE) loot.shipParts = 1
  return { id: `wreck-${wreckCounter++}`, position: [...position], spawnedAt: simTime, loot }
}

// Called once per frame from main.js — cheap given how few wrecks exist at
// once, and simplest way to make "left behind, eventually despawns" true
// without a separate timer per wreck.
export function pruneWrecks(gameState) {
  gameState.wrecks = gameState.wrecks.filter((w) => gameState.simTime - w.spawnedAt < WRECK_DESPAWN_S)
}

// Adds as much of the wreck's loot as fits in the ship's cargo hold (ship
// parts have no cap) and removes the wreck — a wreck disappears once looted,
// per its own design, regardless of whether every last item fit.
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

  gameState.wrecks = gameState.wrecks.filter((w) => w.id !== wreckId)
  return wreck.loot
}
