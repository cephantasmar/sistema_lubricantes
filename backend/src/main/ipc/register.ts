import { app, BrowserWindow, ipcMain, shell } from 'electron'
import type Database from 'better-sqlite3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getDatabasePath } from '../db/database'
import type { PdfPreviewInput } from '../../shared/ipc/contracts'
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

function registerHandler(channel: string, handler: Parameters<typeof ipcMain.handle>[1]) {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

function sanitizePdfFileName(value: string) {
  const safeName = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)

  return safeName || 'documento'
}

async function previewPdfDocument(input: PdfPreviewInput) {
  if (!input.html.trim()) {
    throw new Error('No hay contenido para generar el PDF.')
  }

  const outputDir = join(app.getPath('temp'), 'sistema-lubricantes-pdf')
  await mkdir(outputDir, { recursive: true })

  const baseName = sanitizePdfFileName(input.fileName || input.title || 'documento')
  const filePath = join(outputDir, `${baseName}-${Date.now()}.pdf`)
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  try {
    const encodedHtml = Buffer.from(input.html, 'utf8').toString('base64')
    await pdfWindow.loadURL(`data:text/html;base64,${encodedHtml}`)
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
    })

    await writeFile(filePath, pdfBuffer)
    const openError = await shell.openPath(filePath)
    if (openError) {
      throw new Error(openError)
    }

    return { filePath }
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.close()
    }
  }
}

export function registerSystemIpc(database: Database.Database) {
  registerHandler('system:get-app-info', () => {
    return {
      appName: app.getName(),
      version: app.getVersion(),
      databasePath: getDatabasePath(),
    }
  })

  registerHandler('system:preview-pdf', (_event, payload: PdfPreviewInput) => {
    return previewPdfDocument(payload)
  })

  registerHandler('app:get-bootstrap-data', () => {
    return getBootstrapData(database)
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
