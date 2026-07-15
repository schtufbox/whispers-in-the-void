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

// Role-shaped silhouettes that read as human engineering:
//   trader  — blunt nose, fat mid cargo block, truncated tail
//   fighter — needle nose, pinched mid, broad engine rear
//   explorer — long slender spine with modest mid flare
function generateHullSilhouette(rng, role) {
  const [minLen, maxLen] = ROLE_LENGTH_RANGES[role]
  const length = range(rng, minLen, maxLen)
  const peakWidth = range(rng, length * 0.055, length * 0.12)

  let fracs
  if (role === 'trader') {
    // Boxy freighter: fat through most of the length.
    fracs = [
      range(rng, 0.25, 0.45),
      range(rng, 0.75, 0.95),
      range(rng, 0.95, 1.0),
      range(rng, 0.95, 1.0),
      range(rng, 0.7, 0.9),
      range(rng, 0.35, 0.55)
    ]
  } else if (role === 'fighter') {
    // Combat craft: sharp nose, wasp waist optional, engine flare aft.
    fracs = [
      range(rng, 0.04, 0.12),
      range(rng, 0.35, 0.55),
      range(rng, 0.7, 0.95),
      range(rng, 0.55, 0.85),
      range(rng, 0.65, 1.0),
      range(rng, 0.2, 0.45)
    ]
  } else {
    // Explorer: long taper, modest mid, sensor nose.
    fracs = [
      range(rng, 0.08, 0.18),
      range(rng, 0.4, 0.65),
      range(rng, 0.75, 0.95),
      range(rng, 0.7, 0.9),
      range(rng, 0.45, 0.7),
      range(rng, 0.12, 0.3)
    ]
  }

  const stationWidths = fracs.map((f) => f * peakWidth)
  // Human hulls are usually flatter than they are tall (decks).
  const heightRatio = role === 'trader' ? range(rng, 0.55, 0.85) : range(rng, 0.45, 0.75)
  const stationHeights = stationWidths.map((w) => w * heightRatio * range(rng, 0.9, 1.1))
  // Prefer boxy / octagonal industrial cross-sections over organic high-n.
  const crossSectionSides = pick(rng, role === 'fighter' ? [4, 6, 8] : [4, 4, 6, 8])

  // ~40% of human ships are deliberately asymmetrical (radiator, crane wing,
  // offset bridge, snaking cargo spine) — real spacecraft almost never mirror.
  const asymmetric = rng() < 0.42
  let stationOffsetsX = null
  let stationOffsetsY = null
  if (asymmetric && rng() < 0.55) {
    // Mild lateral snake on mid stations — "module bolted off-center".
    const bias = (rng() < 0.5 ? -1 : 1) * peakWidth * range(rng, 0.08, 0.28)
    stationOffsetsX = stationWidths.map((_, i) => {
      if (i === 0 || i === stationWidths.length - 1) return 0
      return bias * (0.4 + 0.6 * Math.sin((i / (stationWidths.length - 1)) * Math.PI))
    })
  }
  if (asymmetric && rng() < 0.35) {
    // Slight dorsal hump bias mid-body (raised bridge / cargo tower).
    const hump = peakWidth * range(rng, 0.05, 0.18)
    stationOffsetsY = stationHeights.map((_, i) => (i >= 2 && i <= 3 ? hump : 0))
  }

  const wings = []
  const wingChance = role === 'fighter' ? 0.85 : role === 'explorer' ? 0.7 : 0.45
  if (rng() < wingChance) {
    const atStation = pick(rng, role === 'trader' ? [2, 3] : [2, 3, 4])
    let side = 'both'
    if (asymmetric && rng() < 0.55) side = pick(rng, ['left', 'right', 'both'])
    // Rare double-row: primary wings + smaller canards.
    wings.push({
      atStation,
      span: range(rng, peakWidth * (role === 'fighter' ? 2.2 : 1.4), peakWidth * (role === 'fighter' ? 5 : 3.2)),
      sweep: range(rng, role === 'fighter' ? 0.2 : -0.4, role === 'fighter' ? 1.6 : 0.9),
      thickness: range(rng, 0.18, 0.45),
      side,
      tipOffsetY: asymmetric && rng() < 0.4 ? range(rng, -0.4, 0.5) : 0,
      chordScale: range(rng, 0.85, 1.15)
    })
    if (role === 'fighter' && rng() < 0.3) {
      wings.push({
        atStation: pick(rng, [1, 2]),
        span: range(rng, peakWidth * 0.8, peakWidth * 1.8),
        sweep: range(rng, -0.2, 0.6),
        thickness: range(rng, 0.12, 0.25),
        side: asymmetric && rng() < 0.4 ? pick(rng, ['left', 'right']) : 'both'
      })
    }
  }

  // Detail hints consumed by shipMesh (not geometry loft).
  const style = {
    asymmetric,
    // Bridge / superstructure bias: -1 left, 0 center, +1 right.
    bridgeSide: asymmetric && rng() < 0.65 ? (rng() < 0.5 ? -1 : 1) : 0,
    engineLayout: pick(rng, role === 'trader'
      ? ['twin', 'triple', 'quad']
      : role === 'fighter'
        ? ['twin', 'twin', 'triple', 'single']
        : ['single', 'twin', 'twin']),
    hasRadiator: rng() < (role === 'trader' ? 0.7 : 0.45),
    hasCargoPods: role === 'trader' && rng() < 0.75,
    hasSensorMast: role === 'explorer' || rng() < 0.4,
    hasDockingRing: role === 'trader' && rng() < 0.35
  }

  return {
    length,
    stationWidths,
    stationHeights,
    crossSectionSides,
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

function computePrice(stats, rng) {
  const raw = stats.hull + stats.shields * 1.5 + stats.armor * 1.2 + stats.cargoCapacity * 2 + stats.speed * 1.5 + stats.accel * 2
  return Math.round(raw * range(rng, 8, 14))
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
      hull
    })
  }
  return classes
}
