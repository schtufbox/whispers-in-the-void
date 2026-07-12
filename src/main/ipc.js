import { app, ipcMain } from 'electron'
import { saveGame, loadGame, deleteSave, hasSave } from './save.js'

export function registerSaveHandlers() {
  ipcMain.handle('save-game', (_event, data) => saveGame(data))
  ipcMain.handle('load-game', () => loadGame())
  ipcMain.handle('delete-save', () => deleteSave())
  ipcMain.handle('has-save', () => hasSave())
  ipcMain.handle('quit-app', () => app.quit())
}
