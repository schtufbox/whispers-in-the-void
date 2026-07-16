import { pick, range, intRange } from './prng.js'

const SHIP_NAME_ROOTS = [
  'Kestrel', 'Vanguard', 'Draymon', 'Solace', 'Ember', 'Halcyon', 'Meridian', 'Talon',
  'Wraith', 'Comet', 'Aegis', 'Vireo', 'Zephyr', 'Nomad', 'Corsair', 'Falcon',
  'Harrow', 'Ithaca', 'Juno', 'Karst', 'Lucent', 'Marrow', 'Nyx', 'Osprey',
  'Paragon', 'Quill', 'Ronin', 'Sabre', 'Thresher', 'Umbra', 'Vantage', 'Wyvern'
]

const ROLE_WEIGHTS = ['trader', 'trader', 'fighter', 'fighter', 'explorer']

const ROLE_STAT_RANGES = {
  trader: { hull: [90, 220], shields: [20, 60], armor: [25, 60], cargoCapacity: [50, 160], speed: [50, 100], turnRate: [0.6, 1.4], accel: [10, 25] },
  fighter: { hull: [50, 160], shields: [50, 140], armor: [10, 60], cargoCapacity: [5, 30], speed: [140, 260], turnRate: [1.8, 3.2], accel: [35, 70] },
  explorer: { hull: [40, 110], shields: [30, 70], armor: [5, 30], cargoCapacity: [15, 80], speed: [130, 210], turnRate: [1.4, 2.6], accel: [22, 50] }
}

const ROLE_LENGTH_RANGES = {
  trader: [24, 40],
  fighter: [14, 26],
  explorer: [16, 32]
}

// Muted industrial palettes — human ships read as painted metal, not candy.
const ROLE_HUE_RANGES = {
  trader: [25, 55],
  fighter: [200, 230],
  explorer: [175, 210]
}
const ROLE_SAT_RANGES = {
  trader: [0.12, 0.35],
  fighter: [0.08, 0.28],
  explorer: [0.15, 0.4]
}
const ROLE_LIGHT_RANGES = {
  trader: [0.38, 0.58],
  fighter: [0.42, 0.62],
  explorer: [0.45, 0.65]
}

const ROLE_HARDPOINT_COUNTS = {
  trader: [1, 1],
  fighter: [2, 3],
  explorer: [1, 2]
}

// Accessory bays (0–4). Starter Bravia is hard-set to 0; generated hulls
// usually have at least one bay so Autopilot and later modules can fit.
const ROLE_ACCESSORY_SLOT_COUNTS = {
  trader: [1, 2, 2, 3, 4],
  fighter: [0, 1, 1, 2, 2],
  explorer: [1, 1, 2, 2, 3]
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function generateShipModelName(rng, usedNames) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const root = pick(rng, SHIP_NAME_ROOTS)
    const style = rng()
    const name = style < 0.4 ? `${root} Mk${intRange(rng, 1, 4)}` : style < 0.7 ? `${root} ${pick(rng, ['I', 'II', 'III'])}` : root
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
  }
  const fallback = `${pick(rng, SHIP_NAME_ROOTS)} ${Math.floor(rng() * 10000)}`
  usedNames.add(fallback)
  return fallback
}

// Strong asymmetry rate — most hulls stay mirrored; ~1 in 20 is a true oddball.
export const STRONG_ASYMMETRY_CHANCE = 0.05

// Role-shaped silhouettes that read as human engineering:
//   trader  — blunt nose, fat mid cargo block, truncated tail
//   fighter — needle nose, pinched mid, broad engine rear
//   explorer — long slender spine with modest mid flare
// 12 loft stations for high geometric complexity.
function generateHullSilhouette(rng, role) {
  const [minLen, maxLen] = ROLE_LENGTH_RANGES[role]
  const length = range(rng, minLen, maxLen)
  const peakWidth = range(rng, length * 0.055, length * 0.12)

  // 12 width fractions aft→nose (smooth complex curvature).
  let fracs
  if (role === 'trader') {
    fracs = [
      range(rng, 0.2, 0.38),
      range(rng, 0.4, 0.65),
      range(rng, 0.7, 0.92),
      range(rng, 0.9, 1.0),
      range(rng, 0.95, 1.0),
      range(rng, 0.95, 1.0),
      range(rng, 0.95, 1.0),
      range(rng, 0.9, 0.99),
      range(rng, 0.75, 0.92),
      range(rng, 0.5, 0.75),
      range(rng, 0.35, 0.55),
      range(rng, 0.22, 0.42)
    ]
  } else if (role === 'fighter') {
    fracs = [
      range(rng, 0.04, 0.1),
      range(rng, 0.12, 0.28),
      range(rng, 0.3, 0.55),
      range(rng, 0.55, 0.9),
      range(rng, 0.75, 1.0),
      range(rng, 0.55, 0.9),
      range(rng, 0.45, 0.8),
      range(rng, 0.55, 0.95),
      range(rng, 0.7, 1.0),
      range(rng, 0.55, 0.85),
      range(rng, 0.28, 0.5),
      range(rng, 0.12, 0.32)
    ]
  } else {
    fracs = [
      range(rng, 0.05, 0.12),
      range(rng, 0.15, 0.32),
      range(rng, 0.35, 0.6),
      range(rng, 0.55, 0.85),
      range(rng, 0.8, 1.0),
      range(rng, 0.85, 1.0),
      range(rng, 0.75, 0.95),
      range(rng, 0.6, 0.85),
      range(rng, 0.45, 0.7),
      range(rng, 0.3, 0.5),
      range(rng, 0.18, 0.35),
      range(rng, 0.08, 0.22)
    ]
  }

  const stationWidths = fracs.map((f) => f * peakWidth)
  const heightRatio = role === 'trader' ? range(rng, 0.55, 0.85) : range(rng, 0.45, 0.75)
  const stationHeights = stationWidths.map((w) => w * heightRatio * range(rng, 0.9, 1.1))
  // High side counts for smooth facets; superellipse keeps industrial boxiness.
  const crossSectionSides = pick(
    rng,
    role === 'fighter' ? [12, 14, 16, 16] : role === 'trader' ? [10, 12, 12, 14] : [12, 14, 16]
  )
  const superellipseExponent =
    role === 'trader' ? range(rng, 2.4, 3.6) : role === 'fighter' ? range(rng, 1.8, 2.6) : range(rng, 2.0, 3.0)

  const asymmetric = rng() < STRONG_ASYMMETRY_CHANCE
  let stationOffsetsX = null
  let stationOffsetsY = null
  if (asymmetric) {
    const bias = (rng() < 0.5 ? -1 : 1) * peakWidth * range(rng, 0.12, 0.32)
    stationOffsetsX = stationWidths.map((_, i) => {
      if (i === 0 || i === stationWidths.length - 1) return 0
      return bias * (0.45 + 0.55 * Math.sin((i / (stationWidths.length - 1)) * Math.PI))
    })
    if (rng() < 0.7) {
      const hump = peakWidth * range(rng, 0.08, 0.2)
      stationOffsetsY = stationHeights.map((_, i) =>
        i >= 3 && i <= 8 ? hump * (i >= 5 && i <= 6 ? 1 : 0.55) : 0
      )
    }
  }

  const wings = []
  const wingChance = role === 'fighter' ? 0.92 : role === 'explorer' ? 0.78 : 0.55
  if (rng() < wingChance) {
    const atStation = pick(rng, role === 'trader' ? [4, 5, 6] : [3, 4, 5, 6, 7])
    let side = 'both'
    if (asymmetric && rng() < 0.75) side = pick(rng, ['left', 'right', 'both'])
    wings.push({
      atStation,
      span: range(rng, peakWidth * (role === 'fighter' ? 2.2 : 1.4), peakWidth * (role === 'fighter' ? 5 : 3.2)),
      sweep: range(rng, role === 'fighter' ? 0.2 : -0.4, role === 'fighter' ? 1.6 : 0.9),
      thickness: range(rng, 0.22, 0.55),
      side,
      tipOffsetY: asymmetric && rng() < 0.55 ? range(rng, -0.45, 0.55) : 0,
      chordScale: range(rng, 0.85, 1.15)
    })
    // Secondary / tertiary wing planes for denser silhouettes.
    if (rng() < (role === 'fighter' ? 0.7 : 0.4)) {
      wings.push({
        atStation: pick(rng, [2, 3, 4, 5]),
        span: range(rng, peakWidth * 0.9, peakWidth * 2.2),
        sweep: range(rng, -0.3, 0.7),
        thickness: range(rng, 0.14, 0.3),
        side: asymmetric && rng() < 0.5 ? pick(rng, ['left', 'right']) : 'both'
      })
    }
    if (role === 'fighter' && rng() < 0.45) {
      wings.push({
        atStation: pick(rng, [1, 2, 3]),
        span: range(rng, peakWidth * 0.7, peakWidth * 1.6),
        sweep: range(rng, -0.15, 0.5),
        thickness: range(rng, 0.12, 0.24),
        side: 'both'
      })
    }
  }

  // Dorsal tail wing toward the rear (low atStation = aft). Common on fighters
  // and explorers; occasional on traders as a cargo-fin stabilizer.
  const tailChance = role === 'fighter' ? 0.72 : role === 'explorer' ? 0.58 : 0.28
  if (rng() < tailChance) {
    wings.push({
      atStation: pick(rng, [1, 2, 3]),
      span: range(rng, peakWidth * 0.9, peakWidth * (role === 'fighter' ? 2.4 : 1.8)),
      sweep: range(rng, -0.55, 0.15),
      thickness: range(rng, 0.16, 0.38),
      side: 'top',
      tipOffsetX: asymmetric && rng() < 0.4 ? range(rng, -0.25, 0.25) : 0,
      chordScale: range(rng, 0.75, 1.1)
    })
  }

  // Ventral keel wing — rarer, adds gunship / freighter belly mass.
  const bellyChance = role === 'trader' ? 0.35 : role === 'fighter' ? 0.22 : 0.18
  if (rng() < bellyChance) {
    wings.push({
      atStation: pick(rng, [3, 4, 5, 6]),
      span: range(rng, peakWidth * 0.7, peakWidth * 1.8),
      sweep: range(rng, -0.2, 0.5),
      thickness: range(rng, 0.18, 0.4),
      side: 'bottom',
      tipOffsetX: asymmetric && rng() < 0.45 ? range(rng, -0.3, 0.3) : 0,
      chordScale: range(rng, 0.8, 1.1),
      tipAerial: rng() < 0.25
    })
  }

  // Radar dish mounts: top / bottom / side (left+right). Explorers stack more.
  const radarDishes = []
  if (role === 'explorer' || rng() < 0.7) radarDishes.push('top')
  if (role === 'explorer' ? rng() < 0.55 : rng() < 0.22) radarDishes.push('bottom')
  if (role === 'fighter' ? rng() < 0.4 : role === 'explorer' ? rng() < 0.5 : rng() < 0.28) {
    radarDishes.push(rng() < 0.55 ? 'side' : pick(rng, ['left', 'right']))
  }
  if (radarDishes.length === 0) radarDishes.push('top')

  // Bottom cockpits: gunship / freighter-bridge underbelly look (~18% overall,
  // a bit higher on fighters, lower on sleek explorers).
  const cockpitBottomChance = role === 'fighter' ? 0.28 : role === 'trader' ? 0.2 : 0.12
  const cockpitMount = rng() < cockpitBottomChance ? 'bottom' : 'top'

  const style = {
    asymmetric,
    bridgeSide: asymmetric ? (rng() < 0.5 ? -1 : 1) : 0,
    engineLayout: pick(
      rng,
      role === 'trader'
        ? ['twin', 'triple', 'quad']
        : role === 'fighter'
          ? ['twin', 'twin', 'triple', 'single']
          : ['single', 'twin', 'twin']
    ),
    hasRadiator: rng() < (role === 'trader' ? 0.8 : 0.55),
    hasCargoPods: role === 'trader' && rng() < 0.85,
    hasSensorMast: radarDishes.includes('top') || role === 'explorer' || rng() < 0.45,
    radarDishes,
    cockpitMount,
    hasDockingRing: role === 'trader' && rng() < 0.45,
    // Kitbash density — roughly 2× prior generation.
    detailDensity: range(rng, 1.7, 2.5)
  }

  return {
    length,
    stationWidths,
    stationHeights,
    crossSectionSides,
    superellipseExponent,
    wings,
    stationOffsetsX,
    stationOffsetsY,
    style
  }
}

function generateHardpoints(rng, role, hull) {
  const [minCount, maxCount] = ROLE_HARDPOINT_COUNTS[role]
  const count = intRange(rng, minCount, maxCount)
  const zForward = hull.length * 0.4
  const hardpoints = []
  for (let i = 0; i < count; i++) {
    const missileChance = role === 'fighter' ? 0.4 : role === 'trader' ? 0.1 : 0.2
    const type = rng() < missileChance ? 'missile' : 'laser'
    const x = count === 1 ? 0 : (i % 2 === 0 ? -1 : 1) * range(rng, hull.stationWidths[2] * 0.3, hull.stationWidths[2] * 0.8) * (Math.floor(i / 2) + 1)
    hardpoints.push({ id: `hp${i + 1}`, position: [x, range(rng, 0, 0.4), zForward], type })
  }
  return hardpoints
}

// Shop floor for buyable hulls (hand-crafted Scout sits here; generated scale up).
export const MIN_SHIP_BUY_PRICE = 8500

function computePrice(stats, rng) {
  const raw = stats.hull + stats.shields * 1.5 + stats.armor * 1.2 + stats.cargoCapacity * 2 + stats.speed * 1.5 + stats.accel * 2
  return Math.max(MIN_SHIP_BUY_PRICE, Math.round(raw * range(rng, 8, 14)))
}

const MINING_HOLD_ROLE_MULTIPLIER = { trader: 1.3, fighter: 0.6, explorer: 0.9 }
// 3× prior floor (was 30) — mining holds increased by 300% / triple.
const MINING_HOLD_MIN = 90

// Every ship has a dedicated mining hold for mined ore, sized off price and
// role (traders lean into hauling ore, fighters carry the least) and kept
// separate from cargoCapacity. The starter ship is hard-set below this floor
// in data/shipClasses.js, so it's always the smallest hold in the game.
export function computeMiningCapacity(price, role) {
  // ×3 on the prior price formula (was price/500) so all ships triple together.
  return Math.max(MINING_HOLD_MIN, Math.round((price / 500) * MINING_HOLD_ROLE_MULTIPLIER[role] * 3))
}

export function generateShipClassRoster(rng, count) {
  const usedNames = new Set()
  const classes = []
  for (let i = 0; i < count; i++) {
    const role = pick(rng, ROLE_WEIGHTS)
    const statRanges = ROLE_STAT_RANGES[role]
    const stats = {}
    for (const [key, [min, max]] of Object.entries(statRanges)) {
      stats[key] = key === 'turnRate' ? Number(range(rng, min, max).toFixed(2)) : Math.round(range(rng, min, max))
    }

    const hull = generateHullSilhouette(rng, role)
    const [hueMin, hueMax] = ROLE_HUE_RANGES[role]
    const [satMin, satMax] = ROLE_SAT_RANGES[role]
    const [litMin, litMax] = ROLE_LIGHT_RANGES[role]
    // Occasional high-vis hazard stripe orange on traders; otherwise dull metal.
    if (role === 'trader' && rng() < 0.18) {
      hull.color = hslToHex(range(rng, 22, 38), range(rng, 0.45, 0.7), range(rng, 0.4, 0.55))
    } else {
      hull.color = hslToHex(range(rng, hueMin, hueMax), range(rng, satMin, satMax), range(rng, litMin, litMax))
    }

    const name = generateShipModelName(rng, usedNames)
    const id = `gen_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${i}`
    const price = computePrice(stats, rng)
    stats.miningCapacity = computeMiningCapacity(price, role)

    classes.push({
      id,
      name,
      role,
      price,
      stats,
      hardpoints: generateHardpoints(rng, role, hull),
      accessorySlots: pick(rng, ROLE_ACCESSORY_SLOT_COUNTS[role]),
      hull
    })
  }
  return classes
}
