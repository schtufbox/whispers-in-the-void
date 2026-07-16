import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** @typedef {'borderless' | 'windowed'} DisplayMode */

/** Classic windowed default (original game size). */
export const DEFAULT_WINDOWED_WIDTH = 1280
export const DEFAULT_WINDOWED_HEIGHT = 800

const DEFAULTS = {
  /** Fullscreen borderless windowed by default. */
  displayMode: /** @type {DisplayMode} */ ('borderless'),
  windowedWidth: DEFAULT_WINDOWED_WIDTH,
  windowedHeight: DEFAULT_WINDOWED_HEIGHT,
  /** Optional saved position; null = center on next windowed apply. */
  windowedX: null,
  windowedY: null,
  /** Master sound on/off (SFX + music + VO). */
  soundEnabled: true
}

function settingsPath() {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

function clampInt(n, min, max, fallback) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, v))
}

export function loadSettings() {
  const path = settingsPath()
  if (!existsSync(path)) return { ...DEFAULTS }
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    const displayMode =
      data.displayMode === 'windowed' || data.displayMode === 'borderless'
        ? data.displayMode
        : DEFAULTS.displayMode
    const windowedWidth = clampInt(data.windowedWidth, 640, 7680, DEFAULTS.windowedWidth)
    const windowedHeight = clampInt(data.windowedHeight, 480, 4320, DEFAULTS.windowedHeight)
    const windowedX =
      data.windowedX == null || data.windowedX === ''
        ? null
        : clampInt(data.windowedX, -10000, 10000, null)
    const windowedY =
      data.windowedY == null || data.windowedY === ''
        ? null
        : clampInt(data.windowedY, -10000, 10000, null)
    const soundEnabled = data.soundEnabled === false ? false : true
    return {
      ...DEFAULTS,
      ...data,
      displayMode,
      windowedWidth,
      windowedHeight,
      windowedX,
      windowedY,
      soundEnabled
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial }
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function getDisplayMode() {
  return loadSettings().displayMode
}

export function setDisplayMode(mode) {
  const displayMode = mode === 'windowed' ? 'windowed' : 'borderless'
  return saveSettings({ displayMode })
}

export function getSoundEnabled() {
  return loadSettings().soundEnabled !== false
}

export function setSoundEnabled(enabled) {
  const soundEnabled = enabled !== false
  const next = saveSettings({ soundEnabled })
  // Return the persisted boolean so the renderer can trust the write.
  return next.soundEnabled !== false
}

export function getWindowedBounds() {
  const s = loadSettings()
  return {
    width: s.windowedWidth,
    height: s.windowedHeight,
    x: s.windowedX,
    y: s.windowedY
  }
}

/** Persist manually resized / moved windowed geometry. */
export function saveWindowedBounds({ width, height, x, y }) {
  return saveSettings({
    windowedWidth: clampInt(width, 640, 7680, DEFAULT_WINDOWED_WIDTH),
    windowedHeight: clampInt(height, 480, 4320, DEFAULT_WINDOWED_HEIGHT),
    windowedX: x == null ? null : clampInt(x, -10000, 10000, null),
    windowedY: y == null ? null : clampInt(y, -10000, 10000, null)
  })
}
