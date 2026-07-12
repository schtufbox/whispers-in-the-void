import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveGame: (data) => ipcRenderer.invoke('save-game', data),
  loadGame: () => ipcRenderer.invoke('load-game'),
  deleteSave: () => ipcRenderer.invoke('delete-save'),
  hasSave: () => ipcRenderer.invoke('has-save'),
  quitApp: () => ipcRenderer.invoke('quit-app')
})
