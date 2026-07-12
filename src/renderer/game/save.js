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
    flags: gameState.flags
  }
}

export function deserializeGameState(data) {
  // probedBodyIds falls back to [] for saves written before probe missions existed.
  const gameState = { ...data, npcs: [], projectiles: [], inCombat: false, simTime: 0, probedBodyIds: data.probedBodyIds ?? [] }
  // miningHold falls back to {} for saves written before mining existed.
  gameState.player.ship.miningHold ??= {}

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
