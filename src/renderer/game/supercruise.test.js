import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { updateSupercruise, aimAroundObstacles, SUPERCRUISE_MULTIPLIER } from './supercruise.js'
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

test('custom arrivalRange is respected (body-sized shells for large stations/planets)', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  // 200 units out — default range would not count as arrived, body-sized range does.
  assert.equal(updateSupercruise(shipState, shipClass, [0, 0, 200], DT, 250), true)
  assert.equal(updateSupercruise(shipState, shipClass, [0, 0, 200], DT, 60), false)
})

test('aimAroundObstacles leaves a clear path alone', () => {
  const shipPos = new THREE.Vector3(0, 0, 0)
  const targetPos = new THREE.Vector3(0, 0, 1000)
  // Planet off to the side, well clear of the path.
  const bodies = [{ id: 'p1', kind: 'planet', position: [500, 0, 400], radius: 50 }]
  const aim = aimAroundObstacles(shipPos, targetPos, bodies, 5)
  assert.deepEqual(aim.toArray(), targetPos.toArray())
})

test('aimAroundObstacles skirts a body sitting on the path', () => {
  const shipPos = new THREE.Vector3(0, 0, 0)
  const targetPos = new THREE.Vector3(0, 0, 1000)
  // Planet dead ahead on the boresight.
  const bodies = [{ id: 'blocker', kind: 'planet', position: [0, 0, 400], radius: 80 }]
  const aim = aimAroundObstacles(shipPos, targetPos, bodies, 5)
  // Should not still aim straight through the planet center.
  assert.notDeepEqual(aim.toArray(), targetPos.toArray())
  // Skirt point should clear the shell (radius 80 + ship 5 + margin 40 = 125).
  const distFromBody = aim.distanceTo(new THREE.Vector3(0, 0, 400))
  assert.ok(distFromBody >= 120, `aim should sit outside the shell, got ${distFromBody.toFixed(1)}`)
})

test('aimAroundObstacles does not avoid the destination body', () => {
  const shipPos = new THREE.Vector3(0, 0, 0)
  const targetPos = new THREE.Vector3(0, 0, 500)
  const bodies = [{ id: 'dest', kind: 'planet', position: [0, 0, 500], radius: 100 }]
  const aim = aimAroundObstacles(shipPos, targetPos, bodies, 5, 'dest')
  assert.deepEqual(aim.toArray(), targetPos.toArray())
})

test('updateSupercruise with a blocker still reaches the target and stays outside its shell', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const shipRadius = shipClass.hull.length / 2
  const shipState = { position: [0, 0, 0], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const target = [0, 0, 1200]
  const blocker = { id: 'blocker', kind: 'planet', position: [0, 0, 500], radius: 100 }
  const dest = { id: 'dest', kind: 'planet', position: [0, 0, 1200], radius: 30 }
  const bodies = [blocker, dest]
  const arrivalRange = 30 + shipRadius + 45

  let arrived = false
  let minDistToBlocker = Infinity
  for (let i = 0; i < 12000 && !arrived; i++) {
    arrived = updateSupercruise(shipState, shipClass, target, DT, arrivalRange, bodies, shipRadius, 'dest')
    const d = Math.hypot(
      shipState.position[0] - 0,
      shipState.position[1] - 0,
      shipState.position[2] - 500
    )
    if (d < minDistToBlocker) minDistToBlocker = d
  }

  assert.equal(arrived, true, 'should still arrive despite the blocker')
  // Must never dive inside the collision shell (100 + shipRadius).
  assert.ok(
    minDistToBlocker >= 100 + shipRadius - 2,
    `should stay outside blocker shell, closest approach ${minDistToBlocker.toFixed(1)}`
  )
})
