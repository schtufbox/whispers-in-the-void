import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from './state.js'
import { hyperspaceJump } from './hyperspace.js'
import { acceptMission, ensureBountyNpcsForSystem } from './missions.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { SYSTEM_ARRIVAL_POSITION, getSystem } from '../procgen/galaxy.js'

function freshState() {
  return createGameState({ characterName: 'Nova', shipInstanceName: 'Wanderer', shipClassId: STARTER_SHIP_CLASS_ID, seed: 11 })
}

// Bypasses hyperspaceJump's neighbor-range check entirely — used only to set
// up test fixtures for mission/NPC persistence logic that isn't itself about
// jump range, mirroring the same "reach in and set state directly" pattern
// save.test.js already uses for the same reason.
function travelTo(gameState, systemId, rng) {
  gameState.player.currentSystemId = systemId
  gameState.npcs = []
  gameState.projectiles = []
  ensureBountyNpcsForSystem(gameState, systemId, rng)
}

test('hyperspaceJump moves to a neighboring system and resets local ship/encounter state', () => {
  const gameState = freshState()
  const startSystemId = gameState.player.currentSystemId
  gameState.player.ship.position = [40, 5, -30]
  gameState.player.ship.velocity = [10, 0, 0]
  const targetSystemId = getSystem(gameState.galaxy, startSystemId).neighborIds[0]

  hyperspaceJump(gameState, targetSystemId, Math.random)

  assert.equal(gameState.player.currentSystemId, targetSystemId)
  assert.deepEqual(gameState.player.ship.position, SYSTEM_ARRIVAL_POSITION)
  assert.deepEqual(gameState.player.ship.velocity, [0, 0, 0])
  assert.equal(gameState.npcs.length, 0)
})

test('hyperspaceJump refuses to jump to the current system or while in combat', () => {
  const gameState = freshState()
  assert.throws(() => hyperspaceJump(gameState, gameState.player.currentSystemId, Math.random))

  const neighborId = getSystem(gameState.galaxy, gameState.player.currentSystemId).neighborIds[0]
  gameState.inCombat = true
  assert.throws(() => hyperspaceJump(gameState, neighborId, Math.random))
})

test('hyperspaceJump refuses a system that is not a hyperspace neighbor', () => {
  const gameState = freshState()
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  const farSystem = gameState.galaxy.systems.find(
    (s) => s.id !== currentSystem.id && !currentSystem.neighborIds.includes(s.id)
  )
  assert.throws(() => hyperspaceJump(gameState, farSystem.id, Math.random))
})

test('jumping into a bounty target system re-materializes its target NPC', () => {
  const gameState = freshState()
  const bounty = gameState.missions.available.find((m) => m.type === 'bounty')
  acceptMission(gameState, bounty.id, Math.random)
  assert.ok(gameState.npcs.some((n) => n.id === bounty.target.npcId))

  const elsewhere = gameState.galaxy.systems.find(
    (s) => s.id !== gameState.player.currentSystemId && s.id !== bounty.target.systemId
  ).id
  travelTo(gameState, elsewhere, Math.random)
  assert.equal(gameState.npcs.length, 0, 'bounty target should not follow the player into an unrelated system')

  travelTo(gameState, bounty.target.systemId, Math.random)
  assert.ok(gameState.npcs.some((n) => n.id === bounty.target.npcId), 'bounty target should reappear back in its own system')
})
