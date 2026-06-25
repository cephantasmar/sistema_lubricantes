import { app, ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabasePath } from '../db/database'
import {
  closeInventory,
  createMovement,
  createSale,
  getBootstrapData,
  getSaleDetail,
  saveClient,
  registerAttendanceEntry,
  registerAttendanceExit,
  saveProduct,
  getSalesReport,
} from '../modules/store'
import { changePassword, login } from '../modules/auth'
import { deleteShift, fetchAuditLogs, resetUserPassword, saveRole, saveShift, saveWorker, setShiftState } from '../modules/admin'
import { getParallelDollarRate } from '../modules/exchange'

function registerHandler(channel: string, handler: Parameters<typeof ipcMain.handle>[1]) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export function registerSystemIpc(database: Database.Database) {
  registerHandler('system:get-app-info', () => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      databasePath: getDatabasePath(),
    }
  })

  registerHandler('app:get-bootstrap-data', () => {
    return getBootstrapData(database)
  })

  registerHandler('market:get-parallel-dollar-rate', (_event, forceRefresh) => {
    return getParallelDollarRate(Boolean(forceRefresh))
  })

  registerHandler('inventory:save-product', (_event, payload) => {
    return saveProduct(database, payload)
  })

  registerHandler('inventory:create-movement', (_event, payload) => {
    return createMovement(database, payload)
  })

  registerHandler('inventory:close-inventory', (_event, payload) => {
    return closeInventory(database, payload)
  })

  registerHandler('sales:create-sale', (_event, payload) => {
    return createSale(database, payload)
  })

  registerHandler('sales:save-client', (_event, payload) => {
    return saveClient(database, payload)
  })

  registerHandler('sales:get-sale-detail', (_event, saleId) => {
    return getSaleDetail(database, saleId)
  })

  registerHandler('sales:get-sales-report', (_event, payload) => {
    return getSalesReport(database, payload)
  })

  registerHandler('attendance:register-entry', (_event, payload) => {
    return registerAttendanceEntry(database, payload)
  })

  registerHandler('attendance:register-exit', (_event, payload) => {
    return registerAttendanceExit(database, payload)
  })

  registerHandler('auth:login', (_event, payload) => {
    return login(database, payload)
  })

  registerHandler('admin:save-role', (_event, payload) => {
    return saveRole(database, payload)
  })

  registerHandler('admin:save-worker', (_event, payload) => {
    return saveWorker(database, payload)
  })

  ipcMain.handle('admin:reset-user-password', (_event, workerId) => {
    return resetUserPassword(database, workerId)
  })

  ipcMain.handle('auth:change-password', (_event, payload) => {
    return changePassword(database, payload.userId, payload.newPasswordPlain)
  })

  ipcMain.handle('admin:fetch-audit-logs', (_event, payload) => {
    return fetchAuditLogs(database, payload)
  })

  registerHandler('admin:save-shift', (_event, payload) => {
    return saveShift(database, payload)
  })

  registerHandler('admin:delete-shift', (_event, shiftId) => {
    return deleteShift(database, shiftId)
  })

  registerHandler('admin:set-shift-state', (_event, shiftId, enabled) => {
    return setShiftState(database, shiftId, enabled)
  })

}
