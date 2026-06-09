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

  databaseInstance.transaction(() => {
    seedStatements.forEach((statement) => {
      databaseInstance.prepare(statement).run()
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
