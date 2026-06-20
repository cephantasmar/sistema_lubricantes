/// <reference types="vite/client" />

import type {
  AppInfo,
  AttendanceFormInput,
  BootstrapData,
  ClientFormInput,
  InventoryAuditInput,
  InventoryAuditResult,
  MovementFormInput,
  PdfPreviewInput,
  PdfPreviewResult,
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
  SalesReportData
} from '@shared/ipc/contracts'

declare global {
  interface Window {
    inventoryApi: {
      getAppInfo: () => Promise<AppInfo>
      getBootstrapData: () => Promise<BootstrapData>
      previewPdf: (payload: PdfPreviewInput) => Promise<PdfPreviewResult>
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
      saveRole: (payload: RoleFormInput) => Promise<{ roleId: number }>
      saveWorker: (payload: WorkerFormInput) => Promise<{ workerId: number }>
      saveShift: (payload: ShiftFormInput) => Promise<{ shiftId: number }>
      deleteShift: (shiftId: number) => Promise<{ deleted: boolean }>
      setShiftState: (shiftId: number, enabled: boolean) => Promise<{ shiftId: number; enabled: boolean }>
      recordAttendance: (payload: AttendanceInput) => Promise<{ attendanceId: number }>
    }
  }
}

export {}
