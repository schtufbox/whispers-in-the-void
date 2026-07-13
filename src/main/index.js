import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerSaveHandlers } from './ipc.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

if (process.env.DEV_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DEV_REMOTE_DEBUG)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`)
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerSaveHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Electron's own boilerplate skips this on darwin (macOS apps conventionally
// stay alive in the dock after their last window closes, e.g. multi-document
// editors). That doesn't fit a single-window arcade game with nothing useful
// to do in the background — without this, closing the window (red button or
// Cmd+W) left the process running indefinitely on macOS, which read as the
// game failing to quit rather than a deliberate platform convention.
app.on('window-all-closed', () => {
  app.quit()
})
