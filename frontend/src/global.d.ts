/// <reference types="vite/client" />

import type {
  AppInfo,
  BootstrapData,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
  SaleFullDetail,
} from '@shared/ipc/contracts'

declare global {
  interface Window {
    inventoryApi: {
      getAppInfo: () => Promise<AppInfo>
      getBootstrapData: () => Promise<BootstrapData>
      saveProduct: (payload: ProductFormInput) => Promise<{ productId: number }>
      createMovement: (payload: MovementFormInput) => Promise<{ movementId: number }>
      createSale: (payload: SaleFormInput) => Promise<{ saleId: number }>
      getSaleDetail: (saleId: number) => Promise<SaleFullDetail>
    }
  }
}

export {}
