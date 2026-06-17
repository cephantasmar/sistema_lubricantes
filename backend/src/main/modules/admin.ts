import type Database from 'better-sqlite3'
import type { RoleFormInput, ShiftFormInput, WorkerFormInput } from '../../shared/ipc/contracts'
import { logAudit, requirePermission } from './auth'

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
      const stmtUser = db.prepare(`INSERT INTO usuarios (id_usuario, username, email, password_hash, estado, creado_en) VALUES (?, ?, ?, ?, 'activo', ?)`)
      stmtUser.run(userId, username, `${username}@local`, '12345', timestamp) // Default password
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

function validateShift(payload: ShiftFormInput) {
  const name = payload.nombre.trim()
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

  if (!name) {
    throw new Error('El nombre del turno es obligatorio.')
  }

  if (!timePattern.test(payload.hora_inicio) || !timePattern.test(payload.hora_fin)) {
    throw new Error('Las horas del turno deben tener un formato valido.')
  }

  if (payload.hora_inicio === payload.hora_fin) {
    throw new Error('La hora de inicio y fin no pueden ser iguales.')
  }
}

export function saveShift(db: Database.Database, payload: ShiftFormInput) {
  requirePermission(db, 'GESTIONAR_TURNOS')
  validateShift(payload)

  const transaction = db.transaction(() => {
    const name = payload.nombre.trim()
    const description = payload.descripcion?.trim() || null
    let shiftId = payload.id_turno
    const duplicate = db
      .prepare('SELECT id_turno FROM turnos WHERE lower(nombre) = lower(?) AND id_turno <> ?')
      .get(name, shiftId ?? 0) as { id_turno: number } | undefined

    if (duplicate) {
      throw new Error('Ya existe un turno con ese nombre.')
    }

    if (shiftId) {
      const existing = db.prepare('SELECT id_turno FROM turnos WHERE id_turno = ?').get(shiftId)
      if (!existing) {
        throw new Error('El turno que intentas editar no existe.')
      }

      db.prepare(
        'UPDATE turnos SET nombre = ?, hora_inicio = ?, hora_fin = ?, descripcion = ?, estado = ? WHERE id_turno = ?',
      ).run(name, payload.hora_inicio, payload.hora_fin, description, payload.estado ? 1 : 0, shiftId)
      logAudit(db, 'UPDATE', 'turnos', shiftId, `Turno ${name} actualizado`)
    } else {
      shiftId = getNextId(db, 'turnos', 'id_turno')
      db.prepare(
        'INSERT INTO turnos (id_turno, nombre, hora_inicio, hora_fin, descripcion, estado) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(shiftId, name, payload.hora_inicio, payload.hora_fin, description, payload.estado ? 1 : 0)
      logAudit(db, 'INSERT', 'turnos', shiftId, `Turno ${name} creado`)
    }

    return { shiftId }
  })

  return transaction()
}

export function deleteShift(db: Database.Database, shiftId: number) {
  requirePermission(db, 'GESTIONAR_TURNOS')

  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    throw new Error('El turno seleccionado no es valido.')
  }

  const shift = db.prepare('SELECT nombre FROM turnos WHERE id_turno = ?').get(shiftId) as { nombre: string } | undefined
  if (!shift) {
    throw new Error('El turno seleccionado no existe.')
  }

  const usage = db
    .prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM asistencias WHERE id_turno = ?) +
        (SELECT COUNT(*) FROM historial_turnos WHERE id_turno = ?) +
        (SELECT COUNT(*) FROM ventas WHERE id_turno = ?) AS total
    `,
    )
    .get(shiftId, shiftId, shiftId) as { total: number }

  if (Number(usage.total) > 0) {
    throw new Error('Este turno tiene historial y no puede eliminarse. Deshabilitalo para que no se use en nuevos registros.')
  }

  db.prepare('DELETE FROM turnos WHERE id_turno = ?').run(shiftId)
  logAudit(db, 'DELETE', 'turnos', shiftId, `Turno ${shift.nombre} eliminado`)
  return { deleted: true }
}

export function setShiftState(db: Database.Database, shiftId: number, enabled: boolean) {
  requirePermission(db, 'GESTIONAR_TURNOS')

  if (!Number.isInteger(shiftId) || shiftId <= 0) {
    throw new Error('El turno seleccionado no es valido.')
  }

  const shift = db.prepare('SELECT nombre FROM turnos WHERE id_turno = ?').get(shiftId) as { nombre: string } | undefined
  if (!shift) {
    throw new Error('El turno seleccionado no existe.')
  }

  db.prepare('UPDATE turnos SET estado = ? WHERE id_turno = ?').run(enabled ? 1 : 0, shiftId)
  logAudit(db, 'UPDATE', 'turnos', shiftId, `Turno ${shift.nombre} ${enabled ? 'habilitado' : 'deshabilitado'}`)

  return { shiftId, enabled }
}
