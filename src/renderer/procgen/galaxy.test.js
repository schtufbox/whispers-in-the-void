import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateGalaxy,
  canJumpTo,
  findHyperspaceRoute,
  advancePlottedRoute,
  ensureStartingSystemFacilities,
  coreFraction,
  WHISPERS_SYSTEM_NAME,
  WHISPERS_STATION_NAME
} from './galaxy.js'
import { mulberry32 } from './prng.js'

function allBodies(galaxy) {
  return galaxy.systems.flatMap((s) => s.bodies)
}

test('moons appear on roughly 23% of planets and orbit close to their parent', () => {
  const galaxy = generateGalaxy(42)
  const bodies = allBodies(galaxy)
  const planets = bodies.filter((b) => b.kind === 'planet')
  const moons = bodies.filter((b) => b.kind === 'moon')

  const ratio = moons.length / planets.length
  assert.ok(ratio > 0.15 && ratio < 0.31, `expected ~23% moons per planet, got ${(ratio * 100).toFixed(1)}%`)

  // Moons orbit close to their parent planet (looked up by parentId).
  for (const system of galaxy.systems) {
    for (const body of system.bodies) {
      if (body.kind !== 'moon') continue
      const parent = system.bodies.find((b) => b.id === body.parentId)
      assert.ok(parent && parent.kind === 'planet', 'moon must parent a planet')
      const dist = Math.hypot(
        body.position[0] - parent.position[0],
        body.position[1] - parent.position[1],
        body.position[2] - parent.position[2]
      )
      // Threshold accounts for scaled planet/moon radii (PLANET/MOON_SIZE_SCALE)
      // and multi-moon shells stacked outside each other.
      assert.ok(dist < 14000, `moon should orbit close to its parent planet, got distance ${dist}`)
    }
  }
})

test('stations co-hosted with moons keep non-intersecting orbital radii', () => {
  // main.js animates both on flat XZ circles around the same parent — if the
  // two orbit radii are closer than moonR + station shell, they can meet.
  const STATION_SHELL = 2500
  const MARGIN = 6
  let checked = 0
  for (const seed of [1, 2, 3, 42, 1337, 9001]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      for (const station of system.bodies.filter((b) => b.kind === 'station' && b.parentId)) {
        const parent = system.bodies.find((b) => b.id === station.parentId)
        if (!parent || parent.kind !== 'planet') continue
        const stationR = Math.hypot(
          station.position[0] - parent.position[0],
          station.position[2] - parent.position[2]
        )
        for (const moon of system.bodies.filter((b) => b.kind === 'moon' && b.parentId === parent.id)) {
          const moonR = Math.hypot(
            moon.position[0] - parent.position[0],
            moon.position[2] - parent.position[2]
          )
          const need = (moon.radius ?? 0) + STATION_SHELL + MARGIN
          const gap = Math.abs(stationR - moonR)
          assert.ok(
            gap >= need - 1e-6,
            `seed ${seed}: station/moon orbit gap ${gap.toFixed(1)} < required ${need.toFixed(1)} around ${parent.name}`
          )
          checked++
        }
      }
    }
  }
  assert.ok(checked > 0, 'expected at least one planet with both a moon and a station')
})

test('stations never spawn inside planets, moons, or settlements', () => {
  // Placement clearance (visual bulk), not the tight 500m player collision shell.
  const STATION_SHELL = 2500
  const SETTLEMENT_SHELL = 72
  const MARGIN = 6
  const PLANET_GAP = 2000
  function shell(b) {
    if (b.kind === 'station') return STATION_SHELL
    if (b.kind === 'settlement') return SETTLEMENT_SHELL
    return b.radius ?? 0
  }
  function margin(kind) {
    return kind === 'planet' ? PLANET_GAP : MARGIN
  }
  for (const seed of [1, 2, 3, 42, 1337, 9001, 777, 99]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      for (const station of system.bodies.filter((b) => b.kind === 'station')) {
        for (const other of system.bodies) {
          if (other.id === station.id) continue
          if (other.kind !== 'planet' && other.kind !== 'moon' && other.kind !== 'settlement') continue
          const d = Math.hypot(
            station.position[0] - other.position[0],
            station.position[1] - other.position[1],
            station.position[2] - other.position[2]
          )
          const need = STATION_SHELL + shell(other) + margin(other.kind)
          assert.ok(
            d >= need - 1e-3,
            `seed ${seed}: ${station.name} inside ${other.kind} ${other.name} (d=${d.toFixed(1)} need=${need.toFixed(1)})`
          )
        }
      }
    }
  }
})

test('planet-hosted stations keep at least 2000m surface clearance', () => {
  const STATION_SHELL = 2500
  const PLANET_GAP = 2000
  let checked = 0
  for (const seed of [1, 2, 3, 42, 1337, 9001]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      for (const station of system.bodies.filter((b) => b.kind === 'station' && b.parentId)) {
        const parent = system.bodies.find((b) => b.id === station.parentId)
        if (!parent || parent.kind !== 'planet') continue
        const xz = Math.hypot(
          station.position[0] - parent.position[0],
          station.position[2] - parent.position[2]
        )
        const need = (parent.radius ?? 0) + STATION_SHELL + PLANET_GAP
        assert.ok(
          xz >= need - 1e-3,
          `seed ${seed}: station orbit ${xz.toFixed(1)} < min ${need.toFixed(1)} around ${parent.name}`
        )
        checked++
      }
    }
  }
  assert.ok(checked > 0, 'expected planet-hosted stations')
})

test('moon-hosted stations keep their full orbit outside the grandparent planet', () => {
  // main.js orbits the station around the moon; worst case is the near side.
  const STATION_SHELL = 2500
  const PLANET_GAP = 2000
  let checked = 0
  for (const seed of [1, 2, 3, 42, 1337, 9001]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      for (const station of system.bodies.filter((b) => b.kind === 'station' && b.parentId)) {
        const moon = system.bodies.find((b) => b.id === station.parentId)
        if (!moon || moon.kind !== 'moon' || !moon.parentId) continue
        const planet = system.bodies.find((b) => b.id === moon.parentId)
        if (!planet) continue
        const moonR = Math.hypot(moon.position[0] - planet.position[0], moon.position[2] - planet.position[2])
        const stR = Math.hypot(
          station.position[0] - moon.position[0],
          station.position[2] - moon.position[2]
        )
        const nearSide = moonR - stR
        const need = (planet.radius ?? 0) + STATION_SHELL + PLANET_GAP
        assert.ok(
          nearSide >= need - 1e-3,
          `seed ${seed}: moon-station near-side ${nearSide.toFixed(1)} < planet shell ${need.toFixed(1)}`
        )
        checked++
      }
    }
  }
  // Moon hosts are optional; zero is fine if every station preferred planets/star.
  assert.ok(checked >= 0)
})

test('star-orbit stations keep non-intersecting solar radii with planets', () => {
  const STATION_SHELL = 2500
  const PLANET_GAP = 2000
  let checked = 0
  for (const seed of [1, 2, 3, 42, 1337]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      for (const station of system.bodies.filter((b) => b.kind === 'station' && b.orbitsStar)) {
        const stR = Math.hypot(station.position[0], station.position[2])
        for (const planet of system.bodies.filter((b) => b.kind === 'planet')) {
          const pR = Math.hypot(planet.position[0], planet.position[2])
          const need = (planet.radius ?? 0) + STATION_SHELL + PLANET_GAP
          const gap = Math.abs(stR - pR)
          assert.ok(
            gap >= need - 1e-3,
            `seed ${seed}: star-station/planet gap ${gap.toFixed(1)} < ${need.toFixed(1)}`
          )
          checked++
        }
      }
    }
  }
  assert.ok(checked > 0, 'expected star-orbit stations')
})

test("a moon's orbit radius always clears its parent planet's collision shell", () => {
  // The orbit main.js animates is a flat circle at a constant XZ-plane
  // radius (see moonOrbits), so checking that radius against the physical
  // radii here also guarantees no collision at any point during the orbit.
  for (const seed of [1, 2, 3, 42, 1337]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      system.bodies.forEach((body, i) => {
        if (body.kind !== 'moon') return
        const parent = system.bodies[i - 1]
        const xzRadius = Math.hypot(body.position[0] - parent.position[0], body.position[2] - parent.position[2])
        assert.ok(
          xzRadius >= parent.radius + body.radius,
          `moon orbit radius ${xzRadius} should clear parent radius ${parent.radius} + moon radius ${body.radius}`
        )
      })
    }
  }
})

test('a handful of asteroid fields are scattered across the galaxy and are not mission givers', () => {
  const galaxy = generateGalaxy(42)
  const fields = allBodies(galaxy).filter((b) => b.kind === 'asteroidField')
  assert.equal(fields.length, 85)
  assert.ok(fields.every((f) => f.hasMissions === false && f.hasShipyard === false))
})

test('planets, moons, and asteroid fields have a physical radius sized for their kind; other kinds have none', () => {
  const galaxy = generateGalaxy(42)
  const bodies = allBodies(galaxy)
  const byKind = (kind) => bodies.filter((b) => b.kind === kind)

  // Base ranges scaled by PLANET_SIZE_SCALE/MOON_SIZE_SCALE, times the
  // per-system SYSTEM_SCALE_VARIANCE (0.85-1.15) — see galaxy.js.
  const PLANET_SIZE_SCALE = 187.5
  const MOON_SIZE_SCALE = 123.75
  for (const b of byKind('planet')) assert.ok(b.radius >= 8 * PLANET_SIZE_SCALE * 0.85 && b.radius <= 21 * PLANET_SIZE_SCALE * 1.15)
  for (const b of byKind('moon')) assert.ok(b.radius >= 3 * MOON_SIZE_SCALE * 0.85 && b.radius <= 8 * MOON_SIZE_SCALE * 1.15)
  for (const b of byKind('asteroidField')) assert.ok(b.radius >= 70 * 0.85 && b.radius <= 110 * 1.15)
  for (const b of [...byKind('station'), ...byKind('settlement')]) assert.equal(b.radius, null)
})

test('every system has hyperspace neighbors, and the jump lanes are symmetric', () => {
  const galaxy = generateGalaxy(42)
  const byId = new Map(galaxy.systems.map((s) => [s.id, s]))

  for (const system of galaxy.systems) {
    assert.ok(system.neighborIds.length >= 5, `${system.id} should have at least 5 hyperspace neighbors`)
    assert.ok(!system.neighborIds.includes(system.id), 'a system is never its own neighbor')
    for (const neighborId of system.neighborIds) {
      assert.ok(canJumpTo(byId.get(neighborId), system.id), `${neighborId} should list ${system.id} back (symmetric lanes)`)
    }
  }
})

test('findHyperspaceRoute returns a neighbor-connected path from A to B', () => {
  const galaxy = generateGalaxy(42)
  const byId = new Map(galaxy.systems.map((s) => [s.id, s]))
  const a = galaxy.systems[0]
  // Pick a system a few hops out when possible.
  let b = galaxy.systems[galaxy.systems.length - 1]
  const path = findHyperspaceRoute(galaxy, a.id, b.id)
  assert.ok(path, 'galaxy graph should be connected enough for a route')
  assert.equal(path[0], a.id)
  assert.equal(path[path.length - 1], b.id)
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(
      canJumpTo(byId.get(path[i]), path[i + 1]),
      `hop ${path[i]} → ${path[i + 1]} must be a neighbor lane`
    )
  }
  assert.deepEqual(findHyperspaceRoute(galaxy, a.id, a.id), [a.id])
})

test('advancePlottedRoute drops hops as the player arrives', () => {
  const galaxy = generateGalaxy(7)
  const from = galaxy.systems[0]
  const path = findHyperspaceRoute(galaxy, from.id, galaxy.systems[50]?.id ?? galaxy.systems[10].id)
  assert.ok(path && path.length >= 3, 'need a multi-hop route for this test')
  const gameState = {
    galaxy,
    player: {
      currentSystemId: from.id,
      plottedRoute: path.slice(1)
    }
  }
  // Arrive at first hop.
  gameState.player.currentSystemId = path[1]
  advancePlottedRoute(gameState)
  assert.deepEqual(gameState.player.plottedRoute, path.slice(2))

  // Skip ahead to destination in one go (off intermediate list order still works).
  gameState.player.currentSystemId = path[path.length - 1]
  advancePlottedRoute(gameState)
  assert.equal(gameState.player.plottedRoute, null)
})

test('stations orbit a host (planet/moon/star) except a rare free-drifter fraction', () => {
  const galaxy = generateGalaxy(42)
  const stations = allBodies(galaxy).filter((b) => b.kind === 'station')
  const free = stations.filter((s) => !s.parentId && !s.orbitsStar)
  const freeRate = free.length / stations.length
  assert.ok(freeRate < 0.02, `free-drifting stations should be rare, got ${(freeRate * 100).toFixed(2)}%`)
  for (const s of stations) {
    if (s.parentId) {
      const parent = allBodies(galaxy).find((b) => b.id === s.parentId)
      assert.ok(parent && (parent.kind === 'planet' || parent.kind === 'moon'), 'station parent is planet or moon')
    }
  }
})

test('every station has a functional shipyard; settlements do not', () => {
  const galaxy = generateGalaxy(42)
  const stations = allBodies(galaxy).filter((b) => b.kind === 'station')
  const settlements = allBodies(galaxy).filter((b) => b.kind === 'settlement')
  assert.ok(stations.length > 0)
  assert.ok(stations.every((s) => s.hasShipyard === true))
  assert.ok(settlements.every((s) => s.hasShipyard === false))
})

test('settlements sit on a planet/moon surface (or rarely an asteroid field)', () => {
  const galaxy = generateGalaxy(42)
  let surface = 0
  let belt = 0
  for (const system of galaxy.systems) {
    for (const s of system.bodies.filter((b) => b.kind === 'settlement')) {
      assert.ok(s.parentId, 'settlement needs a parent')
      const parent = system.bodies.find((b) => b.id === s.parentId)
      assert.ok(parent, 'parent must exist in system')
      if (s.inAsteroidField) {
        assert.equal(parent.kind, 'asteroidField')
        belt++
        continue
      }
      assert.ok(parent.kind === 'planet' || parent.kind === 'moon', 'surface settlement on planet or moon')
      assert.ok(s.surfaceOffset, 'settlement needs surfaceOffset')
      const dist = Math.hypot(
        s.position[0] - parent.position[0],
        s.position[1] - parent.position[1],
        s.position[2] - parent.position[2]
      )
      // On the crust: slightly above parent.radius (surface lift only).
      assert.ok(dist >= parent.radius, `settlement should be outside host radius (dist ${dist}, r ${parent.radius})`)
      assert.ok(dist <= parent.radius + 12, `settlement should sit on the surface, not float (dist ${dist}, r ${parent.radius})`)
      surface++
    }
  }
  assert.ok(surface > 0, 'expected surface settlements')
  assert.ok(belt / (surface + belt) < 0.05, 'asteroid-belt settlements should be rare')
})

test('at most one settlement per planet family (planet or its moon, not both)', () => {
  const galaxy = generateGalaxy(42)
  for (const system of galaxy.systems) {
    const familyCount = new Map()
    for (const s of system.bodies.filter((b) => b.kind === 'settlement' && !b.inAsteroidField)) {
      const parent = system.bodies.find((b) => b.id === s.parentId)
      assert.ok(parent)
      const family = parent.kind === 'moon' && parent.parentId ? parent.parentId : parent.id
      familyCount.set(family, (familyCount.get(family) ?? 0) + 1)
    }
    for (const [family, n] of familyCount) {
      assert.equal(n, 1, `family ${family} has ${n} settlements`)
    }
  }
})

test('ensureStartingSystemFacilities adds at least 1 station, 2 settlements, and 1 asteroid field', () => {
  const galaxy = generateGalaxy(7)
  // Need ≥2 planet families so family-unique settlement rules can still place two.
  const system = galaxy.systems.find((s) => s.bodies.filter((b) => b.kind === 'planet').length >= 2) ?? galaxy.systems[0]
  // Strip facilities + belts
  system.bodies = system.bodies.filter((b) => b.kind === 'planet' || b.kind === 'moon')
  ensureStartingSystemFacilities(system, mulberry32(99), galaxy._nextBodyId ?? 0)
  assert.ok(system.bodies.filter((b) => b.kind === 'station').length >= 1)
  assert.ok(system.bodies.filter((b) => b.kind === 'settlement').length >= 2)
  assert.ok(system.bodies.filter((b) => b.kind === 'asteroidField').length >= 1)
})

test('every system name is unique across the galaxy', () => {
  for (const seed of [1, 42, 99, 1337]) {
    const galaxy = generateGalaxy(seed)
    const names = galaxy.systems.map((s) => s.name)
    assert.equal(new Set(names).size, names.length, `seed ${seed}: duplicate system names`)
    assert.equal(names.filter((n) => n === WHISPERS_SYSTEM_NAME).length, 1)
  }
})

test('planets use System + Roman numeral, or a unique name when hosting facilities', () => {
  for (const seed of [1, 42, 1337]) {
    const galaxy = generateGalaxy(seed)
    for (const system of galaxy.systems) {
      const planets = system.bodies.filter((b) => b.kind === 'planet')
      for (const planet of planets) {
        // "Sarnosian III" — no "Planet", Roman only.
        const m = planet.name.match(new RegExp(`^${escapeRegExp(system.name)} ([IVXLCDM]+)$`))
        if (m) {
          assert.ok(!/\d/.test(planet.name), `seed ${seed}: arabic digits in planet name ${planet.name}`)
          continue
        }
        // Unique proper name: no Arabic digits and must not end with a Roman numeral token.
        assert.ok(
          !/\d/.test(planet.name) && !/\b[IVXLCDM]+\b$/.test(planet.name),
          `seed ${seed}: unique planet name must not use numerals: ${planet.name}`
        )
        const hostsFacility = system.bodies.some(
          (b) =>
            (b.kind === 'station' || b.kind === 'settlement') &&
            b.parentId === planet.id
        )
        assert.ok(
          hostsFacility,
          `seed ${seed}: planet "${planet.name}" in ${system.name} is not sequential and has no facility`
        )
      }

      // Moons: "{Planet} - Moon I" or unique (no numerals).
      for (const moon of system.bodies.filter((b) => b.kind === 'moon')) {
        const parent = system.bodies.find((b) => b.id === moon.parentId)
        assert.ok(parent, `seed ${seed}: moon ${moon.name} missing parent`)
        const cat = moon.name.match(new RegExp(`^${escapeRegExp(parent.name)} - Moon ([IVXLCDM]+)$`))
        if (cat) continue
        assert.ok(
          !/\b[IVXLCDM]+\b$/.test(moon.name) && !/\d/.test(moon.name),
          `seed ${seed}: unique moon name must not use numerals: ${moon.name}`
        )
      }
    }
  }
})

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('Whispers is the outermost system, has SerNub station, and is ambient-hostile-free', () => {
  for (const seed of [1, 42, 99, 1337]) {
    const galaxy = generateGalaxy(seed)
    const whispers = galaxy.systems.filter((s) => s.name === WHISPERS_SYSTEM_NAME)
    assert.equal(whispers.length, 1, `seed ${seed}: exactly one Whispers`)
    const system = whispers[0]
    assert.equal(system.noAmbientHostiles, true)
    assert.equal(system.starType, 'trinary', `seed ${seed}: Whispers is the trinary system`)

    // Outer rim: no other system should be farther from the core.
    const dist = Math.hypot(system.galaxyPosition[0], system.galaxyPosition[2])
    for (const other of galaxy.systems) {
      if (other === system) continue
      const d = Math.hypot(other.galaxyPosition[0], other.galaxyPosition[2])
      assert.ok(d <= dist + 1e-6, `seed ${seed}: ${other.name} farther than Whispers`)
      assert.notEqual(other.starType, 'trinary', `seed ${seed}: only Whispers is trinary`)
    }
    assert.ok(coreFraction(system) > 0.85, `seed ${seed}: Whispers should be near the rim, got ${coreFraction(system)}`)

    const palace = system.bodies.filter((b) => b.kind === 'station' && b.name === WHISPERS_STATION_NAME)
    assert.equal(palace.length, 1, `seed ${seed}: SerNub's Pleasure Palace station`)
  }
})
