import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateGalaxy, canJumpTo } from './galaxy.js'

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
      // Threshold accounts for the scaled-up planet/moon radii (see
      // PLANET_SIZE_SCALE/MOON_SIZE_SCALE in galaxy.js): the orbit clearance
      // clamp can push larger pairs' orbit radius well past the old ~45 cap.
      assert.ok(dist < 100, `moon should orbit close to its parent planet, got distance ${dist}`)
    })
  }
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
  assert.equal(fields.length, 40)
  assert.ok(fields.every((f) => f.hasMissions === false && f.hasShipyard === false))
})

test('planets, moons, and asteroid fields have a physical radius sized for their kind; other kinds have none', () => {
  const galaxy = generateGalaxy(42)
  const bodies = allBodies(galaxy)
  const byKind = (kind) => bodies.filter((b) => b.kind === kind)

  // Base ranges scaled by PLANET_SIZE_SCALE/MOON_SIZE_SCALE, times the
  // per-system SYSTEM_SCALE_VARIANCE (0.85-1.15) — see galaxy.js.
  for (const b of byKind('planet')) assert.ok(b.radius >= 8 * 2.5 * 0.85 && b.radius <= 21 * 2.5 * 1.15)
  for (const b of byKind('moon')) assert.ok(b.radius >= 3 * 1.65 * 0.85 && b.radius <= 8 * 1.65 * 1.15)
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
