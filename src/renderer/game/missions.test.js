import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acceptMission,
  missionNavTarget,
  missionMarkedSystemIds,
  setWaypointForMission,
  updateMissionProgress
} from './missions.js'
import { createGameState } from './state.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'

function freshState(seed = 7) {
  return createGameState({
    characterName: 'Pilot',
    shipInstanceName: 'Ship',
    shipClassId: STARTER_SHIP_CLASS_ID,
    seed
  })
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

  // Force complete via visited so turn-in waypoint flips
  if (!gs.visitedBodyIds.includes(mission.target.bodyId)) gs.visitedBodyIds.push(mission.target.bodyId)
  updateMissionProgress(gs)
  if (mission.type === 'probe') {
    if (!gs.probedBodyIds.includes(mission.target.bodyId)) gs.probedBodyIds.push(mission.target.bodyId)
    updateMissionProgress(gs)
  }
  // Exploration/investigation complete via visit; probe needs probe list
  if (mission.type === 'exploration' || mission.type === 'investigation' || mission.objectiveComplete) {
    // re-track
    if (mission.objectiveComplete) {
      setWaypointForMission(gs, mission.id)
      assert.equal(gs.player.waypointBodyId, mission.giverStationId)
    }
  }
})
