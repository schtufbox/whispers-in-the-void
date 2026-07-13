import * as THREE from 'three'
import { getShipClass } from '../data/shipClasses.js'
import { getSystem } from '../procgen/galaxy.js'
import { mineRock, isRockAlive } from './mining.js'
import { spawnWreck } from './wrecks.js'
import { getAsteroidRocks } from '../render/asteroidFieldMesh.js'
import { getWeapon, BASE_WEAPON_ID } from '../data/weapons.js'

const HIT_RADIUS = 1.5
const SHIELD_REGEN_DELAY_S = 4
const SHIELD_REGEN_RATE = 10

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

export function applyDamage(entity, amount, simTime = null) {
  let remaining = amount
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

export function regenShields(entity, shipClass, simTime, dt) {
  const idleSeconds = simTime - (entity.lastHitAt ?? -Infinity)
  if (idleSeconds > SHIELD_REGEN_DELAY_S) {
    entity.shields = Math.min(shipClass.stats.shields, entity.shields + SHIELD_REGEN_RATE * dt)
  }
}

// weaponTypeFilter (optional) restricts firing to hardpoints of that type —
// used by main.js so left-click fires only lasers and right-click only
// missiles/rockets; NPCs omit it and fire every hardpoint as before.
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
export function fireProjectile(gameState, shooter, shooterShipClass, ownerId, onFire, weaponTypeFilter = null, targetRef = null) {
  shooter.hardpointCooldowns ??= {}
  shooter.equippedWeapons ??= {}

  const quat = new THREE.Quaternion().fromArray(shooter.quaternion)
  const shooterPos = new THREE.Vector3().fromArray(shooter.position)
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat)

  for (const hp of shooterShipClass.hardpoints) {
    const mountType = hp.type === 'missile' ? 'missile' : 'laser'
    if (weaponTypeFilter && mountType !== weaponTypeFilter) continue
    const weaponId = shooter.equippedWeapons[hp.id] ?? BASE_WEAPON_ID[mountType]
    const weapon = getWeapon(weaponId)
    const readyAt = shooter.hardpointCooldowns[hp.id] ?? -Infinity
    if (gameState.simTime < readyAt) continue
    shooter.hardpointCooldowns[hp.id] = gameState.simTime + weapon.cooldownS

    const worldPos = new THREE.Vector3(...hp.position).applyQuaternion(quat).add(shooterPos)
    gameState.projectiles.push({
      id: `proj-${projectileCounter++}`,
      ownerId,
      targetRef,
      weaponType: mountType,
      weaponId,
      position: worldPos.toArray(),
      quaternion: quat.toArray(),
      velocity: forward.clone().multiplyScalar(weapon.speed).toArray(),
      damage: weapon.damage,
      ttl: weapon.ttl
    })
    onFire?.(weaponId, mountType)
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
        applyDamage(target, proj.damage, gameState.simTime)
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
          gameState.wrecks.push(spawnWreck(newPos.toArray(), gameState.simTime, Math.random))
        }
        onHit?.({ position: newPos.toArray(), weaponType: proj.weaponType, weaponId: proj.weaponId, destroyed: !!target.destroyed })
        hit = true
        break
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
          if (closestDistanceToSegment(rockPos, prevPos, newPos) < rock.radius + HIT_RADIUS) {
            const shipClass = getShipClass(gameState.player.ship.classId)
            const mined = mineRock(gameState, shipClass, currentSystem, body.id, i)
            onHit?.({ position: newPos.toArray(), weaponType: proj.weaponType, weaponId: proj.weaponId, destroyed: false, mined })
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

// The nearest hostile candidate for this NPC to engage, as { id, position }
// (id is 'player' or another NPC's id) — or null if this faction never
// fights (traders). Kept separate from updateNpcAI so both the AI loop and
// tests/future callers can reason about "who is X currently at war with"
// without re-deriving it.
function opponentsFor(npc, gameState) {
  if (npc.faction === 'alien') {
    const opponents = [{ id: 'player', position: gameState.player.ship.position }]
    for (const other of gameState.npcs) {
      if (other.faction === 'pirate' && !other.destroyed) opponents.push({ id: other.id, position: other.position })
    }
    return opponents
  }
  if (npc.faction === 'pirate') {
    if (truceActive(gameState)) {
      return gameState.npcs.filter((n) => n.faction === 'alien' && !n.destroyed).map((n) => ({ id: n.id, position: n.position }))
    }
    return [{ id: 'player', position: gameState.player.ship.position }]
  }
  return []
}

export function updateNpcAI(npc, gameState, dt, onFire) {
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
  for (const candidate of opponentsFor(npc, gameState)) {
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
      applyDamage(gameState.player.ship, RAM_DAMAGE, gameState.simTime)
      npc.hull = 0
      npc.destroyed = true
    }
  } else if (npc.aiState === 'flee') {
    const fleeFromPos = opponent ? new THREE.Vector3().fromArray(opponent.position) : playerPos
    const fleeTarget = npcPos.clone().add(npcPos.clone().sub(fleeFromPos).normalize())
    forward = faceToward(quat, npcPos, fleeTarget, stats.turnRate, dt)
    velocity.addScaledVector(forward, stats.accel * dt)
  } else {
    if (!npc.patrolTarget || npcPos.distanceTo(new THREE.Vector3().fromArray(npc.patrolTarget)) < 20) {
      npc.patrolTarget = npcPos
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 200))
        .toArray()
    }
    forward = faceToward(quat, npcPos, new THREE.Vector3().fromArray(npc.patrolTarget), stats.turnRate * 0.5, dt)
    velocity.addScaledVector(forward, stats.accel * 0.3 * dt)
  }

  velocity.multiplyScalar(Math.pow(0.35, dt))
  if (velocity.length() > stats.speed) velocity.setLength(stats.speed)
  const position = npcPos.clone().addScaledVector(velocity, dt)

  npc.position = position.toArray()
  npc.velocity = velocity.toArray()
  npc.quaternion = quat.toArray()
}

export function updateCombatFlag(gameState) {
  const playerPos = new THREE.Vector3().fromArray(gameState.player.ship.position)
  const truce = truceActive(gameState)
  // Aliens are always hostile to the player; pirates are too, except while
  // truced against a shared alien threat (see opponentsFor above).
  const hostileNearby = gameState.npcs.some((n) => {
    if (n.destroyed) return false
    if (n.faction !== 'alien' && !(n.faction === 'pirate' && !truce)) return false
    return new THREE.Vector3().fromArray(n.position).distanceTo(playerPos) < ATTACK_RANGE
  })
  if (hostileNearby) {
    gameState.inCombat = true
    gameState.lastCombatContactAt = gameState.simTime
  } else if (gameState.inCombat && gameState.simTime - (gameState.lastCombatContactAt ?? 0) > COMBAT_COOLDOWN_S) {
    gameState.inCombat = false
  }
}
