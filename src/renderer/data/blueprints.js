import { SHIP_CLASSES, getShipClass } from './shipClasses.js'
import { WEAPONS, getWeapon } from './weapons.js'
import { MINED_ORE_GOOD_IDS } from './goods.js'

// Blueprint ids: "ship:<classId>" | "weapon:<weaponId>"
// Crafted from raw mined ore at station Industry (game/crafting.js).

export function blueprintIdForShip(classId) {
  return `ship:${classId}`
}

export function blueprintIdForWeapon(weaponId) {
  return `weapon:${weaponId}`
}

export function parseBlueprintId(blueprintId) {
  if (!blueprintId || typeof blueprintId !== 'string') return null
  const i = blueprintId.indexOf(':')
  if (i < 1) return null
  const kind = blueprintId.slice(0, i)
  const itemId = blueprintId.slice(i + 1)
  if ((kind !== 'ship' && kind !== 'weapon') || !itemId) return null
  return { kind, itemId }
}

export function getBlueprint(blueprintId) {
  const parsed = parseBlueprintId(blueprintId)
  if (!parsed) throw new Error(`Unknown blueprint: ${blueprintId}`)
  if (parsed.kind === 'ship') {
    const shipClass = getShipClass(parsed.itemId)
    return {
      id: blueprintId,
      kind: 'ship',
      itemId: shipClass.id,
      name: `${shipClass.name} Blueprint`,
      itemName: shipClass.name,
      listPrice: shipClass.price
    }
  }
  const weapon = getWeapon(parsed.itemId)
  return {
    id: blueprintId,
    kind: 'weapon',
    itemId: weapon.id,
    name: `${weapon.name} Blueprint`,
    itemName: weapon.name,
    listPrice: weapon.price
  }
}

/** All craftable blueprints (ships + buyable weapons). Free base weapons excluded. */
export function allBlueprints() {
  const list = []
  for (const shipClass of SHIP_CLASSES) {
    list.push(getBlueprint(blueprintIdForShip(shipClass.id)))
  }
  for (const weapon of WEAPONS) {
    if (weapon.price <= 0) continue
    list.push(getBlueprint(blueprintIdForWeapon(weapon.id)))
  }
  return list
}

// Craft bands: weapons stay cheap/fast in the low band; ships occupy the upper
// duration/cost range so a hull is always a bigger commitment than a hardpoint.
export const WEAPON_COMPLEXITY_MAX = 0.2
export const SHIP_COMPLEXITY_MIN = 0.62

function relativePriceWithinKind(kind, listPrice) {
  let min = Infinity
  let max = 0
  for (const bp of allBlueprints()) {
    if (bp.kind !== kind) continue
    const c = Math.max(1, bp.listPrice)
    if (c < min) min = c
    if (c > max) max = c
  }
  max = Math.max(min + 1, max)
  const c = Math.max(1, listPrice)
  return (Math.log(c) - Math.log(min)) / (Math.log(max) - Math.log(min))
}

/**
 * 0–1 craft complexity. Weapons map into 0…WEAPON_COMPLEXITY_MAX; ships into
 * SHIP_COMPLEXITY_MIN…1 (log-scaled by list price within each kind).
 */
export function blueprintComplexity(blueprintId) {
  const bp = getBlueprint(blueprintId)
  const r = relativePriceWithinKind(bp.kind, bp.listPrice)
  if (bp.kind === 'weapon') return r * WEAPON_COMPLEXITY_MAX
  return SHIP_COMPLEXITY_MIN + r * (1 - SHIP_COMPLEXITY_MIN)
}

// Craft duration: 1 minute (tiny weapon) → 4 hours (largest ships), wall-clock.
export const CRAFT_DURATION_MIN_S = 60
export const CRAFT_DURATION_MAX_S = 4 * 60 * 60

export function craftDurationS(blueprintId) {
  const t = blueprintComplexity(blueprintId)
  return Math.round(CRAFT_DURATION_MIN_S + t * (CRAFT_DURATION_MAX_S - CRAFT_DURATION_MIN_S))
}

/**
 * Ore recipe in mined-ore units (raw/rich/exotic/quantum).
 * Weapons: small raw/rich stacks. Ships: large totals with rarer tiers.
 */
export function oreCostForBlueprint(blueprintId) {
  const bp = getBlueprint(blueprintId)
  const t = blueprintComplexity(blueprintId)
  // Weapons ~5–45 units; ships ~140–230 (driven by their higher t band).
  const total = bp.kind === 'weapon'
    ? Math.round(5 + (t / WEAPON_COMPLEXITY_MAX) * 40)
    : Math.round(140 + ((t - SHIP_COMPLEXITY_MIN) / (1 - SHIP_COMPLEXITY_MIN)) * 90)
  // Higher t shifts mass into rarer tiers (ships only hit meaningful exotic/quantum).
  const quantum = Math.floor(total * t * t * 0.35)
  const exotic = Math.floor(total * t * 0.28)
  const rich = Math.floor(total * (0.12 + t * 0.28))
  let raw = total - quantum - exotic - rich
  if (raw < 2) raw = 2
  const cost = {}
  if (raw > 0) cost.raw_ore = raw
  if (rich > 0) cost.rich_ore = rich
  if (exotic > 0) cost.exotic_ore = exotic
  if (quantum > 0) cost.quantum_ore = quantum
  return cost
}

/**
 * Modest station bay fee (credits). Far below shop list price — ore is the
 * real material cost; this is industry-slot overhead.
 * Weapons ~80–500cr; ships ~600–2500cr.
 */
export function creditCostForBlueprint(blueprintId) {
  const bp = getBlueprint(blueprintId)
  const t = blueprintComplexity(blueprintId)
  if (bp.kind === 'weapon') {
    return Math.round(80 + (t / Math.max(1e-9, WEAPON_COMPLEXITY_MAX)) * 420)
  }
  const shipT = (t - SHIP_COMPLEXITY_MIN) / Math.max(1e-9, 1 - SHIP_COMPLEXITY_MIN)
  return Math.round(600 + Math.min(1, Math.max(0, shipT)) * 1900)
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.ceil(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatOreCost(cost) {
  return MINED_ORE_GOOD_IDS.filter((id) => (cost[id] ?? 0) > 0)
    .map((id) => `${cost[id]} ${id.replace(/_/g, ' ')}`)
    .join(', ')
}

/** Weighted random blueprint for rare loot (slight bias toward mid-price). */
export function rollRandomBlueprintId(rng = Math.random) {
  const list = allBlueprints()
  // Weight ∝ 1/sqrt(price) so ultra-expensive BPs are rarer drops.
  const weights = list.map((bp) => 1 / Math.sqrt(Math.max(1, bp.listPrice)))
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = rng() * sum
  for (let i = 0; i < list.length; i++) {
    r -= weights[i]
    if (r <= 0) return list[i].id
  }
  return list[list.length - 1].id
}
