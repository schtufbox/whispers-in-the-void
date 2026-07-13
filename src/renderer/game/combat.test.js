import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDamage, fireProjectile, updateProjectiles, updateNpcAI } from './combat.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { getAsteroidRocks } from '../render/asteroidFieldMesh.js'

const DT = 1 / 60

function step(gameState, times, fn) {
  for (let i = 0; i < times; i++) {
    gameState.simTime += DT
    fn()
  }
}

test('applyDamage layers shields then armor then hull', () => {
  const entity = { shields: 10, armor: 5, hull: 100, destroyed: false }
  applyDamage(entity, 8)
  assert.equal(entity.shields, 2)
  assert.equal(entity.armor, 5)
  assert.equal(entity.hull, 100)

  applyDamage(entity, 10)
  assert.equal(entity.shields, 0)
  assert.equal(entity.armor, 0)
  assert.equal(entity.hull, 97)
})

test('applyDamage marks entity destroyed when hull drops to zero or below', () => {
  const entity = { shields: 0, armor: 0, hull: 5, destroyed: false }
  applyDamage(entity, 20)
  assert.ok(entity.hull <= 0)
  assert.equal(entity.destroyed, true)
})

test('fireProjectile spawns a projectile per hardpoint that travels and can hit a target', () => {
  const shipClass = getShipClass('interceptor')
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], lastFireAt: -Infinity }
  const gameState = {
    simTime: 0,
    projectiles: [],
    npcs: [],
    player: { ship: { classId: 'bravia_mk2', position: [0, 0, 50], quaternion: [0, 0, 0, 1], destroyed: false, shields: 0, armor: 0, hull: 100 } }
  }
  fireProjectile(gameState, shooter, shipClass, 'enemy-1')
  assert.equal(gameState.projectiles.length, shipClass.hardpoints.length)

  step(gameState, 20, () => updateProjectiles(gameState, DT))
  assert.ok(gameState.player.ship.hull < 100, 'projectile should eventually hit the player ship')
})

test('fireProjectile with a weaponTypeFilter only fires matching hardpoints', () => {
  const shipClass = getShipClass('corvette') // one laser hardpoint, one missile hardpoint
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const gameState = { simTime: 0, projectiles: [] }

  fireProjectile(gameState, shooter, shipClass, 'player', null, 'laser')
  assert.equal(gameState.projectiles.length, 1)
  assert.equal(gameState.projectiles[0].weaponType, 'laser')

  fireProjectile(gameState, shooter, shipClass, 'player', null, 'missile')
  assert.equal(gameState.projectiles.length, 2)
  assert.equal(gameState.projectiles[1].weaponType, 'missile')
})

test('fireProjectile uses the shooter\'s equipped weapon stats, not just a fixed per-type preset', () => {
  const shipClass = getShipClass('corvette') // hardpoints: wing1 (laser), wing2 (missile)
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], equippedWeapons: { wing1: 'plasma_cannon' } }
  const gameState = { simTime: 0, projectiles: [] }

  fireProjectile(gameState, shooter, shipClass, 'player', null, 'laser')
  assert.equal(gameState.projectiles[0].weaponId, 'plasma_cannon')
  assert.equal(gameState.projectiles[0].damage, 22, 'should use plasma_cannon\'s damage, not the old fixed laser preset')

  // The missile hardpoint has no explicit equippedWeapons entry, so it
  // should fall back to the category's free base weapon.
  fireProjectile(gameState, shooter, shipClass, 'player', null, 'missile')
  assert.equal(gameState.projectiles[1].weaponId, 'rocket_pod')
})

test('fireProjectile with a weaponTypeFilter the ship has no hardpoint for fires nothing', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID) // laser-only starter ship
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] }
  const gameState = { simTime: 0, projectiles: [] }

  fireProjectile(gameState, shooter, shipClass, 'player', null, 'missile')
  assert.equal(gameState.projectiles.length, 0)
})

test('a player laser hitting an asteroid field mines ore instead of dealing damage', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const fieldId = 'field-test'
  const rock = getAsteroidRocks({ id: fieldId, radius: 90 })[0]
  // Places the field so this specific rock sits exactly on the shooter's
  // straight-ahead flight path (matching the starter ship's single, centered
  // hardpoint), since per-rock hit detection needs actual alignment rather
  // than the old field-wide bounding sphere.
  const asteroidField = { id: fieldId, kind: 'asteroidField', position: [-rock.position[0], -rock.position[1], 100 - rock.position[2]], radius: 90 }
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], lastFireAt: -Infinity }
  const gameState = {
    simTime: 0,
    projectiles: [],
    npcs: [],
    galaxy: { systems: [{ id: 'sys-0', galaxyPosition: [0, 0, 0], bodies: [asteroidField] }] },
    player: {
      currentSystemId: 'sys-0',
      ship: { classId: STARTER_SHIP_CLASS_ID, position: [0, 0, 0], quaternion: [0, 0, 0, 1], miningHold: {} }
    }
  }
  fireProjectile(gameState, shooter, shipClass, 'player')
  assert.equal(gameState.projectiles.length, shipClass.hardpoints.length)

  let hitPayload = null
  step(gameState, 20, () => updateProjectiles(gameState, DT, (payload) => { hitPayload = payload }))

  assert.equal(gameState.projectiles.length, 0, 'the projectile should be consumed by the asteroid field, not pass through')
  assert.ok(hitPayload?.mined, 'onHit should report a mining result')
  const totalOre = Object.values(gameState.player.ship.miningHold).reduce((a, b) => a + b, 0)
  assert.equal(totalOre, 1, 'a successful mining hit should add exactly one unit of ore')
})

test('destroying an NPC with a player projectile leaves a lootable wreck at the impact point', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const shooter = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], lastFireAt: -Infinity }
  const npc = { id: 'npc-9', shipClassId: 'scout', faction: 'trader', position: [0, 0, 50], hull: 1, shields: 0, armor: 0, destroyed: false }
  const gameState = {
    simTime: 0,
    projectiles: [],
    npcs: [npc],
    wrecks: [],
    player: { currentSystemId: 'sys-0', startingSystemId: null, ship: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] } }
  }
  fireProjectile(gameState, shooter, shipClass, 'player')
  step(gameState, 20, () => updateProjectiles(gameState, DT))

  assert.equal(npc.destroyed, true)
  assert.equal(gameState.wrecks.length, 1)
  assert.ok(gameState.wrecks[0].loot.cargo, 'wreck should carry some lootable cargo')
})

test('NPC AI: a pirate close to the player transitions from patrol to attack', () => {
  const npc = {
    id: 'npc-0', shipClassId: 'raider_mk1', faction: 'pirate',
    position: [0, 0, 50], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1],
    hull: 90, shields: 60, armor: 25, aiState: 'patrol', patrolTarget: null,
    lastHitAt: -Infinity, lastFireAt: -Infinity, destroyed: false
  }
  const gameState = {
    simTime: 0,
    npcs: [npc], projectiles: [],
    player: { ship: { position: [0, 0, 0], quaternion: [0, 0, 0, 1] } }
  }
  updateNpcAI(npc, gameState, DT)
  assert.equal(npc.aiState, 'attack')
})

test('NPC AI: an attacking pirate closes distance on the player and eventually fires', () => {
  const npc = {
    id: 'npc-2', shipClassId: 'raider_mk1', faction: 'pirate',
    position: [15, 0, 120], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1],
    hull: 90, shields: 60, armor: 25, aiState: 'patrol', patrolTarget: null,
    lastHitAt: -Infinity, lastFireAt: -Infinity, destroyed: false
  }
  const gameState = {
    simTime: 0,
    npcs: [npc], projectiles: [],
    player: { ship: { classId: 'bravia_mk2', position: [0, 0, 0], quaternion: [0, 0, 0, 1], destroyed: false, shields: 0, armor: 0, hull: 100 } }
  }
  const startDistance = Math.hypot(...npc.position)

  step(gameState, 300, () => {
    updateNpcAI(npc, gameState, DT)
    updateProjectiles(gameState, DT)
  })

  const endDistance = Math.hypot(...npc.position)
  assert.ok(endDistance < startDistance, 'attacking pirate should close distance on the player, not flee from it')
  assert.ok(gameState.player.ship.hull < 100, 'pirate should eventually get in range/cone and land a hit')
})

test('NPC AI: low hull fraction forces flee (or, rarely, a suicide ram)', () => {
  // A ~3% chance rolls 'ram' instead of 'flee' the moment hull first drops
  // this low (see RAM_CHANCE) — both are valid "this ship is desperate" outcomes.
  const npc = {
    id: 'npc-1', shipClassId: 'raider_mk1', faction: 'pirate',
    position: [0, 0, 50], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1],
    hull: 10, shields: 0, armor: 0, aiState: 'attack', patrolTarget: null,
    lastHitAt: -Infinity, lastFireAt: -Infinity, destroyed: false
  }
  const gameState = {
    simTime: 0,
    npcs: [npc], projectiles: [],
    player: { ship: { classId: 'bravia_mk2', position: [0, 0, 0], quaternion: [0, 0, 0, 1], hull: 100, shields: 0, armor: 0 } }
  }
  updateNpcAI(npc, gameState, DT)
  assert.ok(['flee', 'ram'].includes(npc.aiState))
})

test('NPC AI: a desperate ship almost always flees, but sometimes commits to a suicide ram on the player', () => {
  const outcomes = { flee: 0, ram: 0 }
  for (let i = 0; i < 500; i++) {
    const npc = {
      id: `npc-${i}`, shipClassId: 'raider_mk1', faction: 'pirate',
      position: [0, 0, 50], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1],
      hull: 10, shields: 0, armor: 0, aiState: 'attack', patrolTarget: null,
      lastHitAt: -Infinity, lastFireAt: -Infinity, destroyed: false
    }
    const gameState = {
      simTime: 0,
      npcs: [npc], projectiles: [],
      player: { ship: { classId: 'bravia_mk2', position: [0, 0, 0], quaternion: [0, 0, 0, 1], hull: 100, shields: 0, armor: 0 } }
    }
    updateNpcAI(npc, gameState, DT)
    outcomes[npc.aiState]++
  }
  assert.ok(outcomes.flee > 400, `expected fleeing to dominate, got ${JSON.stringify(outcomes)}`)
  assert.ok(outcomes.ram > 0, 'expected at least one suicide ram across 500 trials')
})

test('NPC AI: a ramming ship charges the player and deals damage (and destroys itself) on impact', () => {
  const npc = {
    id: 'npc-3', shipClassId: 'raider_mk1', faction: 'pirate',
    position: [0, 0, 5], velocity: [0, 0, 0], quaternion: [0, 0, 0, 1],
    hull: 10, shields: 0, armor: 0, aiState: 'ram', patrolTarget: null,
    lastHitAt: -Infinity, lastFireAt: -Infinity, destroyed: false
  }
  const gameState = {
    simTime: 0,
    npcs: [npc], projectiles: [],
    player: { ship: { classId: 'bravia_mk2', position: [0, 0, 0], quaternion: [0, 0, 0, 1], hull: 100, shields: 0, armor: 0 } }
  }
  updateNpcAI(npc, gameState, DT)
  assert.ok(gameState.player.ship.hull < 100, 'ramming into contact range should damage the player')
  assert.equal(npc.destroyed, true, 'the rammer destroys itself on impact')
})
