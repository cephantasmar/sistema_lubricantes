/// <reference types="vite/client" />

import type {
  AppInfo,
  AttendanceFormInput,
  BootstrapData,
  InventoryAuditInput,
  InventoryAuditResult,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
  AuthInput,
  AuthResult,
  RoleFormInput,
  WorkerFormInput
} from '@shared/ipc/contracts'

declare global {
  interface Window {
    inventoryApi: {
      getAppInfo: () => Promise<AppInfo>
      getBootstrapData: () => Promise<BootstrapData>
      saveProduct: (payload: ProductFormInput) => Promise<{ productId: number }>
      createMovement: (payload: MovementFormInput) => Promise<{ movementId: number }>
      closeInventory: (payload: InventoryAuditInput) => Promise<InventoryAuditResult>
      createSale: (payload: SaleFormInput) => Promise<{ saleId: number }>
      registerAttendanceEntry: (payload: AttendanceFormInput) => Promise<{ attendanceId: number }>
      registerAttendanceExit: (payload: AttendanceFormInput) => Promise<{ attendanceId: number }>
      login: (payload: AuthInput) => Promise<AuthResult>
      saveRole: (payload: RoleFormInput) => Promise<{ roleId: number }>
      saveWorker: (payload: WorkerFormInput) => Promise<{ workerId: number }>
    }
  }
}

export {}
