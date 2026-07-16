// Player combat drones only — launched from player ship drone bays (max 2).
// NPCs never receive, summon, or operate drones (even on hulls that list droneBays).

export const DEFAULT_DRONE_ID = 'asp_light'

export const DRONES = [
  {
    id: 'asp_light',
    name: 'Asp Light Combat',
    // Compact escort fighter stats (pulse laser only).
    shields: 50,
    armor: 50,
    hull: 40,
    weaponId: 'pulse_laser',
    speed: 145,
    turnRate: 2.9,
    accel: 55,
    // Visual scale relative to a full ship hull mesh.
    meshScale: 0.22,
    color: '#8ab4c8'
  }
]

export function getDrone(id = DEFAULT_DRONE_ID) {
  const d = DRONES.find((x) => x.id === id)
  if (!d) throw new Error(`Unknown drone: ${id}`)
  return d
}

/** How many drone bays this hull has (0–2). */
export function droneBayCount(shipClass) {
  const n = Math.floor(Number(shipClass?.droneBays) || 0)
  return Math.max(0, Math.min(2, n))
}
