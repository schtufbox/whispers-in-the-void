import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../procgen/prng.js'
import { createGameState } from '../game/state.js'
import { acceptMission, dropMission, finishMission } from '../game/missions.js'
import { STARTER_SHIP_CLASS_ID } from './shipClasses.js'
import {
  generateMissionsForBody,
  refillMissionsIfExhausted,
  seedMissionsForGalaxy
} from './missionTemplates.js'

function freshState(seed = 42) {
  return createGameState({
    characterName: 'Pilot',
    shipInstanceName: 'Ship',
    shipClassId: STARTER_SHIP_CLASS_ID,
    seed
  })
}

function missionBody(gs) {
  // Prefer a body that actually received a board seed.
  const withBoard = gs.missions.available[0]?.giverStationId
  if (withBoard) {
    for (const system of gs.galaxy.systems) {
      const body = system.bodies.find((b) => b.id === withBoard)
      if (body) return { system, body }
    }
  }
  for (const system of gs.galaxy.systems) {
    const body = system.bodies.find((b) => b.hasMissions)
    if (body) return { system, body }
  }
  return null
}

test('generateMissionsForBody posts 1–3 contracts for a mission body', () => {
  const gs = freshState(7)
  const hit = missionBody(gs)
  assert.ok(hit, 'need a hasMissions body')
  const missions = generateMissionsForBody(mulberry32(99), gs.galaxy, hit.system.id, hit.body.id)
  assert.ok(missions.length >= 1 && missions.length <= 3)
  assert.ok(missions.every((m) => m.giverStationId === hit.body.id))
  assert.ok(missions.every((m) => m.status === 'available'))
})

test('refillMissionsIfExhausted does nothing while the board still has work', () => {
  const gs = freshState(11)
  const hit = missionBody(gs)
  assert.ok(hit)
  const before = gs.missions.available.filter((m) => m.giverStationId === hit.body.id)
  assert.ok(before.length > 0, 'seeded board should have missions')
  const added = refillMissionsIfExhausted(gs, hit.body.id, mulberry32(1))
  assert.equal(added.length, 0)
  assert.equal(
    gs.missions.available.filter((m) => m.giverStationId === hit.body.id).length,
    before.length
  )
})

test('refillMissionsIfExhausted waits while active missions from that body remain', () => {
  const gs = freshState(13)
  const hit = missionBody(gs)
  assert.ok(hit)
  const board = gs.missions.available.filter((m) => m.giverStationId === hit.body.id)
  // Strip board and leave one accepted active contract.
  gs.missions.available = gs.missions.available.filter((m) => m.giverStationId !== hit.body.id)
  gs.missions.available.push(board[0])
  acceptMission(gs, board[0].id, Math.random)
  assert.equal(gs.missions.available.filter((m) => m.giverStationId === hit.body.id).length, 0)
  assert.ok(gs.missions.active.some((m) => m.giverStationId === hit.body.id))

  const blocked = refillMissionsIfExhausted(gs, hit.body.id, mulberry32(5))
  assert.equal(blocked.length, 0, 'must not refill while active contracts remain')
})

test('accepting every available contract never restocks until complete/drop', () => {
  const gs = freshState(41)
  const hit = missionBody(gs)
  assert.ok(hit)
  const bodyId = hit.body.id
  // Accept the entire board one by one; refill after each accept must be empty.
  for (let guard = 0; guard < 10; guard++) {
    const board = gs.missions.available.filter((m) => String(m.giverStationId) === String(bodyId))
    if (!board.length) break
    acceptMission(gs, board[0].id, Math.random)
    const added = refillMissionsIfExhausted(gs, bodyId, mulberry32(guard + 3))
    assert.equal(added.length, 0, `accept step ${guard}: board must not restock`)
  }
  assert.ok(gs.missions.active.some((m) => String(m.giverStationId) === String(bodyId)))
  assert.equal(
    gs.missions.available.filter((m) => String(m.giverStationId) === String(bodyId)).length,
    0
  )
})

test('refillMissionsIfExhausted rolls a new board only after complete or drop of all contracts', () => {
  const gs = freshState(17)
  const hit = missionBody(gs)
  assert.ok(hit)
  const board = gs.missions.available.filter((m) => m.giverStationId === hit.body.id)
  // Leave a single mission, accept it, then drop — fully exhaust that body.
  gs.missions.available = gs.missions.available.filter((m) => m.giverStationId !== hit.body.id)
  gs.missions.available.push(board[0])
  acceptMission(gs, board[0].id, Math.random)
  dropMission(gs, board[0].id)
  assert.equal(gs.missions.available.filter((m) => m.giverStationId === hit.body.id).length, 0)
  assert.equal(gs.missions.active.filter((m) => m.giverStationId === hit.body.id).length, 0)

  const added = refillMissionsIfExhausted(gs, hit.body.id, mulberry32(21))
  assert.ok(added.length >= 1)
  assert.ok(added.every((m) => m.id !== board[0].id))
})

test('refill after auto-complete of a mission also works', () => {
  const gs = freshState(23)
  const hit = missionBody(gs)
  assert.ok(hit)
  const board = gs.missions.available.filter((m) => m.giverStationId === hit.body.id)
  gs.missions.available = gs.missions.available.filter((m) => m.giverStationId !== hit.body.id)
  gs.missions.available.push(board[0])
  acceptMission(gs, board[0].id, Math.random)
  const creditsBefore = gs.player.credits
  finishMission(gs, board[0])
  assert.ok(gs.player.credits > creditsBefore)
  assert.equal(gs.missions.active.some((m) => m.id === board[0].id), false)

  const added = refillMissionsIfExhausted(gs, hit.body.id, mulberry32(29))
  assert.ok(added.length >= 1)
})

test('seedMissionsForGalaxy still produces galaxy-wide boards', () => {
  const gs = freshState(19)
  const seeded = seedMissionsForGalaxy(mulberry32(3), gs.galaxy)
  assert.ok(seeded.length > 10)
  assert.ok(seeded.every((m) => m.status === 'available'))
})
