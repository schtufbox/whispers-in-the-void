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
      // Blunt freighter nose, fat cargo mid, truncated drive section.
      stationWidths: [0.9, 2.0, 2.5, 2.5, 2.1, 1.1],
      stationHeights: [0.7, 1.2, 1.5, 1.5, 1.2, 0.7],
      crossSectionSides: 6,
      wings: [{ atStation: 3, span: 4.5, sweep: 0.3, thickness: 0.35, side: 'both' }],
      // Slight cargo-module offset — starter ship still mostly clean.
      stationOffsetsX: [0, 0.05, 0.12, 0.12, 0.06, 0],
      color: '#9aa8b8',
      style: {
        asymmetric: true,
        bridgeSide: 1,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: true,
        hasSensorMast: true,
        hasDockingRing: false
      }
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
      length: 32,
      // Boxy bulk freighter — nearly constant cross-section.
      stationWidths: [1.4, 3.4, 3.8, 3.8, 3.5, 1.8],
      stationHeights: [1.2, 2.6, 2.8, 2.8, 2.5, 1.4],
      crossSectionSides: 4,
      wings: [{ atStation: 2, span: 2.2, sweep: -0.2, thickness: 0.4, side: 'left' }],
      stationOffsetsX: [0, -0.15, -0.25, -0.2, -0.1, 0],
      color: '#a89870',
      style: {
        asymmetric: true,
        bridgeSide: -1,
        engineLayout: 'quad',
        hasRadiator: true,
        hasCargoPods: true,
        hasSensorMast: true,
        hasDockingRing: true
      }
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
      stationWidths: [0.12, 0.55, 1.05, 0.95, 1.15, 0.35],
      stationHeights: [0.1, 0.35, 0.5, 0.48, 0.55, 0.2],
      crossSectionSides: 6,
      wings: [
        { atStation: 3, span: 7.5, sweep: 1.3, thickness: 0.22, side: 'both' },
        { atStation: 1, span: 2.2, sweep: 0.4, thickness: 0.14, side: 'both' }
      ],
      color: '#c8cdd4',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'twin',
        hasRadiator: false,
        hasCargoPods: false,
        hasSensorMast: true,
        hasDockingRing: false
      }
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
      length: 26,
      stationWidths: [0.4, 1.5, 2.1, 2.0, 1.6, 0.7],
      stationHeights: [0.3, 1.0, 1.4, 1.35, 1.0, 0.45],
      crossSectionSides: 4,
      // One heavier weapons wing — classic asymmetric gunship.
      wings: [
        { atStation: 2, span: 9.5, sweep: 0.4, thickness: 0.45, side: 'left' },
        { atStation: 2, span: 6.5, sweep: 0.6, thickness: 0.3, side: 'right', tipOffsetY: 0.3 }
      ],
      stationOffsetsY: [0, 0.05, 0.15, 0.12, 0.05, 0],
      color: '#6a7680',
      style: {
        asymmetric: true,
        bridgeSide: 1,
        engineLayout: 'triple',
        hasRadiator: true,
        hasCargoPods: false,
        hasSensorMast: true,
        hasDockingRing: false
      }
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
      length: 15,
      stationWidths: [0.15, 0.65, 0.95, 0.85, 0.55, 0.2],
      stationHeights: [0.12, 0.5, 0.7, 0.65, 0.4, 0.15],
      crossSectionSides: 8,
      wings: [{ atStation: 3, span: 3.2, sweep: 0.5, thickness: 0.16, side: 'both' }],
      color: '#7a9a88',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'single',
        hasRadiator: false,
        hasCargoPods: false,
        hasSensorMast: true,
        hasDockingRing: false
      }
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
      // Rough scavenged silhouette — deliberately ugly/asymmetric.
      stationWidths: [0.15, 0.85, 1.4, 1.15, 1.55, 0.45],
      stationHeights: [0.1, 0.45, 0.65, 0.6, 0.85, 0.25],
      crossSectionSides: 5,
      wings: [{ atStation: 4, span: 5.5, sweep: -0.5, thickness: 0.28, side: 'right', tipOffsetY: -0.25 }],
      stationOffsetsX: [0, 0.1, 0.25, 0.2, -0.15, 0],
      color: '#8a4540',
      style: {
        asymmetric: true,
        bridgeSide: -1,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: true,
        hasSensorMast: true,
        hasDockingRing: false
      }
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
      stationWidths: [0.2, 1.0, 1.55, 1.45, 0.95, 0.3],
      stationHeights: [0.15, 0.65, 0.95, 0.9, 0.55, 0.2],
      crossSectionSides: 6,
      wings: [{ atStation: 2, span: 9, sweep: 0.9, thickness: 0.22, side: 'both' }],
      color: '#6a8fa0',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: false,
        hasSensorMast: true,
        hasDockingRing: true
      }
    }
  }
]

export const STARTER_SHIP_CLASS_ID = 'bravia_mk2'
// 3× prior (was 15) with the mining-hold triple pass — still below
// computeMiningCapacity's floor so the starter stays the smallest hold.
const STARTER_MINING_CAPACITY = 45

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
