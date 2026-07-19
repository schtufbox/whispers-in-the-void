import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESSORIES,
  getAccessory,
  accessorySlotCount,
  defaultAccessoriesFor,
  normalizeAccessories,
  shipHasAccessory,
  shipHasAutopilot,
  effectiveMiningCapacity,
  EXTRA_ORE_STORAGE_ID,
  MAX_ACCESSORY_SLOTS
} from './accessories.js'
import { getShipClass, STARTER_SHIP_CLASS_ID } from './shipClasses.js'

test('autopilot costs 10000; extra ore storage costs 12000', () => {
  assert.equal(getAccessory('autopilot').price, 10000)
  assert.equal(getAccessory(EXTRA_ORE_STORAGE_ID).price, 12000)
  assert.ok(ACCESSORIES.some((a) => a.id === 'autopilot'))
  assert.ok(ACCESSORIES.some((a) => a.id === EXTRA_ORE_STORAGE_ID))
})

test('starter Light Runner has one accessory slot; other hand-crafted ships have 1–4', () => {
  assert.equal(accessorySlotCount(getShipClass(STARTER_SHIP_CLASS_ID)), 1)
  assert.equal(defaultAccessoriesFor(getShipClass(STARTER_SHIP_CLASS_ID)).length, 1)
  for (const id of ['hold_runner', 'needle_dart', 'gun_barge', 'bravia_mk2', 'raider_mk1', 'swift_keel']) {
    const n = accessorySlotCount(getShipClass(id))
    assert.ok(n >= 1 && n <= MAX_ACCESSORY_SLOTS, `${id} slots ${n}`)
  }
})

test('normalizeAccessories pads and reports excess', () => {
  const { equipped, excess } = normalizeAccessories(['autopilot', 'autopilot', 'x'], {
    accessorySlots: 1
  })
  assert.deepEqual(equipped, ['autopilot'])
  assert.deepEqual(excess, ['autopilot', 'x'])
})

test('shipHasAutopilot reads equippedAccessories', () => {
  assert.equal(shipHasAutopilot({ equippedAccessories: [] }), false)
  assert.equal(shipHasAutopilot({ equippedAccessories: [null, 'autopilot'] }), true)
  assert.equal(shipHasAccessory({ equippedAccessories: ['autopilot'] }, 'autopilot'), true)
})

test('Extra Ore Storage multiplies mining capacity by 5 while equipped', () => {
  const shipClass = getShipClass(STARTER_SHIP_CLASS_ID)
  const base = shipClass.stats.miningCapacity
  assert.equal(effectiveMiningCapacity({ equippedAccessories: [] }, shipClass), base)
  assert.equal(
    effectiveMiningCapacity({ equippedAccessories: [EXTRA_ORE_STORAGE_ID] }, shipClass),
    base * 5
  )
  // Unequipped (empty slot) returns base.
  assert.equal(effectiveMiningCapacity({ equippedAccessories: [null] }, shipClass), base)
})
