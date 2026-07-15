import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptMission,
  missionNavTarget,
  missionMarkedSystemIds,
  setWaypointForMission,
  updateMissionProgress,
  resolveInvestigationProbe,
  ensureBountyNpcsForSystem,
  markBodyProbed
} from './missions.js'
import { createGameState } from './state.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { findBody } from '../procgen/galaxy.js'

function freshState(seed = 7) {
  return createGameState({
    characterName: 'Pilot',
    shipInstanceName: 'Ship',
    shipClassId: STARTER_SHIP_CLASS_ID,
    seed
  })
}

function acceptInvestigation(gs) {
  const mission = gs.missions.available.find((m) => m.type === 'investigation')
  assert.ok(mission, 'need an investigation mission in seed')
  acceptMission(gs, mission.id, Math.random)
  return mission
}

test('missionNavTarget points at objective body, then giver on complete', () => {
  const gs = freshState()
  const mission = gs.missions.available.find((m) => m.target?.kind === 'body')
  assert.ok(mission, 'need a body-target mission in seed')
  acceptMission(gs, mission.id, Math.random)

  const before = missionNavTarget(mission, gs)
  assert.equal(before.phase, 'objective')
  assert.equal(before.bodyId, mission.target.bodyId)
  assert.equal(before.systemId, mission.target.systemId)

  mission.objectiveComplete = true
  const after = missionNavTarget(mission, gs)
  assert.equal(after.phase, 'turnin')
  assert.equal(after.bodyId, mission.giverStationId)
  assert.equal(after.systemId, mission.giverSystemId)
})

test('missionMarkedSystemIds follows objective then turn-in', () => {
  const gs = freshState(9)
  const mission = gs.missions.available.find((m) => m.target?.kind === 'body')
  acceptMission(gs, mission.id, Math.random)

  assert.ok(missionMarkedSystemIds(gs).has(mission.target.systemId))
  mission.objectiveComplete = true
  const ids = missionMarkedSystemIds(gs)
  assert.ok(ids.has(mission.giverSystemId))
  if (mission.target.systemId !== mission.giverSystemId) {
    assert.equal(ids.has(mission.target.systemId), false)
  }
})

test('setWaypointForMission tracks body objectives', () => {
  const gs = freshState(11)
  const mission = gs.missions.available.find((m) => m.target?.kind === 'body')
  acceptMission(gs, mission.id, Math.random)
  setWaypointForMission(gs, mission.id)
  assert.equal(gs.player.waypointBodyId, mission.target.bodyId)
  assert.equal(gs.player.waypointPosition, null)

  // Force complete per type so turn-in waypoint flips
  if (mission.type === 'probe') {
    if (!gs.probedBodyIds.includes(mission.target.bodyId)) gs.probedBodyIds.push(mission.target.bodyId)
  } else if (mission.type === 'investigation') {
    mission.objectiveComplete = true
  } else {
    if (!gs.visitedBodyIds.includes(mission.target.bodyId)) gs.visitedBodyIds.push(mission.target.bodyId)
  }
  updateMissionProgress(gs)
  if (mission.objectiveComplete) {
    setWaypointForMission(gs, mission.id)
    assert.equal(gs.player.waypointBodyId, mission.giverStationId)
  }
})

test('probe mission completes when target body is marked probed', () => {
  const gs = freshState(21)
  const mission = gs.missions.available.find((m) => m.type === 'probe')
  assert.ok(mission, 'need a probe mission in seed')
  acceptMission(gs, mission.id, Math.random)
  assert.equal(mission.objectiveComplete, false)
  markBodyProbed(gs, mission.target.bodyId)
  assert.equal(mission.objectiveComplete, true, 'markBodyProbed should complete open probe contracts')
  assert.ok(gs.probedBodyIds.map(String).includes(String(mission.target.bodyId)))
})

test('exploration survey completes when the target body is probed', () => {
  const gs = freshState(21)
  const mission = gs.missions.available.find((m) => m.type === 'exploration')
  assert.ok(mission, 'need an exploration mission in seed')
  acceptMission(gs, mission.id, Math.random)
  assert.equal(mission.objectiveComplete, false)
  markBodyProbed(gs, mission.target.bodyId)
  assert.equal(mission.objectiveComplete, true, 'probing the survey target should complete exploration')
})

test('investigation intel probe completes the objective', () => {
  const gs = freshState(13)
  const mission = acceptInvestigation(gs)
  const bodyId = mission.target.bodyId
  // Always intel: roll 0 with leads=0 → intel branch
  const result = resolveInvestigationProbe(gs, bodyId, () => 0)
  assert.equal(result.kind, 'intel')
  assert.equal(mission.objectiveComplete, true)
})

test('investigation hostile probe requires a kill', () => {
  const gs = freshState(17)
  const mission = acceptInvestigation(gs)
  const bodyId = mission.target.bodyId
  const body = findBody(gs.galaxy, bodyId)
  // Place the player near the body so spawn direction is well-defined.
  gs.player.ship.position = [
    body.position[0] + (body.radius ?? 0) + 500,
    body.position[1],
    body.position[2]
  ]
  // roll in [0.4, 0.7) → hostile
  const result = resolveInvestigationProbe(gs, bodyId, () => 0.5)
  assert.equal(result.kind, 'hostile')
  assert.equal(mission.objectiveComplete, false)
  assert.equal(mission.target.kind, 'npcShip')
  assert.ok(gs.npcs.some((n) => n.id === mission.target.npcId))

  const npc = gs.npcs.find((n) => n.id === mission.target.npcId)
  const dist = Math.hypot(
    npc.position[0] - body.position[0],
    npc.position[1] - body.position[1],
    npc.position[2] - body.position[2]
  )
  // Must not be buried inside the surveyed body mesh.
  assert.ok(
    dist >= (body.radius ?? 0) + 200 - 1e-3,
    `hostile should spawn outside body shell (dist ${dist}, radius ${body.radius})`
  )
  assert.ok(npc.destroyed === false)
  assert.deepEqual(gs.player.waypointPosition, npc.position)

  updateMissionProgress(gs)
  assert.equal(mission.objectiveComplete, false)

  npc.destroyed = true
  updateMissionProgress(gs)
  assert.equal(mission.objectiveComplete, true)
})

test('investigation lead retargets to another probeable body', () => {
  const gs = freshState(19)
  const mission = acceptInvestigation(gs)
  const oldBodyId = mission.target.bodyId
  const oldReward = mission.reward
  // roll >= 0.7 → lead
  const result = resolveInvestigationProbe(gs, oldBodyId, () => 0.85)
  assert.equal(result.kind, 'lead')
  assert.equal(mission.objectiveComplete, false)
  assert.equal(mission.target.kind, 'body')
  assert.notEqual(mission.target.bodyId, oldBodyId)
  assert.ok(findBody(gs.galaxy, mission.target.bodyId))
  assert.equal(mission.leads, 1)
  assert.equal(mission.reward, Math.round(oldReward * 1.05))
  assert.ok(mission.log?.some((e) => e.kind === 'lead'))
})

test('investigation hostiles re-materialize after system re-entry', () => {
  const gs = freshState(23)
  const mission = acceptInvestigation(gs)
  resolveInvestigationProbe(gs, mission.target.bodyId, () => 0.5)
  assert.equal(mission.target.kind, 'npcShip')
  const systemId = mission.target.systemId
  gs.npcs = []
  ensureBountyNpcsForSystem(gs, systemId, Math.random)
  assert.ok(gs.npcs.some((n) => n.id === mission.target.npcId))
})
