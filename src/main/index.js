import { app, BrowserWindow, Menu, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerSaveHandlers } from './ipc.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Matches the in-game title screen (menu copyright) and packaged installers.
const APP_NAME = 'Whispers In The Void'
const APP_COPYRIGHT = '© Laughing In Purgatory 2026'
const APP_ID = 'com.whispersinthevoid.game'

// Must run before ready — macOS menubar / app menu label, Linux process title,
// and Electron's default getName() all key off this (otherwise dev shows "Electron").
app.setName(APP_NAME)
process.title = APP_NAME
if (process.platform === 'win32') {
  // Taskbar grouping + jump list name use the AppUserModelID.
  app.setAppUserModelId(APP_ID)
}

if (process.env.DEV_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DEV_REMOTE_DEBUG)
}

function showAbout() {
  // macOS / some Linux DEs use the native About panel when available.
  if (process.platform === 'darwin') {
    app.showAboutPanel()
    return
  }
  dialog.showMessageBox({
    type: 'info',
    title: `About ${APP_NAME}`,
    message: APP_NAME,
    detail: `Version ${app.getVersion()}\n${APP_COPYRIGHT}`
  })
}

function setupApplicationMenu() {
  // Reinforce name after ready (menu rebuild uses getName() on some platforms).
  app.setName(APP_NAME)
  process.title = APP_NAME

  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: APP_COPYRIGHT
  })

  if (process.platform === 'darwin') {
    // role: 'appMenu' uses app.getName() for the leftmost menubar label.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          role: 'appMenu',
          submenu: [
            { role: 'about', label: `About ${APP_NAME}` },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide', label: `Hide ${APP_NAME}` },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit', label: `Quit ${APP_NAME}` }
          ]
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
          ]
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            {
              label: 'Toggle Full Screen',
              accelerator: 'Alt+Enter',
              click: (_item, focusedWindow) => {
                if (focusedWindow) focusedWindow.setFullScreen(!focusedWindow.isFullScreen())
              }
            }
          ]
        },
        {
          role: 'windowMenu'
        }
      ])
    )
    return
  }

  // Windows / Linux application menu.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: APP_NAME,
        submenu: [
          {
            label: `About ${APP_NAME}`,
            click: () => showAbout()
          },
          { type: 'separator' },
          { role: 'quit', label: 'Quit' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          {
            label: 'Toggle Full Screen',
            accelerator: 'Alt+Enter',
            click: (_item, focusedWindow) => {
              if (focusedWindow) focusedWindow.setFullScreen(!focusedWindow.isFullScreen())
            }
          }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: `About ${APP_NAME}`,
            click: () => showAbout()
          }
        ]
      }
    ])
  )
}

function appIconPath() {
  // Packaged: electron-builder embeds the platform icon in the binary.
  // Dev / Linux window chrome still benefits from an explicit PNG path.
  const candidates = [
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return undefined
}

function createWindow() {
  const icon = appIconPath()
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_NAME,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Prevent the renderer document title from overwriting APP_NAME with "Electron".
  win.on('page-title-updated', (event) => {
    event.preventDefault()
    win.setTitle(APP_NAME)
  })

  // Alt+Enter fullscreen even when the game has pointer lock / no menu focus.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!input.alt || input.control || input.meta || input.shift) return
    if (input.key !== 'Enter' && input.key !== 'Return') return
    win.setFullScreen(!win.isFullScreen())
    event.preventDefault()
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
  setupApplicationMenu()
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
