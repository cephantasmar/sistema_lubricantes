export type AppInfo = {
  appName: string
  version: string
  databasePath: string
}

export type ReferenceItem = {
  id: number
  nombre: string
  descripcion?: string | null
}

export type PermissionRow = {
  id_permiso: number
  nombre: string
  descripcion: string | null
  modulo: string
  creado_en: string
}

export type ProductRow = {
  id_producto: number
  codigo: string
  codigo_barra: string | null
  nombre: string
  id_marca: number
  marca_nombre: string
  id_categoria: number | null
  categoria_nombre: string | null
  descripcion: string | null
  precio_costo: number
  precio_venta: number
  stock_minimo: number
  unidad_medida: string
  estado: number | boolean
  creado_en: string
  actualizado_en: string | null
  stock_actual: number
}

export type MovementRow = {
  id_movimiento: number
  id_producto: number
  producto_nombre: string
  producto_codigo: string
  tipo_movimiento: string
  cantidad: number
  costo_unitario: number | null
  motivo: string | null
  referencia: string | null
  observacion: string | null
  realizado_por: string
  fecha_movimiento: string
}

export type SaleRow = {
  id_venta: number
  numero_factura: string
  fecha_venta: string
  producto_nombre: string
  cantidad: number
  subtotal: number
  descuento_total: number
  total: number
  metodo_pago: string
  moneda: string
  estado: string
  vendedor: string
}

export type RoleRow = {
  id_rol: number
  nombre: string
  descripcion: string | null
  estado: boolean | number
  creado_en: string
  permisos?: number[]
}

export type WorkerRow = {
  id_trabajador: number
  id_usuario: number | null
  cedula: string | null
  nombres: string
  apellidos: string
  cargo: string | null
  salario_base: number | null
  estado: string
  creado_en: string
  id_rol?: number | null
}

export type AuditLogRow = {
  id_log: number
  usuario: string
  accion: string
  modulo: string
  descripcion: string | null
  fecha_evento: string
}

export type AuthResult = {
  success: boolean
  message?: string
  user?: {
    id_usuario: number
    username: string
    id_trabajador: number | null
    nombres: string | null
  }
}

export type AuthInput = {
  username: string
  password_plain: string
}

export type ProductFormInput = {
  id_producto?: number | null
  codigo: string
  codigo_barra?: string | null
  nombre: string
  id_marca: number
  id_categoria?: number | null
  descripcion?: string | null
  precio_costo: number
  precio_venta: number
  stock_minimo: number
  unidad_medida: string
  estado: boolean
  stock_inicial: number
}

export type MovementFormInput = {
  id_producto: number
  tipo_movimiento: string
  cantidad: number
  costo_unitario?: number | null
  motivo?: string | null
  referencia?: string | null
  observacion?: string | null
  realizado_por?: number | null
}

export type SaleFormInput = {
  id_producto: number
  cantidad: number
  descuento_total?: number | null
  id_metodo_pago: number
  id_moneda: number
  observacion?: string | null
  realizado_por?: number | null
}

export type RoleFormInput = {
  id_rol?: number | null
  nombre: string
  descripcion?: string | null
  estado: boolean
  permisos?: number[]
}

export type WorkerFormInput = {
  id_trabajador?: number | null
  cedula?: string | null
  nombres: string
  apellidos: string
  cargo?: string | null
  salario_base?: number | null
  estado: string
  crear_usuario: boolean
  id_rol?: number | null
}

export type AttendanceInput = {
  tipo: 'ENTRADA' | 'SALIDA'
}

export type BootstrapData = {
  references: {
    marcas: ReferenceItem[]
    categorias: ReferenceItem[]
    monedas: ReferenceItem[]
    metodosPago: ReferenceItem[]
  }
  metrics: {
    totalProducts: number
    totalStock: number
    lowStockProducts: number
    totalMovements: number
    totalSales: number
  }
  products: ProductRow[]
  movements: MovementRow[]
  sales: SaleRow[]
  roles: RoleRow[]
  workers: WorkerRow[]
  auditLogs: AuditLogRow[]
  permissions: PermissionRow[]
}
