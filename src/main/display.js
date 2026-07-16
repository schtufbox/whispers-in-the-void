import { screen } from 'electron'
import {
  getDisplayMode,
  setDisplayMode,
  getWindowedBounds,
  saveWindowedBounds,
  DEFAULT_WINDOWED_WIDTH,
  DEFAULT_WINDOWED_HEIGHT
} from './settings.js'

export const WINDOWED_WIDTH = DEFAULT_WINDOWED_WIDTH
export const WINDOWED_HEIGHT = DEFAULT_WINDOWED_HEIGHT

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

/** Skip persisting size while we apply mode programmatically. */
let suppressBoundsSave = false
let saveBoundsTimer = null

export function setMainWindow(win) {
  mainWindow = win
}

export function getMainWindow() {
  return mainWindow
}

function notifyDisplayMode(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  const mode = getDisplayMode()
  const isBorderless = mode === 'borderless'
  win.webContents.send('fullscreen-changed', isBorderless)
  win.webContents.send('display-mode-changed', mode)
}

/**
 * Display the window is currently on (or the one matching its bounds / saved pos).
 * Uses native pixel bounds so borderless fills that monitor's real resolution.
 */
function displayForWindow(win) {
  try {
    if (win && !win.isDestroyed()) {
      return screen.getDisplayMatching(win.getBounds())
    }
  } catch {
    /* fall through */
  }
  const saved = getWindowedBounds()
  if (saved.x != null && saved.y != null) {
    return screen.getDisplayMatching({
      x: saved.x,
      y: saved.y,
      width: saved.width || WINDOWED_WIDTH,
      height: saved.height || WINDOWED_HEIGHT
    })
  }
  return screen.getPrimaryDisplay()
}

/**
 * Apply display mode without recreating the window.
 * - borderless: fill the monitor the app is on (that display's current resolution)
 * - windowed: last saved size (default 1280×800) + position if known
 */
export function applyDisplayMode(win, mode) {
  if (!win || win.isDestroyed()) return
  const borderless = mode !== 'windowed'

  suppressBoundsSave = true
  try {
    win.setFullScreen(false)

    if (borderless) {
      // Resolve display *before* expanding so we stay on the same monitor.
      const display = displayForWindow(win)
      // Full pixel bounds of that display (native resolution / current mode).
      const bounds = display.bounds

      if (typeof win.setSimpleFullScreen === 'function' && win.isSimpleFullScreen()) {
        win.setSimpleFullScreen(false)
      }
      win.setResizable(true)
      win.setMenuBarVisibility(false)
      win.setAutoHideMenuBar(true)
      // Explicit size = current screen resolution of the display the app is on.
      win.setBounds(bounds)

      // macOS: simple fullscreen for edge-to-edge on the same display/Space.
      if (process.platform === 'darwin' && typeof win.setSimpleFullScreen === 'function') {
        win.setSimpleFullScreen(true)
      }
    } else {
      if (process.platform === 'darwin' && typeof win.setSimpleFullScreen === 'function') {
        win.setSimpleFullScreen(false)
      }
      win.setResizable(true)
      win.setMenuBarVisibility(false)
      const saved = getWindowedBounds()
      const width = saved.width || WINDOWED_WIDTH
      const height = saved.height || WINDOWED_HEIGHT
      if (saved.x != null && saved.y != null) {
        win.setBounds({ x: saved.x, y: saved.y, width, height })
      } else {
        win.setSize(width, height)
        win.center()
      }
    }
  } finally {
    // Defer clear so resize events from setBounds don't persist borderless size.
    setTimeout(() => {
      suppressBoundsSave = false
    }, 250)
  }

  notifyDisplayMode(win)
}

export function notifyDisplayModeForMain() {
  if (mainWindow) notifyDisplayMode(mainWindow)
}

/**
 * Persist current window bounds when the player is in windowed mode
 * and has resized/moved the window manually.
 */
export function persistWindowedBoundsIfNeeded(win) {
  if (suppressBoundsSave || !win || win.isDestroyed()) return
  if (getDisplayMode() !== 'windowed') return
  if (win.isFullScreen()) return
  if (typeof win.isSimpleFullScreen === 'function' && win.isSimpleFullScreen()) return
  if (win.isMinimized()) return

  const b = win.getBounds()
  // Ignore absurd sizes (e.g. mid-transition).
  if (b.width < 640 || b.height < 480) return

  saveWindowedBounds({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y
  })
}

/** Debounced save on resize/move. */
export function schedulePersistWindowedBounds(win) {
  if (suppressBoundsSave) return
  clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    persistWindowedBoundsIfNeeded(win)
  }, 300)
}

/**
 * Wire resize/move listeners on a BrowserWindow.
 */
export function attachWindowBoundsPersistence(win) {
  const onChange = () => schedulePersistWindowedBounds(win)
  win.on('resize', onChange)
  win.on('move', onChange)
  // Flush on close so the last size is never lost.
  win.on('close', () => {
    clearTimeout(saveBoundsTimer)
    persistWindowedBoundsIfNeeded(win)
  })
}

export function requestDisplayMode(mode) {
  const next = mode === 'windowed' ? 'windowed' : 'borderless'
  // Leaving windowed: save size before we expand to borderless.
  if (getDisplayMode() === 'windowed' && next === 'borderless' && mainWindow) {
    persistWindowedBoundsIfNeeded(mainWindow)
  }
  setDisplayMode(next)
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyDisplayMode(mainWindow, next)
  }
  return next
}

export function toggleDisplayMode() {
  const next = getDisplayMode() === 'borderless' ? 'windowed' : 'borderless'
  return requestDisplayMode(next)
}

export function isBorderlessMode() {
  return getDisplayMode() === 'borderless'
}

/** Options for BrowserWindow constructor. */
export function borderlessCreateOptions() {
  const borderless = isBorderlessMode()
  const saved = getWindowedBounds()
  const w = saved.width || WINDOWED_WIDTH
  const h = saved.height || WINDOWED_HEIGHT
  const hasPos = saved.x != null && saved.y != null
  // Prefer the display that owns the last windowed position (multi-monitor).
  const display =
    hasPos
      ? screen.getDisplayMatching({
          x: saved.x,
          y: saved.y,
          width: w,
          height: h
        })
      : screen.getPrimaryDisplay()

  return {
    borderless,
    width: borderless ? display.bounds.width : w,
    height: borderless ? display.bounds.height : h,
    x: borderless ? display.bounds.x : hasPos ? saved.x : undefined,
    y: borderless ? display.bounds.y : hasPos ? saved.y : undefined,
    center: !borderless && !hasPos,
    frame: false
  }
}
