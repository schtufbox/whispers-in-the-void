import { getSystem, canJumpTo, SYSTEM_ARRIVAL_POSITION } from '../procgen/galaxy.js'
import { ensureBountyNpcsForSystem } from './missions.js'

export function hyperspaceJump(gameState, targetSystemId, rng) {
  if (gameState.inCombat) throw new Error('Cannot hyperspace while in combat')
  if (targetSystemId === gameState.player.currentSystemId) throw new Error('Already in that system')
  const system = getSystem(gameState.galaxy, targetSystemId)
  if (!system) throw new Error('Unknown system')
  const currentSystem = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (!canJumpTo(currentSystem, targetSystemId)) throw new Error('Target system is out of hyperspace range — jump via a neighboring system first')

  gameState.player.currentSystemId = targetSystemId
  gameState.player.waypointBodyId = null
  gameState.player.ship.position = [...SYSTEM_ARRIVAL_POSITION]
  gameState.player.ship.velocity = [0, 0, 0]
  // Face the star: SYSTEM_ARRIVAL_POSITION sits on -Z, and identity
  // quaternion is +Z-forward (see CLAUDE.md's ship coordinate convention),
  // so this always looks back toward the system origin regardless of
  // whatever way the ship was facing before the jump.
  gameState.player.ship.quaternion = [0, 0, 0, 1]
  // NPCs and projectiles belong to the system just left; encounter state is
  // never persisted (see the save/load design), so it's simplest to drop
  // them here too rather than track per-system entity lists.
  gameState.npcs = []
  gameState.projectiles = []

  ensureBountyNpcsForSystem(gameState, targetSystemId, rng)
}
