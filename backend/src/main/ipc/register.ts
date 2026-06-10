import { app, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabasePath } from '../db/database'
import {
  createMovement,
  createSale,
  getBootstrapData,
  registerAttendanceEntry,
  registerAttendanceExit,
  saveProduct,
} from '../modules/store'

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

  ipcMain.handle('sales:create-sale', (_event, payload) => {
    return createSale(database, payload)
  })

  ipcMain.handle('attendance:register-entry', (_event, payload) => {
    return registerAttendanceEntry(database, payload)
  })

  ipcMain.handle('attendance:register-exit', (_event, payload) => {
    return registerAttendanceExit(database, payload)
  })
}
