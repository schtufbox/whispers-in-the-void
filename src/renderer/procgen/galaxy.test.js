import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateGalaxy,
  canJumpTo,
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

  // Moons are generated immediately after their parent planet within the
  // same system's bodies array, so the preceding entry is always the parent.
  for (const system of galaxy.systems) {
    system.bodies.forEach((body, i) => {
      if (body.kind !== 'moon') return
      const parent = system.bodies[i - 1]
      assert.equal(parent.kind, 'planet')
      const dist = Math.hypot(
        body.position[0] - parent.position[0],
        body.position[1] - parent.position[1],
        body.position[2] - parent.position[2]
      )
      // Threshold accounts for scaled planet/moon radii (PLANET/MOON_SIZE_SCALE):
      // orbit clearance = parentR + moonR + margin can exceed several thousand.
      assert.ok(dist < 8000, `moon should orbit close to its parent planet, got distance ${dist}`)
    })
  }
})

test('stations co-hosted with moons keep non-intersecting orbital radii', () => {
  // main.js animates both on flat XZ circles around the same parent — if the
  // two orbit radii are closer than moonR + station shell, they can meet.
  const STATION_SHELL = 337.5
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
      // On the crust: slightly above parent.radius (small surface lift only).
      assert.ok(dist >= parent.radius, `settlement should be outside host radius (dist ${dist}, r ${parent.radius})`)
      assert.ok(dist <= parent.radius + 80, `settlement should sit on the surface, not float (dist ${dist}, r ${parent.radius})`)
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

test('ensureStartingSystemFacilities adds at least 1 station and 2 settlements', () => {
  const galaxy = generateGalaxy(7)
  // Need ≥2 planet families so family-unique settlement rules can still place two.
  const system = galaxy.systems.find((s) => s.bodies.filter((b) => b.kind === 'planet').length >= 2) ?? galaxy.systems[0]
  // Strip facilities
  system.bodies = system.bodies.filter((b) => b.kind === 'planet' || b.kind === 'moon')
  ensureStartingSystemFacilities(system, mulberry32(99), galaxy._nextBodyId ?? 0)
  assert.ok(system.bodies.filter((b) => b.kind === 'station').length >= 1)
  assert.ok(system.bodies.filter((b) => b.kind === 'settlement').length >= 2)
})

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
