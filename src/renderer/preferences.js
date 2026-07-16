/**
 * User preferences that outlive a session.
 * SFX + music are applied in the renderer and mirrored in localStorage for a
 * fast cold-start; Electron settings.json is the long-term source of truth.
 */
import * as audio from './audio.js'

const SFX_LS_KEY = 'witv.sfxEnabled'
const MUSIC_LS_KEY = 'witv.musicEnabled'
/** Legacy master key — migrated once into sfx + music. */
const LEGACY_SOUND_LS_KEY = 'witv.soundEnabled'

function readLocalBool(key) {
  try {
    const v = localStorage.getItem(key)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* private mode */
  }
  return null
}

function writeLocalBool(key, enabled) {
  try {
    localStorage.setItem(key, enabled ? '1' : '0')
  } catch {
    /* */
  }
}

function readLocalChannels() {
  let sfx = readLocalBool(SFX_LS_KEY)
  let music = readLocalBool(MUSIC_LS_KEY)
  if (sfx == null || music == null) {
    const legacy = readLocalBool(LEGACY_SOUND_LS_KEY)
    if (legacy != null) {
      if (sfx == null) sfx = legacy
      if (music == null) music = legacy
    }
  }
  return { sfx, music }
}

/** Apply cached channels immediately (sync) so title music respects last choice. */
export function applyLocalSoundCache() {
  const { sfx, music } = readLocalChannels()
  if (sfx != null) audio.setSfxEnabled(sfx)
  if (music != null) audio.setMusicEnabled(music)
}

/**
 * Load SFX + music from Electron settings.json (authoritative),
 * fall back to localStorage, and keep both in sync.
 */
export async function loadSoundPreference() {
  applyLocalSoundCache()
  try {
    const api = window.electronAPI
    if (typeof api?.getSfxEnabled === 'function') {
      const sfx = await api.getSfxEnabled()
      const music = await api.getMusicEnabled()
      if (typeof sfx === 'boolean') {
        audio.setSfxEnabled(sfx)
        writeLocalBool(SFX_LS_KEY, sfx)
      }
      if (typeof music === 'boolean') {
        audio.setMusicEnabled(music)
        writeLocalBool(MUSIC_LS_KEY, music)
      }
      return { sfx: audio.isSfxEnabled(), music: audio.isMusicEnabled() }
    }
    // Older main process: single master flag.
    const enabled = await api?.getSoundEnabled?.()
    if (typeof enabled === 'boolean') {
      audio.setSoundEnabled(enabled)
      writeLocalBool(SFX_LS_KEY, enabled)
      writeLocalBool(MUSIC_LS_KEY, enabled)
      return { sfx: enabled, music: enabled }
    }
  } catch (err) {
    console.warn('loadSoundPreference failed', err)
  }
  return { sfx: audio.isSfxEnabled(), music: audio.isMusicEnabled() }
}

export async function persistSfxEnabled(enabled) {
  const on = enabled !== false
  audio.setSfxEnabled(on)
  writeLocalBool(SFX_LS_KEY, on)
  try {
    const saved = await window.electronAPI?.setSfxEnabled?.(on)
    if (typeof saved === 'boolean') {
      audio.setSfxEnabled(saved)
      writeLocalBool(SFX_LS_KEY, saved)
      return saved
    }
  } catch (err) {
    console.error('persistSfxEnabled failed', err)
  }
  return on
}

export async function persistMusicEnabled(enabled) {
  const on = enabled !== false
  audio.setMusicEnabled(on)
  writeLocalBool(MUSIC_LS_KEY, on)
  try {
    const saved = await window.electronAPI?.setMusicEnabled?.(on)
    if (typeof saved === 'boolean') {
      audio.setMusicEnabled(saved)
      writeLocalBool(MUSIC_LS_KEY, saved)
      return saved
    }
  } catch (err) {
    console.error('persistMusicEnabled failed', err)
  }
  return on
}

/** @deprecated use persistSfxEnabled / persistMusicEnabled */
export async function persistSoundEnabled(enabled) {
  const on = enabled !== false
  await persistSfxEnabled(on)
  await persistMusicEnabled(on)
  return on
}
