import { mulberry32, pick, range, intRange } from './prng.js'
import { generateBodyName, generateSpeciesName } from './names.js'
import { ECONOMY_TAGS } from '../data/economyTags.js'

const ARM_COUNT = 4
export const GALAXY_MAX_RADIUS = 2600
const MAX_RADIUS = GALAXY_MAX_RADIUS
const ARM_TWIST = 2.5
const JITTER_ANGLE = 0.5
const DISK_THICKNESS = 120
// "~400% larger" solar systems per user request — one scale factor so the
// local scatter radius and the arrival distance below stay consistent.
const SYSTEM_SIZE_SCALE = 5
const SYSTEM_LOCAL_MIN_RADIUS = 300 * SYSTEM_SIZE_SCALE
const SYSTEM_LOCAL_MAX_RADIUS = 1600 * SYSTEM_SIZE_SCALE
// "+150%"/"+65%" per user request, applied once here since body.radius is
// both the render and collision size (see game/collision.js).
const PLANET_SIZE_SCALE = 2.5
const MOON_SIZE_SCALE = 1.65
// Per-system variety so systems aren't all uniformly sized — drawn once per
// system in generateGalaxy and threaded through to every body it contains
// (planets, moons, and anything placed into it afterward: stations/
// settlements/asteroid fields), plus the local scatter radius itself.
const SYSTEM_SCALE_VARIANCE = [0.85, 1.15]
const MOON_CHANCE = 0.23
const MOON_ORBIT_MIN_RADIUS = 18
const MOON_ORBIT_MAX_RADIUS = 45
// Extra breathing room beyond the parent's + moon's own physical radii, so a
// moon's orbit (a circle at a constant radius — see main.js's moonOrbits)
// never sweeps through the parent planet's collision shell.
const MOON_ORBIT_CLEARANCE_MARGIN = 6

// Ships always arrive/start at this fixed point relative to the system's
// star (at local origin) — near the system's edge, facing the star (identity
// quaternion + a position on -Z; see game/hyperspace.js). Far enough that
// even the largest star (a giant, core radius up to ~500 post-scale — see
// render/starMesh.js's STAR_SIZE_SCALE) reads as a backdrop rather than
// something the camera spawns inside of.
export const SYSTEM_ARRIVAL_POSITION = [0, 400, -SYSTEM_LOCAL_MAX_RADIUS * 0.95]

function spiralPosition(rng, armIndex) {
  const radius = MAX_RADIUS * Math.sqrt(rng())
  const angle = (armIndex / ARM_COUNT) * Math.PI * 2 + radius * 0.01 * ARM_TWIST + (rng() - 0.5) * JITTER_ANGLE
  const x = radius * Math.cos(angle)
  const z = radius * Math.sin(angle)
  const y = (rng() - 0.5) * DISK_THICKNESS
  return [x, y, z]
}

// Bodies within a system are scattered locally around that system's own
// origin (0,0,0) — this is the small-scale space the player actually flies
// in with real-time flight; the galaxy-scale spiral position above is only
// used for placing the system on the galaxy map.
function localPosition(rng, systemScale) {
  const radius = range(rng, SYSTEM_LOCAL_MIN_RADIUS, SYSTEM_LOCAL_MAX_RADIUS) * systemScale
  const theta = rng() * Math.PI * 2
  const phi = Math.acos(2 * rng() - 1)
  return [radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.3, radius * Math.sin(phi) * Math.sin(theta)]
}

// Moons orbit close to their parent planet rather than being scattered
// anywhere in the system like other bodies. The orbit is a flat circle in
// the XZ plane at a constant radius and a fixed height offset (main.js's
// moonOrbits animates exactly this shape), so the XZ-plane radius — clamped
// here to clear both bodies' physical radii plus a margin — is guaranteed
// to clear the parent's collision shell for the entire orbit, not just at
// generation time.
function localPositionNearBody(rng, parentPosition, parentRadius, moonRadius) {
  const clearance = parentRadius + moonRadius + MOON_ORBIT_CLEARANCE_MARGIN
  const xzRadius = Math.max(clearance, range(rng, MOON_ORBIT_MIN_RADIUS, MOON_ORBIT_MAX_RADIUS))
  const theta = rng() * Math.PI * 2
  const y = range(rng, -MOON_ORBIT_MAX_RADIUS * 0.3, MOON_ORBIT_MAX_RADIUS * 0.3)
  return [
    parentPosition[0] + xzRadius * Math.cos(theta),
    parentPosition[1] + y,
    parentPosition[2] + xzRadius * Math.sin(theta)
  ]
}

function randomTags(rng) {
  const count = intRange(rng, 1, 2)
  const tags = new Set()
  while (tags.size < count) tags.add(pick(rng, ECONOMY_TAGS))
  return [...tags]
}

function missionChance(rng, kind) {
  if (kind === 'planet') return rng() < 0.4
  if (kind === 'moon') return rng() < 0.15
  if (kind === 'asteroidField') return false
  return true
}

// Physical size for kinds whose collision/visual radius varies per instance
// (planets/moons render and collide at this exact radius; an asteroid
// field's radius is both its rock-scatter spread and its collision size).
// Stations/settlements don't need this — their mesh size never varies, so
// game/collision.js just uses a fixed radius per kind for those.
function radiusFor(rng, kind, systemScale) {
  if (kind === 'planet') return range(rng, 8, 21) * PLANET_SIZE_SCALE * systemScale
  if (kind === 'moon') return range(rng, 3, 8) * MOON_SIZE_SCALE * systemScale
  if (kind === 'asteroidField') return range(rng, 70, 110) * systemScale
  return null
}

function makeBody(rng, idCounter, kind, parent, systemScale) {
  // Radius is rolled before position so a moon's orbit clearance (below) can
  // account for both its own and its parent's physical size.
  const radius = radiusFor(rng, kind, systemScale)
  const position = kind === 'moon' ? localPositionNearBody(rng, parent.position, parent.radius, radius) : localPosition(rng, systemScale)
  return {
    id: `body-${idCounter}`,
    name: kind === 'moon' ? `${parent.name} Moon` : generateBodyName(rng, kind),
    kind,
    parentId: kind === 'moon' ? parent.id : undefined,
    position,
    radius,
    economyTags: randomTags(rng),
    hasMissions: missionChance(rng, kind),
    hasShipyard: kind === 'station' ? rng() < 0.6 : false
  }
}

export function generateGalaxy(seed, opts = {}) {
  const {
    systemCount = 450,
    totalPlanets = 1500,
    stationCount = 180,
    settlementCount = 120,
    asteroidFieldCount = 40,
    speciesCount = 20
  } = opts
  const rng = mulberry32(seed)
  let bodyIdCounter = 0

  // Spread totalPlanets across systemCount systems with some variance per
  // system (1-5ish) rather than a flat count, so systems feel distinct.
  const planetsPerSystem = []
  let remainingPlanets = totalPlanets
  for (let i = 0; i < systemCount; i++) {
    const systemsLeft = systemCount - i
    const avgLeft = remainingPlanets / systemsLeft
    const count = Math.max(1, Math.round(range(rng, avgLeft * 0.4, avgLeft * 1.6)))
    planetsPerSystem.push(count)
    remainingPlanets -= count
  }
  planetsPerSystem[planetsPerSystem.length - 1] = Math.max(1, planetsPerSystem[planetsPerSystem.length - 1] + remainingPlanets)

  const systems = []
  for (let i = 0; i < systemCount; i++) {
    const sizeScale = range(rng, ...SYSTEM_SCALE_VARIANCE)
    const bodies = []
    for (let p = 0; p < planetsPerSystem[i]; p++) {
      const planet = makeBody(rng, bodyIdCounter++, 'planet', null, sizeScale)
      bodies.push(planet)
      if (rng() < MOON_CHANCE) bodies.push(makeBody(rng, bodyIdCounter++, 'moon', planet, sizeScale))
    }
    systems.push({
      id: `sys-${i}`,
      name: generateBodyName(rng, 'system'),
      galaxyPosition: spiralPosition(rng, i % ARM_COUNT),
      sizeScale,
      bodies
    })
  }

  for (let i = 0; i < stationCount; i++) {
    const system = pick(rng, systems)
    system.bodies.push(makeBody(rng, bodyIdCounter++, 'station', null, system.sizeScale))
  }
  for (let i = 0; i < settlementCount; i++) {
    const system = pick(rng, systems)
    system.bodies.push(makeBody(rng, bodyIdCounter++, 'settlement', null, system.sizeScale))
  }
  for (let i = 0; i < asteroidFieldCount; i++) {
    const system = pick(rng, systems)
    system.bodies.push(makeBody(rng, bodyIdCounter++, 'asteroidField', null, system.sizeScale))
  }

  const species = []
  for (let i = 0; i < speciesCount; i++) species.push(generateSpeciesName(rng))

  return { seed, systems, species }
}

// 0 at the galactic core, 1 at the rim — shared by game/mining.js's ore-tier
// pick, game/spawner.js's population/alien-activity gradient, and
// game/state.js's core-biased starting system.
export function coreFraction(system) {
  const dist = Math.hypot(system.galaxyPosition[0], system.galaxyPosition[2])
  return Math.min(1, dist / GALAXY_MAX_RADIUS)
}

export function findBody(galaxy, bodyId) {
  for (const system of galaxy.systems) {
    const body = system.bodies.find((b) => b.id === bodyId)
    if (body) return body
  }
  return null
}

export function findSystemOfBody(galaxy, bodyId) {
  return galaxy.systems.find((s) => s.bodies.some((b) => b.id === bodyId)) ?? null
}

export function getSystem(galaxy, systemId) {
  return galaxy.systems.find((s) => s.id === systemId) ?? null
}
