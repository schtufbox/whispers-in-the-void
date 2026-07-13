import { ensureBountyNpcsForSystem } from './missions.js'

export function serializeGameState(gameState) {
  return {
    version: gameState.version,
    seed: gameState.seed,
    createdAt: gameState.createdAt,
    player: gameState.player,
    galaxy: gameState.galaxy,
    economyOverrides: gameState.economyOverrides,
    missions: gameState.missions,
    visitedBodyIds: gameState.visitedBodyIds,
    probedBodyIds: gameState.probedBodyIds,
    stationStorage: gameState.stationStorage,
    flags: gameState.flags
  }
}

export function deserializeGameState(data) {
  // probedBodyIds falls back to [] for saves written before probe missions existed.
  // wrecks are ephemeral like npcs/projectiles — never persisted, always
  // start empty on load.
  const gameState = { ...data, npcs: [], projectiles: [], wrecks: [], inCombat: false, simTime: 0, probedBodyIds: data.probedBodyIds ?? [] }
  // miningHold falls back to {} for saves written before mining existed.
  gameState.player.ship.miningHold ??= {}
  gameState.player.ship.shipParts ??= 0
  gameState.stationStorage ??= {}
  // startingSystemId/startingSystemPeaceBroken fall back for saves written
  // before the starting-system peace existed — null just means that save
  // never gets the "no hostiles at home" protection, which is harmless.
  gameState.player.startingSystemId ??= null
  gameState.flags.startingSystemPeaceBroken ??= false

  // Encounter/NPC state is never persisted (see plan). Only the current
  // system's bounty target needs to exist right away; other systems'
  // bounties re-materialize the same way when the player jumps there.
  ensureBountyNpcsForSystem(gameState, gameState.player.currentSystemId, Math.random)
  return gameState
}

export async function saveGame(gameState) {
  if (gameState.inCombat) throw new Error('Cannot save while in combat')
  await window.electronAPI.saveGame(serializeGameState(gameState))
}

export async function loadGame() {
  const data = await window.electronAPI.loadGame()
  return data ? deserializeGameState(data) : null
}

export function hasSave() {
  return window.electronAPI.hasSave()
}

export function deleteSave() {
  return window.electronAPI.deleteSave()
}
