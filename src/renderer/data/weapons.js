// Buyable hardpoint weapons — a laser and missile tier list, priced roughly
// by power (higher damage-per-second costs more). pulse_laser/rocket_pod are
// the free defaults every laser/missile hardpoint starts equipped with
// (their stats match the original fixed presets combat.js used before
// weapons became swappable, so an untouched loadout plays identically to
// before).
export const WEAPONS = [
  { id: 'pulse_laser', name: 'Pulse Laser', category: 'laser', damage: 6, speed: 600, cooldownS: 0.25, ttl: 1.2, price: 0, color: '#5ee6ff' },
  { id: 'rapid_laser', name: 'Rapid Laser', category: 'laser', damage: 5, speed: 650, cooldownS: 0.15, ttl: 1.1, price: 4200, color: '#7fe6ff' },
  { id: 'burst_laser', name: 'Burst Laser', category: 'laser', damage: 10, speed: 620, cooldownS: 0.28, ttl: 1.3, price: 7800, color: '#ffe066' },
  { id: 'beam_laser', name: 'Beam Laser', category: 'laser', damage: 14, speed: 700, cooldownS: 0.35, ttl: 1.4, price: 13500, color: '#ff6ad1' },
  { id: 'plasma_cannon', name: 'Plasma Cannon', category: 'laser', damage: 22, speed: 480, cooldownS: 0.5, ttl: 1.6, price: 24000, color: '#7cff6a' },

  // Missile cooldowns /1.5 → +50% rate of fire.
  { id: 'rocket_pod', name: 'Rocket Pod', category: 'missile', damage: 30, speed: 220, cooldownS: 0.933, ttl: 4, price: 0, color: '#ff8a3d' },
  { id: 'seeker_missile', name: 'Seeker Missile', category: 'missile', damage: 42, speed: 250, cooldownS: 1.067, ttl: 4.5, price: 9500, color: '#ff5a5a' },
  { id: 'torpedo', name: 'Torpedo', category: 'missile', damage: 65, speed: 170, cooldownS: 1.6, ttl: 6, price: 19500, color: '#b35aff' }
]

export const BASE_WEAPON_ID = { laser: 'pulse_laser', missile: 'rocket_pod' }

export function getWeapon(id) {
  const weapon = WEAPONS.find((w) => w.id === id)
  if (!weapon) throw new Error(`Unknown weapon: ${id}`)
  return weapon
}

export function weaponsForCategory(category) {
  return WEAPONS.filter((w) => w.category === category)
}

// Every hardpoint starts mounted with its category's free base weapon —
// used for a brand-new/purchased ship's initial ship.equippedWeapons map.
export function defaultLoadoutFor(shipClass) {
  const loadout = {}
  for (const hp of shipClass.hardpoints) {
    loadout[hp.id] = BASE_WEAPON_ID[hp.type] ?? BASE_WEAPON_ID.laser
  }
  return loadout
}
