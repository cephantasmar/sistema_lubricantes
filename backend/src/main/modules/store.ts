import type Database from 'better-sqlite3'
import type {
  AttendanceFormInput,
  AttendanceRow,
  BootstrapData,
  ClientFormInput,
  ClientRow,
  InventoryAuditInput,
  InventoryAuditResult,
  InventoryAuditResultItem,
  MovementFormInput,
  MovementRow,
  ProductFormInput,
  ProductRow,
  ReferenceItem,
  SaleDetailRow,
  SaleFormInput,
  SaleFullDetail,
  SalePaymentRow,
  SaleRow,
  ShiftHistoryRow,
  ShiftRotationSummaryRow,
  ShiftRow,
  WorkerRow,
  WorkHoursSummaryRow,
  RoleRow,
  AuditLogRow,
  PermissionRow,
  SalesReportInput,
  SalesReportData,
} from '../../shared/ipc/contracts'
import { getCurrentUserAccess, getCurrentWorkerId, hasPermission, requirePermission } from './auth'

const SYSTEM_USER_ID = 1

const PRODUCT_STOCK_QUERY = `
  SELECT
    p.id_producto,
    p.codigo,
    p.codigo_barra,
    p.nombre,
    p.id_marca,
    COALESCE(m.nombre, 'Sin marca') AS marca_nombre,
    p.id_categoria,
    COALESCE(c.nombre, 'General') AS categoria_nombre,
    p.descripcion,
    p.precio_costo,
    p.precio_venta,
    p.stock_minimo,
    p.unidad_medida,
    p.estado,
    p.creado_en,
    p.actualizado_en,
    COALESCE(SUM(
      CASE
        WHEN im.tipo_movimiento IN ('ENTRADA', 'AJUSTE_POS', 'DEVOLUCION') THEN im.cantidad
        WHEN im.tipo_movimiento IN ('SALIDA', 'AJUSTE_NEG', 'VENTA') THEN -im.cantidad
        ELSE 0
      END
    ), 0) AS stock_actual
  FROM productos p
  LEFT JOIN marcas m ON m.id_marca = p.id_marca
  LEFT JOIN categorias_producto c ON c.id_categoria = p.id_categoria
  LEFT JOIN inventario_movimientos im ON im.id_producto = p.id_producto
  GROUP BY p.id_producto
  ORDER BY p.nombre ASC, p.id_producto ASC
`

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function localDateParts() {
  const date = new Date()

  return {
    year: date.getFullYear(),
    month: padDatePart(date.getMonth() + 1),
    day: padDatePart(date.getDate()),
    hours: padDatePart(date.getHours()),
    minutes: padDatePart(date.getMinutes()),
    seconds: padDatePart(date.getSeconds()),
  }
}

function nowSql() {
  const date = localDateParts()

  return `${date.year}-${date.month}-${date.day} ${date.hours}:${date.minutes}:${date.seconds}`
}

function todaySql() {
  const { year, month, day } = localDateParts()

  return `${day}-${month}-${year}`
}

function toNumber(value: unknown) {
  return Number(value ?? 0)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function assertRequiredText(value: string | null | undefined, fieldName: string) {
  if (!normalizeText(value)) {
    throw new Error(`${fieldName} es obligatorio.`)
  }
}

function assertRequiredId(value: unknown, fieldName: string) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`Selecciona ${fieldName}.`)
  }
}

function assertFiniteNumber(value: unknown, fieldName: string) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`${fieldName} debe ser un numero valido.`)
  }
}

function assertPositiveNumber(value: unknown, fieldName: string) {
  assertFiniteNumber(value, fieldName)

  if (Number(value) <= 0) {
    throw new Error(`${fieldName} debe ser mayor que cero.`)
  }
}

function assertNonNegativeNumber(value: unknown, fieldName: string) {
  assertFiniteNumber(value, fieldName)

  if (Number(value) < 0) {
    throw new Error(`${fieldName} no puede ser negativo.`)
  }
}

function getNextId(database: Database.Database, tableName: string, columnName: string) {
  const result = database.prepare(`SELECT COALESCE(MAX(${columnName}), 0) + 1 AS next_id FROM ${tableName}`).get() as {
    next_id: number
  }

  return Number(result.next_id)
}

function assertAttendanceWorkerScope(database: Database.Database, workerId: number) {
  const access = getCurrentUserAccess(database)
  const currentWorkerId = getCurrentWorkerId()

  if (!access.canViewAllAttendance && workerId !== currentWorkerId) {
    throw new Error('Solo puedes registrar asistencias de tu propio usuario.')
  }
}

function movementDirection(typeMovimiento: string) {
  switch (typeMovimiento.toUpperCase()) {
    case 'ENTRADA':
    case 'AJUSTE_POS':
    case 'DEVOLUCION':
      return 1
    case 'SALIDA':
    case 'AJUSTE_NEG':
    case 'VENTA':
      return -1
    default:
      return 0
  }
}

function mapReferenceItem(row: { id: number; nombre: string; descripcion: string | null }): ReferenceItem {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    descripcion: row.descripcion,
  }
}

export function getReferenceData(database: Database.Database, workerScopeId?: number | null) {
  const marcas = database.prepare('SELECT id_marca AS id, nombre, descripcion FROM marcas ORDER BY nombre ASC').all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const categorias = database.prepare(
    'SELECT id_categoria AS id, nombre, descripcion FROM categorias_producto ORDER BY nombre ASC',
  ).all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const monedas = database.prepare("SELECT id_moneda AS id, codigo || ' - ' || nombre AS nombre, simbolo AS descripcion FROM monedas ORDER BY codigo ASC").all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const metodosPago = database.prepare('SELECT id_metodo AS id, nombre, NULL AS descripcion FROM metodos_pago WHERE estado = 1 ORDER BY nombre ASC').all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const clientes = database.prepare("SELECT id_cliente AS id, nombre || CASE WHEN documento IS NOT NULL AND documento <> '' THEN ' · CI ' || documento ELSE '' END AS nombre, telefono AS descripcion FROM clientes ORDER BY nombre ASC").all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const workerFilter = typeof workerScopeId === 'number' ? 'AND id_trabajador = ?' : ''
  const workerParams = typeof workerScopeId === 'number' ? [workerScopeId] : []
  const trabajadores = database
    .prepare(
      `
      SELECT
        id_trabajador,
        id_usuario,
        cedula,
        nombres,
        apellidos,
        nombres || ' ' || apellidos AS nombre_completo,
        cargo,
        salario_base,
        estado,
        creado_en
      FROM trabajadores
      WHERE estado = 'activo' ${workerFilter}
      ORDER BY nombres ASC, apellidos ASC
    `,
    )
    .all(...workerParams) as WorkerRow[]

  const turnos = database
    .prepare(
      `
      SELECT id_turno, nombre, hora_inicio, hora_fin, descripcion
      FROM turnos
      WHERE estado = 1
      ORDER BY hora_inicio ASC, id_turno ASC
    `,
    )
    .all() as ShiftRow[]

  const tiposCambio = database.prepare(`
    SELECT id_moneda, valor
    FROM tipo_cambio tc
    WHERE registrado_en = (
      SELECT MAX(registrado_en) FROM tipo_cambio WHERE id_moneda = tc.id_moneda
    )
  `).all() as Array<{
    id_moneda: number
    valor: number
  }>

  return {
    marcas: marcas.map(mapReferenceItem),
    categorias: categorias.map(mapReferenceItem),
    monedas: monedas.map(mapReferenceItem),
    metodosPago: metodosPago.map(mapReferenceItem),
    clientes: clientes.map(mapReferenceItem),
    trabajadores,
    turnos,
    tiposCambio,
  }
}

export function listProducts(database: Database.Database): ProductRow[] {
  return database.prepare(PRODUCT_STOCK_QUERY).all() as ProductRow[]
}

export function listMovements(database: Database.Database): MovementRow[] {
  return database
    .prepare(
      `
      SELECT
        im.id_movimiento,
        im.id_producto,
        p.nombre AS producto_nombre,
        p.codigo AS producto_codigo,
        im.tipo_movimiento,
        im.cantidad,
        im.costo_unitario,
        im.motivo,
        im.referencia,
        im.observacion,
        COALESCE(t.nombres || ' ' || t.apellidos, 'Sistema') AS realizado_por,
        im.fecha_movimiento
      FROM inventario_movimientos im
      INNER JOIN productos p ON p.id_producto = im.id_producto
      LEFT JOIN trabajadores t ON t.id_trabajador = im.realizado_por
      ORDER BY im.fecha_movimiento DESC, im.id_movimiento DESC
      LIMIT 50
    `,
    )
    .all() as MovementRow[]
}

export function listSales(database: Database.Database, sellerScopeId?: number | null): SaleRow[] {
  const sellerFilter = typeof sellerScopeId === 'number' ? 'WHERE v.id_vendedor = ?' : ''
  const params = typeof sellerScopeId === 'number' ? [sellerScopeId] : []

  return database
    .prepare(
      `
      SELECT
        v.id_venta,
        v.numero_factura,
        v.fecha_venta,
        COALESCE(c.nombre, 'Consumidor final') AS cliente_nombre,
        COALESCE(det.productos_diferentes, 0) AS productos_diferentes,
        COALESCE(det.cantidad_total, 0) AS cantidad_total,
        v.subtotal,
        v.descuento_total,
        v.total,
        COALESCE(pay.metodo_pago, 'Sin pago') AS metodo_pago,
        mo.codigo || COALESCE(' ' || mo.simbolo, '') AS moneda,
        v.estado
      FROM ventas v
      LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
      LEFT JOIN (
        SELECT
          id_venta,
          COUNT(*) AS productos_diferentes,
          SUM(cantidad) AS cantidad_total
        FROM venta_detalles
        GROUP BY id_venta
      ) det ON det.id_venta = v.id_venta
      LEFT JOIN (
        SELECT
          pv.id_venta,
          MIN(mp.nombre) AS metodo_pago
        FROM pagos_venta pv
        INNER JOIN metodos_pago mp ON mp.id_metodo = pv.id_metodo_pago
        GROUP BY pv.id_venta
      ) pay ON pay.id_venta = v.id_venta
      INNER JOIN monedas mo ON mo.id_moneda = v.id_moneda
      ${sellerFilter}
      ORDER BY v.fecha_venta DESC, v.id_venta DESC
      LIMIT 50
    `,
    )
    .all(...params) as SaleRow[]
}

export function saveClient(database: Database.Database, input: ClientFormInput) {
  requirePermission(database, 'REGISTRAR_VENTAS')

  const nombre = normalizeText(input.nombre)
  const documento = normalizeText(input.documento)
  const telefono = normalizeText(input.telefono)
  const email = normalizeText(input.email)?.toLowerCase() ?? null
  const direccion = normalizeText(input.direccion)

  assertRequiredText(nombre, 'El nombre o apellido')
  assertRequiredText(documento, 'El CI')

  if (nombre!.length > 150) {
    throw new Error('El nombre del cliente no puede superar 150 caracteres.')
  }
  if (documento!.length < 4 || documento!.length > 50) {
    throw new Error('El CI debe tener entre 4 y 50 caracteres.')
  }
  if (telefono && telefono.length > 30) {
    throw new Error('El telefono no puede superar 30 caracteres.')
  }
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)) {
    throw new Error('Ingresa un correo electronico valido.')
  }
  if (direccion && direccion.length > 255) {
    throw new Error('La direccion no puede superar 255 caracteres.')
  }

  const clientId = Number(input.id_cliente ?? 0)
  const existing = database
    .prepare('SELECT id_cliente FROM clientes WHERE LOWER(TRIM(documento)) = LOWER(TRIM(?)) AND id_cliente <> ?')
    .get(documento, clientId) as { id_cliente: number } | undefined

  if (existing) {
    throw new Error('Ya existe un cliente registrado con ese CI.')
  }

  if (clientId > 0) {
    const client = database.prepare('SELECT id_cliente FROM clientes WHERE id_cliente = ?').get(clientId)
    if (!client) {
      throw new Error('El cliente que intentas editar ya no existe.')
    }

    database.prepare(`
      UPDATE clientes
      SET nombre = ?, documento = ?, telefono = ?, direccion = ?, email = ?
      WHERE id_cliente = ?
    `).run(nombre, documento, telefono, direccion, email, clientId)

    return { clientId }
  }

  const newClientId = getNextId(database, 'clientes', 'id_cliente')
  database.prepare(`
    INSERT INTO clientes (id_cliente, nombre, documento, telefono, direccion, email, creado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(newClientId, nombre, documento, telefono, direccion, email, nowSql())

  return { clientId: newClientId }
}

export function listAttendances(database: Database.Database, workerScopeId?: number | null): AttendanceRow[] {
  const conditions = ['(a.fecha = ? OR a.hora_salida IS NULL)']
  const params: Array<number | string> = [todaySql()]

  if (typeof workerScopeId === 'number') {
    conditions.push('a.id_trabajador = ?')
    params.push(workerScopeId)
  }

  const attendanceFilter = `WHERE ${conditions.join(' AND ')}`

  return database
    .prepare(
      `
      SELECT
        a.id_asistencia,
        a.id_trabajador,
        t.nombres || ' ' || t.apellidos AS trabajador_nombre,
        a.id_turno,
        tu.nombre AS turno_nombre,
        a.fecha,
        a.hora_entrada,
        a.hora_salida,
        a.observacion,
        CASE WHEN a.hora_salida IS NULL THEN 'EN_TURNO' ELSE 'COMPLETADO' END AS estado
      FROM asistencias a
      INNER JOIN trabajadores t ON t.id_trabajador = a.id_trabajador
      INNER JOIN turnos tu ON tu.id_turno = a.id_turno
      ${attendanceFilter}
      ORDER BY substr(a.fecha, 7, 4) || '-' || substr(a.fecha, 4, 2) || '-' || substr(a.fecha, 1, 2) DESC,
        COALESCE(a.hora_salida, a.hora_entrada) DESC,
        a.id_asistencia DESC
      LIMIT 40
    `,
    )
    .all(...params) as AttendanceRow[]
}

export function listWorkHoursSummary(database: Database.Database, workerScopeId?: number | null): WorkHoursSummaryRow[] {
  const workerFilter = typeof workerScopeId === 'number' ? 'AND t.id_trabajador = ?' : ''
  const params = typeof workerScopeId === 'number' ? [workerScopeId] : []

  return database
    .prepare(
      `
      SELECT
        t.id_trabajador,
        t.nombres || ' ' || t.apellidos AS trabajador_nombre,
        t.cargo,
        COUNT(a.id_asistencia) AS asistencias_completadas,
        COALESCE(SUM(
          CASE
            WHEN a.hora_entrada IS NOT NULL AND a.hora_salida IS NOT NULL
            THEN CAST((julianday(a.hora_salida) - julianday(a.hora_entrada)) * 24 * 60 AS INTEGER)
            ELSE 0
          END
        ), 0) AS minutos_trabajados,
        ROUND(COALESCE(SUM(
          CASE
            WHEN a.hora_entrada IS NOT NULL AND a.hora_salida IS NOT NULL
            THEN (julianday(a.hora_salida) - julianday(a.hora_entrada)) * 24
            ELSE 0
          END
        ), 0), 2) AS horas_trabajadas
      FROM trabajadores t
      LEFT JOIN asistencias a ON a.id_trabajador = t.id_trabajador AND a.hora_salida IS NOT NULL
      WHERE t.estado = 'activo' ${workerFilter}
      GROUP BY t.id_trabajador
      ORDER BY horas_trabajadas DESC, trabajador_nombre ASC
    `,
    )
    .all(...params) as WorkHoursSummaryRow[]
}

export function listShiftHistory(database: Database.Database, workerScopeId?: number | null): ShiftHistoryRow[] {
  const workerFilter = typeof workerScopeId === 'number' ? 'WHERE a.id_trabajador = ?' : ''
  const params = typeof workerScopeId === 'number' ? [workerScopeId] : []

  return database
    .prepare(
      `
      SELECT
        a.id_asistencia,
        a.id_trabajador,
        t.nombres || ' ' || t.apellidos AS trabajador_nombre,
        t.cargo,
        tu.nombre AS turno_nombre,
        a.fecha,
        a.hora_entrada,
        a.hora_salida,
        CASE WHEN a.hora_salida IS NULL THEN 'EN_TURNO' ELSE 'COMPLETADO' END AS estado
      FROM asistencias a
      INNER JOIN trabajadores t ON t.id_trabajador = a.id_trabajador
      INNER JOIN turnos tu ON tu.id_turno = a.id_turno
      ${workerFilter}
      ORDER BY substr(a.fecha, 7, 4) || '-' || substr(a.fecha, 4, 2) || '-' || substr(a.fecha, 1, 2) DESC,
        COALESCE(a.hora_salida, a.hora_entrada) DESC,
        a.id_asistencia DESC
      LIMIT 120
    `,
    )
    .all(...params) as ShiftHistoryRow[]
}

export function listShiftRotationSummary(database: Database.Database, workerScopeId?: number | null): ShiftRotationSummaryRow[] {
  const workerFilter = typeof workerScopeId === 'number' ? 'AND t.id_trabajador = ?' : ''
  const params = typeof workerScopeId === 'number' ? [workerScopeId] : []

  return database
    .prepare(
      `
      WITH attendance_order AS (
        SELECT
          a.id_trabajador,
          tu.nombre AS turno_nombre,
          a.fecha,
          ROW_NUMBER() OVER (
            PARTITION BY a.id_trabajador
            ORDER BY substr(a.fecha, 7, 4) || '-' || substr(a.fecha, 4, 2) || '-' || substr(a.fecha, 1, 2) DESC,
              COALESCE(a.hora_salida, a.hora_entrada) DESC,
              a.id_asistencia DESC
          ) AS row_number
        FROM asistencias a
        INNER JOIN turnos tu ON tu.id_turno = a.id_turno
      )
      SELECT
        t.id_trabajador,
        t.nombres || ' ' || t.apellidos AS trabajador_nombre,
        t.cargo,
        COALESCE(SUM(CASE WHEN lower(tu.nombre) LIKE '%ma%' OR tu.hora_inicio < '12:00' THEN 1 ELSE 0 END), 0) AS turnos_manana,
        COALESCE(SUM(CASE WHEN lower(tu.nombre) LIKE '%tarde%' THEN 1 ELSE 0 END), 0) AS turnos_tarde,
        COALESCE(SUM(CASE WHEN lower(tu.nombre) LIKE '%noche%' THEN 1 ELSE 0 END), 0) AS turnos_noche,
        COUNT(a.id_asistencia) AS total_turnos,
        latest.turno_nombre AS ultimo_turno,
        latest.fecha AS ultima_fecha
      FROM trabajadores t
      LEFT JOIN asistencias a ON a.id_trabajador = t.id_trabajador
      LEFT JOIN turnos tu ON tu.id_turno = a.id_turno
      LEFT JOIN attendance_order latest ON latest.id_trabajador = t.id_trabajador AND latest.row_number = 1
      WHERE t.estado = 'activo' ${workerFilter}
      GROUP BY t.id_trabajador
      ORDER BY total_turnos DESC, trabajador_nombre ASC
    `,
    )
    .all(...params) as ShiftRotationSummaryRow[]
}

export function getBootstrapData(database: Database.Database): BootstrapData {
  const access = getCurrentUserAccess(database)
  const canManageRoles = hasPermission(database, 'GESTIONAR_ROLES')
  const canManageWorkers = hasPermission(database, 'GESTIONAR_TRABAJADORES')
  const canManageShifts = hasPermission(database, 'GESTIONAR_TURNOS')
  const canAccessInventoryData =
    hasPermission(database, 'VER_INVENTARIO') ||
    hasPermission(database, 'REGISTRAR_MOVIMIENTOS') ||
    hasPermission(database, 'REGISTRAR_VENTAS') ||
    hasPermission(database, 'GESTIONAR_INVENTARIO')
  const canAccessAttendanceData = hasPermission(database, 'VER_ASISTENCIAS') || hasPermission(database, 'REGISTRAR_ASISTENCIAS')
  const attendanceWorkerScope = access.canViewAllAttendance ? null : getCurrentWorkerId() ?? -1

  const products = canAccessInventoryData ? listProducts(database) : []
  const movements = hasPermission(database, 'VER_MOVIMIENTOS') ? listMovements(database) : []
  const canViewAllSales = access.isAdminLike || access.permissionNames.includes('VER_VENTAS')
  const canAccessSales = canViewAllSales || access.permissionNames.includes('REGISTRAR_VENTAS')
  const sales = canAccessSales
    ? listSales(database, canViewAllSales ? null : getCurrentWorkerId() ?? -1)
    : []
  const salesMetricFilter = canViewAllSales ? '' : 'WHERE id_vendedor = ?'
  const salesMetricParams = canViewAllSales ? [] : [getCurrentWorkerId() ?? -1]
  const salesMetrics = canAccessSales
    ? (database.prepare(`
        SELECT COUNT(*) AS total_sales, COALESCE(SUM(total), 0) AS total_amount
        FROM ventas
        ${salesMetricFilter}
      `).get(...salesMetricParams) as { total_sales: number; total_amount: number })
    : { total_sales: 0, total_amount: 0 }
  const clients = hasPermission(database, 'REGISTRAR_VENTAS')
    ? (database.prepare(`
        SELECT id_cliente, nombre, COALESCE(documento, '') AS documento, telefono, email, direccion, creado_en
        FROM clientes
        ORDER BY nombre ASC, id_cliente ASC
      `).all() as ClientRow[])
    : []
  const attendances = canAccessAttendanceData ? listAttendances(database, attendanceWorkerScope) : []
  const workHoursSummary = canAccessAttendanceData && access.canViewAllAttendance ? listWorkHoursSummary(database) : []
  const shiftHistory = canAccessAttendanceData ? listShiftHistory(database, attendanceWorkerScope) : []
  const shiftRotationSummary = canAccessAttendanceData && access.canViewAllAttendance ? listShiftRotationSummary(database) : []
  const references = getReferenceData(database, access.canViewAllAttendance ? null : attendanceWorkerScope)

  const rolesData = canManageRoles
    ? (database.prepare('SELECT id_rol, nombre, descripcion, estado, creado_en FROM roles ORDER BY id_rol ASC').all() as RoleRow[])
    : []
  const rolPermisos = database.prepare('SELECT id_rol, id_permiso FROM rol_permiso').all() as {id_rol: number, id_permiso: number}[]
  const roles = rolesData.map(role => ({
    ...role,
    permisos: rolPermisos.filter(rp => rp.id_rol === role.id_rol).map(rp => rp.id_permiso)
  }))

  const workerAdminFilter = canManageWorkers ? '' : 'WHERE t.id_trabajador = ?'
  const workerAdminParams = canManageWorkers ? [] : [getCurrentWorkerId() ?? -1]
  const workers = database.prepare(`
    SELECT t.id_trabajador, t.id_usuario, t.cedula, t.nombres, t.apellidos, t.cargo, t.salario_base, t.estado, t.creado_en, ur.id_rol 
    FROM trabajadores t
    LEFT JOIN usuario_rol ur ON ur.id_usuario = t.id_usuario
    ${workerAdminFilter}
    ORDER BY t.nombres ASC
  `).all(...workerAdminParams) as WorkerRow[]
  const auditLogs = access.isAdminLike ? database.prepare(`
    SELECT l.id_log, COALESCE(u.username, 'Sistema') AS usuario, l.accion, l.modulo, l.descripcion, l.fecha_evento 
    FROM auditoria_logs l 
    LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario 
    ORDER BY l.fecha_evento DESC LIMIT 50
  `).all() as AuditLogRow[] : []
  
  const permissions = canManageRoles
    ? (database.prepare('SELECT id_permiso, nombre, descripcion, modulo, creado_en FROM permisos ORDER BY modulo ASC, nombre ASC').all() as PermissionRow[])
    : []
  const shifts = canManageShifts
    ? (database
        .prepare(`
          SELECT
            tu.id_turno,
            tu.nombre,
            tu.hora_inicio,
            tu.hora_fin,
            tu.descripcion,
            tu.estado,
            (
              (SELECT COUNT(*) FROM asistencias a WHERE a.id_turno = tu.id_turno) +
              (SELECT COUNT(*) FROM historial_turnos ht WHERE ht.id_turno = tu.id_turno) +
              (SELECT COUNT(*) FROM ventas v WHERE v.id_turno = tu.id_turno)
            ) AS registros_asociados
          FROM turnos tu
          ORDER BY tu.hora_inicio ASC, tu.nombre ASC
        `)
        .all() as ShiftRow[])
    : []

  const totalStock = products.reduce((sum, product) => sum + toNumber(product.stock_actual), 0)
  const lowStockProducts = products.filter((product) => toNumber(product.stock_actual) <= toNumber(product.stock_minimo)).length

  return {
    references,
    metrics: {
      totalProducts: products.length,
      totalStock,
      lowStockProducts,
      totalMovements: movements.length,
      totalSales: Number(salesMetrics.total_sales),
      totalSalesAmount: Number(salesMetrics.total_amount),
      activeAttendances: attendances.filter((attendance) => attendance.estado === 'EN_TURNO').length,
    },
    products,
    movements,
    sales,
    clients,
    attendances,
    workHoursSummary,
    shiftHistory,
    shiftRotationSummary,
    shifts,
    roles,
    workers,
    auditLogs,
    permissions,
  }
}

export function registerAttendanceEntry(database: Database.Database, input: AttendanceFormInput) {
  requirePermission(database, 'REGISTRAR_ASISTENCIAS')

  const transaction = database.transaction((payload: AttendanceFormInput) => {
    assertRequiredId(payload.id_trabajador, 'un trabajador')
    assertRequiredId(payload.id_turno, 'un turno')
    assertAttendanceWorkerScope(database, Number(payload.id_trabajador))

    const worker = database
      .prepare("SELECT id_trabajador FROM trabajadores WHERE id_trabajador = ? AND estado = 'activo'")
      .get(payload.id_trabajador) as { id_trabajador: number } | undefined

    if (!worker) {
      throw new Error('El trabajador seleccionado no existe o no esta activo.')
    }

    const shift = database.prepare('SELECT id_turno FROM turnos WHERE id_turno = ? AND estado = 1').get(payload.id_turno) as
      | { id_turno: number }
      | undefined

    if (!shift) {
      throw new Error('Selecciona un turno activo.')
    }

    const openAttendance = getOpenAttendance(database, payload.id_trabajador)

    if (openAttendance) {
      throw new Error('Este trabajador ya tiene una entrada abierta. Registra su salida antes de iniciar otro turno.')
    }

    const attendanceId = getNextId(database, 'asistencias', 'id_asistencia')
    const timestamp = nowSql()

    database
      .prepare(
        `
        INSERT INTO asistencias (
          id_asistencia, id_trabajador, id_turno, fecha, hora_entrada, hora_salida, observacion, registrado_por
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      )
      .run(
        attendanceId,
        payload.id_trabajador,
        payload.id_turno,
        todaySql(),
        timestamp,
        normalizeText(payload.observacion),
        payload.id_trabajador,
      )

    return attendanceId
  })

  return {
    attendanceId: transaction(input),
  }
}

export function registerAttendanceExit(database: Database.Database, input: AttendanceFormInput) {
  requirePermission(database, 'REGISTRAR_ASISTENCIAS')

  const transaction = database.transaction((payload: AttendanceFormInput) => {
    assertRequiredId(payload.id_trabajador, 'un trabajador')
    assertAttendanceWorkerScope(database, Number(payload.id_trabajador))

    const openAttendance = getOpenAttendance(database, payload.id_trabajador)

    if (!openAttendance) {
      throw new Error('Este trabajador no tiene una entrada abierta.')
    }

    const exitTime = nowSql()
    const note = normalizeText(payload.observacion)
    const nextObservation = [openAttendance.observacion, note ? `Salida: ${note}` : null].filter(Boolean).join(' | ') || null

    database
      .prepare(
        `
        UPDATE asistencias
        SET hora_salida = ?, observacion = ?, registrado_por = ?
        WHERE id_asistencia = ?
      `,
      )
      .run(exitTime, nextObservation, payload.id_trabajador, openAttendance.id_asistencia)

    return openAttendance.id_asistencia
  })

  return {
    attendanceId: transaction(input),
  }
}

export function saveProduct(database: Database.Database, input: ProductFormInput) {
  requirePermission(database, 'GESTIONAR_INVENTARIO')

  const transaction = database.transaction((payload: ProductFormInput) => {
    assertRequiredText(payload.codigo, 'El codigo')
    assertRequiredText(payload.nombre, 'El nombre del producto')
    assertRequiredText(payload.unidad_medida, 'La unidad de medida')
    assertRequiredId(payload.id_marca, 'una marca')
    if (payload.id_categoria !== null && payload.id_categoria !== undefined) {
      assertRequiredId(payload.id_categoria, 'una categoria')
    }
    assertNonNegativeNumber(payload.precio_costo, 'El precio costo')
    assertNonNegativeNumber(payload.precio_venta, 'El precio venta')
    assertNonNegativeNumber(payload.stock_minimo, 'El stock minimo')
    assertNonNegativeNumber(payload.stock_inicial, 'El stock inicial')

    const isEdit = Boolean(payload.id_producto)
    const productId = isEdit ? Number(payload.id_producto) : getNextId(database, 'productos', 'id_producto')
    const timestamp = nowSql()

    if (isEdit) {
      database
        .prepare(
          `
          UPDATE productos
          SET codigo = ?, codigo_barra = ?, nombre = ?, id_marca = ?, id_categoria = ?, descripcion = ?,
              precio_costo = ?, precio_venta = ?, stock_minimo = ?, unidad_medida = ?, estado = ?, actualizado_en = ?
          WHERE id_producto = ?
        `,
        )
        .run(
          payload.codigo.trim(),
          normalizeText(payload.codigo_barra),
          payload.nombre.trim(),
          payload.id_marca,
          payload.id_categoria ?? null,
          normalizeText(payload.descripcion),
          payload.precio_costo,
          payload.precio_venta,
          payload.stock_minimo,
          payload.unidad_medida.trim(),
          payload.estado ? 1 : 0,
          timestamp,
          productId,
        )
    } else {
      database
        .prepare(
          `
          INSERT INTO productos (
            id_producto, codigo, codigo_barra, nombre, id_marca, id_categoria, descripcion,
            precio_costo, precio_venta, stock_minimo, unidad_medida, estado, creado_en, actualizado_en
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `,
        )
        .run(
          productId,
          payload.codigo.trim(),
          normalizeText(payload.codigo_barra),
          payload.nombre.trim(),
          payload.id_marca,
          payload.id_categoria ?? null,
          normalizeText(payload.descripcion),
          payload.precio_costo,
          payload.precio_venta,
          payload.stock_minimo,
          payload.unidad_medida.trim(),
          payload.estado ? 1 : 0,
          timestamp,
        )

      if (payload.stock_inicial > 0) {
        const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')

        database
          .prepare(
            `
            INSERT INTO inventario_movimientos (
              id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
              referencia, observacion, realizado_por, fecha_movimiento
            ) VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            movementId,
            productId,
            payload.stock_inicial,
            payload.precio_costo,
            'Stock inicial',
            `PRODUCTO-${productId}`,
            'Apertura inicial de inventario',
            SYSTEM_USER_ID,
            timestamp,
          )
      }
    }

    return productId
  })

  return {
    productId: transaction(input),
  }
}

export function createMovement(database: Database.Database, input: MovementFormInput) {
  requirePermission(database, 'REGISTRAR_MOVIMIENTOS')

  const transaction = database.transaction((payload: MovementFormInput) => {
    assertRequiredId(payload.id_producto, 'un producto')
    assertPositiveNumber(payload.cantidad, 'La cantidad')
    if (payload.costo_unitario !== null && payload.costo_unitario !== undefined) {
      assertNonNegativeNumber(payload.costo_unitario, 'El costo unitario')
    }

    const product = database.prepare('SELECT id_producto FROM productos WHERE id_producto = ?').get(payload.id_producto) as
      | { id_producto: number }
      | undefined

    if (!product) {
      throw new Error('El producto seleccionado no existe.')
    }

    const direction = movementDirection(payload.tipo_movimiento)

    if (direction === 0) {
      throw new Error('Tipo de movimiento no soportado.')
    }

    const currentStock = getProductStock(database, payload.id_producto)
    const nextStock = currentStock + direction * payload.cantidad

    if (nextStock < 0) {
      throw new Error('El movimiento dejaría el stock en negativo.')
    }

    const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')
    const timestamp = nowSql()

    database
      .prepare(
        `
        INSERT INTO inventario_movimientos (
          id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
          referencia, observacion, realizado_por, fecha_movimiento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        movementId,
        payload.id_producto,
        payload.tipo_movimiento.trim().toUpperCase(),
        payload.cantidad,
        payload.costo_unitario ?? null,
        normalizeText(payload.motivo),
        normalizeText(payload.referencia),
        normalizeText(payload.observacion),
        payload.realizado_por ?? SYSTEM_USER_ID,
        timestamp,
      )

    return movementId
  })

  return {
    movementId: transaction(input),
  }
}

function getCurrencyRate(database: Database.Database, idMoneda: number): number {
  const currency = database.prepare('SELECT codigo FROM monedas WHERE id_moneda = ?').get(idMoneda) as { codigo: string } | undefined
  if (!currency || currency.codigo === 'BOB') return 1

  const rate = database
    .prepare(
      `
      SELECT valor FROM tipo_cambio
      WHERE id_moneda = ?
      ORDER BY registrado_en DESC
      LIMIT 1
    `,
    )
    .get(idMoneda) as { valor: number } | undefined

  return rate ? Number(rate.valor) : 1
}

export function createSale(database: Database.Database, input: SaleFormInput) {
  requirePermission(database, 'REGISTRAR_VENTAS')

  const transaction = database.transaction((payload: SaleFormInput) => {
    if (!payload.detalles.length) {
      throw new Error('La venta debe tener al menos un producto.')
    }

    if (!payload.pagos || payload.pagos.length === 0) {
      throw new Error('Debe registrar al menos un pago.')
    }

    const vendedor = database.prepare('SELECT id_trabajador FROM trabajadores WHERE id_trabajador = ?').get(payload.id_vendedor)
    if (!vendedor) {
      throw new Error('El vendedor especificado no existe.')
    }

    const access = getCurrentUserAccess(database)
    const currentWorkerId = getCurrentWorkerId()
    if (!access.isAdminLike && payload.id_vendedor !== currentWorkerId) {
      throw new Error('Solo puedes registrar ventas a nombre de tu propio usuario.')
    }

    const activeAttendance = database.prepare(`
      SELECT a.id_turno
      FROM asistencias a
      INNER JOIN turnos t ON t.id_turno = a.id_turno
      WHERE a.id_trabajador = ? AND a.hora_salida IS NULL AND t.estado = 1
      ORDER BY a.hora_entrada DESC, a.id_asistencia DESC
      LIMIT 1
    `).get(payload.id_vendedor) as { id_turno: number } | undefined

    if (!activeAttendance && !access.isAdminLike) {
      throw new Error('El vendedor debe registrar su entrada antes de realizar una venta.')
    }

    const saleShiftId = activeAttendance ? Number(activeAttendance.id_turno) : null

    if (payload.id_cliente !== null) {
      const cliente = database.prepare('SELECT id_cliente FROM clientes WHERE id_cliente = ?').get(payload.id_cliente)
      if (!cliente) {
        throw new Error('El cliente especificado no existe.')
      }
    }

    const currency = database.prepare('SELECT id_moneda FROM monedas WHERE id_moneda = ?').get(payload.id_moneda) as { id_moneda: number } | undefined
    if (!currency) {
      throw new Error('La moneda seleccionada no existe.')
    }

    const normalizedDetails = new Map<number, { cantidad: number; descuento_unitario: number; id_descuento: number | null }>()
    payload.detalles.forEach((detail) => {
      const productId = Number(detail.id_producto)
      const quantity = Number(detail.cantidad)
      const descUnit = Number(detail.descuento_unitario ?? 0)

      if (!Number.isFinite(productId) || productId <= 0) {
        throw new Error('La venta contiene un producto invalido.')
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Todas las cantidades deben ser mayores que cero.')
      }

      if (!Number.isFinite(descUnit) || descUnit < 0) {
        throw new Error('El descuento unitario no puede ser negativo.')
      }

      const current = normalizedDetails.get(productId)
      normalizedDetails.set(productId, {
        cantidad: roundMoney((current?.cantidad ?? 0) + quantity),
        descuento_unitario: descUnit,
        id_descuento: detail.id_descuento ?? null,
      })
    })

    type SaleLine = {
      id_producto: number
      nombre: string
      cantidad: number
      precio_costo: number
      precio_venta: number
      descuento_unitario: number
      subtotal_linea: number
      total_linea: number
      id_descuento: number | null
    }

    const lines: SaleLine[] = []
    normalizedDetails.forEach((info, productId) => {
      const product = database
        .prepare('SELECT id_producto, nombre, precio_costo, precio_venta, estado FROM productos WHERE id_producto = ?')
        .get(productId) as
        | { id_producto: number; nombre: string; precio_costo: number; precio_venta: number; estado: number | boolean }
        | undefined

      if (!product) {
        throw new Error(`El producto con ID ${productId} no existe.`)
      }

      if (!product.estado) {
        throw new Error(`El producto ${product.nombre} esta inactivo.`)
      }

      const stockActual = getProductStock(database, productId)
      if (stockActual < info.cantidad) {
        throw new Error(`No hay suficiente stock para ${product.nombre}. Disponible: ${stockActual}.`)
      }

      const subtotalLine = roundMoney(Number(product.precio_venta) * info.cantidad)
      const discountLine = roundMoney(info.descuento_unitario * info.cantidad)
      if (discountLine > subtotalLine) {
        throw new Error(`El descuento del producto ${product.nombre} no puede ser mayor que su subtotal.`)
      }

      lines.push({
        id_producto: product.id_producto,
        nombre: product.nombre,
        cantidad: info.cantidad,
        precio_costo: Number(product.precio_costo),
        precio_venta: Number(product.precio_venta),
        descuento_unitario: info.descuento_unitario,
        subtotal_linea: subtotalLine,
        total_linea: roundMoney(subtotalLine - discountLine),
        id_descuento: info.id_descuento,
      })
    })

    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal_linea, 0))
    const discountTotal = roundMoney(lines.reduce((sum, line) => sum + line.descuento_unitario * line.cantidad, 0))
    const total = roundMoney(subtotal - discountTotal)

    let totalPagadoInSaleCurrency = 0
    const paymentsWithSaleValue = payload.pagos.map((pago) => {
      assertRequiredId(pago.id_metodo_pago, 'un metodo de pago')
      assertRequiredId(pago.id_moneda, 'una moneda de pago')
      assertPositiveNumber(pago.monto, 'El monto del pago')

      const paymentMethod = database.prepare('SELECT id_metodo FROM metodos_pago WHERE id_metodo = ? AND estado = 1').get(pago.id_metodo_pago)
      if (!paymentMethod) {
        throw new Error('Uno de los metodos de pago no existe o esta inactivo.')
      }

      const paymentCurrency = database.prepare('SELECT id_moneda FROM monedas WHERE id_moneda = ?').get(pago.id_moneda)
      if (!paymentCurrency) {
        throw new Error('Una de las monedas de pago no existe.')
      }

      const rateP = getCurrencyRate(database, pago.id_moneda)
      const rateS = payload.tasa_cambio_aplicada || getCurrencyRate(database, payload.id_moneda)
      const montoInSaleCurrency = roundMoney((pago.monto * rateP) / rateS)
      totalPagadoInSaleCurrency = roundMoney(totalPagadoInSaleCurrency + montoInSaleCurrency)

      return {
        ...pago,
        montoInSaleCurrency,
        rateP,
      }
    })

    let estado = 'COMPLETADA'
    if (totalPagadoInSaleCurrency < total) {
      estado = 'PENDIENTE'
    } else if (totalPagadoInSaleCurrency > total) {
      const vueltoInSaleCurrency = roundMoney(totalPagadoInSaleCurrency - total)
      const cashMethod = database.prepare("SELECT id_metodo FROM metodos_pago WHERE LOWER(nombre) LIKE '%efectivo%'").get() as
        | { id_metodo: number }
        | undefined
      const cashPaymentIdx = paymentsWithSaleValue.findIndex((pago) => cashMethod && pago.id_metodo_pago === cashMethod.id_metodo)
      const targetPayment = paymentsWithSaleValue[cashPaymentIdx !== -1 ? cashPaymentIdx : 0]
      const rateS = payload.tasa_cambio_aplicada || getCurrencyRate(database, payload.id_moneda)
      const vueltoInPaymentCurrency = roundMoney((vueltoInSaleCurrency * rateS) / targetPayment.rateP)

      targetPayment.monto = roundMoney(targetPayment.monto - vueltoInPaymentCurrency)
      targetPayment.montoInSaleCurrency = roundMoney(targetPayment.montoInSaleCurrency - vueltoInSaleCurrency)
    }

    const saleId = getNextId(database, 'ventas', 'id_venta')
    const timestamp = nowSql()
    const invoiceNumber = `FAC-${String(new Date().getFullYear()).slice(-2)}-${String(saleId).padStart(5, '0')}`

    database
      .prepare(
        `
        INSERT INTO ventas (
          id_venta, numero_factura, fecha_venta, id_cliente, id_vendedor, id_turno,
          subtotal, descuento_total, total, id_moneda, tasa_cambio_aplicada, observacion, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        saleId,
        invoiceNumber,
        timestamp,
        payload.id_cliente,
        payload.id_vendedor,
        saleShiftId,
        subtotal,
        discountTotal,
        total,
        payload.id_moneda,
        payload.tasa_cambio_aplicada,
        normalizeText(payload.observacion),
        estado,
      )

    lines.forEach((line) => {
      const detailId = getNextId(database, 'venta_detalles', 'id_venta_detalle')
      const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')

      database
        .prepare(
          `
          INSERT INTO venta_detalles (
            id_venta_detalle, id_venta, id_producto, cantidad, precio_unitario, precio_costo_unitario,
            descuento_unitario, subtotal_linea, total_linea, id_descuento
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          detailId,
          saleId,
          line.id_producto,
          line.cantidad,
          line.precio_venta,
          line.precio_costo,
          line.descuento_unitario,
          line.subtotal_linea,
          line.total_linea,
          line.id_descuento,
        )

      database
        .prepare(
          `
          INSERT INTO inventario_movimientos (
            id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
            referencia, observacion, realizado_por, fecha_movimiento
          ) VALUES (?, ?, 'VENTA', ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          movementId,
          line.id_producto,
          line.cantidad,
          line.precio_costo,
          'Venta registrada',
          invoiceNumber,
          normalizeText(payload.observacion) ?? `Venta de ${line.nombre}`,
          payload.id_vendedor,
          timestamp,
        )
    })

    paymentsWithSaleValue.forEach((pago) => {
      if (pago.monto > 0) {
        const paymentId = getNextId(database, 'pagos_venta', 'id_pago_venta')
        database
          .prepare(
            `
            INSERT INTO pagos_venta (
              id_pago_venta, id_venta, id_metodo_pago, id_moneda, monto, referencia_pago, fecha_pago
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(paymentId, saleId, pago.id_metodo_pago, pago.id_moneda, pago.monto, normalizeText(pago.referencia_pago), timestamp)
      }
    })

    return saleId
  })

  return {
    saleId: transaction(input),
  }
}

export function getSaleDetail(database: Database.Database, saleId: number): SaleFullDetail {
  const sale = database
    .prepare(
      `
      SELECT
        v.id_venta,
        v.id_vendedor,
        v.numero_factura,
        v.fecha_venta,
        v.subtotal,
        v.descuento_total,
        v.total,
        v.tasa_cambio_aplicada AS tasa_cambio,
        v.observacion,
        v.estado,
        mo.codigo AS moneda_codigo,
        c.nombre AS cliente_nombre,
        c.documento AS cliente_documento,
        c.telefono AS cliente_telefono,
        t.nombres || ' ' || t.apellidos AS vendedor_nombre,
        tu.nombre AS turno_nombre
      FROM ventas v
      INNER JOIN monedas mo ON mo.id_moneda = v.id_moneda
      LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
      INNER JOIN trabajadores t ON t.id_trabajador = v.id_vendedor
      LEFT JOIN turnos tu ON tu.id_turno = v.id_turno
      WHERE v.id_venta = ?
    `,
    )
    .get(saleId) as
    | {
        id_venta: number
        id_vendedor: number
        numero_factura: string
        fecha_venta: string
        subtotal: number
        descuento_total: number
        total: number
        tasa_cambio: number
        observacion: string | null
        estado: string
        moneda_codigo: string
        cliente_nombre: string | null
        cliente_documento: string | null
        cliente_telefono: string | null
        vendedor_nombre: string
        turno_nombre: string | null
      }
    | undefined

  if (!sale) {
    throw new Error('La venta solicitada no existe.')
  }

  const access = getCurrentUserAccess(database)
  const canViewAllSales = access.isAdminLike || access.permissionNames.includes('VER_VENTAS')
  if (!canViewAllSales && sale.id_vendedor !== getCurrentWorkerId()) {
    throw new Error('No tienes permiso para consultar esta venta.')
  }

  const detalles = database
    .prepare(
      `
      SELECT
        vd.id_producto,
        p.codigo,
        p.nombre,
        vd.cantidad,
        vd.precio_unitario,
        vd.precio_costo_unitario,
        vd.descuento_unitario,
        vd.subtotal_linea,
        vd.total_linea
      FROM venta_detalles vd
      INNER JOIN productos p ON p.id_producto = vd.id_producto
      WHERE vd.id_venta = ?
    `,
    )
    .all(saleId) as SaleDetailRow[]

  const pagos = database
    .prepare(
      `
      SELECT
        mp.nombre AS metodo_pago,
        mo.codigo AS moneda_codigo,
        pv.monto,
        pv.referencia_pago
      FROM pagos_venta pv
      INNER JOIN metodos_pago mp ON mp.id_metodo = pv.id_metodo_pago
      INNER JOIN monedas mo ON mo.id_moneda = pv.id_moneda
      WHERE pv.id_venta = ?
    `,
    )
    .all(saleId) as SalePaymentRow[]

  const ganancia_total = roundMoney(
    detalles.reduce((sum, item) => sum + Number(item.total_linea) - Number(item.precio_costo_unitario) * Number(item.cantidad), 0),
  )

  return {
    id_venta: Number(sale.id_venta),
    numero_factura: sale.numero_factura,
    fecha_venta: sale.fecha_venta,
    cliente_nombre: sale.cliente_nombre,
    cliente_documento: sale.cliente_documento,
    cliente_telefono: sale.cliente_telefono,
    vendedor_nombre: sale.vendedor_nombre,
    turno_nombre: sale.turno_nombre,
    subtotal: Number(sale.subtotal),
    descuento_total: Number(sale.descuento_total),
    total: Number(sale.total),
    moneda_codigo: sale.moneda_codigo,
    tasa_cambio: Number(sale.tasa_cambio),
    observacion: sale.observacion,
    estado: sale.estado,
    ganancia_total,
    detalles: detalles.map((detail) => ({
      id_producto: Number(detail.id_producto),
      codigo: detail.codigo,
      nombre: detail.nombre,
      cantidad: Number(detail.cantidad),
      precio_unitario: Number(detail.precio_unitario),
      precio_costo_unitario: Number(detail.precio_costo_unitario),
      descuento_unitario: Number(detail.descuento_unitario),
      subtotal_linea: Number(detail.subtotal_linea),
      total_linea: Number(detail.total_linea),
    })),
    pagos: pagos.map((payment) => ({
      metodo_pago: payment.metodo_pago,
      moneda_codigo: payment.moneda_codigo,
      monto: Number(payment.monto),
      referencia_pago: payment.referencia_pago,
    })),
  }
}
export function closeInventory(database: Database.Database, input: InventoryAuditInput): InventoryAuditResult {
  requirePermission(database, 'GESTIONAR_INVENTARIO')

  const transaction = database.transaction((payload: InventoryAuditInput) => {
    const timestamp = nowSql()
    const details: InventoryAuditResultItem[] = []
    let adjusted = 0

    for (const item of payload.items) {
      const product = database
        .prepare('SELECT id_producto, nombre FROM productos WHERE id_producto = ?')
        .get(item.id_producto) as { id_producto: number; nombre: string } | undefined

      if (!product) {
        continue
      }

      const stockSistema = getProductStock(database, item.id_producto)
      const conteoFisico = Number(item.conteo_fisico)
      const diferencia = conteoFisico - stockSistema

      let tipoAjuste: InventoryAuditResultItem['tipo_ajuste'] = 'SIN_CAMBIO'

      if (diferencia > 0) {
        tipoAjuste = 'AJUSTE_POS'
      } else if (diferencia < 0) {
        tipoAjuste = 'AJUSTE_NEG'
      }

      if (item.precio_costo !== undefined && item.precio_costo !== null) {
        database
          .prepare('UPDATE productos SET precio_costo = ?, actualizado_en = ? WHERE id_producto = ?')
          .run(item.precio_costo, timestamp, item.id_producto)
      }

      if (item.precio_venta !== undefined && item.precio_venta !== null) {
        database
          .prepare('UPDATE productos SET precio_venta = ?, actualizado_en = ? WHERE id_producto = ?')
          .run(item.precio_venta, timestamp, item.id_producto)
      }

      if (diferencia !== 0) {
        const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')

        database
          .prepare(
            `
            INSERT INTO inventario_movimientos (
              id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
              referencia, observacion, realizado_por, fecha_movimiento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            movementId,
            item.id_producto,
            tipoAjuste,
            Math.abs(diferencia),
            item.precio_costo ?? null,
            'Cierre de inventario físico',
            `INV-${timestamp.slice(0, 10).replaceAll('-', '')}`,
            normalizeText(payload.observacion) ?? 'Ajuste automático por cierre de inventario',
            SYSTEM_USER_ID,
            timestamp,
          )

        adjusted += 1
      }

      details.push({
        id_producto: item.id_producto,
        nombre: product.nombre,
        stock_sistema: stockSistema,
        conteo_fisico: conteoFisico,
        diferencia,
        tipo_ajuste: tipoAjuste,
      })
    }

    return {
      procesados: details.length,
      ajustados: adjusted,
      detalles: details,
    }
  })

  return transaction(input)
}

function getProductStock(database: Database.Database, productId: number) {
  const product = database
    .prepare(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN im.tipo_movimiento IN ('ENTRADA', 'AJUSTE_POS', 'DEVOLUCION') THEN im.cantidad
          WHEN im.tipo_movimiento IN ('SALIDA', 'AJUSTE_NEG', 'VENTA') THEN -im.cantidad
          ELSE 0
        END
      ), 0) AS stock_actual
      FROM inventario_movimientos im
      WHERE im.id_producto = ?
    `,
    )
    .get(productId) as
    | { stock_actual: number }
    | undefined

  return Number(product?.stock_actual ?? 0)
}

function getOpenAttendance(database: Database.Database, workerId: number) {
  return database
    .prepare(
      `
      SELECT id_asistencia, observacion
      FROM asistencias
      WHERE id_trabajador = ? AND hora_salida IS NULL
      ORDER BY hora_entrada DESC, id_asistencia DESC
      LIMIT 1
    `,
    )
    .get(workerId) as { id_asistencia: number; observacion: string | null } | undefined
}

export function getSalesReport(database: Database.Database, input: SalesReportInput): SalesReportData {
  const access = getCurrentUserAccess(database)
  if (!access.isAdminLike) {
    throw new Error('No tienes permiso para consultar reportes administrativos.')
  }

  const { startDate, endDate } = input

  // 1. Profit report (SCRUM-16)
  const profitRows = database.prepare(`
    SELECT
      v.id_venta,
      v.numero_factura,
      v.fecha_venta,
      t.nombres || ' ' || t.apellidos AS vendedor,
      COALESCE(c.nombre, 'Consumidor final') AS cliente,
      v.subtotal,
      v.descuento_total AS descuento,
      v.total,
      COALESCE(vd.costo_total, 0) AS costo,
      v.total - COALESCE(vd.costo_total, 0) AS ganancia,
      CASE 
        WHEN v.total > 0 THEN ((v.total - COALESCE(vd.costo_total, 0)) / v.total) * 100
        ELSE 0
      END AS margen,
      v.estado
    FROM ventas v
    INNER JOIN trabajadores t ON t.id_trabajador = v.id_vendedor
    LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
    LEFT JOIN (
      SELECT 
        id_venta,
        SUM(cantidad * precio_costo_unitario) AS costo_total
      FROM venta_detalles
      GROUP BY id_venta
    ) vd ON vd.id_venta = v.id_venta
    WHERE DATE(v.fecha_venta) BETWEEN ? AND ? AND v.estado != 'ANULADA'
    ORDER BY v.fecha_venta DESC, v.id_venta DESC
  `).all(startDate, endDate) as any[]

  const profitReport = profitRows.map((r) => ({
    id_venta: Number(r.id_venta),
    numero_factura: String(r.numero_factura),
    fecha_venta: String(r.fecha_venta),
    vendedor: String(r.vendedor),
    cliente: String(r.cliente),
    subtotal: Number(r.subtotal),
    descuento: Number(r.descuento),
    total: Number(r.total),
    costo: Number(r.costo),
    ganancia: Number(r.ganancia),
    margen: Number(r.margen),
    estado: String(r.estado),
  }))

  // 2. Cash flow report (SCRUM-18)
  const cashFlowRows = database.prepare(`
    SELECT
      mp.nombre AS metodo_pago,
      SUM(pv.monto) AS total_recibido,
      COUNT(pv.referencia_pago) AS referencias_count
    FROM pagos_venta pv
    INNER JOIN metodos_pago mp ON mp.id_metodo = pv.id_metodo_pago
    INNER JOIN ventas v ON v.id_venta = pv.id_venta
    WHERE DATE(v.fecha_venta) BETWEEN ? AND ? AND v.estado != 'ANULADA'
    GROUP BY pv.id_metodo_pago
  `).all(startDate, endDate) as any[]

  const cashFlowReport = cashFlowRows.map((r) => ({
    metodo_pago: String(r.metodo_pago),
    total_recibido: Number(r.total_recibido),
    referencias_count: Number(r.referencias_count),
  }))

  // 3. KPIs
  const totalVendido = roundMoney(profitReport.reduce((sum, r) => sum + r.total, 0))
  const totalCosto = roundMoney(profitReport.reduce((sum, r) => sum + r.costo, 0))
  const totalGanancia = roundMoney(totalVendido - totalCosto)
  const totalDescuentos = roundMoney(profitReport.reduce((sum, r) => sum + r.descuento, 0))
  const cantidadVentas = profitReport.length
  
  const totalCobrado = roundMoney(cashFlowReport.reduce((sum, r) => sum + r.total_recibido, 0))
  const saldoPendiente = roundMoney(totalVendido > totalCobrado ? totalVendido - totalCobrado : 0)

  const kpis = {
    totalVendido,
    totalCobrado,
    totalCosto,
    totalGanancia,
    totalDescuentos,
    cantidadVentas,
    saldoPendiente,
  }

  // 4. Charts data (SCRUM-17)
  const brandRows = database.prepare(`
    SELECT
      m.nombre AS marca,
      COUNT(DISTINCT v.id_venta) AS ventas_count,
      SUM(vd.total_linea) AS total_vendido
    FROM venta_detalles vd
    INNER JOIN ventas v ON v.id_venta = vd.id_venta
    INNER JOIN productos p ON p.id_producto = vd.id_producto
    INNER JOIN marcas m ON m.id_marca = p.id_marca
    WHERE DATE(v.fecha_venta) BETWEEN ? AND ? AND v.estado != 'ANULADA'
    GROUP BY m.id_marca
    ORDER BY total_vendido DESC
  `).all(startDate, endDate) as any[]

  const chartsBrands = brandRows.map((r) => ({
    marca: String(r.marca),
    ventas_count: Number(r.ventas_count),
    total_vendido: Number(r.total_vendido),
  }))

  const shiftRows = database.prepare(`
    SELECT
      COALESCE(tu.nombre, 'Sin turno') AS turno,
      COUNT(v.id_venta) AS ventas_count,
      SUM(v.total) AS total_vendido
    FROM ventas v
    LEFT JOIN turnos tu ON tu.id_turno = v.id_turno
    WHERE DATE(v.fecha_venta) BETWEEN ? AND ? AND v.estado != 'ANULADA'
    GROUP BY v.id_turno
    ORDER BY total_vendido DESC
  `).all(startDate, endDate) as any[]

  const chartsShifts = shiftRows.map((r) => ({
    turno: String(r.turno),
    ventas_count: Number(r.ventas_count),
    total_vendido: Number(r.total_vendido),
  }))

  const dailyRows = database.prepare(`
    SELECT
      DATE(v.fecha_venta) AS fecha,
      SUM(v.total) AS total_vendido,
      SUM(v.total) - SUM(COALESCE(vd.costo_total, 0)) AS total_ganancia
    FROM ventas v
    LEFT JOIN (
      SELECT 
        id_venta,
        SUM(cantidad * precio_costo_unitario) AS costo_total
      FROM venta_detalles
      GROUP BY id_venta
    ) vd ON vd.id_venta = v.id_venta
    WHERE DATE(v.fecha_venta) BETWEEN ? AND ? AND v.estado != 'ANULADA'
    GROUP BY DATE(v.fecha_venta)
    ORDER BY DATE(v.fecha_venta) ASC
  `).all(startDate, endDate) as any[]

  const chartsDaily = dailyRows.map((r) => ({
    fecha: String(r.fecha),
    total_vendido: Number(r.total_vendido),
    total_ganancia: Number(r.total_ganancia),
  }))

  return {
    kpis,
    profitReport,
    cashFlowReport,
    charts: {
      brands: chartsBrands,
      shifts: chartsShifts,
      daily: chartsDaily,
    },
  }
}
