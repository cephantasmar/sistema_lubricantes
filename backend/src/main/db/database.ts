import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import schemaSql from '../../shared/database/schema.sql?raw'

let database: Database.Database | null = null

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
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
    `INSERT OR IGNORE INTO usuarios (id_usuario, username, email, password_hash, estado, ultimo_acceso, creado_en, actualizado_en) VALUES (1, 'system', 'system@local', 'system', 'activo', NULL, '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (1, 1, '00000000', 'Sistema', 'Operador', NULL, NULL, date('now'), NULL, 'Sistema', 0, 'activo', '${now}', NULL)`
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
