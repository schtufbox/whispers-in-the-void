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

const ROLE_HUE_RANGES = {
  trader: [30, 60],
  fighter: [340, 380],
  explorer: [160, 220]
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

function generateHullSilhouette(rng, role) {
  const [minLen, maxLen] = ROLE_LENGTH_RANGES[role]
  const length = range(rng, minLen, maxLen)
  const peakWidth = range(rng, length * 0.05, length * 0.11)
  const noseFrac = range(rng, 0.05, 0.2)
  const midFrontFrac = range(rng, 0.4, 0.8)
  const peakFrac = range(rng, 0.9, 1.0)
  const midBackFrac = range(rng, 0.85, 1.0)
  const rearFrac = range(rng, 0.5, 0.8)
  const tailFrac = range(rng, 0.05, 0.3)
  const stationWidths = [noseFrac, midFrontFrac, peakFrac, midBackFrac, rearFrac, tailFrac].map((f) => f * peakWidth)
  const heightRatio = range(rng, 0.5, 0.9)
  const stationHeights = stationWidths.map((w) => w * heightRatio * range(rng, 0.85, 1.15))
  const crossSectionSides = pick(rng, [4, 5, 6, 8])

  const wings = []
  if (rng() < 0.75) {
    const atStation = pick(rng, [2, 3, 4])
    wings.push({
      atStation,
      span: range(rng, peakWidth * 1.5, peakWidth * 4),
      sweep: range(rng, -0.5, 1.3),
      thickness: range(rng, 0.15, 0.4)
    })
  }

  return { length, stationWidths, stationHeights, crossSectionSides, wings }
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
// Tripled alongside the starter ship's hard-set capacity (see
// STARTER_MINING_CAPACITY in data/shipClasses.js, 5 -> 15) so every other
// ship's hold keeps scaling off that same new base rather than drifting back
// down toward the old floor.
const MINING_HOLD_MIN = 30

// Every ship has a dedicated mining hold for mined ore, sized off price and
// role (traders lean into hauling ore, fighters carry the least) and kept
// separate from cargoCapacity. The starter ship is hard-set below this floor
// in data/shipClasses.js, so it's always the smallest hold in the game.
export function computeMiningCapacity(price, role) {
  return Math.max(MINING_HOLD_MIN, Math.round((price / 500) * MINING_HOLD_ROLE_MULTIPLIER[role]))
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
    hull.color = hslToHex(range(rng, hueMin, hueMax), range(rng, 0.35, 0.65), range(rng, 0.45, 0.7))

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
