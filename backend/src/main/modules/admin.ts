import type Database from 'better-sqlite3'
import type { RoleFormInput, WorkerFormInput } from '../../shared/ipc/contracts'
import { hashPassword, logAudit, requirePermission } from './auth'

function getNextId(db: Database.Database, tableName: string, idColumn: string): number {
  const stmt = db.prepare(`SELECT MAX(${idColumn}) as maxId FROM ${tableName}`)
  const result = stmt.get() as { maxId: number | null }
  return (result.maxId ?? 0) + 1
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function localDateTimeSql() {
  const date = new Date()

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`
}

function localDateDisplaySql() {
  const date = new Date()

  return `${padDatePart(date.getDate())}-${padDatePart(date.getMonth() + 1)}-${date.getFullYear()}`
}

export function saveRole(db: Database.Database, payload: RoleFormInput) {
  requirePermission(db, 'GESTIONAR_ROLES')

  const transaction = db.transaction(() => {
    let roleId = payload.id_rol
    const timestamp = localDateTimeSql()

    if (roleId) {
      const stmt = db.prepare(`UPDATE roles SET nombre = ?, descripcion = ?, estado = ?, actualizado_en = ? WHERE id_rol = ?`)
      stmt.run(payload.nombre, payload.descripcion, payload.estado ? 1 : 0, timestamp, roleId)
      logAudit(db, 'UPDATE', 'roles', roleId, `Rol ${payload.nombre} actualizado`)
    } else {
      roleId = getNextId(db, 'roles', 'id_rol')
      const stmt = db.prepare(`INSERT INTO roles (id_rol, nombre, descripcion, estado, creado_en) VALUES (?, ?, ?, ?, ?)`)
      stmt.run(roleId, payload.nombre, payload.descripcion, payload.estado ? 1 : 0, timestamp)
      logAudit(db, 'INSERT', 'roles', roleId, `Rol ${payload.nombre} creado`)
    }
    if (payload.permisos) {
      db.prepare(`DELETE FROM rol_permiso WHERE id_rol = ?`).run(roleId)
      const insertPermiso = db.prepare(`INSERT INTO rol_permiso (id_rol, id_permiso) VALUES (?, ?)`)
      payload.permisos.forEach((idPermiso) => {
        insertPermiso.run(roleId, idPermiso)
      })
    }

    return { roleId }
  })
  return transaction()
}

export function saveWorker(db: Database.Database, payload: WorkerFormInput) {
  requirePermission(db, 'GESTIONAR_TRABAJADORES')

  const transaction = db.transaction(() => {
    let workerId = payload.id_trabajador
    let userId: number | null = null
    const timestamp = localDateTimeSql()

    // Check if worker exists to see if we should preserve existing id_usuario
    if (workerId) {
      const workerInfo = db.prepare(`SELECT id_usuario FROM trabajadores WHERE id_trabajador = ?`).get(workerId) as any
      if (workerInfo && workerInfo.id_usuario) {
        userId = workerInfo.id_usuario
      }
    }

    if (payload.crear_usuario && !userId) {
      userId = getNextId(db, 'usuarios', 'id_usuario')
      const username = (payload.nombres.split(' ')[0] + payload.apellidos.split(' ')[0]).toLowerCase()
      const stmtUser = db.prepare(`INSERT INTO usuarios (id_usuario, username, email, password_hash, requiere_cambio_password, estado, creado_en) VALUES (?, ?, ?, ?, 1, 'activo', ?)`)
      stmtUser.run(userId, username, `${username}@local`, hashPassword('12345'), timestamp) // Default password
      logAudit(db, 'INSERT', 'usuarios', userId, `Usuario ${username} creado automáticamente`)
    }

    if (workerId) {
      const stmt = db.prepare(`UPDATE trabajadores SET nombres = ?, apellidos = ?, cedula = ?, cargo = ?, salario_base = ?, estado = ?, id_usuario = ?, actualizado_en = ? WHERE id_trabajador = ?`)
      stmt.run(payload.nombres, payload.apellidos, payload.cedula, payload.cargo, payload.salario_base, payload.estado, userId, timestamp, workerId)
      logAudit(db, 'UPDATE', 'trabajadores', workerId, `Trabajador ${payload.nombres} actualizado`)
    } else {
      workerId = getNextId(db, 'trabajadores', 'id_trabajador')
      const stmt = db.prepare(`INSERT INTO trabajadores (id_trabajador, id_usuario, cedula, nombres, apellidos, cargo, salario_base, estado, fecha_ingreso, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      stmt.run(workerId, userId, payload.cedula, payload.nombres, payload.apellidos, payload.cargo, payload.salario_base, payload.estado, localDateDisplaySql(), timestamp)
      logAudit(db, 'INSERT', 'trabajadores', workerId, `Trabajador ${payload.nombres} creado`)
    }

    if (userId) {
      db.prepare(`DELETE FROM usuario_rol WHERE id_usuario = ?`).run(userId)
      if (payload.id_rol) {
        db.prepare(`INSERT INTO usuario_rol (id_usuario, id_rol) VALUES (?, ?)`).run(userId, payload.id_rol)
      }
    }

    return { workerId }
  })
  return transaction()
}

export function resetUserPassword(db: Database.Database, workerId: number): { success: boolean; message?: string } {
  requirePermission(db, 'GESTIONAR_TRABAJADORES')
  try {
    const workerInfo = db.prepare(`SELECT id_usuario FROM trabajadores WHERE id_trabajador = ?`).get(workerId) as any
    if (!workerInfo || !workerInfo.id_usuario) {
      return { success: false, message: 'El trabajador no tiene un usuario de sistema asignado.' }
    }

    const userId = workerInfo.id_usuario
    const newHash = hashPassword('12345')
    db.prepare('UPDATE usuarios SET password_hash = ?, requiere_cambio_password = 1, actualizado_en = ? WHERE id_usuario = ?')
      .run(newHash, localDateTimeSql(), userId)
    
    logAudit(db, 'UPDATE', 'usuarios', userId, 'Contraseña restablecida a valor por defecto')
    return { success: true, message: 'Contraseña restablecida exitosamente.' }
  } catch (err) {
    console.error('Error resetUserPassword:', err)
    return { success: false, message: 'Error al restablecer contraseña.' }
  }
}
