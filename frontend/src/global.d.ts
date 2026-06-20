/// <reference types="vite/client" />

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
      saveClient: (payload: ClientFormInput) => Promise<{ clientId: number }>
      getSaleDetail: (saleId: number) => Promise<SaleFullDetail>
      getSalesReport: (payload: SalesReportInput) => Promise<SalesReportData>
      registerAttendanceEntry: (payload: AttendanceFormInput) => Promise<{ attendanceId: number }>
      registerAttendanceExit: (payload: AttendanceFormInput) => Promise<{ attendanceId: number }>
      login: (payload: AuthInput) => Promise<AuthResult>
      changePassword: (payload: { userId: number; newPasswordPlain: string }) => Promise<{ success: boolean; message?: string }>
      saveRole: (payload: RoleFormInput) => Promise<{ roleId: number }>
      saveWorker: (payload: WorkerFormInput) => Promise<{ workerId: number }>
      resetUserPassword: (workerId: number) => Promise<{ success: boolean; message?: string }>
      saveShift: (payload: ShiftFormInput) => Promise<{ shiftId: number }>
      deleteShift: (shiftId: number) => Promise<{ deleted: boolean }>
      setShiftState: (shiftId: number, enabled: boolean) => Promise<{ shiftId: number; enabled: boolean }>
      recordAttendance: (payload: AttendanceInput) => Promise<{ attendanceId: number }>
      fetchAuditLogs: (payload: FetchAuditLogsInput) => Promise<FetchAuditLogsResult>
    }
  }
}

export {}
