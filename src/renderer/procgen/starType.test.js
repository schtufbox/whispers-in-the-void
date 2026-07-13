import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../game/state.js'
import { STARTER_SHIP_CLASS_ID } from '../data/shipClasses.js'
import { starTypeForSystem } from './starType.js'

test('new games never start in a binary star system', () => {
  for (let seed = 0; seed < 25; seed++) {
    const gs = createGameState({
      characterName: 'Pilot',
      shipInstanceName: 'Ship',
      shipClassId: STARTER_SHIP_CLASS_ID,
      seed
    })
    const system = gs.galaxy.systems.find((s) => s.id === gs.player.startingSystemId)
    assert.ok(system, `missing starting system for seed ${seed}`)
    assert.notEqual(
      starTypeForSystem(system),
      'binary',
      `seed ${seed} started in binary system ${system.id}`
    )
  }
})
