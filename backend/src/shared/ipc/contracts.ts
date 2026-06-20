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
  cliente_nombre: string
  productos_diferentes: number
  cantidad_total: number
  subtotal: number
  descuento_total: number
  total: number
  metodo_pago: string
  moneda: string
  estado: string
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
  nombre_completo?: string
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

export type FetchAuditLogsInput = {
  page: number
  limit: number
  modulo?: string | null
  accion?: string | null
  usuario?: string | null
  fechaDesde?: string | null
  fechaHasta?: string | null
}

export type FetchAuditLogsResult = {
  logs: AuditLogRow[]
  totalItems: number
  totalPages: number
  currentPage: number
}

export type AuthResult = {
  success: boolean
  message?: string
  requiresPasswordChange?: boolean
  user?: {
    id_usuario: number
    username: string
    id_trabajador: number | null
    nombres: string | null
    roleNames: string[]
    permissionNames: string[]
    isAdminLike: boolean
  }
}

export type AuthInput = {
  username: string
  password_plain: string
}

export type ShiftRow = {
  id_turno: number
  nombre: string
  hora_inicio: string
  hora_fin: string
  descripcion: string | null
  estado?: boolean | number
  registros_asociados?: number
}

export type AttendanceRow = {
  id_asistencia: number
  id_trabajador: number
  trabajador_nombre: string
  id_turno: number
  turno_nombre: string
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  observacion: string | null
  estado: 'EN_TURNO' | 'COMPLETADO'
}

export type WorkHoursSummaryRow = {
  id_trabajador: number
  trabajador_nombre: string
  cargo: string | null
  asistencias_completadas: number
  minutos_trabajados: number
  horas_trabajadas: number
}

export type ShiftHistoryRow = {
  id_asistencia: number
  id_trabajador: number
  trabajador_nombre: string
  cargo: string | null
  turno_nombre: string
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  estado: 'EN_TURNO' | 'COMPLETADO'
}

export type ShiftRotationSummaryRow = {
  id_trabajador: number
  trabajador_nombre: string
  cargo: string | null
  turnos_manana: number
  turnos_tarde: number
  turnos_noche: number
  total_turnos: number
  ultimo_turno: string | null
  ultima_fecha: string | null
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

export type ClientFormInput = {
  id_cliente?: number | null
  nombre: string
  documento: string
  telefono?: string | null
  email?: string | null
  direccion?: string | null
}

export type ClientRow = {
  id_cliente: number
  nombre: string
  documento: string
  telefono: string | null
  email: string | null
  direccion: string | null
  creado_en: string
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
  cliente_documento: string | null
  cliente_telefono: string | null
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

export type AttendanceFormInput = {
  id_trabajador: number
  id_turno?: number | null
  observacion?: string | null
}

export type InventoryAuditItemInput = {
  id_producto: number
  conteo_fisico: number
  precio_costo?: number | null
  precio_venta?: number | null
}

export type InventoryAuditInput = {
  items: InventoryAuditItemInput[]
  observacion?: string | null
}

export type InventoryAuditResultItem = {
  id_producto: number
  nombre: string
  stock_sistema: number
  conteo_fisico: number
  diferencia: number
  tipo_ajuste: 'AJUSTE_POS' | 'AJUSTE_NEG' | 'SIN_CAMBIO'
}

export type InventoryAuditResult = {
  procesados: number
  ajustados: number
  detalles: InventoryAuditResultItem[]
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

export type ShiftFormInput = {
  id_turno?: number | null
  nombre: string
  hora_inicio: string
  hora_fin: string
  descripcion?: string | null
  estado: boolean
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
    clientes: ReferenceItem[]
    trabajadores: WorkerRow[]
    turnos: ShiftRow[]
    tiposCambio: ExchangeRateItem[]
  }
  metrics: {
    totalProducts: number
    totalStock: number
    lowStockProducts: number
    totalMovements: number
    totalSales: number
    totalSalesAmount: number
    activeAttendances: number
  }
  products: ProductRow[]
  movements: MovementRow[]
  sales: SaleRow[]
  clients: ClientRow[]
  attendances: AttendanceRow[]
  workHoursSummary: WorkHoursSummaryRow[]
  shiftHistory: ShiftHistoryRow[]
  shiftRotationSummary: ShiftRotationSummaryRow[]
  shifts: ShiftRow[]
  roles: RoleRow[]
  workers: WorkerRow[]
  auditLogs: AuditLogRow[]
  permissions: PermissionRow[]
}

export type SalesReportInput = {
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  vendedorId?: number | null
  turnoId?: number | null
  monedaId?: number | null
  estado?: string | null
}

export type ReportHighlight = {
  label: string
  value: number
}

export type SalesReportKPIs = {
  totalVendido: number
  totalCobrado: number
  totalCosto: number
  totalGanancia: number
  totalDescuentos: number
  cantidadVentas: number
  saldoPendiente: number
  ticketPromedio: number
  margenPromedio: number
  ventasCompletadas: number
  ventasPendientes: number
  ventasAnuladas: number
  pagosRegistrados: number
  metodosPagoCount: number
  ventaMasRentable: ReportHighlight | null
  margenMasBajo: ReportHighlight | null
}

export type ProfitReportRow = {
  id_venta: number
  numero_factura: string
  fecha_venta: string
  vendedor: string
  cliente: string
  turno: string
  moneda: string
  productos_count: number
  cantidad_total: number
  subtotal: number
  descuento: number
  total: number
  costo: number
  ganancia: number
  margen: number
  pagos_recibidos: number
  saldo_pendiente: number
  estado: string
}

export type CashFlowReportRow = {
  metodo_pago: string
  moneda: string
  total_recibido: number
  transacciones_count: number
  ventas_count: number
  referencias_count: number
  sin_referencia_count: number
}

export type CashFlowSaleRow = {
  id_venta: number
  numero_factura: string
  fecha_venta: string
  cliente: string
  vendedor: string
  turno: string
  estado: string
  moneda: string
  total_vendido: number
  total_recibido: number
  saldo_pendiente: number
  cambio: number
  metodos_pago: string
}

export type ChartDataBrand = {
  marca: string
  ventas_count: number
  unidades: number
  total_vendido: number
  total_ganancia: number
  margen: number
}

export type ChartDataShift = {
  turno: string
  ventas_count: number
  total_vendido: number
  total_ganancia: number
  margen: number
}

export type ChartDataSeller = {
  vendedor: string
  ventas_count: number
  total_vendido: number
  total_ganancia: number
  margen: number
}

export type ChartDataDaily = {
  fecha: string
  total_vendido: number
  total_costo: number
  total_ganancia: number
  ventas_count: number
}

export type SalesReportData = {
  kpis: SalesReportKPIs
  profitReport: ProfitReportRow[]
  cashFlowReport: CashFlowReportRow[]
  cashFlowBySale: CashFlowSaleRow[]
  charts: {
    brands: ChartDataBrand[]
    shifts: ChartDataShift[]
    sellers: ChartDataSeller[]
    daily: ChartDataDaily[]
  }
}
