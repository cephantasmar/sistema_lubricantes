import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { getDatabase, closeDatabase } from './db/database'
import { registerSystemIpc } from './ipc/register'

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  const database = getDatabase()
  registerSystemIpc(database)
  const devServerUrl = import.meta.env.MAIN_VITE_DEV_SERVER_URL ?? 'http://localhost:5173'

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    title: 'Inventario de Aceites',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (import.meta.env.DEV) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
