import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  AttendanceFormInput,
  BootstrapData,
  ClientFormInput,
  InventoryAuditInput,
  InventoryAuditResult,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
  SaleFullDetail,
  AuthInput,
  AuthResult,
  RoleFormInput,
  ShiftFormInput,
  WorkerFormInput,
  AttendanceInput,
  SalesReportInput,
  SalesReportData,
  FetchAuditLogsInput,
  FetchAuditLogsResult
} from '../shared/ipc/contracts'

contextBridge.exposeInMainWorld('inventoryApi', {
  getAppInfo: () => ipcRenderer.invoke('system:get-app-info') as Promise<AppInfo>,
  getBootstrapData: () => ipcRenderer.invoke('app:get-bootstrap-data') as Promise<BootstrapData>,
  
  // Inventory & Sales
  saveProduct: (payload: ProductFormInput) => ipcRenderer.invoke('inventory:save-product', payload) as Promise<{ productId: number }>,
  createMovement: (payload: MovementFormInput) => ipcRenderer.invoke('inventory:create-movement', payload) as Promise<{ movementId: number }>,
  closeInventory: (payload: InventoryAuditInput) =>
    ipcRenderer.invoke('inventory:close-inventory', payload) as Promise<InventoryAuditResult>,
  createSale: (payload: SaleFormInput) => ipcRenderer.invoke('sales:create-sale', payload) as Promise<{ saleId: number }>,
  saveClient: (payload: ClientFormInput) => ipcRenderer.invoke('sales:save-client', payload) as Promise<{ clientId: number }>,
  getSaleDetail: (saleId: number) => ipcRenderer.invoke('sales:get-sale-detail', saleId) as Promise<SaleFullDetail>,
  getSalesReport: (payload: SalesReportInput) => ipcRenderer.invoke('sales:get-sales-report', payload) as Promise<SalesReportData>,
  registerAttendanceEntry: (payload: AttendanceFormInput) =>
    ipcRenderer.invoke('attendance:register-entry', payload) as Promise<{ attendanceId: number }>,
  registerAttendanceExit: (payload: AttendanceFormInput) =>
    ipcRenderer.invoke('attendance:register-exit', payload) as Promise<{ attendanceId: number }>,

  // Auth & Admin
  login: (payload: AuthInput) => ipcRenderer.invoke('auth:login', payload) as Promise<AuthResult>,
  changePassword: (payload: { userId: number; newPasswordPlain: string }) => ipcRenderer.invoke('auth:change-password', payload) as Promise<{ success: boolean; message?: string }>,
  saveRole: (payload: RoleFormInput) => ipcRenderer.invoke('admin:save-role', payload) as Promise<{ roleId: number }>,
  saveWorker: (payload: WorkerFormInput) => ipcRenderer.invoke('admin:save-worker', payload) as Promise<{ workerId: number }>,
  resetUserPassword: (workerId: number) => ipcRenderer.invoke('admin:reset-user-password', workerId) as Promise<{ success: boolean; message?: string }>,
  saveShift: (payload: ShiftFormInput) => ipcRenderer.invoke('admin:save-shift', payload) as Promise<{ shiftId: number }>,
  deleteShift: (shiftId: number) => ipcRenderer.invoke('admin:delete-shift', shiftId) as Promise<{ deleted: boolean }>,
  setShiftState: (shiftId: number, enabled: boolean) =>
    ipcRenderer.invoke('admin:set-shift-state', shiftId, enabled) as Promise<{ shiftId: number; enabled: boolean }>,
  recordAttendance: (payload: AttendanceInput) => ipcRenderer.invoke('shifts:record-attendance', payload) as Promise<{ attendanceId: number }>,
  fetchAuditLogs: (payload: FetchAuditLogsInput) => ipcRenderer.invoke('admin:fetch-audit-logs', payload) as Promise<FetchAuditLogsResult>,
})
