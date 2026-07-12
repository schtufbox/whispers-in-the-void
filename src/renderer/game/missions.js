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
