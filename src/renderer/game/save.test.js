import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from './state.js'
import { serializeGameState, deserializeGameState } from './save.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { acceptMission } from './missions.js'

test('serialize then deserialize round-trips player, galaxy, and missions, and drops ephemeral encounter state', () => {
  const gameState = createGameState({
    characterName: 'Nova', shipInstanceName: 'Wanderer', shipClassId: STARTER_SHIP_CLASS_ID, seed: 5
  })
  gameState.player.credits = 4321
  gameState.player.ship.position = [10, 20, 30]
  gameState.player.ship.quaternion = [0, 0.1, 0, 0.995]
  gameState.player.ship.velocity = [1, 0, -5]
  gameState.player.dockedBodyId = null

  const json = JSON.parse(JSON.stringify(serializeGameState(gameState)))
  const restored = deserializeGameState(json)

  assert.equal(restored.player.credits, 4321)
  assert.deepEqual(restored.player.ship.position, [10, 20, 30])
  assert.deepEqual(restored.player.ship.velocity, [1, 0, -5])
  assert.equal(restored.player.dockedBodyId, null)
  assert.equal(restored.galaxy.systems.length, gameState.galaxy.systems.length)
  assert.equal(restored.npcs.length, 0, 'no ordinary encounter state should persist')
  assert.equal(restored.inCombat, false)
})

test('docked pose fields round-trip through save', () => {
  const gameState = createGameState({
    characterName: 'Nova', shipInstanceName: 'Wanderer', shipClassId: STARTER_SHIP_CLASS_ID, seed: 5
  })
  const station = gameState.galaxy.systems
    .flatMap((s) => s.bodies)
    .find((b) => b.kind === 'station')
  assert.ok(station)
  gameState.player.currentSystemId = gameState.galaxy.systems.find((s) =>
    s.bodies.some((b) => b.id === station.id)
  ).id
  gameState.player.dockedBodyId = station.id
  gameState.player.dockedExteriorPosition = [100, 50, -200]
  gameState.player.dockedApproachDir = [0, 0, 1]
  gameState.player.ship.position = [2_000_000, 0, 20]

  const restored = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(gameState))))
  assert.equal(restored.player.dockedBodyId, station.id)
  assert.deepEqual(restored.player.dockedExteriorPosition, [100, 50, -200])
  assert.deepEqual(restored.player.dockedApproachDir, [0, 0, 1])
})

test('an active, incomplete bounty mission respawns its target npc on load', () => {
  const gameState = createGameState({
    characterName: 'Nova', shipInstanceName: 'Wanderer', shipClassId: STARTER_SHIP_CLASS_ID, seed: 5
  })
  const bounty = gameState.missions.available.find((m) => m.type === 'bounty')
  acceptMission(gameState, bounty.id, Math.random)
  // ensureBountyNpcsForSystem only respawns targets for the player's current
  // system on load, so point the player at wherever this bounty's target
  // actually is rather than relying on the starting system happening to
  // have one (an incidental alignment that shifts with galaxy generation).
  gameState.player.currentSystemId = bounty.target.systemId

  const json = JSON.parse(JSON.stringify(serializeGameState(gameState)))
  const restored = deserializeGameState(json)

  const restoredMission = restored.missions.active.find((m) => m.id === bounty.id)
  assert.ok(restoredMission.target.npcId, 'bounty should have a fresh npcId after reload')
  assert.ok(restored.npcs.some((n) => n.id === restoredMission.target.npcId))
})
