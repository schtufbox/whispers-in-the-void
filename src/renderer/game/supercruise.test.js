import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updateSupercruise, SUPERCRUISE_MULTIPLIER } from './supercruise.js'
import { updateFlight } from './flight.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'

const DT = 1 / 60

test('updateSupercruise flies the ship toward the target and reports arrival', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const target = [0, 0, 500]

  let arrived = false
  for (let i = 0; i < 600 && !arrived; i++) {
    arrived = updateSupercruise(shipState, shipClass, target, DT)
  }

  assert.equal(arrived, true, 'ship should reach the arrival threshold within a reasonable number of steps')
  assert.ok(shipState.position[2] > 0, 'ship should have moved toward the target')
})

test('supercruise cruising speed is roughly SUPERCRUISE_MULTIPLIER times normal manual-flight cruising speed', () => {
  // The flight model's exponential damping means ships settle at a terminal
  // velocity well below their nominal stats.speed cap under sustained thrust
  // (that cap is a hard ceiling, not a value normal flight actually reaches).
  // So "triple speed" is measured against real cruising speed, not the cap.
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)

  const manualState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const keys = new Set(['KeyW'])
  for (let i = 0; i < 600; i++) updateFlight(manualState, shipClass, keys, { dx: 0, dy: 0 }, DT)
  const manualSpeed = Math.hypot(...manualState.velocity)

  const cruiseState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  for (let i = 0; i < 600; i++) updateSupercruise(cruiseState, shipClass, [0, 0, 10000], DT)
  const cruiseSpeed = Math.hypot(...cruiseState.velocity)

  const ratio = cruiseSpeed / manualSpeed
  assert.ok(ratio > SUPERCRUISE_MULTIPLIER * 0.9 && ratio < SUPERCRUISE_MULTIPLIER * 1.1, `expected ~${SUPERCRUISE_MULTIPLIER}x, got ${ratio.toFixed(2)}x`)
})

test('arriving within range on the first call returns true immediately without moving', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const arrived = updateSupercruise(shipState, shipClass, [0, 0, 10], DT)
  assert.equal(arrived, true)
})
