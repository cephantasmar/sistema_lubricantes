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
  productos_diferentes: number
  cantidad_total: number
  subtotal: number
  descuento_total: number
  total: number
  metodo_pago: string
  moneda: string
  estado: string
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

export type PaymentInput = {
  id_metodo_pago: number
  id_moneda: number
  monto: number
  referencia_pago: string | null
}

export type SaleDetailInput = {
  id_producto: number
  cantidad: number
  descuento_unitario: number
  id_descuento: number | null
}

export type SaleFormInput = {
  id_cliente: number | null
  id_vendedor: number
  id_turno: number | null
  id_moneda: number
  tasa_cambio_aplicada: number
  observacion: string | null
  detalles: SaleDetailInput[]
  pagos: PaymentInput[]
}

export type SaleDetailRow = {
  id_producto: number
  codigo: string
  nombre: string
  cantidad: number
  precio_unitario: number
  precio_costo_unitario: number
  descuento_unitario: number
  subtotal_linea: number
  total_linea: number
}

export type SalePaymentRow = {
  metodo_pago: string
  moneda_codigo: string
  monto: number
  referencia_pago: string | null
}

export type SaleFullDetail = {
  id_venta: number
  numero_factura: string
  fecha_venta: string
  cliente_nombre: string | null
  vendedor_nombre: string
  turno_nombre: string | null
  subtotal: number
  descuento_total: number
  total: number
  moneda_codigo: string
  tasa_cambio: number
  observacion: string | null
  estado: string
  ganancia_total: number
  detalles: SaleDetailRow[]
  pagos: SalePaymentRow[]
}

export type ExchangeRateItem = {
  id_moneda: number
  valor: number
}

export type BootstrapData = {
  references: {
    marcas: ReferenceItem[]
    categorias: ReferenceItem[]
    monedas: ReferenceItem[]
    metodosPago: ReferenceItem[]
    clientes: ReferenceItem[]
    trabajadores: ReferenceItem[]
    turnos: ReferenceItem[]
    tiposCambio: ExchangeRateItem[]
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
}
