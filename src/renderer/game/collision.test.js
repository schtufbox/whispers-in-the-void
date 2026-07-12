import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveBodyCollisions } from './collision.js'

test('flying into a planet pushes the ship back to the surface and cancels inward velocity', () => {
  const planet = { kind: 'planet', position: [0, 0, 100], radius: 20 }
  const shipState = { position: [0, 0, 85], velocity: [0, 0, 50] }
  const shipRadius = 5

  resolveBodyCollisions(shipState, [planet], shipRadius)

  const dist = Math.hypot(...shipState.position.map((v, i) => v - planet.position[i]))
  assert.ok(Math.abs(dist - (planet.radius + shipRadius)) < 1e-6, 'ship should sit exactly at the collision surface')
  assert.ok(shipState.velocity[2] <= 0, 'velocity flying into the planet should be cancelled, not pass through')
})

test('a ship well clear of every body is left untouched', () => {
  const planet = { kind: 'planet', position: [0, 0, 1000], radius: 20 }
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 10] }
  resolveBodyCollisions(shipState, [planet], 5)
  assert.deepEqual(shipState.position, [0, 0, 0])
  assert.deepEqual(shipState.velocity, [0, 0, 10])
})

test('sliding tangent to a body is not affected (only the inward component is cancelled)', () => {
  const planet = { kind: 'planet', position: [0, 0, 0], radius: 20 }
  const shipState = { position: [22, 0, 0], velocity: [0, 0, 30] }
  resolveBodyCollisions(shipState, [planet], 5)
  assert.deepEqual(shipState.velocity, [0, 0, 30], 'velocity tangential to the surface should be untouched')
})

test('kinds without a defined collision radius (e.g. asteroid fields missing radius) are skipped safely', () => {
  const weird = { kind: 'unknown', position: [0, 0, 0] }
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 1] }
  resolveBodyCollisions(shipState, [weird], 5)
  assert.deepEqual(shipState.position, [0, 0, 0])
})
