import type Database from 'better-sqlite3'
import type {
  AttendanceFormInput,
  AttendanceRow,
  BootstrapData,
  InventoryAuditInput,
  InventoryAuditResult,
  InventoryAuditResultItem,
  MovementFormInput,
  MovementRow,
  ProductFormInput,
  ProductRow,
  ReferenceItem,
  SaleFormInput,
  SaleRow,
  ShiftRow,
  WorkerRow,
  WorkHoursSummaryRow,
  RoleRow,
  AuditLogRow,
  PermissionRow,
} from '../../shared/ipc/contracts'

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

export function getReferenceData(database: Database.Database) {
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

  const trabajadores = database
    .prepare(
      `
      SELECT
        id_trabajador,
        nombres || ' ' || apellidos AS nombre_completo,
        cargo,
        estado
      FROM trabajadores
      WHERE estado = 'activo'
      ORDER BY nombres ASC, apellidos ASC
    `,
    )
    .all() as WorkerRow[]

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

  return {
    marcas: marcas.map(mapReferenceItem),
    categorias: categorias.map(mapReferenceItem),
    monedas: monedas.map(mapReferenceItem),
    metodosPago: metodosPago.map(mapReferenceItem),
    trabajadores,
    turnos,
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

export function listSales(database: Database.Database): SaleRow[] {
  return database
    .prepare(
      `
      SELECT
        v.id_venta,
        v.numero_factura,
        v.fecha_venta,
        COALESCE(det.productos_diferentes, 0) AS productos_diferentes,
        COALESCE(det.cantidad_total, 0) AS cantidad_total,
        v.subtotal,
        v.descuento_total,
        v.total,
        COALESCE(pay.metodo_pago, 'Sin pago') AS metodo_pago,
        mo.codigo || COALESCE(' ' || mo.simbolo, '') AS moneda,
        v.estado
      FROM ventas v
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
      ORDER BY v.fecha_venta DESC, v.id_venta DESC
      LIMIT 50
    `,
    )
    .all() as SaleRow[]
}

export function listAttendances(database: Database.Database): AttendanceRow[] {
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
      ORDER BY substr(a.fecha, 7, 4) || '-' || substr(a.fecha, 4, 2) || '-' || substr(a.fecha, 1, 2) DESC,
        COALESCE(a.hora_salida, a.hora_entrada) DESC,
        a.id_asistencia DESC
      LIMIT 80
    `,
    )
    .all() as AttendanceRow[]
}

export function listWorkHoursSummary(database: Database.Database): WorkHoursSummaryRow[] {
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
      WHERE t.estado = 'activo'
      GROUP BY t.id_trabajador
      ORDER BY horas_trabajadas DESC, trabajador_nombre ASC
    `,
    )
    .all() as WorkHoursSummaryRow[]
}

export function getBootstrapData(database: Database.Database): BootstrapData {
  const products = listProducts(database)
  const movements = listMovements(database)
  const sales = listSales(database)
  const attendances = listAttendances(database)
  const workHoursSummary = listWorkHoursSummary(database)
  const references = getReferenceData(database)

  const rolesData = database.prepare('SELECT id_rol, nombre, descripcion, estado, creado_en FROM roles ORDER BY id_rol ASC').all() as RoleRow[]
  const rolPermisos = database.prepare('SELECT id_rol, id_permiso FROM rol_permiso').all() as {id_rol: number, id_permiso: number}[]
  const roles = rolesData.map(role => ({
    ...role,
    permisos: rolPermisos.filter(rp => rp.id_rol === role.id_rol).map(rp => rp.id_permiso)
  }))

  const workers = database.prepare(`
    SELECT t.id_trabajador, t.id_usuario, t.cedula, t.nombres, t.apellidos, t.cargo, t.salario_base, t.estado, t.creado_en, ur.id_rol 
    FROM trabajadores t
    LEFT JOIN usuario_rol ur ON ur.id_usuario = t.id_usuario
    ORDER BY t.nombres ASC
  `).all() as WorkerRow[]
  const auditLogs = database.prepare(`
    SELECT l.id_log, COALESCE(u.username, 'Sistema') AS usuario, l.accion, l.modulo, l.descripcion, l.fecha_evento 
    FROM auditoria_logs l 
    LEFT JOIN usuarios u ON u.id_usuario = l.id_usuario 
    ORDER BY l.fecha_evento DESC LIMIT 50
  `).all() as AuditLogRow[]
  
  const permissions = database.prepare('SELECT id_permiso, nombre, descripcion, modulo, creado_en FROM permisos ORDER BY modulo ASC, nombre ASC').all() as PermissionRow[]

  const totalStock = products.reduce((sum, product) => sum + toNumber(product.stock_actual), 0)
  const lowStockProducts = products.filter((product) => toNumber(product.stock_actual) <= toNumber(product.stock_minimo)).length

  return {
    references,
    metrics: {
      totalProducts: products.length,
      totalStock,
      lowStockProducts,
      totalMovements: movements.length,
      totalSales: sales.length,
      activeAttendances: attendances.filter((attendance) => attendance.estado === 'EN_TURNO').length,
    },
    products,
    movements,
    sales,
    attendances,
    workHoursSummary,
    roles,
    workers,
    auditLogs,
    permissions,
  }
}

export function registerAttendanceEntry(database: Database.Database, input: AttendanceFormInput) {
  const transaction = database.transaction((payload: AttendanceFormInput) => {
    assertRequiredId(payload.id_trabajador, 'un trabajador')
    assertRequiredId(payload.id_turno, 'un turno')

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
  const transaction = database.transaction((payload: AttendanceFormInput) => {
    assertRequiredId(payload.id_trabajador, 'un trabajador')

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

export function createSale(database: Database.Database, input: SaleFormInput) {
  const transaction = database.transaction((payload: SaleFormInput) => {
    if (!payload.detalles.length) {
      throw new Error('La venta debe tener al menos un producto.')
    }

    if (payload.id_metodo_pago <= 0) {
      throw new Error('Debe seleccionar un método de pago.')
    }

    if (payload.id_moneda <= 0) {
      throw new Error('Debe seleccionar una moneda.')
    }

    const normalizedDetails = new Map<number, number>()

    payload.detalles.forEach((detail) => {
      const productId = Number(detail.id_producto)
      const quantity = Number(detail.cantidad)

      if (!Number.isFinite(productId) || productId <= 0) {
        throw new Error('La venta contiene un producto inválido.')
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Todas las cantidades deben ser mayores que cero.')
      }

      normalizedDetails.set(productId, roundMoney((normalizedDetails.get(productId) ?? 0) + quantity))
    })

    const discountTotal = roundMoney(Number(payload.descuento_total ?? 0))

    if (!Number.isFinite(discountTotal) || discountTotal < 0) {
      throw new Error('El descuento no puede ser negativo.')
    }

    const paymentMethod = database.prepare('SELECT id_metodo FROM metodos_pago WHERE id_metodo = ? AND estado = 1').get(payload.id_metodo_pago) as
      | { id_metodo: number }
      | undefined

    if (!paymentMethod) {
      throw new Error('El método de pago seleccionado no existe o está inactivo.')
    }

    const currency = database.prepare('SELECT id_moneda FROM monedas WHERE id_moneda = ?').get(payload.id_moneda) as
      | { id_moneda: number }
      | undefined

    if (!currency) {
      throw new Error('La moneda seleccionada no existe.')
    }

    type SaleLine = {
      id_producto: number
      nombre: string
      cantidad: number
      precio_costo: number
      precio_venta: number
      subtotal_linea: number
    }

    const lines: SaleLine[] = []

    normalizedDetails.forEach((quantity, productId) => {
      const product = database
        .prepare('SELECT id_producto, nombre, precio_costo, precio_venta, estado FROM productos WHERE id_producto = ?')
        .get(productId) as
        | { id_producto: number; nombre: string; precio_costo: number; precio_venta: number; estado: number | boolean }
        | undefined

      if (!product) {
        throw new Error(`El producto ${productId} no existe.`)
      }

      if (!product.estado) {
        throw new Error(`El producto ${product.nombre} está inactivo.`)
      }

      const stockActual = getProductStock(database, productId)

      if (stockActual < quantity) {
        throw new Error(`No hay suficiente stock para ${product.nombre}. Disponible: ${stockActual}.`)
      }

      lines.push({
        id_producto: product.id_producto,
        nombre: product.nombre,
        cantidad: quantity,
        precio_costo: Number(product.precio_costo),
        precio_venta: Number(product.precio_venta),
        subtotal_linea: roundMoney(Number(product.precio_venta) * quantity),
      })
    })

    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal_linea, 0))

    if (discountTotal > subtotal) {
      throw new Error('El descuento no puede superar el subtotal de la venta.')
    }

    const total = roundMoney(subtotal - discountTotal)
    const saleId = getNextId(database, 'ventas', 'id_venta')
    const timestamp = nowSql()
    const invoiceNumber = `FAC-${String(new Date().getFullYear()).slice(-2)}-${String(saleId).padStart(5, '0')}`

    database
      .prepare(
        `
        INSERT INTO ventas (
          id_venta, numero_factura, fecha_venta, id_cliente, id_vendedor, id_turno,
          subtotal, descuento_total, total, id_moneda, tasa_cambio_aplicada, observacion, estado
        ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        saleId,
        invoiceNumber,
        timestamp,
        payload.realizado_por ?? SYSTEM_USER_ID,
        subtotal,
        discountTotal,
        total,
        payload.id_moneda,
        1,
        normalizeText(payload.observacion),
        'COMPLETADA',
      )

    let appliedDiscount = 0

    lines.forEach((line, index) => {
      const detailId = getNextId(database, 'venta_detalles', 'id_venta_detalle')
      const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')
      const isLastLine = index === lines.length - 1
      const lineDiscount =
        subtotal === 0 ? 0 : isLastLine ? roundMoney(discountTotal - appliedDiscount) : roundMoney((line.subtotal_linea / subtotal) * discountTotal)
      const lineTotal = roundMoney(line.subtotal_linea - lineDiscount)
      const unitDiscount = roundMoney(lineDiscount / line.cantidad)

      appliedDiscount = roundMoney(appliedDiscount + lineDiscount)

      database
        .prepare(
          `
        INSERT INTO venta_detalles (
          id_venta_detalle, id_venta, id_producto, cantidad, precio_unitario, precio_costo_unitario,
          descuento_unitario, subtotal_linea, total_linea, id_descuento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
        )
        .run(
          detailId,
          saleId,
          line.id_producto,
          line.cantidad,
          line.precio_venta,
          line.precio_costo,
          unitDiscount,
          line.subtotal_linea,
          lineTotal,
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
          payload.realizado_por ?? SYSTEM_USER_ID,
          timestamp,
        )
    })

    const paymentId = getNextId(database, 'pagos_venta', 'id_pago_venta')

    database
      .prepare(
        `
        INSERT INTO pagos_venta (
          id_pago_venta, id_venta, id_metodo_pago, id_moneda, monto, referencia_pago, fecha_pago
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(paymentId, saleId, payload.id_metodo_pago, payload.id_moneda, total, invoiceNumber, timestamp)

    return saleId
  })

  return {
    saleId: transaction(input),
  }
}

export function closeInventory(database: Database.Database, input: InventoryAuditInput): InventoryAuditResult {
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
