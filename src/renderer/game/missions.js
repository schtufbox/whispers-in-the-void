import { spawnNpcWithClass } from './spawner.js'

export function acceptMission(gameState, missionId, rng) {
  const mission = gameState.missions.available.find((m) => m.id === missionId)
  if (!mission) throw new Error('Mission not available')

  mission.status = 'active'
  gameState.missions.available = gameState.missions.available.filter((m) => m.id !== missionId)
  gameState.missions.active.push(mission)

  if (mission.type === 'bounty') {
    const npc = spawnNpcWithClass(rng, {
      shipClassId: mission.target.shipClassId,
      position: mission.target.locationHint,
      faction: 'pirate'
    })
    npc.missionId = mission.id
    gameState.npcs.push(npc)
    mission.target.npcId = npc.id
  }
}

// Bounty target ships are never persisted or carried between systems (NPCs
// are ephemeral, per the save/encounter design) — this re-materializes the
// target for any active, incomplete bounty whose system the player has just
// entered (via load or hyperspace), so leaving and coming back still works.
export function ensureBountyNpcsForSystem(gameState, systemId, rng) {
  for (const mission of gameState.missions.active) {
    if (mission.type !== 'bounty' || mission.objectiveComplete) continue
    if (mission.target.systemId !== systemId) continue
    if (gameState.npcs.some((n) => n.id === mission.target.npcId)) continue

    const npc = spawnNpcWithClass(rng, {
      shipClassId: mission.target.shipClassId,
      position: mission.target.locationHint,
      faction: 'pirate'
    })
    npc.missionId = mission.id
    gameState.npcs.push(npc)
    mission.target.npcId = npc.id
  }
}

export function markBodyVisited(gameState, bodyId) {
  if (!gameState.visitedBodyIds.includes(bodyId)) gameState.visitedBodyIds.push(bodyId)
}

// Distinct from visitedBodyIds: a probe mission requires actually launching a
// probe at the body (main.js's probeBody), not just flying near or docking.
export function markBodyProbed(gameState, bodyId) {
  if (!gameState.probedBodyIds.includes(bodyId)) gameState.probedBodyIds.push(bodyId)
}

export function updateMissionProgress(gameState) {
  for (const mission of gameState.missions.active) {
    if (mission.objectiveComplete) continue
    if (mission.type === 'bounty') {
      const npc = gameState.npcs.find((n) => n.id === mission.target.npcId)
      if (npc?.destroyed) mission.objectiveComplete = true
    } else if (mission.type === 'probe') {
      if (gameState.probedBodyIds.includes(mission.target.bodyId)) mission.objectiveComplete = true
    } else {
      if (gameState.visitedBodyIds.includes(mission.target.bodyId)) mission.objectiveComplete = true
    }
  }
}

export function turnInMission(gameState, missionId) {
  const mission = gameState.missions.active.find((m) => m.id === missionId)
  if (!mission) throw new Error('Mission not active')
  if (!mission.objectiveComplete) throw new Error('Mission objective not complete yet')

  mission.status = 'complete'
  gameState.missions.active = gameState.missions.active.filter((m) => m.id !== missionId)
  gameState.player.credits += mission.reward
  gameState.player.reputation += 1
}

// Where the player should go next for an active mission: the objective
// system/body while incomplete, or the giver station once ready to turn in.
// Bounty objectives have no body — only a system + world position (live NPC
// if spawned, else the original locationHint).
export function missionNavTarget(mission, gameState) {
  if (mission.objectiveComplete) {
    return {
      phase: 'turnin',
      systemId: mission.giverSystemId,
      bodyId: mission.giverStationId,
      position: null
    }
  }
  if (mission.target.kind === 'body') {
    return {
      phase: 'objective',
      systemId: mission.target.systemId,
      bodyId: mission.target.bodyId,
      position: null
    }
  }
  // bounty
  let position = mission.target.locationHint
  if (mission.target.npcId && gameState.player.currentSystemId === mission.target.systemId) {
    const npc = gameState.npcs.find((n) => n.id === mission.target.npcId && !n.destroyed)
    if (npc) position = npc.position
  }
  return {
    phase: 'objective',
    systemId: mission.target.systemId,
    bodyId: null,
    position: position ? [...position] : null
  }
}

// Galaxy-map system ids that currently need an orange objective ring.
export function missionMarkedSystemIds(gameState) {
  const ids = new Set()
  for (const mission of gameState.missions.active) {
    ids.add(missionNavTarget(mission, gameState).systemId)
  }
  return ids
}

// Body ids in a given system that are active mission markers (objective or turn-in).
export function missionMarkedBodyIds(gameState, systemId) {
  const ids = new Set()
  for (const mission of gameState.missions.active) {
    const t = missionNavTarget(mission, gameState)
    if (t.systemId === systemId && t.bodyId) ids.add(t.bodyId)
  }
  return ids
}

// Point the player's waypoint at a mission's current nav target.
// Free-space positions (bounty hunts) are only set while already in that
// system — local coords from another system would point at nothing useful.
export function setWaypointForMission(gameState, missionId) {
  const mission = gameState.missions.active.find((m) => m.id === missionId)
  if (!mission) throw new Error('Mission not active')
  const t = missionNavTarget(mission, gameState)
  if (t.bodyId) {
    gameState.player.waypointBodyId = t.bodyId
    gameState.player.waypointPosition = null
    return
  }
  if (t.position && t.systemId === gameState.player.currentSystemId) {
    gameState.player.waypointBodyId = null
    gameState.player.waypointPosition = t.position
    return
  }
  if (t.systemId !== gameState.player.currentSystemId) {
    // Clear local markers; galaxy map orange ring is the cross-system cue.
    gameState.player.waypointBodyId = null
    gameState.player.waypointPosition = null
    return
  }
  throw new Error('Mission has no trackable location')
}
