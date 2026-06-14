import type Database from 'better-sqlite3'
import type {
  BootstrapData,
  MovementFormInput,
  MovementRow,
  ProductFormInput,
  ProductRow,
  ReferenceItem,
  SaleFormInput,
  SaleRow,
  SaleFullDetail,
  SaleDetailRow,
  SalePaymentRow,
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

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
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

  const clientes = database.prepare("SELECT id_cliente AS id, nombre, COALESCE('Doc: ' || documento, '') AS descripcion FROM clientes ORDER BY nombre ASC").all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const trabajadores = database.prepare("SELECT id_trabajador AS id, nombres || ' ' || apellidos AS nombre, cargo AS descripcion FROM trabajadores WHERE estado = 'ACTIVO' ORDER BY nombres ASC").all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

  const turnos = database.prepare("SELECT id_turno AS id, nombre || ' (' || hora_inicio || ' - ' || hora_fin || ')' AS nombre, descripcion FROM turnos WHERE estado = 1 ORDER BY nombre ASC").all() as Array<{
    id: number
    nombre: string
    descripcion: string | null
  }>

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
    trabajadores: trabajadores.map(mapReferenceItem),
    turnos: turnos.map(mapReferenceItem),
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
          GROUP_CONCAT(mp.nombre, ', ') AS metodo_pago
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

export function getBootstrapData(database: Database.Database): BootstrapData {
  const products = listProducts(database)
  const movements = listMovements(database)
  const sales = listSales(database)
  const references = getReferenceData(database)

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
    },
    products,
    movements,
    sales,
  }
}

export function saveProduct(database: Database.Database, input: ProductFormInput) {
  const transaction = database.transaction((payload: ProductFormInput) => {
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
    if (payload.cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor que cero.')
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
  if (idMoneda === 1) return 1
  const currency = database.prepare('SELECT codigo FROM monedas WHERE id_moneda = ?').get(idMoneda) as { codigo: string } | undefined
  if (!currency || currency.codigo === 'BOB') return 1

  const rate = database.prepare(`
    SELECT valor FROM tipo_cambio
    WHERE id_moneda = ?
    ORDER BY registrado_en DESC
    LIMIT 1
  `).get(idMoneda) as { valor: number } | undefined

  return rate ? Number(rate.valor) : 1
}

export function createSale(database: Database.Database, input: SaleFormInput) {
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

    if (payload.id_cliente !== null) {
      const cliente = database.prepare('SELECT id_cliente FROM clientes WHERE id_cliente = ?').get(payload.id_cliente)
      if (!cliente) {
        throw new Error('El cliente especificado no existe.')
      }
    }

    if (payload.id_turno !== null) {
      const turno = database.prepare('SELECT id_turno FROM turnos WHERE id_turno = ?').get(payload.id_turno)
      if (!turno) {
        throw new Error('El turno especificado no existe.')
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
        throw new Error('La venta contiene un producto inválido.')
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Todas las cantidades deben ser mayores que cero.')
      }

      if (!Number.isFinite(descUnit) || descUnit < 0) {
        throw new Error('El descuento unitario no puede ser negativo.')
      }

      const current = normalizedDetails.get(productId)
      const newQty = roundMoney((current?.cantidad ?? 0) + quantity)
      normalizedDetails.set(productId, {
        cantidad: newQty,
        descuento_unitario: descUnit,
        id_descuento: detail.id_descuento ?? null
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
        throw new Error(`El producto ${product.nombre} está inactivo.`)
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
      const totalLine = roundMoney(subtotalLine - discountLine)

      lines.push({
        id_producto: product.id_producto,
        nombre: product.nombre,
        cantidad: info.cantidad,
        precio_costo: Number(product.precio_costo),
        precio_venta: Number(product.precio_venta),
        descuento_unitario: info.descuento_unitario,
        subtotal_linea: subtotalLine,
        total_linea: totalLine,
        id_descuento: info.id_descuento
      })
    })

    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.subtotal_linea, 0))
    const discountTotal = roundMoney(lines.reduce((sum, line) => sum + (line.descuento_unitario * line.cantidad), 0))
    const total = roundMoney(subtotal - discountTotal)

    let totalPagadoInSaleCurrency = 0
    const paymentsWithSaleValue = payload.pagos.map((pago) => {
      const rateP = getCurrencyRate(database, pago.id_moneda)
      const rateS = payload.tasa_cambio_aplicada || getCurrencyRate(database, payload.id_moneda)
      const montoInSaleCurrency = roundMoney((pago.monto * rateP) / rateS)
      totalPagadoInSaleCurrency = roundMoney(totalPagadoInSaleCurrency + montoInSaleCurrency)
      return {
        ...pago,
        montoInSaleCurrency,
        rateP
      }
    })

    let estado = 'COMPLETADA'
    let vueltoInSaleCurrency = 0
    if (totalPagadoInSaleCurrency < total) {
      estado = 'PENDIENTE'
    } else if (totalPagadoInSaleCurrency > total) {
      vueltoInSaleCurrency = roundMoney(totalPagadoInSaleCurrency - total)
      
      const cashMethod = database.prepare("SELECT id_metodo FROM metodos_pago WHERE LOWER(nombre) LIKE '%efectivo%'").get() as { id_metodo: number } | undefined
      const cashPaymentIdx = paymentsWithSaleValue.findIndex(p => cashMethod && p.id_metodo_pago === cashMethod.id_metodo)

      if (cashPaymentIdx !== -1) {
        const cashPay = paymentsWithSaleValue[cashPaymentIdx]
        const rateS = payload.tasa_cambio_aplicada || getCurrencyRate(database, payload.id_moneda)
        const vueltoInCashCurrency = roundMoney((vueltoInSaleCurrency * rateS) / cashPay.rateP)
        
        cashPay.monto = roundMoney(cashPay.monto - vueltoInCashCurrency)
        cashPay.montoInSaleCurrency = roundMoney(cashPay.montoInSaleCurrency - vueltoInSaleCurrency)
      } else {
        const firstPay = paymentsWithSaleValue[0]
        const rateS = payload.tasa_cambio_aplicada || getCurrencyRate(database, payload.id_moneda)
        const vueltoInPayCurrency = roundMoney((vueltoInSaleCurrency * rateS) / firstPay.rateP)
        
        firstPay.monto = roundMoney(firstPay.monto - vueltoInPayCurrency)
        firstPay.montoInSaleCurrency = roundMoney(firstPay.montoInSaleCurrency - vueltoInSaleCurrency)
      }
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
        payload.id_turno,
        subtotal,
        discountTotal,
        total,
        payload.id_moneda,
        payload.tasa_cambio_aplicada,
        normalizeText(payload.observacion),
        estado
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
          line.id_descuento
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
          timestamp
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
          .run(
            paymentId,
            saleId,
            pago.id_metodo_pago,
            pago.id_moneda,
            pago.monto,
            normalizeText(pago.referencia_pago),
            timestamp
          )
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
        t.nombres || ' ' || t.apellidos AS vendedor_nombre,
        tu.nombre AS turno_nombre
      FROM ventas v
      INNER JOIN monedas mo ON mo.id_moneda = v.id_moneda
      LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
      INNER JOIN trabajadores t ON t.id_trabajador = v.id_vendedor
      LEFT JOIN turnos tu ON tu.id_turno = v.id_turno
      WHERE v.id_venta = ?
    `
    )
    .get(saleId) as any

  if (!sale) {
    throw new Error('La venta solicitada no existe.')
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
    `
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
    `
    )
    .all(saleId) as SalePaymentRow[]

  const ganancia_total = roundMoney(
    detalles.reduce((sum, item) => sum + (Number(item.total_linea) - (Number(item.precio_costo_unitario) * Number(item.cantidad))), 0)
  )

  return {
    id_venta: Number(sale.id_venta),
    numero_factura: sale.numero_factura,
    fecha_venta: sale.fecha_venta,
    cliente_nombre: sale.cliente_nombre,
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
    detalles: detalles.map((d) => ({
      id_producto: Number(d.id_producto),
      codigo: d.codigo,
      nombre: d.nombre,
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario),
      precio_costo_unitario: Number(d.precio_costo_unitario),
      descuento_unitario: Number(d.descuento_unitario),
      subtotal_linea: Number(d.subtotal_linea),
      total_linea: Number(d.total_linea),
    })),
    pagos: pagos.map((p) => ({
      metodo_pago: p.metodo_pago,
      moneda_codigo: p.moneda_codigo,
      monto: Number(p.monto),
      referencia_pago: p.referencia_pago,
    })),
  }
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
