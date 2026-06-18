import { app, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabasePath } from '../db/database'
import {
  closeInventory,
  createMovement,
  createSale,
  getBootstrapData,
  getSaleDetail,
  registerAttendanceEntry,
  registerAttendanceExit,
  saveProduct,
  getSalesReport,
} from '../modules/store'
import { changePassword, login } from '../modules/auth'
import { resetUserPassword, saveRole, saveWorker } from '../modules/admin'

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

  ipcMain.handle('sales:get-sale-detail', (_event, saleId) => {
    return getSaleDetail(database, saleId)
  })

  ipcMain.handle('sales:get-sales-report', (_event, payload) => {
    return getSalesReport(database, payload)
  })

  ipcMain.handle('attendance:register-entry', (_event, payload) => {
    return registerAttendanceEntry(database, payload)
  })

  ipcMain.handle('attendance:register-exit', (_event, payload) => {
    return registerAttendanceExit(database, payload)
  })

  ipcMain.handle('auth:login', (_event, payload) => {
    return login(database, payload)
  })

  ipcMain.handle('admin:save-role', (_event, payload) => {
    return saveRole(database, payload)
  })

  ipcMain.handle('admin:save-worker', (_event, payload) => {
    return saveWorker(database, payload)
  })

  ipcMain.handle('admin:reset-user-password', (_event, workerId) => {
    return resetUserPassword(database, workerId)
  })

  ipcMain.handle('auth:change-password', (_event, payload) => {
    return changePassword(database, payload.userId, payload.newPasswordPlain)
  })

}
