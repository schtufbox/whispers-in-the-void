import { mulberry32 } from './prng.js'

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Weighted so a normal yellow/white star is the common case; the rest give
// systems visual variety without every system looking exotic. Shared by
// render/starMesh.js (visuals) and game/state.js (starting-system pick) so
// both agree on which systems are binaries.
export const STAR_TYPES = [
  'mainSequence', 'mainSequence', 'mainSequence',
  'redDwarf', 'redDwarf',
  'whiteDwarf', 'giant', 'binary'
]

export function starTypeForSystem(system) {
  const id = typeof system === 'string' ? system : system.id
  const rng = mulberry32(hashString(id))
  return STAR_TYPES[Math.floor(rng() * STAR_TYPES.length)]
}
