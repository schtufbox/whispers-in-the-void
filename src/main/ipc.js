import { app, ipcMain } from 'electron'
import { saveGame, loadGame, deleteSave, hasSave } from './save.js'
import { getDisplayMode, getSoundEnabled, setSoundEnabled } from './settings.js'
import { requestDisplayMode } from './display.js'

export function registerSaveHandlers() {
  ipcMain.handle('save-game', (_event, data) => saveGame(data))
  ipcMain.handle('load-game', () => loadGame())
  ipcMain.handle('delete-save', () => deleteSave())
  ipcMain.handle('has-save', () => hasSave())
  ipcMain.handle('quit-app', () => app.quit())
  ipcMain.handle('get-display-mode', () => getDisplayMode())
  ipcMain.handle('set-display-mode', (_event, mode) => requestDisplayMode(mode))
  ipcMain.handle('get-sound-enabled', () => getSoundEnabled())
  // Persists to userData/settings.json — restored on next launch.
  ipcMain.handle('set-sound-enabled', (_event, enabled) => setSoundEnabled(enabled))
}
