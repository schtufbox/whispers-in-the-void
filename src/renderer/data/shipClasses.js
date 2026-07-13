import { mulberry32 } from '../procgen/prng.js'
import { generateShipClassRoster, computeMiningCapacity } from '../procgen/shipRoster.js'

const HAND_CRAFTED_SHIP_CLASSES = [
  {
    id: 'bravia_mk2',
    name: 'Bravia Mk2',
    role: 'trader',
    price: 12000,
    stats: { hull: 100, shields: 50, armor: 20, cargoCapacity: 40, speed: 120, turnRate: 1.8, accel: 30 },
    hardpoints: [{ id: 'fwd1', position: [0, 0.2, 10], type: 'laser' }],
    hull: {
      length: 22,
      stationWidths: [0.2, 1.4, 2.4, 2.4, 1.6, 0.3],
      stationHeights: [0.2, 0.9, 1.3, 1.3, 0.9, 0.2],
      crossSectionSides: 6,
      wings: [{ atStation: 3, span: 5, sweep: 0.5, thickness: 0.3 }],
      color: '#8fb3ff'
    }
  },
  {
    id: 'hauler',
    name: 'Hauler',
    role: 'trader',
    price: 20000,
    stats: { hull: 150, shields: 30, armor: 40, cargoCapacity: 120, speed: 70, turnRate: 0.9, accel: 15 },
    hardpoints: [{ id: 'fwd1', position: [0, 0.5, 12], type: 'laser' }],
    hull: {
      length: 30,
      stationWidths: [0.6, 3.2, 3.6, 3.6, 3.2, 0.6],
      stationHeights: [0.6, 2.4, 2.6, 2.6, 2.4, 0.6],
      crossSectionSides: 4,
      wings: [],
      color: '#c2a35c'
    }
  },
  {
    id: 'interceptor',
    name: 'Interceptor',
    role: 'fighter',
    price: 35000,
    stats: { hull: 70, shields: 80, armor: 10, cargoCapacity: 10, speed: 220, turnRate: 2.8, accel: 55 },
    hardpoints: [
      { id: 'fwd1', position: [-1.2, 0, 9], type: 'laser' },
      { id: 'fwd2', position: [1.2, 0, 9], type: 'laser' }
    ],
    hull: {
      length: 20,
      stationWidths: [0.05, 0.6, 1.1, 1.0, 0.7, 0.1],
      stationHeights: [0.05, 0.4, 0.6, 0.6, 0.4, 0.1],
      crossSectionSides: 6,
      wings: [{ atStation: 3, span: 8, sweep: 1.2, thickness: 0.2 }],
      color: '#e0e0e0'
    }
  },
  {
    id: 'corvette',
    name: 'Corvette',
    role: 'fighter',
    price: 45000,
    stats: { hull: 130, shields: 100, armor: 50, cargoCapacity: 25, speed: 140, turnRate: 2.0, accel: 35 },
    hardpoints: [
      { id: 'wing1', position: [-3, 0, 6], type: 'laser' },
      { id: 'wing2', position: [3, 0, 6], type: 'missile' }
    ],
    hull: {
      length: 24,
      stationWidths: [0.3, 1.6, 2.0, 2.0, 1.4, 0.3],
      stationHeights: [0.3, 1.2, 1.5, 1.5, 1.0, 0.3],
      crossSectionSides: 4,
      wings: [{ atStation: 2, span: 9, sweep: 0.3, thickness: 0.4 }],
      color: '#7d8f9a'
    }
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'explorer',
    price: 9000,
    stats: { hull: 50, shields: 40, armor: 5, cargoCapacity: 15, speed: 180, turnRate: 2.5, accel: 45 },
    hardpoints: [{ id: 'fwd1', position: [0, 0.1, 7], type: 'laser' }],
    hull: {
      length: 14,
      stationWidths: [0.1, 0.7, 1.0, 0.9, 0.5, 0.1],
      stationHeights: [0.1, 0.6, 0.8, 0.8, 0.5, 0.1],
      crossSectionSides: 8,
      wings: [{ atStation: 3, span: 3, sweep: 0.6, thickness: 0.15 }],
      color: '#7fe0a0'
    }
  },
  {
    id: 'raider_mk1',
    name: 'Raider Mk1',
    role: 'fighter',
    price: 28000,
    npcOnly: true,
    stats: { hull: 90, shields: 60, armor: 25, cargoCapacity: 20, speed: 160, turnRate: 2.2, accel: 40 },
    hardpoints: [
      { id: 'fwd1', position: [-1, 0, 8], type: 'laser' },
      { id: 'fwd2', position: [1, 0, 8], type: 'missile' }
    ],
    hull: {
      length: 19,
      stationWidths: [0.05, 0.9, 1.5, 1.3, 1.6, 0.2],
      stationHeights: [0.05, 0.5, 0.7, 0.7, 0.9, 0.15],
      crossSectionSides: 5,
      wings: [{ atStation: 4, span: 6, sweep: -0.4, thickness: 0.25 }],
      color: '#a13a3a'
    }
  },
  {
    id: 'clipper',
    name: 'Clipper',
    role: 'explorer',
    price: 18000,
    stats: { hull: 80, shields: 50, armor: 15, cargoCapacity: 60, speed: 150, turnRate: 1.6, accel: 28 },
    hardpoints: [{ id: 'fwd1', position: [0, 0.3, 13], type: 'laser' }],
    hull: {
      length: 28,
      stationWidths: [0.1, 1.0, 1.6, 1.5, 0.9, 0.15],
      stationHeights: [0.1, 0.7, 1.0, 1.0, 0.6, 0.1],
      crossSectionSides: 6,
      wings: [{ atStation: 2, span: 10, sweep: 0.8, thickness: 0.2 }],
      color: '#4fc3d9'
    }
  }
]

export const STARTER_SHIP_CLASS_ID = 'bravia_mk2'
// Tripled per user request (was 5) — still deliberately below
// computeMiningCapacity's own floor (see MINING_HOLD_MIN in shipRoster.js,
// scaled up to match) so the starter ship is guaranteed to have the smallest
// mining hold in the game.
const STARTER_MINING_CAPACITY = 15

for (const c of HAND_CRAFTED_SHIP_CLASSES) {
  c.stats.miningCapacity = c.id === STARTER_SHIP_CLASS_ID ? STARTER_MINING_CAPACITY : computeMiningCapacity(c.price, c.role)
}

// The 7 hand-crafted classes above cover the starter ship and a few iconic
// archetypes; the remaining 93 (to reach the full 100-class roster) are
// procedurally generated from a fixed seed so the shipyard catalog is varied
// but stable across runs, matching the rest of the game's procgen approach.
const SHIP_ROSTER_SEED = 918273645
const GENERATED_SHIP_CLASSES = generateShipClassRoster(mulberry32(SHIP_ROSTER_SEED), 93)

export const SHIP_CLASSES = [...HAND_CRAFTED_SHIP_CLASSES, ...GENERATED_SHIP_CLASSES]

export function getShipClass(id) {
  const cls = SHIP_CLASSES.find((c) => c.id === id)
  if (!cls) throw new Error(`Unknown ship class: ${id}`)
  return cls
}

export function purchasableShipClasses() {
  return SHIP_CLASSES.filter((c) => !c.npcOnly)
}
