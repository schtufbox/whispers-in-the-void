import { mulberry32, pick, range, intRange } from './prng.js'
import { generateBodyName, generateSpeciesName } from './names.js'
import { ECONOMY_TAGS } from '../data/economyTags.js'

const ARM_COUNT = 4
export const GALAXY_MAX_RADIUS = 2600
const MAX_RADIUS = GALAXY_MAX_RADIUS
const ARM_TWIST = 2.5
const JITTER_ANGLE = 0.5
const DISK_THICKNESS = 120
// Local system scatter. Stars are STAR_SIZE_SCALE 225 (giants ~45k radius,
// corona ~1.9×) — min orbit must clear that or planets spawn inside the sun.
// Bumped with the 6× sun / 5× planet pass (was SYSTEM_SIZE_SCALE 18).
const SYSTEM_SIZE_SCALE = 120
const SYSTEM_LOCAL_MIN_RADIUS = 900 * SYSTEM_SIZE_SCALE
const SYSTEM_LOCAL_MAX_RADIUS = 2800 * SYSTEM_SIZE_SCALE
// Planets 5× prior (was 37.5); moons keep the same relative scale vs planets.
const PLANET_SIZE_SCALE = 187.5
const MOON_SIZE_SCALE = 123.75
const SYSTEM_SCALE_VARIANCE = [0.85, 1.15]
const MOON_CHANCE = 0.23
const MOON_ORBIT_MIN_RADIUS = 18
const MOON_ORBIT_MAX_RADIUS = 45
const MOON_ORBIT_CLEARANCE_MARGIN = 6
// Match game/collision.js station shells (+50% station/settlement pass).
const STATION_CLEARANCE_RADIUS = 337.5
// Settlements sit on the crust — only a small radial lift so the mesh base
// meets the surface (not floating on the full collision shell).
const SETTLEMENT_SURFACE_LIFT = 33
const SETTLEMENT_CLEARANCE_RADIUS = 60
// Vast majority of stations orbit a planet, moon, or the star; a tiny fraction drift alone.
const STATION_FREE_DRIFT_CHANCE = 0.003
// Settlements are almost always surface-bound; a rare outpost in an asteroid belt.
const SETTLEMENT_ASTEROID_CHANCE = 0.003
// If the chosen host already has an orbiting station, settlement is rare.
const SETTLEMENT_WITH_STATION_CHANCE = 0.05
const JUMP_NEIGHBOR_COUNT = 5

export const SYSTEM_ARRIVAL_POSITION = [0, 400, -SYSTEM_LOCAL_MAX_RADIUS * 0.95]

// Special outer-rim destination: always one system, always this station name.
// Ambient hostiles never spawn here (mission NPCs still can).
export const WHISPERS_SYSTEM_NAME = 'Whispers'
export const WHISPERS_STATION_NAME = "SerNub's Pleasure Palace"

function spiralPosition(rng, armIndex) {
  const radius = MAX_RADIUS * Math.sqrt(rng())
  const angle = (armIndex / ARM_COUNT) * Math.PI * 2 + radius * 0.01 * ARM_TWIST + (rng() - 0.5) * JITTER_ANGLE
  const x = radius * Math.cos(angle)
  const z = radius * Math.sin(angle)
  const y = (rng() - 0.5) * DISK_THICKNESS
  return [x, y, z]
}

function localPosition(rng, systemScale) {
  const radius = range(rng, SYSTEM_LOCAL_MIN_RADIUS, SYSTEM_LOCAL_MAX_RADIUS) * systemScale
  const theta = rng() * Math.PI * 2
  const phi = Math.acos(2 * rng() - 1)
  return [radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.3, radius * Math.sin(phi) * Math.sin(theta)]
}

// Flat XZ-plane orbit around a host body (moons, orbiting stations).
function localPositionNearBody(rng, parentPosition, parentRadius, ownClearance) {
  const clearance = parentRadius + ownClearance + MOON_ORBIT_CLEARANCE_MARGIN
  const xzRadius = Math.max(clearance, range(rng, Math.max(MOON_ORBIT_MIN_RADIUS, clearance), Math.max(MOON_ORBIT_MAX_RADIUS, clearance * 1.4)))
  const theta = rng() * Math.PI * 2
  const y = range(rng, -xzRadius * 0.15, xzRadius * 0.15)
  return [
    parentPosition[0] + xzRadius * Math.cos(theta),
    parentPosition[1] + y,
    parentPosition[2] + xzRadius * Math.sin(theta)
  ]
}

// Station orbiting the system star (origin).
function localPositionStarOrbit(rng, systemScale) {
  const radius = range(rng, SYSTEM_LOCAL_MIN_RADIUS * 0.2, SYSTEM_LOCAL_MIN_RADIUS * 0.65) * systemScale
  const theta = rng() * Math.PI * 2
  const y = range(rng, -radius * 0.08, radius * 0.08)
  return [radius * Math.cos(theta), y, radius * Math.sin(theta)]
}

// Settlement sits ON a planet/moon surface (center slightly above crust so the
// mesh base meets the ground; not perched far out on a collision shell).
function localPositionOnSurface(rng, host) {
  const theta = rng() * Math.PI * 2
  const phi = Math.acos(2 * rng() - 1)
  const dist = host.radius + SETTLEMENT_SURFACE_LIFT
  const nx = Math.sin(phi) * Math.cos(theta)
  const ny = Math.cos(phi)
  const nz = Math.sin(phi) * Math.sin(theta)
  const offset = [dist * nx, dist * ny, dist * nz]
  return {
    position: [host.position[0] + offset[0], host.position[1] + offset[1], host.position[2] + offset[2]],
    surfaceOffset: offset
  }
}

// Planet + its moons share one "family" — at most one settlement in the whole family.
function hostFamilyId(body) {
  if (body.kind === 'moon' && body.parentId) return body.parentId
  return body.id
}

function familiesWithSettlements(system) {
  const taken = new Set()
  for (const b of system.bodies) {
    if (b.kind !== 'settlement' || !b.parentId || b.inAsteroidField) continue
    const parent = system.bodies.find((p) => p.id === b.parentId)
    if (parent) taken.add(hostFamilyId(parent))
  }
  return taken
}

function hostHasStation(system, hostId) {
  return system.bodies.some((b) => b.kind === 'station' && b.parentId === hostId)
}

function randomTags(rng) {
  const count = intRange(rng, 1, 2)
  const tags = new Set()
  while (tags.size < count) tags.add(pick(rng, ECONOMY_TAGS))
  return [...tags]
}

// Missions only at dockable facilities (stations / settlements).
function missionChance(kind) {
  return kind === 'station' || kind === 'settlement'
}

function radiusFor(rng, kind, systemScale) {
  if (kind === 'planet') return range(rng, 8, 21) * PLANET_SIZE_SCALE * systemScale
  if (kind === 'moon') return range(rng, 3, 8) * MOON_SIZE_SCALE * systemScale
  if (kind === 'asteroidField') return range(rng, 70, 110) * systemScale
  return null
}

function makePlanetOrMoon(rng, idCounter, kind, parent, systemScale) {
  const radius = radiusFor(rng, kind, systemScale)
  const position =
    kind === 'moon'
      ? localPositionNearBody(rng, parent.position, parent.radius, radius)
      : localPosition(rng, systemScale)
  return {
    id: `body-${idCounter}`,
    name: kind === 'moon' ? `${parent.name} Moon` : generateBodyName(rng, kind),
    kind,
    parentId: kind === 'moon' ? parent.id : undefined,
    position,
    radius,
    economyTags: randomTags(rng),
    hasMissions: false,
    hasShipyard: false,
    hasShipParts: false
  }
}

function makeAsteroidField(rng, idCounter, systemScale) {
  return {
    id: `body-${idCounter}`,
    name: generateBodyName(rng, 'asteroidField'),
    kind: 'asteroidField',
    position: localPosition(rng, systemScale),
    radius: radiusFor(rng, 'asteroidField', systemScale),
    economyTags: randomTags(rng),
    hasMissions: false,
    hasShipyard: false,
    hasShipParts: false
  }
}

function makeStation(rng, idCounter, system) {
  const planets = system.bodies.filter((b) => b.kind === 'planet')
  const moons = system.bodies.filter((b) => b.kind === 'moon')
  const bodyHosts = [...planets, ...moons]

  let position
  let parentId
  let orbitsStar = false

  if (rng() < STATION_FREE_DRIFT_CHANCE) {
    // Rare free-floating station.
    position = localPosition(rng, system.sizeScale)
  } else {
    // Host pool: star + every planet/moon in the system.
    const useStar = bodyHosts.length === 0 || rng() < 0.28
    if (useStar) {
      position = localPositionStarOrbit(rng, system.sizeScale)
      orbitsStar = true
    } else {
      const host = pick(rng, bodyHosts)
      const hostRadius = host.radius ?? 0
      position = localPositionNearBody(rng, host.position, hostRadius, STATION_CLEARANCE_RADIUS)
      parentId = host.id
    }
  }

  return {
    id: `body-${idCounter}`,
    name: generateBodyName(rng, 'station'),
    kind: 'station',
    parentId,
    orbitsStar: orbitsStar || undefined,
    position,
    radius: null,
    economyTags: randomTags(rng),
    hasMissions: true,
    hasShipyard: rng() < 0.6,
    hasShipParts: rng() < 0.06
  }
}

function makeSettlement(rng, idCounter, system, { force = false } = {}) {
  // Rare asteroid-belt outpost — only non-surface case (not subject to family rules).
  if (!force && rng() < SETTLEMENT_ASTEROID_CHANCE) {
    const fields = system.bodies.filter((b) => b.kind === 'asteroidField')
    if (fields.length) {
      const field = pick(rng, fields)
      // Sit just outside the field shell (still "in" the belt, not free deep space).
      const pos = localPositionNearBody(rng, field.position, field.radius ?? 80, SETTLEMENT_CLEARANCE_RADIUS)
      return {
        id: `body-${idCounter}`,
        name: generateBodyName(rng, 'settlement'),
        kind: 'settlement',
        parentId: field.id,
        inAsteroidField: true,
        position: pos,
        radius: null,
        economyTags: randomTags(rng),
        hasMissions: true,
        hasShipyard: false,
        hasShipParts: rng() < 0.06
      }
    }
  }

  // Surface settlements: at most ONE per planet family (planet OR one of its
  // moons — never both). If that body already has a station, only 5% chance.
  const takenFamilies = familiesWithSettlements(system)
  const candidates = system.bodies.filter(
    (b) => (b.kind === 'planet' || b.kind === 'moon') && !takenFamilies.has(hostFamilyId(b))
  )
  // Shuffle-pick until one accepts (station co-location roll, unless forced).
  const pool = [...candidates]
  while (pool.length) {
    const idx = intRange(rng, 0, pool.length - 1)
    const host = pool.splice(idx, 1)[0]
    if (!force && hostHasStation(system, host.id) && rng() >= SETTLEMENT_WITH_STATION_CHANCE) continue

    const { position, surfaceOffset } = localPositionOnSurface(rng, host)
    return {
      id: `body-${idCounter}`,
      name: generateBodyName(rng, 'settlement'),
      kind: 'settlement',
      parentId: host.id,
      surfaceOffset,
      position,
      radius: null,
      economyTags: randomTags(rng),
      hasMissions: true,
      hasShipyard: false,
      hasShipParts: rng() < 0.06
    }
  }
  return null
}

function computeNeighborLanes(systems) {
  const neighborSets = new Map(systems.map((s) => [s.id, new Set()]))
  for (const system of systems) {
    const nearest = systems
      .filter((other) => other !== system)
      .map((other) => ({
        id: other.id,
        dist: Math.hypot(other.galaxyPosition[0] - system.galaxyPosition[0], other.galaxyPosition[2] - system.galaxyPosition[2])
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, JUMP_NEIGHBOR_COUNT)
    for (const { id } of nearest) {
      neighborSets.get(system.id).add(id)
      neighborSets.get(id).add(system.id)
    }
  }
  for (const system of systems) system.neighborIds = [...neighborSets.get(system.id)]
}

// Guarantees the player's home system has somewhere to dock and trade.
export function ensureStartingSystemFacilities(system, rng, startId = 0) {
  let bodyIdCounter = startId
  const maxExisting = system.bodies.reduce((m, b) => {
    const n = Number(String(b.id).replace(/^body-/, ''))
    return Number.isFinite(n) ? Math.max(m, n + 1) : m
  }, 0)
  bodyIdCounter = Math.max(bodyIdCounter, maxExisting)

  while (system.bodies.filter((b) => b.kind === 'station').length < 1) {
    system.bodies.push(makeStation(rng, bodyIdCounter++, system))
  }
  // Force surface placements so the home system always gets docks even when
  // station co-location / family rules would otherwise reject random rolls.
  let guard = 0
  while (system.bodies.filter((b) => b.kind === 'settlement').length < 2 && guard++ < 20) {
    const s = makeSettlement(rng, bodyIdCounter++, system, { force: true })
    if (s) system.bodies.push(s)
    else break
  }
  return bodyIdCounter
}

export function generateGalaxy(seed, opts = {}) {
  const {
    systemCount = 450,
    totalPlanets = 1500,
    stationCount = 180,
    settlementCount = 120,
    // ~19% of systems (was 40 ≈ 9%; +10 percentage points).
    asteroidFieldCount = 85,
    speciesCount = 20
  } = opts
  const rng = mulberry32(seed)
  let bodyIdCounter = 0

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
      const planet = makePlanetOrMoon(rng, bodyIdCounter++, 'planet', null, sizeScale)
      bodies.push(planet)
      if (rng() < MOON_CHANCE) bodies.push(makePlanetOrMoon(rng, bodyIdCounter++, 'moon', planet, sizeScale))
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
    system.bodies.push(makeStation(rng, bodyIdCounter++, system))
  }
  for (let i = 0; i < settlementCount; i++) {
    const system = pick(rng, systems)
    const settlement = makeSettlement(rng, bodyIdCounter++, system)
    if (settlement) system.bodies.push(settlement)
  }
  for (let i = 0; i < asteroidFieldCount; i++) {
    const system = pick(rng, systems)
    system.bodies.push(makeAsteroidField(rng, bodyIdCounter++, system.sizeScale))
  }

  computeNeighborLanes(systems)

  // Outer-rim landmark: rename the farthest system and guarantee SerNub's station.
  bodyIdCounter = placeWhispersSystem(systems, bodyIdCounter)

  const species = []
  for (let i = 0; i < speciesCount; i++) species.push(generateSpeciesName(rng))

  return { seed, systems, species, _nextBodyId: bodyIdCounter }
}

/**
 * Picks the system farthest from the galactic core, names it Whispers, tags it
 * as ambient-hostile-free, and ensures a station named SerNub's Pleasure Palace.
 * Deterministic from layout alone (no extra RNG) so seeds stay stable.
 */
function placeWhispersSystem(systems, bodyIdCounter) {
  let rim = systems[0]
  let bestDist = -1
  for (const system of systems) {
    const dist = Math.hypot(system.galaxyPosition[0], system.galaxyPosition[2])
    if (dist > bestDist) {
      bestDist = dist
      rim = system
    }
  }

  // Avoid a second system keeping the same display name if procgen rolled it.
  for (const system of systems) {
    if (system !== rim && system.name === WHISPERS_SYSTEM_NAME) {
      system.name = `${system.name} Reach`
    }
  }

  rim.name = WHISPERS_SYSTEM_NAME
  // main.js ambient spawn keys off this — permanent (not breakable like home peace).
  rim.noAmbientHostiles = true
  // Only trinary in the galaxy — starMesh / starTypeForSystem read this flag.
  rim.starType = 'trinary'

  let station = rim.bodies.find((b) => b.kind === 'station')
  if (!station) {
    // Seeded only from system id so we don't perturb the main galaxy RNG stream.
    const idHash = [...rim.id].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)
    const stationRng = mulberry32(Math.abs(idHash) ^ 0x5e12ab)
    station = makeStation(stationRng, bodyIdCounter++, rim)
    rim.bodies.push(station)
  }
  station.name = WHISPERS_STATION_NAME
  station.hasMissions = true

  return bodyIdCounter
}

export function canJumpTo(fromSystem, toSystemId) {
  return fromSystem.neighborIds.includes(toSystemId)
}

export function coreFraction(system) {
  const dist = Math.hypot(system.galaxyPosition[0], system.galaxyPosition[2])
  return Math.min(1, dist / GALAXY_MAX_RADIUS)
}

export function systemsWithinJumps(galaxy, originSystemId, maxJumps) {
  const visited = new Set([originSystemId])
  let frontier = [originSystemId]
  for (let depth = 0; depth < maxJumps && frontier.length; depth++) {
    const next = []
    for (const systemId of frontier) {
      const system = getSystem(galaxy, systemId)
      for (const neighborId of system.neighborIds) {
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        next.push(neighborId)
      }
    }
    frontier = next
  }
  return [...visited].map((id) => getSystem(galaxy, id))
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
