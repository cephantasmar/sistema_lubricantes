import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import schemaSql from '../../shared/database/schema.sql?raw'

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
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (1, 'Mañana', '08:00', '12:00', 'Turno de apertura', 1)",
    "UPDATE turnos SET nombre = 'Mañana' WHERE id_turno = 1",
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (2, 'Tarde', '14:00', '18:00', 'Turno de cierre', 1)",
    "INSERT OR IGNORE INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (3, 'Completo', '08:00', '18:00', 'Jornada completa', 1)",
    `INSERT OR IGNORE INTO usuarios (id_usuario, username, email, password_hash, estado, ultimo_acceso, creado_en, actualizado_en) VALUES (1, 'system', 'system@local', 'system', 'activo', NULL, '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (1, 1, '00000000', 'Sistema', 'Operador', NULL, NULL, '${todayDisplaySql()}', NULL, 'Sistema', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (2, NULL, '10000001', 'Ana', 'Rojas', '70000001', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Vendedora', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (3, NULL, '10000002', 'Carlos', 'Mendoza', '70000002', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Encargado de inventario', 0, 'activo', '${now}', NULL)`,
    `INSERT OR IGNORE INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, telefono, direccion, fecha_ingreso, fecha_salida, cargo, salario_base, estado, creado_en, actualizado_en) VALUES (4, NULL, '10000003', 'Lucia', 'Fernandez', '70000003', 'Sucursal central', '${todayDisplaySql()}', NULL, 'Cajera', 0, 'activo', '${now}', NULL)`,
    "UPDATE asistencias SET fecha = substr(fecha, 9, 2) || '-' || substr(fecha, 6, 2) || '-' || substr(fecha, 1, 4) WHERE fecha GLOB '????-??-??'"
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
