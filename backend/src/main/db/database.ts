import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import schemaSql from '../../shared/database/schema.sql?raw'
import { hashPassword } from '../modules/auth'

let database: Database.Database | null = null

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

function todayDisplaySql() {
  const { year, month, day } = localDateParts()

  return `${day}-${month}-${year}`
}

function seedDatabase(databaseInstance: Database.Database) {
  const now = nowSql()

  const seedStatements = [
    "INSERT OR IGNORE INTO marcas (id_marca, nombre, descripcion, estado) VALUES (1, 'Sin marca', 'Marca base inicial', 1)",
    "INSERT OR IGNORE INTO categorias_producto (id_categoria, nombre, descripcion) VALUES (1, 'General', 'Categoría base inicial')",
    "INSERT OR IGNORE INTO monedas (id_moneda, codigo, nombre, simbolo) VALUES (1, 'USD', 'Dólar estadounidense', '$')",
    "INSERT OR IGNORE INTO metodos_pago (id_metodo, nombre, estado) VALUES (1, 'Efectivo', 1)",
    "INSERT OR IGNORE INTO metodos_pago (id_metodo, nombre, estado) VALUES (2, 'Tarjeta', 1)",
    "INSERT OR IGNORE INTO metodos_pago (id_metodo, nombre, estado) VALUES (3, 'Transferencia', 1)",
    `INSERT OR IGNORE INTO roles (id_rol, nombre, descripcion, estado, creado_en) VALUES (1, 'Administrador', 'Rol principal con acceso total', 1, '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (1, 'VER_INVENTARIO', 'Ver catálogo y stock', 'INVENTARIO', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (2, 'GESTIONAR_INVENTARIO', 'Crear y editar productos', 'INVENTARIO', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (3, 'VER_MOVIMIENTOS', 'Ver historial de movimientos', 'MOVIMIENTOS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (4, 'REGISTRAR_MOVIMIENTOS', 'Añadir entradas y salidas', 'MOVIMIENTOS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (5, 'VER_VENTAS', 'Ver historial de ventas', 'VENTAS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (6, 'REGISTRAR_VENTAS', 'Registrar nuevas ventas', 'VENTAS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (7, 'VER_ASISTENCIAS', 'Ver control de asistencias', 'ASISTENCIAS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (8, 'REGISTRAR_ASISTENCIAS', 'Marcar entrada y salida', 'ASISTENCIAS', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (9, 'GESTIONAR_ROLES', 'Crear y asignar roles (RBAC)', 'ADMINISTRACION', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (10, 'GESTIONAR_TRABAJADORES', 'Añadir y editar personal', 'ADMINISTRACION', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (11, 'VER_REPORTES', 'Ver reportes y métricas', 'REPORTES', '${now}')`,
    `INSERT OR IGNORE INTO permisos (id_permiso, nombre, descripcion, modulo, creado_en) VALUES (12, 'GENERAR_REPORTES', 'Exportar reportes en CSV', 'REPORTES', '${now}')`,
    `INSERT OR IGNORE INTO rol_permiso (id_rol, id_permiso) SELECT 1, id_permiso FROM permisos`,
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (1, 'Mañana', '08:00', '12:00', 'Turno de apertura', 1)",
    "UPDATE turnos SET nombre = 'Mañana' WHERE id_turno = 1",
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (2, 'Tarde', '14:00', '18:00', 'Turno de cierre', 1)",
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (3, 'Completo', '08:00', '18:00', 'Jornada completa', 1)",
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (4, 'Noche', '18:00', '22:00', 'Turno nocturno', 1)",
    `INSERT OR IGNORE INTO usuarios (id_usuario, username, email, password_hash, requiere_cambio_password, estado, ultimo_acceso, creado_en, actualizado_en) VALUES (1, 'system', 'system@local', '${hashPassword('system')}', 0, 'activo', NULL, '${now}', NULL)`,
    `INSERT OR IGNORE INTO usuario_rol (id_usuario, id_rol) VALUES (1, 1)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (1, 1, '00000000', 'Sistema', 'Operador', NULL, NULL, '${todayDisplaySql()}', NULL, 'Sistema', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (2, NULL, '10000001', 'Ana', 'Rojas', '70000001', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Vendedora', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (3, NULL, '10000002', 'Carlos', 'Mendoza', '70000002', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Encargado de inventario', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (4, NULL, '10000003', 'Lucia', 'Fernandez', '70000003', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Cajera', 0, 'activo', '${now}', NULL)`,
    "UPDATE asistencias SET fecha = substr(fecha, 9, 2) || '-' || substr(fecha, 6, 2) || '-' || substr(fecha, 1, 4) WHERE fecha GLOB '????-??-??'"
  ]

  const testProducts = [
    { id: 1001, codigo: 'LUB-5W30-001', nombre: 'Aceite de Motor Sintetico 5W-30 1L', costo: 6.9, venta: 11.5, stockInicial: 40 },
    { id: 1002, codigo: 'LUB-5W30-004', nombre: 'Aceite de Motor Sintetico 5W-30 4L', costo: 24.5, venta: 37.9, stockInicial: 25 },
    { id: 1003, codigo: 'LUB-10W40-001', nombre: 'Aceite de Motor Semisintetico 10W-40 1L', costo: 5.7, venta: 9.9, stockInicial: 42 },
    { id: 1004, codigo: 'LUB-10W40-004', nombre: 'Aceite de Motor Semisintetico 10W-40 4L', costo: 21.2, venta: 33.5, stockInicial: 24 },
    { id: 1005, codigo: 'LUB-15W40-001', nombre: 'Aceite Diesel Mineral 15W-40 1L', costo: 4.9, venta: 8.2, stockInicial: 45 },
    { id: 1006, codigo: 'LUB-15W40-004', nombre: 'Aceite Diesel Mineral 15W-40 4L', costo: 18.7, venta: 29.8, stockInicial: 28 },
    { id: 1007, codigo: 'LUB-20W50-001', nombre: 'Aceite Multigrado 20W-50 1L', costo: 4.6, venta: 7.9, stockInicial: 38 },
    { id: 1008, codigo: 'LUB-20W50-004', nombre: 'Aceite Multigrado 20W-50 4L', costo: 17.9, venta: 27.5, stockInicial: 26 },
    { id: 1009, codigo: 'LUB-ATF-001', nombre: 'Fluido Transmision ATF Dexron III 1L', costo: 6.1, venta: 10.4, stockInicial: 34 },
    { id: 1010, codigo: 'LUB-ATF-004', nombre: 'Fluido Transmision ATF Dexron III 4L', costo: 22.8, venta: 35.6, stockInicial: 18 },
    { id: 1011, codigo: 'LUB-CVT-001', nombre: 'Fluido CVT Sintetico 1L', costo: 8.4, venta: 13.9, stockInicial: 20 },
    { id: 1012, codigo: 'LUB-75W90-001', nombre: 'Aceite Caja 75W-90 GL-5 1L', costo: 7.9, venta: 12.8, stockInicial: 22 },
    { id: 1013, codigo: 'LUB-80W90-001', nombre: 'Aceite Diferencial 80W-90 GL-5 1L', costo: 7.3, venta: 11.9, stockInicial: 24 },
    { id: 1014, codigo: 'LUB-HYD-001', nombre: 'Aceite Hidraulico ISO VG 46 1L', costo: 5.8, venta: 9.7, stockInicial: 30 },
    { id: 1015, codigo: 'LUB-HYD-020', nombre: 'Aceite Hidraulico ISO VG 46 20L', costo: 88.0, venta: 126.0, stockInicial: 8 },
    { id: 1016, codigo: 'LUB-GREASE-400', nombre: 'Grasa Multiproposito Litio EP2 400g', costo: 3.1, venta: 5.5, stockInicial: 50 },
    { id: 1017, codigo: 'LUB-BRAKE-500', nombre: 'Liquido de Frenos DOT 4 500ml', costo: 3.6, venta: 6.2, stockInicial: 44 },
    { id: 1018, codigo: 'LUB-COOL-001', nombre: 'Refrigerante Concentrado 1L', costo: 4.2, venta: 7.1, stockInicial: 36 },
    { id: 1019, codigo: 'LUB-2T-001', nombre: 'Aceite 2T Para Moto 1L', costo: 5.3, venta: 8.9, stockInicial: 27 },
    { id: 1020, codigo: 'LUB-4T-001', nombre: 'Aceite 4T Para Moto 20W-50 1L', costo: 5.7, venta: 9.4, stockInicial: 31 },
  ]

  const insertProduct = databaseInstance.prepare(`
    INSERT OR IGNORE INTO productos (
      id_producto, codigo, codigo_barra, nombre, id_marca, id_categoria, descripcion,
      precio_costo, precio_venta, stock_minimo, unidad_medida, estado, creado_en, actualizado_en
    ) VALUES (?, ?, NULL, ?, 1, 1, ?, ?, ?, ?, 'L', 1, ?, NULL)
  `)

  const insertMovement = databaseInstance.prepare(`
    INSERT OR IGNORE INTO inventario_movimientos (
      id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
      referencia, observacion, realizado_por, fecha_movimiento
    ) VALUES (?, ?, 'ENTRADA', ?, ?, 'Stock inicial de prueba', ?, ?, 1, ?)
  `)

  const getProductStock = databaseInstance.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN im.tipo_movimiento IN ('ENTRADA', 'AJUSTE_POS', 'DEVOLUCION') THEN im.cantidad
        WHEN im.tipo_movimiento IN ('SALIDA', 'AJUSTE_NEG', 'VENTA') THEN -im.cantidad
        ELSE 0
      END
    ), 0) AS stock_actual
    FROM inventario_movimientos im
    WHERE im.id_producto = ?
  `)

  const insertStockAdjustment = databaseInstance.prepare(`
    INSERT OR IGNORE INTO inventario_movimientos (
      id_movimiento, id_producto, tipo_movimiento, cantidad, costo_unitario, motivo,
      referencia, observacion, realizado_por, fecha_movimiento
    ) VALUES (?, ?, 'AJUSTE_POS', ?, ?, 'Reposicion de stock demo', ?, ?, 1, ?)
  `)

  databaseInstance.transaction(() => {
    seedStatements.forEach((statement) => {
      databaseInstance.prepare(statement).run()
    })

    testProducts.forEach((product, index) => {
      const referencia = `SEED-${product.codigo}`
      const descripcion = `${product.nombre} (producto demo para pruebas)`

      insertProduct.run(
        product.id,
        product.codigo,
        product.nombre,
        descripcion,
        product.costo,
        product.venta,
        5,
        now,
      )

      insertMovement.run(5000 + index + 1, product.id, product.stockInicial, product.costo, referencia, referencia, now)

      const currentStock = Number((getProductStock.get(product.id) as { stock_actual: number } | undefined)?.stock_actual ?? 0)
      if (currentStock < product.stockInicial) {
        const missingStock = Number((product.stockInicial - currentStock).toFixed(2))
        insertStockAdjustment.run(
          6000 + index + 1,
          product.id,
          missingStock,
          product.costo,
          `SEED-TOPUP-${product.codigo}`,
          `Ajuste automatico de stock demo hasta ${product.stockInicial}`,
          now,
        )
      }
    })
  })()
}

export function getDatabase(): Database.Database {
  if (database) {
    return database
  }

  const databasePath = join(app.getPath('userData'), 'inventario-aceites.sqlite')
  mkdirSync(dirname(databasePath), { recursive: true })
  const databaseIsNew = !existsSync(databasePath)

  database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  if (databaseIsNew) {
    database.exec(schemaSql)
  }

  seedDatabase(database)

  return database
}

export function closeDatabase() {
  if (!database) {
    return
  }

  database.close()
  database = null
}

export function getDatabasePath() {
  return join(app.getPath('userData'), 'inventario-aceites.sqlite')
}
