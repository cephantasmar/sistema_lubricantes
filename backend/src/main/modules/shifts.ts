import type Database from 'better-sqlite3'
import type { AttendanceInput } from '../../shared/ipc/contracts'
import { getCurrentWorkerId, logAudit } from './auth'

function getNextId(db: Database.Database, tableName: string, idColumn: string): number {
  const stmt = db.prepare(`SELECT MAX(${idColumn}) as maxId FROM ${tableName}`)
  const result = stmt.get() as { maxId: number | null }
  return (result.maxId ?? 0) + 1
}

export function recordAttendance(db: Database.Database, payload: AttendanceInput) {
  const transaction = db.transaction(() => {
    const workerId = getCurrentWorkerId()
    if (!workerId) {
      throw new Error('El usuario actual no está asociado a ningún trabajador. Imposible registrar asistencia.')
    }

    const attendanceId = getNextId(db, 'asistencias', 'id_asistencia')
    const stmt = db.prepare(`INSERT INTO asistencias (id_asistencia, id_trabajador, tipo, fecha_hora) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`)
    stmt.run(attendanceId, workerId, payload.tipo)

    logAudit(db, 'INSERT', 'asistencias', attendanceId, `Registro de asistencia: ${payload.tipo}`)

    return { attendanceId }
  })
  return transaction()
}
