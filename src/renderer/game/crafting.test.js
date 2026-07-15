import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CRAFT_DURATION_MIN_S,
  CRAFT_DURATION_MAX_S,
  craftDurationS,
  oreCostForBlueprint,
  creditCostForBlueprint,
  blueprintIdForShip,
  blueprintIdForWeapon,
  allBlueprints,
  getBlueprint,
  SHIP_EXOTIC_ORE_FROM_R,
  SHIP_QUANTUM_ORE_FROM_R
} from '../data/blueprints.js'
import {
  startCraft,
  updateCraftingJobs,
  storeBlueprints,
  retrieveBlueprints,
  ensureBlueprintMaps,
  WRECK_BLUEPRINT_DROP_CHANCE,
  PROBE_BLUEPRINT_DROP_CHANCE
} from './crafting.js'
import { createGameState } from './state.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { WEAPONS } from '../data/weapons.js'

function freshState() {
  return createGameState({
    characterName: 'Crafter',
    shipInstanceName: 'Rig',
    shipClassId: STARTER_SHIP_CLASS_ID,
    seed: 42
  })
}

test('blueprint catalog covers ships and paid weapons', () => {
  const bps = allBlueprints()
  assert.ok(bps.some((b) => b.kind === 'ship'))
  assert.ok(bps.some((b) => b.kind === 'weapon'))
  assert.ok(!bps.some((b) => b.itemId === 'pulse_laser'), 'free pulse laser has no craftable BP')
})

test('craft duration spans ~1 minute to ~4 hours', () => {
  const durations = allBlueprints().map((b) => craftDurationS(b.id))
  const min = Math.min(...durations)
  const max = Math.max(...durations)
  assert.ok(min >= CRAFT_DURATION_MIN_S - 1)
  assert.ok(min <= CRAFT_DURATION_MIN_S + 120)
  assert.ok(max >= CRAFT_DURATION_MAX_S * 0.85)
  assert.ok(max <= CRAFT_DURATION_MAX_S + 1)
})

test('weapons craft faster and cheaper than ships', () => {
  const weapons = allBlueprints().filter((b) => b.kind === 'weapon')
  const ships = allBlueprints().filter((b) => b.kind === 'ship')
  const maxWeaponDur = Math.max(...weapons.map((b) => craftDurationS(b.id)))
  const minShipDur = Math.min(...ships.map((b) => craftDurationS(b.id)))
  assert.ok(maxWeaponDur < minShipDur, 'slowest weapon faster than fastest ship')
  // Ships sit in the upper band of the duration scale.
  assert.ok(minShipDur >= CRAFT_DURATION_MAX_S * 0.55)
  const maxWeaponOre = Math.max(
    ...weapons.map((b) => Object.values(oreCostForBlueprint(b.id)).reduce((a, n) => a + n, 0))
  )
  const minShipOre = Math.min(
    ...ships.map((b) => Object.values(oreCostForBlueprint(b.id)).reduce((a, n) => a + n, 0))
  )
  assert.ok(maxWeaponOre < minShipOre, 'priciest weapon ore less than cheapest ship')
})

test('ore cost is higher for expensive items', () => {
  const cheapWeapon = WEAPONS.find((w) => w.price > 0)
  const cheapId = blueprintIdForWeapon(cheapWeapon.id)
  // Pick a high-price ship
  const ships = allBlueprints().filter((b) => b.kind === 'ship').sort((a, b) => b.listPrice - a.listPrice)
  const expensiveId = ships[0].id
  const cheapTotal = Object.values(oreCostForBlueprint(cheapId)).reduce((a, b) => a + b, 0)
  const expTotal = Object.values(oreCostForBlueprint(expensiveId)).reduce((a, b) => a + b, 0)
  assert.ok(expTotal > cheapTotal * 2)
})

test('only upper-tier ships need exotic/quantum (rim) ore; weapons never do', () => {
  const weapons = allBlueprints().filter((b) => b.kind === 'weapon')
  for (const w of weapons) {
    const c = oreCostForBlueprint(w.id)
    assert.equal(c.exotic_ore, undefined, `${w.itemName} should not need exotic ore`)
    assert.equal(c.quantum_ore, undefined, `${w.itemName} should not need quantum ore`)
    assert.ok((c.raw_ore ?? 0) > 0)
  }

  const ships = allBlueprints().filter((b) => b.kind === 'ship').sort((a, b) => a.listPrice - b.listPrice)
  const prices = ships.map((s) => s.listPrice)
  const logMin = Math.log(prices[0])
  const logMax = Math.log(prices[prices.length - 1])
  const rel = (price) => (Math.log(price) - logMin) / (logMax - logMin)

  let anyExotic = false
  let anyQuantum = false
  for (const s of ships) {
    const c = oreCostForBlueprint(s.id)
    const r = rel(s.listPrice)
    if (r < SHIP_EXOTIC_ORE_FROM_R - 0.02) {
      assert.equal(c.exotic_ore, undefined, `cheap ship ${s.itemName} (r=${r.toFixed(2)}) needs no exotic`)
      assert.equal(c.quantum_ore, undefined, `cheap ship ${s.itemName} needs no quantum`)
    }
    if (r < SHIP_QUANTUM_ORE_FROM_R - 0.02) {
      assert.equal(c.quantum_ore, undefined, `mid ship ${s.itemName} (r=${r.toFixed(2)}) needs no quantum`)
    }
    if ((c.exotic_ore ?? 0) > 0) anyExotic = true
    if ((c.quantum_ore ?? 0) > 0) anyQuantum = true
  }
  assert.ok(anyExotic, 'some high-end ships should need exotic ore')
  assert.ok(anyQuantum, 'top ships should need quantum ore')
  // Top ship must use quantum.
  const top = ships[ships.length - 1]
  assert.ok((oreCostForBlueprint(top.id).quantum_ore ?? 0) > 0)
})

test('credit bay fee is modest and ships cost more than weapons', () => {
  const weapons = allBlueprints().filter((b) => b.kind === 'weapon')
  const ships = allBlueprints().filter((b) => b.kind === 'ship')
  const maxWeaponFee = Math.max(...weapons.map((b) => creditCostForBlueprint(b.id)))
  const minShipFee = Math.min(...ships.map((b) => creditCostForBlueprint(b.id)))
  assert.ok(maxWeaponFee < minShipFee)
  assert.ok(maxWeaponFee <= 600)
  assert.ok(minShipFee >= 500)
  // Always well below shop list price.
  for (const bp of allBlueprints()) {
    assert.ok(creditCostForBlueprint(bp.id) < bp.listPrice * 0.25)
  }
})

test('startCraft consumes station BP+ore+credits and delivers after wall-clock duration', () => {
  const gs = freshState()
  ensureBlueprintMaps(gs)
  const station = gs.galaxy.systems
    .flatMap((s) => s.bodies)
    .find((b) => b.kind === 'station')
  assert.ok(station)
  gs.player.currentSystemId = gs.galaxy.systems.find((s) => s.bodies.some((b) => b.id === station.id)).id

  const bpId = blueprintIdForWeapon('rapid_laser')
  const cost = oreCostForBlueprint(bpId)
  const fee = creditCostForBlueprint(bpId)
  const storage = (gs.stationStorage[station.id] ??= {
    cargo: {},
    miningHold: {},
    shipParts: 0,
    ships: [],
    weapons: {},
    blueprints: {}
  })
  storage.blueprints[bpId] = 1
  for (const [id, qty] of Object.entries(cost)) storage.miningHold[id] = qty
  gs.player.credits = fee + 50
  const creditsBefore = gs.player.credits

  const t0 = 1_700_000_000_000
  const job = startCraft(gs, station.id, bpId, t0)
  assert.equal(storage.blueprints[bpId], undefined)
  assert.equal(Object.keys(storage.miningHold).length, 0)
  assert.equal(gs.player.credits, creditsBefore - fee)
  assert.equal(gs.craftingJobs.length, 1)

  // Mid-way: not done
  const mid = updateCraftingJobs(gs, t0 + (job.durationS * 1000) / 2)
  assert.equal(mid.length, 0)
  assert.equal(gs.craftingJobs.length, 1)

  // Complete
  const done = updateCraftingJobs(gs, job.completesAtWallMs + 1)
  assert.equal(done.length, 1)
  assert.equal(done[0].blueprintId, bpId)
  assert.equal(gs.craftingJobs.length, 0)
  assert.equal(storage.weapons.rapid_laser, 1)
})

test('startCraft rejects insufficient credits', () => {
  const gs = freshState()
  ensureBlueprintMaps(gs)
  const station = gs.galaxy.systems.flatMap((s) => s.bodies).find((b) => b.kind === 'station')
  gs.player.currentSystemId = gs.galaxy.systems.find((s) => s.bodies.some((b) => b.id === station.id)).id
  const bpId = blueprintIdForWeapon('rapid_laser')
  const cost = oreCostForBlueprint(bpId)
  const storage = (gs.stationStorage[station.id] ??= {
    cargo: {}, miningHold: {}, shipParts: 0, ships: [], weapons: {}, blueprints: {}
  })
  storage.blueprints[bpId] = 1
  for (const [id, qty] of Object.entries(cost)) storage.miningHold[id] = qty
  gs.player.credits = 0
  assert.throws(() => startCraft(gs, station.id, bpId), /Need \d+cr/)
  assert.equal(storage.blueprints[bpId], 1)
})

test('store/retrieve blueprints whole-hold transfer', () => {
  const gs = freshState()
  ensureBlueprintMaps(gs)
  const station = gs.galaxy.systems.flatMap((s) => s.bodies).find((b) => b.kind === 'station')
  const bpId = blueprintIdForShip(STARTER_SHIP_CLASS_ID)
  gs.player.ship.blueprints[bpId] = 2
  storeBlueprints(gs, station.id)
  assert.equal(gs.player.ship.blueprints[bpId], undefined)
  assert.equal(gs.stationStorage[station.id].blueprints[bpId], 2)
  retrieveBlueprints(gs, station.id)
  assert.equal(gs.player.ship.blueprints[bpId], 2)
})

test('blueprint drop chances are very rare', () => {
  assert.ok(WRECK_BLUEPRINT_DROP_CHANCE < 0.05)
  assert.ok(PROBE_BLUEPRINT_DROP_CHANCE < 0.03)
  assert.ok(PROBE_BLUEPRINT_DROP_CHANCE < WRECK_BLUEPRINT_DROP_CHANCE)
})

test('getBlueprint names ships and weapons', () => {
  const shipBp = getBlueprint(blueprintIdForShip(STARTER_SHIP_CLASS_ID))
  assert.match(shipBp.name, /Blueprint/)
  const wBp = getBlueprint(blueprintIdForWeapon('torpedo'))
  assert.equal(wBp.kind, 'weapon')
  assert.match(wBp.name, /Torpedo/)
})
