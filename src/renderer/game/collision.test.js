import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveBodyCollisions, trySupercruiseTunnel } from './collision.js'

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

test('supercruise tunnel exits the far side of a body along travel direction', () => {
  const planet = { id: 'p1', kind: 'planet', position: [0, 0, 100], radius: 40 }
  const shipState = {
    position: [0, 0, 70],
    velocity: [0, 0, 80],
    quaternion: [0, 0, 0, 1]
  }
  const event = trySupercruiseTunnel(shipState, [planet], 5)
  assert.ok(event, 'should tunnel when overlapping')
  assert.ok(shipState.position[2] > planet.position[2], 'exit should be past the body center')
  const dist = Math.hypot(...shipState.position.map((v, i) => v - planet.position[i]))
  assert.ok(dist >= planet.radius + 5, 'exit should clear the collision shell')
})

test('supercruise tunnel ignores the destination body', () => {
  const planet = { id: 'dest', kind: 'planet', position: [0, 0, 100], radius: 40 }
  const shipState = { position: [0, 0, 70], velocity: [0, 0, 80], quaternion: [0, 0, 0, 1] }
  const event = trySupercruiseTunnel(shipState, [planet], 5, 'dest')
  assert.equal(event, null)
  assert.deepEqual(shipState.position, [0, 0, 70])
})

test('supercruise tunnel ignores explicit host body ids (surface settlement parent)', () => {
  const planet = { id: 'host', kind: 'planet', position: [0, 0, 100], radius: 40 }
  const shipState = { position: [0, 0, 70], velocity: [0, 0, 80], quaternion: [0, 0, 0, 1] }
  const event = trySupercruiseTunnel(shipState, [planet], 5, 'settlement', new Set(['host']))
  assert.equal(event, null)
  assert.deepEqual(shipState.position, [0, 0, 70])
})
