import { pick, intRange } from './prng.js'

const FIRST_NAME_PARTS = [
  'Ja', 'Mor', 'Ka', 'El', 'Ro', 'Sa', 'Ti', 'Mi', 'Lu', 'De',
  'An', 'Vi', 'Bri', 'Cor', 'Nad', 'Ori', 'Fen', 'Zeph', 'Yol', 'Quin',
  'Rem', 'Wes', 'Iva', 'Pet'
]
const LAST_NAME_PARTS = [
  'son', 'ley', 'ford', 'stone', 'wick', 'ton', 'vale', 'moor', 'ridge', 'field',
  'burn', 'well', 'shaw', 'kirk', 'holt', 'dale', 'gate', 'reed', 'cross', 'thorn',
  'brook', 'wood', 'lund', 'hart'
]

export function generateHumanName(rng) {
  const first = pick(rng, FIRST_NAME_PARTS) + pick(rng, FIRST_NAME_PARTS)
  const last = pick(rng, LAST_NAME_PARTS).replace(/^./, (c) => c.toUpperCase())
  return `${first} ${last.charAt(0).toUpperCase() + last.slice(1)}`
}

const ALIEN_CONSONANTS = ['kr', 'th', 'vor', 'x', 'q', 'zh', 'gr', 'nn', 'ss', 'tk', 'dr', 'vex', 'kh', 'zr']
const ALIEN_VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'oo', 'ai']

export function generateSpeciesName(rng) {
  const syllables = intRange(rng, 2, 3)
  let name = ''
  for (let i = 0; i < syllables; i++) {
    name += pick(rng, ALIEN_CONSONANTS) + pick(rng, ALIEN_VOWELS)
  }
  if (rng() < 0.2) name += `'${pick(rng, ALIEN_CONSONANTS)}`
  return name.charAt(0).toUpperCase() + name.slice(1)
}

const BODY_PREFIX = [
  'Kor', 'Val', 'Ther', 'Ash', 'Bel', 'Dun', 'Eri', 'Fal', 'Gal', 'Hes',
  'Ios', 'Jun', 'Lyr', 'Mira', 'Nyx', 'Oster', 'Pryn', 'Quel', 'Ravn', 'Sol',
  'Tarn', 'Ul', 'Vesh', 'Wren'
]
const BODY_SUFFIX = ['ain', 'os', 'ara', 'ell', 'ion', 'oth', 'yn', 'ade', 'ora', 'ex']
const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

export function generateBodyName(rng, kind) {
  const root = pick(rng, BODY_PREFIX) + pick(rng, BODY_SUFFIX)
  if (kind === 'planet' && rng() < 0.6) return `${root} ${pick(rng, ROMAN_NUMERALS)}`
  if (kind === 'station') return `${root} Station`
  if (kind === 'settlement') return `${root} Settlement`
  if (kind === 'asteroidField') return `${root} Belt`
  return root
}
