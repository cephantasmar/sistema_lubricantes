import { app, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabasePath } from '../db/database'
<<<<<<< HEAD
import {
  createMovement,
  createSale,
  getBootstrapData,
  registerAttendanceEntry,
  registerAttendanceExit,
  saveProduct,
} from '../modules/store'
=======
import { closeInventory, createMovement, createSale, getBootstrapData, saveProduct } from '../modules/store'
import { login } from '../modules/auth'
import { saveRole, saveWorker } from '../modules/admin'
import { recordAttendance } from '../modules/shifts'
>>>>>>> origin/SPRINT1

let handlersRegistered = false

export function registerSystemIpc(database: Database.Database) {
  if (handlersRegistered) {
    return
  }

  handlersRegistered = true

  ipcMain.handle('system:get-app-info', () => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      databasePath: getDatabasePath(),
    }
  })

  ipcMain.handle('app:get-bootstrap-data', () => {
    return getBootstrapData(database)
  })

  ipcMain.handle('inventory:save-product', (_event, payload) => {
    return saveProduct(database, payload)
  })

  ipcMain.handle('inventory:create-movement', (_event, payload) => {
    return createMovement(database, payload)
  })

  ipcMain.handle('inventory:close-inventory', (_event, payload) => {
    return closeInventory(database, payload)
  })

  ipcMain.handle('sales:create-sale', (_event, payload) => {
    return createSale(database, payload)
  })

<<<<<<< HEAD
  ipcMain.handle('attendance:register-entry', (_event, payload) => {
    return registerAttendanceEntry(database, payload)
  })

  ipcMain.handle('attendance:register-exit', (_event, payload) => {
    return registerAttendanceExit(database, payload)
=======
  ipcMain.handle('auth:login', (_event, payload) => {
    return login(database, payload)
  })

  ipcMain.handle('admin:save-role', (_event, payload) => {
    return saveRole(database, payload)
  })

  ipcMain.handle('admin:save-worker', (_event, payload) => {
    return saveWorker(database, payload)
  })

  ipcMain.handle('shifts:record-attendance', (_event, payload) => {
    return recordAttendance(database, payload)
>>>>>>> origin/SPRINT1
  })
}
