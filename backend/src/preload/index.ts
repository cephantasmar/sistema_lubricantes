import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  BootstrapData,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
} from '../shared/ipc/contracts'

contextBridge.exposeInMainWorld('inventoryApi', {
  getAppInfo: () => ipcRenderer.invoke('system:get-app-info') as Promise<AppInfo>,
  getBootstrapData: () => ipcRenderer.invoke('app:get-bootstrap-data') as Promise<BootstrapData>,
  saveProduct: (payload: ProductFormInput) => ipcRenderer.invoke('inventory:save-product', payload) as Promise<{ productId: number }>,
  createMovement: (payload: MovementFormInput) =>
    ipcRenderer.invoke('inventory:create-movement', payload) as Promise<{ movementId: number }>,
  createSale: (payload: SaleFormInput) => ipcRenderer.invoke('sales:create-sale', payload) as Promise<{ saleId: number }>,
})
