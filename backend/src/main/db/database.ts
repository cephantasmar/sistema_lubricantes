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
    `INSERT OR IGNORE INTO rol_permiso (id_rol, id_permiso) SELECT 1, id_permiso FROM permisos`,
    `INSERT OR IGNORE INTO usuarios (id_usuario, username, email, password_hash, estado, ultimo_acceso, creado_en, actualizado_en) VALUES (1, 'system', 'system@local', 'system', 'activo', NULL, '${now}', NULL)`,
    `INSERT OR IGNORE INTO usuario_rol (id_usuario, id_rol) VALUES (1, 1)`,
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
