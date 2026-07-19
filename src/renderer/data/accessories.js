// Buyable ship accessories — fitted into optional accessory slots (not
// hardpoints). Starter Light Runner has one slot; other hulls may have up to 4.
// Further accessory types can be added here later.

export const MAX_ACCESSORY_SLOTS = 4

/** +400% ore hold while fitted → capacity becomes 5× base. */
export const EXTRA_ORE_STORAGE_ID = 'extra_ore_storage'
export const EXTRA_ORE_STORAGE_BONUS_FRAC = 4

export const ACCESSORIES = [
  {
    id: 'autopilot',
    name: 'Autopilot',
    description:
      'When a multi-hop route is plotted, engages consecutive hyperspace jumps with a short pause between systems.',
    price: 10000
  },
  {
    id: EXTRA_ORE_STORAGE_ID,
    name: 'Extra Ore Storage',
    description:
      'While equipped, expands the ore hold by 400% of the hull’s base capacity (5× total).',
    price: 12000
  }
]

export function getAccessory(id) {
  const acc = ACCESSORIES.find((a) => a.id === id)
  if (!acc) throw new Error(`Unknown accessory: ${id}`)
  return acc
}

export function accessorySlotCount(shipClass) {
  const n = shipClass?.accessorySlots ?? 0
  return Math.max(0, Math.min(MAX_ACCESSORY_SLOTS, Math.floor(n)))
}

/** Empty loadout array sized to the class's accessory slots. */
export function defaultAccessoriesFor(shipClass) {
  return Array(accessorySlotCount(shipClass)).fill(null)
}

/**
 * Resize / pad an equippedAccessories array to match the class slot count.
 * Returns { equipped, excess } where excess are accessory ids that no longer fit.
 */
export function normalizeAccessories(equipped, shipClass) {
  const n = accessorySlotCount(shipClass)
  const prev = Array.isArray(equipped) ? equipped : []
  const next = Array(n).fill(null)
  const excess = []
  for (let i = 0; i < prev.length; i++) {
    const id = prev[i]
    if (!id) continue
    if (i < n) next[i] = id
    else excess.push(id)
  }
  return { equipped: next, excess }
}

export function shipHasAccessory(ship, accessoryId) {
  if (!ship || !accessoryId) return false
  const eq = ship.equippedAccessories
  if (!Array.isArray(eq)) return false
  return eq.includes(accessoryId)
}

export function shipHasAutopilot(ship) {
  return shipHasAccessory(ship, 'autopilot')
}

/**
 * Ore hold capacity with accessories applied.
 * Extra Ore Storage: +400% of base while equipped (5× total).
 */
export function effectiveMiningCapacity(ship, shipClass) {
  const base = shipClass?.stats?.miningCapacity ?? 0
  if (shipHasAccessory(ship, EXTRA_ORE_STORAGE_ID)) {
    return Math.round(base * (1 + EXTRA_ORE_STORAGE_BONUS_FRAC))
  }
  return base
}
