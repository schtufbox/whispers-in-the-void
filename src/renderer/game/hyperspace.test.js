import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from './state.js'
import { hyperspaceJump } from './hyperspace.js'
import { acceptMission } from './missions.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { SYSTEM_ARRIVAL_POSITION } from '../procgen/galaxy.js'

function freshState() {
  return createGameState({ characterName: 'Nova', shipInstanceName: 'Wanderer', shipClassId: STARTER_SHIP_CLASS_ID, seed: 11 })
}

test('hyperspaceJump moves to the target system and resets local ship/encounter state', () => {
  const gameState = freshState()
  const startSystemId = gameState.player.currentSystemId
  gameState.player.ship.position = [40, 5, -30]
  gameState.player.ship.velocity = [10, 0, 0]
  const targetSystemId = gameState.galaxy.systems.find((s) => s.id !== startSystemId).id

  hyperspaceJump(gameState, targetSystemId, Math.random)

  assert.equal(gameState.player.currentSystemId, targetSystemId)
  assert.deepEqual(gameState.player.ship.position, SYSTEM_ARRIVAL_POSITION)
  assert.deepEqual(gameState.player.ship.velocity, [0, 0, 0])
  assert.equal(gameState.npcs.length, 0)
})

test('hyperspaceJump refuses to jump to the current system or while in combat', () => {
  const gameState = freshState()
  assert.throws(() => hyperspaceJump(gameState, gameState.player.currentSystemId, Math.random))

  const otherSystemId = gameState.galaxy.systems.find((s) => s.id !== gameState.player.currentSystemId).id
  gameState.inCombat = true
  assert.throws(() => hyperspaceJump(gameState, otherSystemId, Math.random))
})

test('jumping into a bounty target system re-materializes its target NPC', () => {
  const gameState = freshState()
  const bounty = gameState.missions.available.find((m) => m.type === 'bounty')
  acceptMission(gameState, bounty.id, Math.random)
  assert.ok(gameState.npcs.some((n) => n.id === bounty.target.npcId))

  const elsewhere = gameState.galaxy.systems.find(
    (s) => s.id !== gameState.player.currentSystemId && s.id !== bounty.target.systemId
  ).id
  hyperspaceJump(gameState, elsewhere, Math.random)
  assert.equal(gameState.npcs.length, 0, 'bounty target should not follow the player into an unrelated system')

  hyperspaceJump(gameState, bounty.target.systemId, Math.random)
  assert.ok(gameState.npcs.some((n) => n.id === bounty.target.npcId), 'bounty target should reappear back in its own system')
})
