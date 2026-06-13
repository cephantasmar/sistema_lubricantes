import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  BootstrapData,
  InventoryAuditInput,
  InventoryAuditResult,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
  AuthInput,
  AuthResult,
  RoleFormInput,
  WorkerFormInput,
  AttendanceInput
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

  // Auth & Admin
  login: (payload: AuthInput) => ipcRenderer.invoke('auth:login', payload) as Promise<AuthResult>,
  saveRole: (payload: RoleFormInput) => ipcRenderer.invoke('admin:save-role', payload) as Promise<{ roleId: number }>,
  saveWorker: (payload: WorkerFormInput) => ipcRenderer.invoke('admin:save-worker', payload) as Promise<{ workerId: number }>,
  recordAttendance: (payload: AttendanceInput) => ipcRenderer.invoke('shifts:record-attendance', payload) as Promise<{ attendanceId: number }>,
})
