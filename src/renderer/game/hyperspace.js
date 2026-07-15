import * as THREE from 'three'
import { getSystem, canJumpTo, SYSTEM_ARRIVAL_POSITION, advancePlottedRoute } from '../procgen/galaxy.js'
import { ensureBountyNpcsForSystem } from './missions.js'

const _up = new THREE.Vector3(0, 1, 0)
const _from = new THREE.Vector3()
const _toward = new THREE.Vector3()
const _mat = new THREE.Matrix4()
const _quat = new THREE.Quaternion()

/**
 * Quaternion that aims ship local +Z from `fromPos` toward `towardPos`.
 * Matrix4.lookAt uses camera convention (+Z away from target), so eye/target
 * are swapped — same fix as combat.js / supercruise.js / main.js quatFacing.
 */
export function quatFacingSun(fromPos, towardPos = [0, 0, 0]) {
  _from.fromArray(fromPos)
  _toward.fromArray(towardPos)
  if (_from.distanceToSquared(_toward) < 1e-8) return [0, 0, 0, 1]
  _quat.setFromRotationMatrix(_mat.lookAt(_toward, _from, _up))
  return _quat.toArray()
}

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
  // Arrival is offset above the ecliptic (y ≠ 0), so identity no longer aims
  // at the sun — face the system origin (star / binary primary) explicitly.
  gameState.player.ship.quaternion = quatFacingSun(gameState.player.ship.position)
  // Drop hops already reached from any galaxy-map plotted route.
  advancePlottedRoute(gameState)
  // NPCs, projectiles, and wrecks all belong to the system just left;
  // encounter state is never persisted (see the save/load design), so it's
  // simplest to drop them here too rather than track per-system entity lists.
  gameState.npcs = []
  gameState.projectiles = []
  gameState.wrecks = []

  ensureBountyNpcsForSystem(gameState, targetSystemId, rng)
}
