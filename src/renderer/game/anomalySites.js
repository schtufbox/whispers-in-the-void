/**
 * Runtime helpers for Spatial Anomaly sites once fully scanned.
 */
import { intRange } from '../procgen/prng.js'
import { spawnNpc } from './spawner.js'
import {
  rollSiteLoot,
  markAlienBaseDestroyed,
  markAnomalyCompleted,
  allDatacoreNodulesDone,
  ALIEN_SITE_DESPAWN_S
} from './systemScan.js'
import { ALIEN_SHIP_CLASSES } from '../data/shipClasses.js'

export const SITE_ACTIVATION_RANGE = 12000
/** Approach range to hack a sealed nodule with P (generous so the site is usable). */
export const NODULE_PROBE_RANGE = 520

/**
 * Spawn one alien wave near anomaly position.
 * @returns {object[]} npcs
 */
export function spawnAlienIncursionWave(rng, anomaly, waveIndex, systemBodies, coreFraction = 0.5) {
  const n = 2 + intRange(rng, 0, 3) // 2–5
  const npcs = []
  const base = anomaly.position
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2
    const d = 600 + rng() * 900
    const position = [
      base[0] + Math.cos(ang) * d,
      base[1] + (rng() - 0.5) * 200,
      base[2] + Math.sin(ang) * d
    ]
    const hull =
      ALIEN_SHIP_CLASSES[Math.floor(rng() * Math.max(1, ALIEN_SHIP_CLASSES.length))] ?? null
    const npc = spawnNpc(rng, {
      position,
      faction: 'alien',
      coreFraction,
      bodies: systemBodies
    })
    if (hull) npc.shipClassId = hull.id
    npc.anomalySiteId = anomaly.id
    npc.anomalyWave = waveIndex
    npcs.push(npc)
  }
  return npcs
}

export function grantLootToShip(gameState, loot) {
  if (!loot || !gameState?.player?.ship) return
  const ship = gameState.player.ship
  const cargo = ship.cargo
  for (const [id, qty] of Object.entries(loot.cargo ?? {})) {
    cargo[id] = (cargo[id] ?? 0) + qty
  }
  if (loot.shipParts) {
    ship.shipParts = (ship.shipParts ?? 0) + loot.shipParts
  }
  ship.blueprints ??= {}
  for (const [blueprintId, qty] of Object.entries(loot.blueprints ?? {})) {
    ship.blueprints[blueprintId] = (ship.blueprints[blueprintId] ?? 0) + qty
  }
  ship.skillbooks ??= {}
  for (const [skillId, qty] of Object.entries(loot.skillbooks ?? {})) {
    ship.skillbooks[skillId] = (ship.skillbooks[skillId] ?? 0) + qty
  }
}

export function applyAlienBaseKill(gameState, anomaly, rng, simTime) {
  const credits = anomaly.creditsReward ?? 6000
  gameState.player.credits += credits
  markAlienBaseDestroyed(anomaly, simTime)
  // Alien site wreck: rare alien BPs + skillbooks (very small chance).
  const loot = rollSiteLoot(rng, {
    valuableChance: 0.25,
    gameState,
    alien: true
  })
  return { credits, loot }
}

export function applyDatacoreNoduleSuccess(gameState, anomaly, nodule, rng) {
  nodule.status = 'open'
  nodule.looted = true
  const loot = rollSiteLoot(rng, {
    valuableChance: 0.3,
    gameState,
    alien: false
  })
  grantLootToShip(gameState, loot)
  if (allDatacoreNodulesDone(anomaly)) {
    markAnomalyCompleted(anomaly, gameState.simTime)
  }
  return loot
}

export function applyDatacoreNoduleFail(anomaly, nodule, simTime) {
  nodule.status = 'destroyed'
  if (allDatacoreNodulesDone(anomaly)) {
    markAnomalyCompleted(anomaly, simTime)
  }
}

export { SITE_ACTIVATION_RANGE as ANOMALY_SITE_RANGE, ALIEN_SITE_DESPAWN_S }
