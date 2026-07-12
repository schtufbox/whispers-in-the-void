import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from './prng.js'
import { generateShipClassRoster } from './shipRoster.js'

test('generates the requested count of ship classes with unique ids and names', () => {
  const classes = generateShipClassRoster(mulberry32(1), 43)
  assert.equal(classes.length, 43)
  assert.equal(new Set(classes.map((c) => c.id)).size, 43)
  assert.equal(new Set(classes.map((c) => c.name)).size, 43)
})

test('every generated class has valid hull, stats, hardpoints, and price', () => {
  const classes = generateShipClassRoster(mulberry32(2), 43)
  for (const c of classes) {
    assert.ok(['trader', 'fighter', 'explorer'].includes(c.role))
    assert.ok(c.price > 0)
    assert.equal(c.hull.stationWidths.length, c.hull.stationHeights.length)
    assert.ok(c.hull.stationWidths.every((w) => w > 0))
    assert.ok(c.hardpoints.length >= 1)
    for (const hp of c.hardpoints) assert.ok(['laser', 'missile'].includes(hp.type))
    for (const stat of Object.values(c.stats)) assert.ok(stat > 0)
  }
})

test('all three roles appear across a large sample', () => {
  const classes = generateShipClassRoster(mulberry32(3), 43)
  const roles = new Set(classes.map((c) => c.role))
  assert.ok(roles.has('trader') && roles.has('fighter') && roles.has('explorer'))
})
