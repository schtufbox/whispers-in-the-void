import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../procgen/prng.js'
import { generateGalaxy } from '../procgen/galaxy.js'
import { seedMissionsForGalaxy, generateProbeMission } from '../data/missionTemplates.js'
import { acceptMission, markBodyVisited, markBodyProbed, updateMissionProgress, turnInMission } from './missions.js'
import { applyDamage } from './combat.js'

function makeGameStateWithMissions() {
  const galaxy = generateGalaxy(7)
  const missions = seedMissionsForGalaxy(mulberry32(8), galaxy)
  return {
    galaxy,
    missions: { available: missions, active: [] },
    visitedBodyIds: [],
    probedBodyIds: [],
    npcs: [],
    player: { credits: 0, reputation: 0 }
  }
}

test('galaxy seeding produces at least one mission of each type across ~40 bodies', () => {
  const gameState = makeGameStateWithMissions()
  const types = new Set(gameState.missions.available.map((m) => m.type))
  assert.ok(types.has('bounty') && types.has('exploration') && types.has('investigation'))
})

test('accepting a bounty mission spawns its target NPC, and destroying it completes the objective', () => {
  const gameState = makeGameStateWithMissions()
  const bounty = gameState.missions.available.find((m) => m.type === 'bounty')
  acceptMission(gameState, bounty.id, Math.random)

  assert.equal(gameState.missions.active.length, 1)
  const npc = gameState.npcs.find((n) => n.id === bounty.target.npcId)
  assert.ok(npc, 'accepting a bounty should spawn its target npc')

  applyDamage(npc, 99999)
  updateMissionProgress(gameState)
  assert.equal(bounty.objectiveComplete, true)

  turnInMission(gameState, bounty.id)
  assert.equal(gameState.player.credits, bounty.reward)
  assert.equal(gameState.missions.active.length, 0)
})

test('turning in a mission before its objective is complete throws', () => {
  const gameState = makeGameStateWithMissions()
  const exploration = gameState.missions.available.find((m) => m.type === 'exploration')
  acceptMission(gameState, exploration.id, Math.random)
  assert.throws(() => turnInMission(gameState, exploration.id))

  markBodyVisited(gameState, exploration.target.bodyId)
  updateMissionProgress(gameState)
  turnInMission(gameState, exploration.id)
  assert.equal(gameState.player.credits, exploration.reward)
})

test('a probe mission only completes once its target body is actually probed, not merely visited', () => {
  const gameState = makeGameStateWithMissions()
  const giverSystem = gameState.galaxy.systems[0]
  const giverBody = giverSystem.bodies[0]
  const mission = generateProbeMission(Math.random, gameState.galaxy, giverSystem.id, giverBody.id)
  gameState.missions.available.push(mission)
  acceptMission(gameState, mission.id, Math.random)

  markBodyVisited(gameState, mission.target.bodyId)
  updateMissionProgress(gameState)
  assert.equal(mission.objectiveComplete, false, 'visiting alone should not satisfy a probe mission')

  markBodyProbed(gameState, mission.target.bodyId)
  updateMissionProgress(gameState)
  assert.equal(mission.objectiveComplete, true)

  turnInMission(gameState, mission.id)
  assert.equal(gameState.player.credits, mission.reward)
})
