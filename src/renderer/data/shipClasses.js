import { mulberry32 } from '../procgen/prng.js'
import { generateShipClassRoster, computeMiningCapacity } from '../procgen/shipRoster.js'

const HAND_CRAFTED_SHIP_CLASSES = [
  {
    id: 'bravia_mk2',
    name: 'Bravia Mk2',
    role: 'trader',
    price: 12000,
    stats: { hull: 100, shields: 50, armor: 20, cargoCapacity: 40, speed: 120, turnRate: 1.8, accel: 30 },
    // Forward hardpoint on the industrial prow.
    hardpoints: [{ id: 'fwd1', position: [0, 0.25, 8.2], type: 'laser' }],
    // Starter has no accessory bay — upgrade hull for Autopilot etc.
    accessorySlots: 0,
    hull: {
      // Compact industrial starter frigate: angular prow, rugged plating,
      // twin aft drives — utilitarian rather than sleek.
      length: 18,
      // 12 stations aft→nose: broad engine bus → tall mid → sharp wedge prow.
      stationWidths: [0.7, 0.9, 1.1, 1.3, 1.5, 1.55, 1.5, 1.35, 1.1, 0.8, 0.5, 0.28],
      stationHeights: [0.82, 1.0, 1.2, 1.4, 1.52, 1.55, 1.4, 1.2, 0.9, 0.6, 0.4, 0.24],
      crossSectionSides: 14,
      superellipseExponent: 3.1,
      // Angular plate fins + ventral keel wing (industrial slabs).
      wings: [
        {
          atStation: 4,
          span: 3.2,
          sweep: 0.55,
          thickness: 0.34,
          side: 'both',
          tipOffsetY: -0.35,
          chordScale: 1.05
        },
        {
          atStation: 7,
          span: 1.6,
          sweep: -0.2,
          thickness: 0.2,
          side: 'both',
          tipOffsetY: 0.08,
          chordScale: 0.9
        },
        // Underside keel wing — tip carries a forward aerial (see shipMesh).
        {
          atStation: 5,
          span: 2.4,
          sweep: 0.35,
          thickness: 0.28,
          side: 'bottom',
          tipOffsetX: 0,
          chordScale: 1.0,
          tipAerial: true
        }
      ],
      stationOffsetsX: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      stationOffsetsY: [0.04, 0.06, 0.09, 0.12, 0.1, 0.08, 0.05, 0.02, 0, -0.02, -0.02, 0],
      // Matte bronze-steel hull.
      color: '#8a7a68',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: false,
        hasSensorMast: true,
        hasDockingRing: false,
        detailDensity: 2.2
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
    accessorySlots: 2,
    hull: {
      length: 32,
      // Boxy bulk freighter — fat cargo block, blunt nose, truncated tail.
      stationWidths: [1.2, 2.2, 3.2, 3.7, 3.85, 3.85, 3.8, 3.6, 3.2, 2.4, 1.6, 1.1],
      stationHeights: [1.0, 1.8, 2.5, 2.75, 2.85, 2.85, 2.8, 2.6, 2.3, 1.7, 1.15, 0.85],
      crossSectionSides: 12,
      superellipseExponent: 3.2,
      wings: [
        // Port cargo fin.
        { atStation: 5, span: 2.4, sweep: -0.25, thickness: 0.42, side: 'left', chordScale: 1.05 },
        // Aft dorsal stabilizer over the drive bus.
        { atStation: 2, span: 1.8, sweep: -0.35, thickness: 0.32, side: 'top', chordScale: 0.95 },
        // Ventral cargo keel.
        { atStation: 6, span: 1.6, sweep: 0.15, thickness: 0.3, side: 'bottom', chordScale: 0.9 }
      ],
      stationOffsetsX: [0, -0.08, -0.16, -0.22, -0.25, -0.22, -0.18, -0.12, -0.06, 0, 0, 0],
      stationOffsetsY: [0, 0.02, 0.05, 0.08, 0.1, 0.1, 0.08, 0.05, 0.02, 0, 0, 0],
      color: '#a89870',
      style: {
        asymmetric: true,
        bridgeSide: -1,
        engineLayout: 'quad',
        hasRadiator: true,
        hasCargoPods: true,
        hasSensorMast: true,
        // Underside freighter bridge + side cargo radars.
        cockpitMount: 'bottom',
        radarDishes: ['top', 'side', 'bottom'],
        hasDockingRing: true,
        detailDensity: 2.1
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
    accessorySlots: 1,
    hull: {
      length: 20,
      // Needle fighter — pinched mid, broad rear engines, sharp prow.
      stationWidths: [0.1, 0.28, 0.55, 0.85, 1.05, 0.95, 0.9, 1.1, 1.15, 0.7, 0.35, 0.14],
      stationHeights: [0.08, 0.2, 0.35, 0.48, 0.52, 0.48, 0.45, 0.52, 0.55, 0.35, 0.18, 0.1],
      crossSectionSides: 14,
      superellipseExponent: 2.1,
      wings: [
        // Main swept combat wings mid-body.
        { atStation: 6, span: 6.8, sweep: 1.25, thickness: 0.2, side: 'both', tipOffsetY: -0.15, chordScale: 1.05 },
        // Canard-ish forward stubs.
        { atStation: 9, span: 1.6, sweep: 0.35, thickness: 0.12, side: 'both', chordScale: 0.75 },
        // Tall rear tail fin.
        { atStation: 2, span: 2.1, sweep: -0.4, thickness: 0.16, side: 'top', chordScale: 0.85 }
      ],
      color: '#c8cdd4',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'twin',
        hasRadiator: false,
        hasCargoPods: false,
        hasSensorMast: true,
        cockpitMount: 'top',
        radarDishes: ['top', 'side'],
        hasDockingRing: false,
        detailDensity: 2.0
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
    accessorySlots: 2,
    hull: {
      length: 26,
      // Heavy gunship — broad mid, armored prow, asymmetric weapon plane.
      stationWidths: [0.35, 0.75, 1.3, 1.75, 2.05, 2.1, 2.0, 1.85, 1.55, 1.1, 0.65, 0.35],
      stationHeights: [0.25, 0.55, 0.95, 1.25, 1.4, 1.42, 1.35, 1.2, 1.0, 0.7, 0.4, 0.22],
      crossSectionSides: 12,
      superellipseExponent: 2.8,
      wings: [
        // Heavier port weapons wing.
        { atStation: 5, span: 8.8, sweep: 0.45, thickness: 0.42, side: 'left', chordScale: 1.1 },
        // Shorter starboard plane with anhedral.
        { atStation: 5, span: 6.0, sweep: 0.55, thickness: 0.28, side: 'right', tipOffsetY: 0.35, chordScale: 0.95 },
        // Rear dorsal stabilizer.
        { atStation: 2, span: 2.4, sweep: -0.3, thickness: 0.28, side: 'top', chordScale: 0.9 },
        // Ventral keel for belly mass.
        { atStation: 6, span: 1.9, sweep: 0.25, thickness: 0.26, side: 'bottom', chordScale: 0.85 }
      ],
      stationOffsetsY: [0, 0.02, 0.05, 0.1, 0.14, 0.15, 0.12, 0.08, 0.04, 0.02, 0, 0],
      color: '#6a7680',
      style: {
        asymmetric: true,
        bridgeSide: 1,
        engineLayout: 'triple',
        hasRadiator: true,
        hasCargoPods: false,
        hasSensorMast: true,
        // Gunship belly cockpit.
        cockpitMount: 'bottom',
        radarDishes: ['top', 'right', 'bottom'],
        hasDockingRing: false,
        detailDensity: 2.3
      }
    }
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'explorer',
    price: 8500,
    stats: { hull: 50, shields: 40, armor: 5, cargoCapacity: 15, speed: 180, turnRate: 2.5, accel: 45 },
    hardpoints: [{ id: 'fwd1', position: [0, 0.1, 7], type: 'laser' }],
    accessorySlots: 1,
    hull: {
      length: 15,
      // Compact survey boat — slender spine, modest mid flare.
      stationWidths: [0.12, 0.28, 0.5, 0.72, 0.9, 0.95, 0.88, 0.75, 0.55, 0.38, 0.22, 0.12],
      stationHeights: [0.1, 0.22, 0.4, 0.55, 0.68, 0.72, 0.66, 0.55, 0.4, 0.28, 0.16, 0.1],
      crossSectionSides: 14,
      superellipseExponent: 2.2,
      wings: [
        { atStation: 6, span: 2.8, sweep: 0.45, thickness: 0.14, side: 'both', chordScale: 0.95 },
        // Small survey tail fin.
        { atStation: 2, span: 1.3, sweep: -0.25, thickness: 0.12, side: 'top', chordScale: 0.8 }
      ],
      color: '#7a9a88',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'single',
        hasRadiator: false,
        hasCargoPods: false,
        hasSensorMast: true,
        cockpitMount: 'top',
        // Sensor suite: top + bottom dishes.
        radarDishes: ['top', 'bottom', 'side'],
        hasDockingRing: false,
        detailDensity: 1.9
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
    accessorySlots: 1,
    hull: {
      length: 19,
      // Rough scavenged silhouette — deliberately ugly / asymmetric.
      stationWidths: [0.12, 0.4, 0.75, 1.15, 1.35, 1.2, 1.05, 1.45, 1.5, 0.95, 0.45, 0.18],
      stationHeights: [0.08, 0.28, 0.45, 0.6, 0.68, 0.62, 0.55, 0.78, 0.82, 0.5, 0.25, 0.12],
      crossSectionSides: 10,
      superellipseExponent: 2.4,
      wings: [
        { atStation: 7, span: 5.2, sweep: -0.45, thickness: 0.26, side: 'right', tipOffsetY: -0.28, chordScale: 1.0 },
        // Crooked tail stub.
        { atStation: 1, span: 1.5, sweep: 0.2, thickness: 0.18, side: 'top', tipOffsetX: 0.2, chordScale: 0.75 },
        // Scrap ventral plate.
        { atStation: 5, span: 1.2, sweep: 0.1, thickness: 0.2, side: 'bottom', tipOffsetX: -0.15 }
      ],
      stationOffsetsX: [0, 0.05, 0.12, 0.2, 0.22, 0.18, 0.1, -0.08, -0.15, -0.08, 0, 0],
      stationOffsetsY: [0, 0, 0.02, 0.05, 0.08, 0.06, 0.03, 0.1, 0.12, 0.05, 0, 0],
      color: '#8a4540',
      style: {
        asymmetric: true,
        bridgeSide: -1,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: true,
        hasSensorMast: true,
        cockpitMount: 'bottom',
        radarDishes: ['top', 'left', 'bottom'],
        hasDockingRing: false,
        detailDensity: 2.2
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
    accessorySlots: 2,
    hull: {
      length: 28,
      // Long-range explorer — elegant spine, broad mid wings, proud tail.
      stationWidths: [0.18, 0.45, 0.85, 1.2, 1.5, 1.55, 1.48, 1.3, 1.0, 0.65, 0.35, 0.16],
      stationHeights: [0.12, 0.32, 0.58, 0.82, 0.95, 0.98, 0.92, 0.8, 0.58, 0.38, 0.2, 0.1],
      crossSectionSides: 14,
      superellipseExponent: 2.3,
      wings: [
        // Primary mid-body sails.
        { atStation: 5, span: 8.2, sweep: 0.85, thickness: 0.2, side: 'both', tipOffsetY: 0.12, chordScale: 1.05 },
        // Rear dorsal tail wing.
        { atStation: 2, span: 2.6, sweep: -0.45, thickness: 0.18, side: 'top', chordScale: 0.9 },
        // Slim forward canards.
        { atStation: 9, span: 1.8, sweep: 0.3, thickness: 0.12, side: 'both', chordScale: 0.7 }
      ],
      color: '#6a8fa0',
      style: {
        asymmetric: false,
        bridgeSide: 0,
        engineLayout: 'twin',
        hasRadiator: true,
        hasCargoPods: false,
        hasSensorMast: true,
        cockpitMount: 'top',
        radarDishes: ['top', 'bottom', 'side'],
        hasDockingRing: true,
        detailDensity: 2.0
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
