/**
 * User preferences that outlive a session (display lives in main settings.json;
 * sound is applied in the renderer and mirrored here for a fast cold-start).
 */
import * as audio from './audio.js'

const SOUND_LS_KEY = 'witv.soundEnabled'

function readLocalSound() {
  try {
    const v = localStorage.getItem(SOUND_LS_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    /* private mode */
  }
  return null
}

function writeLocalSound(enabled) {
  try {
    localStorage.setItem(SOUND_LS_KEY, enabled ? '1' : '0')
  } catch {
    /* */
  }
}

/** Apply cached sound immediately (sync) so title music respects last choice. */
export function applyLocalSoundCache() {
  const cached = readLocalSound()
  if (cached != null) audio.setSoundEnabled(cached)
}

/**
 * Load sound preference from Electron settings.json (authoritative),
 * fall back to localStorage, and keep both in sync.
 */
export async function loadSoundPreference() {
  applyLocalSoundCache()
  try {
    const enabled = await window.electronAPI?.getSoundEnabled?.()
    if (typeof enabled === 'boolean') {
      audio.setSoundEnabled(enabled)
      writeLocalSound(enabled)
      return enabled
    }
  } catch (err) {
    console.warn('loadSoundPreference failed', err)
  }
  return audio.isSoundEnabled()
}

/**
 * Set master sound and persist as the default for future launches.
 * Writes Electron userData/settings.json and localStorage.
 */
export async function persistSoundEnabled(enabled) {
  const on = enabled !== false
  audio.setSoundEnabled(on)
  writeLocalSound(on)
  try {
    const saved = await window.electronAPI?.setSoundEnabled?.(on)
    if (typeof saved === 'boolean') {
      audio.setSoundEnabled(saved)
      writeLocalSound(saved)
      return saved
    }
  } catch (err) {
    console.error('persistSoundEnabled failed', err)
  }
  return on
}
