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

  return {
    marcas: marcas.map(mapReferenceItem),
    categorias: categorias.map(mapReferenceItem),
    monedas: monedas.map(mapReferenceItem),
    metodosPago: metodosPago.map(mapReferenceItem),
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
        p.nombre AS producto_nombre,
        d.cantidad,
        v.subtotal,
        v.descuento_total,
        v.total,
        mp.nombre AS metodo_pago,
        mo.codigo || COALESCE(' ' || mo.simbolo, '') AS moneda,
        v.estado,
        COALESCE(t.nombres || ' ' || t.apellidos, 'Sistema') AS vendedor
      FROM ventas v
      INNER JOIN venta_detalles d ON d.id_venta = v.id_venta
      INNER JOIN productos p ON p.id_producto = d.id_producto
      INNER JOIN pagos_venta pv ON pv.id_venta = v.id_venta
      INNER JOIN metodos_pago mp ON mp.id_metodo = pv.id_metodo_pago
      INNER JOIN monedas mo ON mo.id_moneda = pv.id_moneda
      INNER JOIN trabajadores t ON t.id_trabajador = v.id_vendedor
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

export function createSale(database: Database.Database, input: SaleFormInput) {
  const transaction = database.transaction((payload: SaleFormInput) => {
    if (payload.cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor que cero.')
    }

    const product = database
      .prepare('SELECT id_producto, nombre, precio_costo, precio_venta FROM productos WHERE id_producto = ?')
      .get(payload.id_producto) as
      | { id_producto: number; nombre: string; precio_costo: number; precio_venta: number }
      | undefined

    if (!product) {
      throw new Error('El producto seleccionado no existe.')
    }

    const stockActual = getProductStock(database, payload.id_producto)

    if (stockActual < payload.cantidad) {
      throw new Error('No hay suficiente stock para completar la venta.')
    }

    const quantity = payload.cantidad
    const unitPrice = product.precio_venta
    const subtotal = unitPrice * quantity
    const discountTotal = payload.descuento_total ?? 0
    const total = Math.max(subtotal - discountTotal, 0)
    const saleId = getNextId(database, 'ventas', 'id_venta')
    const detailId = getNextId(database, 'venta_detalles', 'id_venta_detalle')
    const paymentId = getNextId(database, 'pagos_venta', 'id_pago_venta')
    const movementId = getNextId(database, 'inventario_movimientos', 'id_movimiento')
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
        SYSTEM_USER_ID,
        subtotal,
        discountTotal,
        total,
        payload.id_moneda,
        1,
        normalizeText(payload.observacion),
        'COMPLETADA',
      )

    database
      .prepare(
        `
        INSERT INTO venta_detalles (
          id_venta_detalle, id_venta, id_producto, cantidad, precio_unitario, precio_costo_unitario,
          descuento_unitario, subtotal_linea, total_linea, id_descuento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `,
      )
      .run(detailId, saleId, payload.id_producto, quantity, unitPrice, product.precio_costo, discountTotal, subtotal, total)

    database
      .prepare(
        `
        INSERT INTO pagos_venta (
          id_pago_venta, id_venta, id_metodo_pago, id_moneda, monto, referencia_pago, fecha_pago
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(paymentId, saleId, payload.id_metodo_pago, payload.id_moneda, total, invoiceNumber, timestamp)

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
        payload.id_producto,
        quantity,
        product.precio_costo,
        'Venta registrada',
        invoiceNumber,
        normalizeText(payload.observacion) ?? `Venta de ${product.nombre}`,
        SYSTEM_USER_ID,
        timestamp,
      )

    return saleId
  })

  return {
    saleId: transaction(input),
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
