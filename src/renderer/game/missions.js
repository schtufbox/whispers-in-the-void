import { spawnNpc, spawnNpcWithClass } from './spawner.js'
import { pick } from '../procgen/prng.js'
import { coreFraction, findBody, getSystem } from '../procgen/galaxy.js'

const PROBEABLE_KINDS = ['planet', 'moon', 'asteroidField']
// ponytail: hard cap so a lead chain always terminates; raise only if trails feel short
const MAX_INVESTIGATION_LEADS = 2
const LEAD_REWARD_MULT = 1.05

function pushMissionLog(mission, gameState, kind, text) {
  mission.log ??= []
  mission.log.push({ kind, text, simTime: gameState.simTime ?? 0 })
}

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

  // Body already surveyed before accept — complete probe objectives immediately.
  updateMissionProgress(gameState)
}

// Re-materialize any incomplete mission with an npcShip target in this system
// (bounties + investigation hostiles). NPCs are never persisted.
export function ensureBountyNpcsForSystem(gameState, systemId, rng) {
  for (const mission of gameState.missions.active) {
    if (mission.objectiveComplete) continue
    if (mission.target.kind !== 'npcShip') continue
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
  if (!bodyId) return
  const id = String(bodyId)
  if (!gameState.probedBodyIds.includes(id)) gameState.probedBodyIds.push(id)
  // Complete any matching open probe missions right here (don't rely solely on
  // a later updateMissionProgress call that can be skipped while menus/docked).
  for (const mission of gameState.missions.active) {
    if (mission.type !== 'probe' || mission.objectiveComplete) continue
    if (String(mission.target?.bodyId) === id) {
      mission.objectiveComplete = true
      pushMissionLog(mission, gameState, 'intel', 'Survey complete — return to the mission giver')
    }
  }
}

function pickInvestigationLead(gameState, mission, rng) {
  const currentSystem = getSystem(gameState.galaxy, mission.target.systemId)
  if (!currentSystem) return null

  const candidates = []
  for (const body of currentSystem.bodies) {
    if (!PROBEABLE_KINDS.includes(body.kind)) continue
    if (body.id === mission.target.bodyId) continue
    candidates.push({ system: currentSystem, body })
  }

  // Same-system trail first; spill into neighbors only if this system is dry.
  if (!candidates.length) {
    for (const neighborId of currentSystem.neighborIds) {
      const system = getSystem(gameState.galaxy, neighborId)
      if (!system) continue
      for (const body of system.bodies) {
        if (!PROBEABLE_KINDS.includes(body.kind)) continue
        candidates.push({ system, body })
      }
    }
  }

  if (!candidates.length) return null
  return pick(rng, candidates)
}

// Probe hit an active investigation body objective. Outcomes: intel (done),
// hostile (kill to finish), or lead (retarget body). Returns null if this
// body isn't an open investigation target.
export function resolveInvestigationProbe(gameState, bodyId, rng) {
  const mission = gameState.missions.active.find(
    (m) =>
      m.type === 'investigation' &&
      !m.objectiveComplete &&
      m.target.kind === 'body' &&
      m.target.bodyId === bodyId
  )
  if (!mission) return null

  const leads = mission.leads ?? 0
  const roll = rng()
  // After the lead cap, always terminate (intel or hostile).
  let kind
  if (leads >= MAX_INVESTIGATION_LEADS) {
    kind = roll < 0.5 ? 'intel' : 'hostile'
  } else if (roll < 0.4) {
    kind = 'intel'
  } else if (roll < 0.7) {
    kind = 'hostile'
  } else {
    kind = 'lead'
  }

  if (kind === 'lead') {
    const next = pickInvestigationLead(gameState, mission, rng)
    if (!next) {
      kind = 'intel' // nowhere left to trail
    } else {
      mission.leads = leads + 1
      mission.reward = Math.round(mission.reward * LEAD_REWARD_MULT)
      mission.target = { kind: 'body', systemId: next.system.id, bodyId: next.body.id }
      mission.title = `Investigate the signal near ${next.body.name} in ${next.system.name}`
      if (gameState.player.waypointBodyId === bodyId) {
        gameState.player.waypointBodyId = next.body.id
      }
      pushMissionLog(
        mission,
        gameState,
        'lead',
        `Signal relocated → ${next.body.name} · ${next.system.name} (+5% reward)`
      )
      return {
        kind: 'lead',
        mission,
        bodyName: next.body.name,
        systemName: next.system.name
      }
    }
  }

  if (kind === 'hostile') {
    const system = getSystem(gameState.galaxy, mission.target.systemId)
    const body = findBody(gameState.galaxy, bodyId)
    const base = body?.position ?? gameState.player.ship.position
    // Offset so the contact isn't buried in the body mesh.
    const position = [base[0] + 80, base[1] + 20, base[2] + 40]
    const npc = spawnNpc(rng, {
      position,
      faction: 'pirate',
      coreFraction: system ? coreFraction(system) : 0
    })
    npc.missionId = mission.id
    gameState.npcs.push(npc)
    mission.target = {
      kind: 'npcShip',
      systemId: mission.target.systemId,
      locationHint: [...position],
      npcId: npc.id,
      shipClassId: npc.shipClassId
    }
    if (gameState.player.waypointBodyId === bodyId) {
      gameState.player.waypointBodyId = null
      gameState.player.waypointPosition = [...position]
    }
    pushMissionLog(mission, gameState, 'hostile', 'Hostile contact stirred by the probe — eliminate to proceed')
    return { kind: 'hostile', mission }
  }

  mission.objectiveComplete = true
  pushMissionLog(mission, gameState, 'intel', 'Investigation data recovered — return to the mission giver')
  return { kind: 'intel', mission }
}

export function updateMissionProgress(gameState) {
  const probed = gameState.probedBodyIds ?? []
  const visited = gameState.visitedBodyIds ?? []
  for (const mission of gameState.missions.active) {
    if (mission.objectiveComplete) continue
    if (mission.target?.kind === 'npcShip') {
      const npc = gameState.npcs.find((n) => n.id === mission.target.npcId)
      if (npc?.destroyed) mission.objectiveComplete = true
    } else if (mission.type === 'probe') {
      const bodyId = mission.target?.bodyId
      if (bodyId && probed.some((id) => String(id) === String(bodyId))) {
        mission.objectiveComplete = true
      }
    } else if (mission.type === 'exploration') {
      const bodyId = mission.target?.bodyId
      if (bodyId && visited.some((id) => String(id) === String(bodyId))) {
        mission.objectiveComplete = true
      }
    }
    // investigation body phase: only resolveInvestigationProbe sets complete
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
// Bounty / investigation-hostile objectives have no body — only a system +
// world position (live NPC if spawned, else the original locationHint).
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
  // npcShip (bounty or investigation hostile)
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
