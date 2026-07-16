import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveGame: (data) => ipcRenderer.invoke('save-game', data),
  loadGame: () => ipcRenderer.invoke('load-game'),
  deleteSave: () => ipcRenderer.invoke('delete-save'),
  hasSave: () => ipcRenderer.invoke('has-save'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getDisplayMode: () => ipcRenderer.invoke('get-display-mode'),
  setDisplayMode: (mode) => ipcRenderer.invoke('set-display-mode', mode),
  getSoundEnabled: () => ipcRenderer.invoke('get-sound-enabled'),
  setSoundEnabled: (enabled) => ipcRenderer.invoke('set-sound-enabled', enabled),
  // Main fires this on enter/leave full screen (Alt+Enter, menu, etc.).
  onFullscreenChanged: (cb) => {
    const handler = (_event, isFullscreen) => cb(isFullscreen)
    ipcRenderer.on('fullscreen-changed', handler)
    return () => ipcRenderer.removeListener('fullscreen-changed', handler)
  },
  onDisplayModeChanged: (cb) => {
    const handler = (_event, mode) => cb(mode)
    ipcRenderer.on('display-mode-changed', handler)
    return () => ipcRenderer.removeListener('display-mode-changed', handler)
  }
})
