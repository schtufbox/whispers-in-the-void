import * as THREE from 'three'
import { getShipClass } from '../data/shipClasses.js'
import { getSystem, ensureSystemSecurity } from '../procgen/galaxy.js'
import {
  clearPositionOfBodies,
  positionOverlapsBodies,
  NPC_FLIGHT_CLEARANCE,
  NPC_SPAWN_SHIP_RADIUS
} from './spawner.js'
import { mineRock, isRockAlive, mineYieldForWeapon } from './mining.js'
import { spawnWreck } from './wrecks.js'
import { getAsteroidRocks } from '../render/asteroidFieldMesh.js'
import { rockCollisionRadius } from './collision.js'
import { getWeapon, BASE_WEAPON_ID } from '../data/weapons.js'
import { damageDrone } from './drones.js'
import {
  applyLawPenaltyForAttack,
  applyLawBonusForPirateKill,
  policeHostileToPlayer,
  civiliansHostileToPlayer,
  lawPenaltyAppliesInSystem
} from './security.js'

/**
 * Track NPCs the player has shot or that have shot the player.
 * Drones only engage these — never tab-lock alone.
 */
export function markPlayerCombatEngagement(gameState, proj, target, isPlayerTarget) {
  if (!gameState?.player) return
  gameState.player.combatEngagedNpcIds ??= {}
  if (proj.ownerId === 'player' && !isPlayerTarget && target?.id) {
    const already = !!gameState.player.combatEngagedNpcIds[target.id]
    // Law penalty only in Sec 3–6, and only for non-hostiles who never shot first.
    // Pirates/aliens are fair game; police attacks still cost standing in high-sec.
    if (!already && target.faction !== 'pirate' && target.faction !== 'alien') {
      const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
      if (system) ensureSystemSecurity(system)
      if (lawPenaltyAppliesInSystem(system)) {
        applyLawPenaltyForAttack(gameState, false)
      }
    }
    gameState.player.combatEngagedNpcIds[target.id] = true
  }
  if (isPlayerTarget && proj.ownerId && proj.ownerId !== 'player') {
    gameState.player.combatEngagedNpcIds[proj.ownerId] = true
  }
}

export function isNpcEngagedWithPlayer(gameState, npcId) {
  return !!(gameState?.player?.combatEngagedNpcIds?.[npcId])
}

/** Drop dead / gone NPCs from the engagement set. */
export function pruneCombatEngagement(gameState) {
  const map = gameState?.player?.combatEngagedNpcIds
  if (!map) return
  for (const id of Object.keys(map)) {
    const npc = gameState.npcs?.find((n) => n.id === id && !n.destroyed)
    if (!npc) delete map[id]
  }
}

const HIT_RADIUS = 1.5
// Mining lasers need a generous pad — pure geometric rock shells are easy to miss
// at speed / with wing parallax, and felt "broken" when reticle sat on a rock.
const MINE_HIT_PAD = 14
const SHIELD_REGEN_DELAY_S = 4
// NPC combat regen (points per second after idle delay).
const SHIELD_REGEN_RATE = 10
// Player: 1% of max shields every 10s while out of combat.
const PLAYER_SHIELD_REGEN_FRACTION = 0.01
const PLAYER_SHIELD_REGEN_PERIOD_S = 10

const ATTACK_RANGE = 250
const DISENGAGE_RANGE = 375
const FIRE_RANGE = 200
const FIRE_CONE_DOT = 0.9
const FLEE_HULL_FRACTION = 0.25
const COMBAT_COOLDOWN_S = 6

// Once an attacker closes within this range it may start circling rather
// than always closing head-on (see the `isOrbiter` coin-flip below).
const ORBIT_RANGE = 90
// A hit this recent makes an attacker break off and open the range for a
// moment before pressing the attack again, instead of tanking hits blindly.
const EVADE_WINDOW_S = 1.2
// Rolled once, the moment an NPC first drops below FLEE_HULL_FRACTION — a
// suicide run instead of fleeing. Never re-rolled per frame, or the "3%"
// would resolve to near-certain within a fraction of a second at 60fps.
const RAM_CHANCE = 0.03
const RAM_DAMAGE = 60
const RAM_QUOTES = ['Ramming speed!', "I'm taking you with me!", 'No surrender!']

let projectileCounter = 0

// All cooldown/regen timing below is driven by gameState.simTime (seconds
// accumulated from per-frame dt), never wall-clock time, so combat logic
// behaves identically whether it's run at 60fps or fast-forwarded in a test.

// Player ship takes less weapon damage than NPCs (same shot, less effect).
export const PLAYER_DAMAGE_TAKEN_MULT = 0.75

export function applyDamage(entity, amount, simTime = null, { player = false } = {}) {
  let remaining = amount
  if (player) remaining *= PLAYER_DAMAGE_TAKEN_MULT
  if (entity.shields > 0) {
    const absorbed = Math.min(entity.shields, remaining)
    entity.shields -= absorbed
    remaining -= absorbed
  }
  if (remaining > 0 && entity.armor > 0) {
    const absorbed = Math.min(entity.armor, remaining)
    entity.armor -= absorbed
    remaining -= absorbed
  }
  if (remaining > 0) entity.hull -= remaining
  if (simTime !== null) entity.lastHitAt = simTime
  if (entity.hull <= 0 && 'destroyed' in entity) entity.destroyed = true
}

// opts.player + opts.inCombat: player only regens out of combat at 1%/10s.
// NPCs keep the faster point-based combat regen.
export function regenShields(entity, shipClass, simTime, dt, { player = false, inCombat = false } = {}) {
  if (player && inCombat) return
  const idleSeconds = simTime - (entity.lastHitAt ?? -Infinity)
  if (idleSeconds <= SHIELD_REGEN_DELAY_S) return
  const max = shipClass.stats.shields
  const rate = player
    ? (max * PLAYER_SHIELD_REGEN_FRACTION) / PLAYER_SHIELD_REGEN_PERIOD_S
    : SHIELD_REGEN_RATE
  entity.shields = Math.min(max, entity.shields + rate * dt)
}

// weaponTypeFilter (optional) restricts firing to hardpoints of that type —
// main.js: LMB = lasers, RMB = missiles (both may fire in the same frame).
// NPCs omit it and fire every hardpoint as before.
// targetRef (optional) is who this shot is actually aimed at — { kind:
// 'player' } or { kind: 'npc', id }. Only NPC shooters set it (see
// updateNpcAI/opponentsFor below); the player's own shots omit it and keep
// hitting any NPC in range, unchanged. updateProjectiles uses it to resolve
// NPC-vs-NPC hits (e.g. a pirate firing on an alien during a truce) without
// every NPC projectile defaulting to "hits the player".
//
// Each hardpoint's actual damage/speed/cooldown/ttl comes from whatever
// weapon is equipped there (shooter.equippedWeapons[hp.id], from
// data/weapons.js) rather than a fixed per-type preset — hp.type is only the
// hardpoint's *mount* kind (what category of weapon fits), not the weapon
// itself. Falls back to that category's free base weapon if nothing (or an
// NPC, which never shops) has equippedWeapons set for it.
// Default NPC aim: converge on ship +Z ahead. Player passes aimWorld = the
// shared chase/reticle aim point (ship +Z × AIM_LOOK_AHEAD from sceneSync).
const DEFAULT_AIM_DISTANCE = 400
const _aimPoint = new THREE.Vector3()
const _projDir = new THREE.Vector3()
const _projQuat = new THREE.Quaternion()
const _localForward = new THREE.Vector3(0, 0, 1)

/**
 * @param {string|null} weaponTypeFilter 'laser' | 'missile' | null (all)
 * @param {{ kind: string, id?: string }|null} targetRef NPC aim target
 * @param {number[]|null} aimWorld world point to aim each muzzle at (player reticle)
 */
export function fireProjectile(
  gameState,
  shooter,
  shooterShipClass,
  ownerId,
  onFire,
  weaponTypeFilter = null,
  targetRef = null,
  aimWorld = null
) {
  shooter.hardpointCooldowns ??= {}
  shooter.equippedWeapons ??= {}

  const quat = new THREE.Quaternion().fromArray(shooter.quaternion)
  quat.normalize()
  const shooterPos = new THREE.Vector3().fromArray(shooter.position)
  const forward = _localForward.clone().applyQuaternion(quat)
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, 1)
  else forward.normalize()

  if (Array.isArray(aimWorld) && aimWorld.length === 3) {
    _aimPoint.fromArray(aimWorld)
  } else {
    _aimPoint.copy(shooterPos).addScaledVector(forward, DEFAULT_AIM_DISTANCE)
  }

  const hardpoints = shooterShipClass?.hardpoints
  if (!hardpoints?.length) return

  for (const hp of hardpoints) {
    const mountType = hp.type === 'missile' ? 'missile' : 'laser'
    if (weaponTypeFilter && mountType !== weaponTypeFilter) continue
    let weaponId = shooter.equippedWeapons?.[hp.id] ?? BASE_WEAPON_ID[mountType]
    let weapon
    try {
      weapon = getWeapon(weaponId)
    } catch {
      weaponId = BASE_WEAPON_ID[mountType]
      weapon = getWeapon(weaponId)
    }
    const readyAt = shooter.hardpointCooldowns[hp.id] ?? -Infinity
    if (gameState.simTime < readyAt) continue
    shooter.hardpointCooldowns[hp.id] = gameState.simTime + weapon.cooldownS

    const hpPos = hp.position ?? [0, 0, 0]
    let localX = hpPos[0]
    let localY = hpPos[1]
    let localZ = hpPos[2]
    // Player lasers: centerline + pure ship +Z (nose hardpoint Z, no X/Y wing offset).
    // Spawn at the muzzle — downrange jumps made bolts tiny/invisible in chase cam.
    if (ownerId === 'player' && mountType === 'laser') {
      localX = 0
      localY = 0
      localZ = Math.max(localZ, 8)
    }
    const worldPos = new THREE.Vector3(localX, localY, localZ).applyQuaternion(quat).add(shooterPos)
    // Player lasers always fly pure ship +Z (Tab-lock does not bend the beam).
    // Missiles / NPCs still aim at aimWorld when provided.
    if (ownerId === 'player' && mountType === 'laser') {
      _projDir.copy(forward)
    } else {
      _projDir.copy(_aimPoint).sub(worldPos)
      if (_projDir.lengthSq() < 1e-8) _projDir.copy(forward)
      else _projDir.normalize()
    }
    _projQuat.setFromUnitVectors(_localForward, _projDir)

    gameState.projectiles.push({
      id: `proj-${projectileCounter++}`,
      ownerId,
      targetRef,
      weaponType: mountType,
      weaponId,
      position: worldPos.toArray(),
      quaternion: _projQuat.toArray(),
      velocity: _projDir.clone().multiplyScalar(weapon.speed).toArray(),
      damage: weapon.damage,
      ttl: weapon.ttl
    })
    try {
      onFire?.(weaponId, mountType)
    } catch (err) {
      console.error('onFire callback failed:', err)
    }
  }
}

export function getShipCollisionRadius(shipClass) {
  return shipClass.hull.length / 2
}

function closestDistanceToSegment(point, segStart, segEnd) {
  const seg = segEnd.clone().sub(segStart)
  const len2 = seg.lengthSq()
  if (len2 === 0) return point.distanceTo(segStart)
  const t = Math.max(0, Math.min(1, point.clone().sub(segStart).dot(seg) / len2))
  return point.distanceTo(segStart.clone().addScaledVector(seg, t))
}

// Player lasers that no longer track current ship +Z (fired during a turn) are
// dropped so a stationary burst isn't painted over by the old spray for ~1s.
const BORESIGHT_KEEP_DOT = 0.995 // ~5.7°
const _pruneFwd = new THREE.Vector3()
const _pruneQuat = new THREE.Quaternion()

/**
 * Remove player laser bolts whose travel dir is off the live boresight.
 * Call after ship orientation updates (and before drawing).
 */
export function prunePlayerLasersOffBoresight(gameState) {
  const ship = gameState?.player?.ship
  if (!ship || !gameState.projectiles?.length) return
  _pruneQuat.fromArray(ship.quaternion).normalize()
  _pruneFwd.set(0, 0, 1).applyQuaternion(_pruneQuat)
  if (_pruneFwd.lengthSq() < 1e-8) return
  _pruneFwd.normalize()
  gameState.projectiles = gameState.projectiles.filter((p) => {
    if (p.ownerId !== 'player' || p.weaponType === 'missile') return true
    const sp = Math.hypot(p.velocity[0], p.velocity[1], p.velocity[2])
    if (sp < 1e-6) return false
    const dot =
      (p.velocity[0] * _pruneFwd.x + p.velocity[1] * _pruneFwd.y + p.velocity[2] * _pruneFwd.z) / sp
    return dot >= BORESIGHT_KEEP_DOT
  })
}

export function updateProjectiles(gameState, dt, onHit) {
  const alive = []
  // Only the player can mine, and only if galaxy/currentSystemId are present
  // (test fixtures often omit them — no asteroid check happens in that case).
  const currentSystem = gameState.galaxy ? getSystem(gameState.galaxy, gameState.player.currentSystemId) : null

  for (const proj of gameState.projectiles) {
    proj.ttl -= dt
    if (proj.ttl <= 0) continue

    const prevPos = new THREE.Vector3().fromArray(proj.position)
    const newPos = prevPos.clone().addScaledVector(new THREE.Vector3().fromArray(proj.velocity), dt)
    proj.position = newPos.toArray()

    const targets =
      proj.ownerId === 'player'
        ? gameState.npcs
        : proj.targetRef?.kind === 'npc'
          ? gameState.npcs.filter((n) => n.id === proj.targetRef.id)
          : [gameState.player.ship]
    let hit = false
    for (const target of targets) {
      if (target.destroyed) continue
      const targetShipClass = getShipClass(target.shipClassId ?? target.classId)
      const targetPos = new THREE.Vector3().fromArray(target.position)
      const hitDistance = HIT_RADIUS + getShipCollisionRadius(targetShipClass)
      if (closestDistanceToSegment(targetPos, prevPos, newPos) < hitDistance) {
        const isPlayer = target === gameState.player.ship
        applyDamage(target, proj.damage, gameState.simTime, { player: isPlayer })
        // Firefight bookkeeping for player drones (engage only after shots exchanged).
        markPlayerCombatEngagement(gameState, proj, target, isPlayer)
        // Firing on a non-hostile ship (a trader) while home permanently
        // breaks the starting system's peace — see main.js's ambient
        // spawner, which otherwise only ever spawns neutral traffic there.
        if (proj.ownerId === 'player' && target.faction === 'trader' && gameState.player.currentSystemId === gameState.player.startingSystemId) {
          gameState.flags.startingSystemPeaceBroken = true
        }
        // Only a kill the player is directly responsible for (their own
        // projectile) leaves a lootable wreck — an NPC-vs-NPC kill or a
        // suicide ram don't count, per its own design.
        if (proj.ownerId === 'player' && target.destroyed) {
          gameState.wrecks.push(
            spawnWreck(newPos.toArray(), gameState.simTime, Math.random, target.shipClassId ?? target.classId)
          )
          if (target.faction === 'pirate') {
            applyLawBonusForPirateKill(gameState)
          }
        }
        onHit?.({
          position: newPos.toArray(),
          weaponType: proj.weaponType,
          weaponId: proj.weaponId,
          destroyed: !!target.destroyed,
          hitPlayer: isPlayer,
          // Shooter id (npc id or 'player') — used for death-screen killer credit.
          ownerId: proj.ownerId ?? null,
          // Incoming shot direction (world) for directional damage vignette.
          inboundDir: prevPos.clone().sub(newPos).toArray(),
          // NPC id when a ship is killed (for ship-death FX, avoid double-play).
          targetNpcId: !isPlayer && target.id ? target.id : null
        })
        hit = true
        break
      }
    }

    // Enemy shots can destroy deployed *player* combat drones only (NPCs have none).
    if (!hit && proj.ownerId !== 'player') {
      const drones = gameState.player?.ship?.drones ?? []
      for (const drone of drones) {
        if (!drone.deployed || drone.destroyed || drone.hull <= 0) continue
        const dPos = new THREE.Vector3().fromArray(drone.position)
        if (closestDistanceToSegment(dPos, prevPos, newPos) < HIT_RADIUS + 4) {
          const destroyed = damageDrone(drone, proj.damage, gameState.simTime)
          // Hitting a player drone counts as engaging the player.
          if (proj.ownerId && proj.ownerId !== 'player') {
            gameState.player.combatEngagedNpcIds ??= {}
            gameState.player.combatEngagedNpcIds[proj.ownerId] = true
          }
          onHit?.({
            position: newPos.toArray(),
            weaponType: proj.weaponType,
            weaponId: proj.weaponId,
            destroyed,
            hitPlayer: false,
            hitDrone: true,
            droneId: drone.id,
            inboundDir: prevPos.clone().sub(newPos).toArray()
          })
          hit = true
          break
        }
      }
    }

    // Hit-tests individual rocks (matching the per-rock Tab-targeting system
    // in main.js) rather than the field's whole bounding sphere, since ore is
    // now a finite, depletable, per-rock resource.
    if (!hit && proj.ownerId === 'player' && currentSystem) {
      fieldLoop: for (const body of currentSystem.bodies) {
        if (body.kind !== 'asteroidField') continue
        const rocks = getAsteroidRocks(body)
        for (let i = 0; i < rocks.length; i++) {
          if (!isRockAlive(gameState, body.id, i)) continue
          const rock = rocks[i]
          const rockPos = new THREE.Vector3(body.position[0] + rock.position[0], body.position[1] + rock.position[1], body.position[2] + rock.position[2])
          const hitR = rockCollisionRadius(rock) + MINE_HIT_PAD
          if (closestDistanceToSegment(rockPos, prevPos, newPos) < hitR) {
            const shipClass = getShipClass(gameState.player.ship.classId)
            // Stronger guns chip more ore (pulse laser 1, rocket pod 2, …).
            const yieldAmt = mineYieldForWeapon(proj.weaponId ?? proj.weaponType)
            const mined = mineRock(gameState, shipClass, currentSystem, body.id, i, yieldAmt)
            onHit?.({
              position: newPos.toArray(),
              rockPosition: rockPos.toArray(),
              weaponType: proj.weaponType,
              weaponId: proj.weaponId,
              destroyed: !!mined.destroyed,
              mined,
              fieldId: body.id,
              rockIndex: i
            })
            hit = true
            break fieldLoop
          }
        }
      }
    }

    if (!hit) alive.push(proj)
  }
  gameState.projectiles = alive
}

function faceToward(quat, fromPos, toPos, turnRate, dt) {
  // Matrix4.lookAt follows the camera convention (local +Z points away from
  // the target), but our ships' forward is +Z, so eye/target are swapped here.
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(toPos, fromPos, new THREE.Vector3(0, 1, 0))
  )
  quat.slerp(targetQuat, Math.min(1, turnRate * dt))
  return new THREE.Vector3(0, 0, 1).applyQuaternion(quat)
}

// A pirate/alien encounter turns three-way the moment an alien is present:
// aliens are hostile to both the player and pirates, and pirates call a
// truce with the player to fight the aliens instead (main.js detects when
// this ends — no more live aliens — to have the survivors thank the player
// and leave the system).
export function truceActive(gameState) {
  return gameState.npcs.some((n) => !n.destroyed && n.faction === 'alien')
}

/**
 * Per-frame combat context — built once before the NPC AI loop so we do not
 * re-walk the galaxy / re-roll law checks for every ship (was a combat hitch).
 */
export function prepareCombatFrame(gameState) {
  const system = getSystem(gameState.galaxy, gameState.player.currentSystemId)
  if (system) ensureSystemSecurity(system)
  const truce = truceActive(gameState)
  // Pre-index live hostiles by faction for O(1) opponent lists.
  const pirates = []
  const aliens = []
  const police = []
  for (const n of gameState.npcs) {
    if (n.destroyed) continue
    if (n.faction === 'pirate') pirates.push(n)
    else if (n.faction === 'alien') aliens.push(n)
    else if (n.faction === 'police') police.push(n)
  }
  return {
    system,
    bodies: system?.bodies ?? [],
    playerPos: gameState.player.ship.position,
    truce,
    policeSos: policeHostileToPlayer(gameState, system),
    civSos: civiliansHostileToPlayer(gameState, system),
    pirates,
    aliens,
    police,
    engagedMap: gameState.player.combatEngagedNpcIds ?? {}
  }
}

// The nearest hostile candidate for this NPC to engage, as { id, position }
// (id is 'player' or another NPC's id) — or null if this faction never
// fights (traders). Kept separate from updateNpcAI so both the AI loop and
// tests/future callers can reason about "who is X currently at war with"
// without re-deriving it.
function opponentsFor(npc, gameState, frame = null) {
  const ctx = frame ?? prepareCombatFrame(gameState)
  const playerPos = ctx.playerPos
  const engaged = !!ctx.engagedMap[npc.id]

  if (npc.faction === 'alien') {
    const opponents = [{ id: 'player', position: playerPos }]
    for (const other of ctx.pirates) {
      if (other.id !== npc.id) opponents.push({ id: other.id, position: other.position })
    }
    for (const other of ctx.police) {
      opponents.push({ id: other.id, position: other.position })
    }
    return opponents
  }
  if (npc.faction === 'pirate') {
    if (ctx.truce) {
      return ctx.aliens.map((n) => ({ id: n.id, position: n.position }))
    }
    const opponents = [{ id: 'player', position: playerPos }]
    for (const other of ctx.police) {
      opponents.push({ id: other.id, position: other.position })
    }
    return opponents
  }
  if (npc.faction === 'police') {
    const opponents = []
    for (const other of ctx.pirates) {
      opponents.push({ id: other.id, position: other.position })
    }
    for (const other of ctx.aliens) {
      opponents.push({ id: other.id, position: other.position })
    }
    if (ctx.policeSos || engaged) {
      opponents.push({ id: 'player', position: playerPos })
    }
    return opponents
  }
  // Traders / civilians: only fight when engaged or system-wide outlaw SOS.
  if (npc.faction === 'trader' || !npc.faction) {
    if (engaged || ctx.civSos) {
      return [{ id: 'player', position: playerPos }]
    }
  }
  return []
}

export function updateNpcAI(npc, gameState, dt, onFire, onPlayerHit, combatFrame = null) {
  if (npc.destroyed) return
  const npcShipClass = getShipClass(npc.shipClassId)
  regenShields(npc, npcShipClass, gameState.simTime, dt)

  const npcPos = new THREE.Vector3().fromArray(npc.position)
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const hullFraction = npc.hull / npcShipClass.stats.hull
  const stats = npcShipClass.stats
  const quat = new THREE.Quaternion().fromArray(npc.quaternion)
  const velocity = new THREE.Vector3().fromArray(npc.velocity)

  let opponent = null
  let distance = Infinity
  for (const candidate of opponentsFor(npc, gameState, combatFrame)) {
    const d = npcPos.distanceTo(new THREE.Vector3().fromArray(candidate.position))
    if (d < distance) {
      distance = d
      opponent = candidate
    }
  }

  if (hullFraction < FLEE_HULL_FRACTION) {
    // A one-time decision the moment it first drops this low — not re-rolled
    // every frame while it stays there (see RAM_CHANCE above).
    if (npc.aiState !== 'flee' && npc.aiState !== 'ram') {
      if (Math.random() < RAM_CHANCE) {
        npc.aiState = 'ram'
        npc.ramQuote = RAM_QUOTES[Math.floor(Math.random() * RAM_QUOTES.length)]
      } else {
        npc.aiState = 'flee'
      }
    }
  } else if (opponent && distance < ATTACK_RANGE) npc.aiState = 'attack'
  else if (npc.aiState === 'attack' && distance >= DISENGAGE_RANGE) npc.aiState = 'patrol'

  let forward
  if (npc.aiState === 'attack' && opponent) {
    const opponentPos = new THREE.Vector3().fromArray(opponent.position)
    forward = faceToward(quat, npcPos, opponentPos, stats.turnRate, dt)
    const toOpponent = opponentPos.clone().sub(npcPos).normalize()

    // Coin-flipped once per NPC so only some attackers orbit — the rest keep
    // closing head-on as before, for variety.
    npc.isOrbiter ??= Math.random() < 0.5
    npc.orbitDir ??= Math.random() < 0.5 ? 1 : -1
    const recentlyHit = gameState.simTime - (npc.lastHitAt ?? -Infinity) < EVADE_WINDOW_S

    if (recentlyHit) {
      // Took a hit — break off and open the range for a moment rather than
      // pressing in blindly. Still faces the opponent (see forward above),
      // so it can keep firing back while it retreats.
      velocity.addScaledVector(forward, -stats.accel * dt)
    } else if (npc.isOrbiter && distance < ORBIT_RANGE) {
      // Circle rather than close head-on: thrust mostly tangential to the
      // opponent (facing still tracks them, so guns stay on target), with a
      // small radial nudge to roughly hold ORBIT_RANGE.
      const tangent = new THREE.Vector3(-toOpponent.z, 0, toOpponent.x).multiplyScalar(npc.orbitDir)
      const radial = toOpponent.clone().multiplyScalar(distance < ORBIT_RANGE * 0.7 ? -1 : 0.4)
      velocity.addScaledVector(tangent.multiplyScalar(0.85).add(radial).normalize(), stats.accel * dt)
    } else {
      velocity.addScaledVector(forward, stats.accel * dt)
    }

    if (distance < FIRE_RANGE && forward.dot(toOpponent) > FIRE_CONE_DOT) {
      const targetRef = opponent.id === 'player' ? { kind: 'player' } : { kind: 'npc', id: opponent.id }
      fireProjectile(gameState, npc, npcShipClass, npc.id, onFire, null, targetRef)
    }
  } else if (npc.aiState === 'ram') {
    // A suicide run is aimed squarely at the player regardless of whatever
    // opponentsFor would otherwise pick (e.g. an alien, if this pirate was
    // truced) — turns and accelerates harder than a normal attack run for a
    // dramatic charge, and destroys itself on impact alongside the damage.
    forward = faceToward(quat, npcPos, playerPos, stats.turnRate * 1.6, dt)
    velocity.addScaledVector(forward, stats.accel * 1.6 * dt)
    const hitDistance = getShipCollisionRadius(npcShipClass) + getShipCollisionRadius(getShipClass(gameState.player.ship.classId))
    if (npcPos.distanceTo(playerPos) < hitDistance) {
      applyDamage(gameState.player.ship, RAM_DAMAGE, gameState.simTime, { player: true })
      npc.hull = 0
      npc.destroyed = true
      onPlayerHit?.(npc.position)
    }
  } else if (npc.aiState === 'flee') {
    const fleeFromPos = opponent ? new THREE.Vector3().fromArray(opponent.position) : playerPos
    const fleeTarget = npcPos.clone().add(npcPos.clone().sub(fleeFromPos).normalize())
    forward = faceToward(quat, npcPos, fleeTarget, stats.turnRate, dt)
    velocity.addScaledVector(forward, stats.accel * dt)
  } else {
    // Station police: loiter in a ring outside the station exterior; others wander.
    if (!npc.patrolTarget || npcPos.distanceTo(new THREE.Vector3().fromArray(npc.patrolTarget)) < 20) {
      if (npc.patrolAnchor && Array.isArray(npc.patrolAnchor)) {
        const minR = Math.max(80, npc.patrolMinRadius ?? npc.patrolRadius ?? 280)
        const maxR = Math.max(minR + 40, npc.patrolMaxRadius ?? minR + 200)
        const a = Math.random() * Math.PI * 2
        const elev = (Math.random() - 0.5) * 0.5
        const dist = minR + Math.random() * (maxR - minR)
        let target = [
          npc.patrolAnchor[0] + Math.cos(a) * dist * Math.cos(elev),
          npc.patrolAnchor[1] + Math.sin(elev) * dist * 0.45,
          npc.patrolAnchor[2] + Math.sin(a) * dist * Math.cos(elev)
        ]
        // Never pick a patrol waypoint inside solid geometry.
        if (combatFrame?.bodies) {
          target = clearPositionOfBodies(
            target,
            combatFrame.bodies,
            NPC_SPAWN_SHIP_RADIUS,
            NPC_FLIGHT_CLEARANCE
          )
        }
        npc.patrolTarget = target
      } else {
        let target = npcPos
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 200))
          .toArray()
        if (combatFrame?.bodies) {
          target = clearPositionOfBodies(
            target,
            combatFrame.bodies,
            NPC_SPAWN_SHIP_RADIUS,
            NPC_FLIGHT_CLEARANCE
          )
        }
        npc.patrolTarget = target
      }
    }
    forward = faceToward(quat, npcPos, new THREE.Vector3().fromArray(npc.patrolTarget), stats.turnRate * 0.5, dt)
    velocity.addScaledVector(forward, stats.accel * 0.3 * dt)
  }

  velocity.multiplyScalar(Math.pow(0.35, dt))
  if (velocity.length() > stats.speed) velocity.setLength(stats.speed)
  let position = npcPos.clone().addScaledVector(velocity, dt).toArray()

  // Keep NPCs outside solid shells — fast overlap check first (skip clear cost).
  if (
    combatFrame?.bodies &&
    positionOverlapsBodies(position, combatFrame.bodies, NPC_SPAWN_SHIP_RADIUS, NPC_FLIGHT_CLEARANCE)
  ) {
    const before = position
    position = clearPositionOfBodies(
      position,
      combatFrame.bodies,
      NPC_SPAWN_SHIP_RADIUS,
      NPC_FLIGHT_CLEARANCE
    )
    const pushX = position[0] - before[0]
    const pushY = position[1] - before[1]
    const pushZ = position[2] - before[2]
    if (pushX * pushX + pushY * pushY + pushZ * pushZ > 1e-6) {
      const v = velocity
      const inward = v.x * -pushX + v.y * -pushY + v.z * -pushZ
      if (inward > 0) {
        const plen = Math.hypot(pushX, pushY, pushZ) || 1
        v.x += (pushX / plen) * inward
        v.y += (pushY / plen) * inward
        v.z += (pushZ / plen) * inward
      }
    }
  }

  npc.position = position
  npc.velocity = velocity.toArray()
  npc.quaternion = quat.toArray()
}

export function updateCombatFlag(gameState, combatFrame = null) {
  const ctx = combatFrame ?? prepareCombatFrame(gameState)
  const playerPos = new THREE.Vector3().fromArray(ctx.playerPos)
  // Aliens always hostile; pirates unless truced; police when wanted/engaged;
  // civilians when outlaw SOS or engaged.
  const hostileNearby = gameState.npcs.some((n) => {
    if (n.destroyed) return false
    const dist = new THREE.Vector3().fromArray(n.position).distanceTo(playerPos)
    if (dist >= ATTACK_RANGE) return false
    if (n.faction === 'alien') return true
    if (n.faction === 'pirate' && !ctx.truce) return true
    if (n.faction === 'police' && (ctx.policeSos || ctx.engagedMap[n.id])) return true
    if ((n.faction === 'trader' || !n.faction) && (ctx.civSos || ctx.engagedMap[n.id])) {
      return true
    }
    return false
  })
  if (hostileNearby) {
    gameState.inCombat = true
    gameState.lastCombatContactAt = gameState.simTime
  } else if (gameState.inCombat && gameState.simTime - (gameState.lastCombatContactAt ?? 0) > COMBAT_COOLDOWN_S) {
    gameState.inCombat = false
  }
}

/** True when the player has exchanged fire with a live pirate nearby (police response). */
export function playerFightingPirates(gameState) {
  if (!gameState?.npcs?.length) return false
  const engagedMap = gameState.player.combatEngagedNpcIds
  if (!engagedMap) return false
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  return gameState.npcs.some((n) => {
    if (n.destroyed || n.faction !== 'pirate') return false
    if (!engagedMap[n.id]) return false
    return new THREE.Vector3().fromArray(n.position).distanceTo(playerPos) < ATTACK_RANGE * 1.4
  })
}
