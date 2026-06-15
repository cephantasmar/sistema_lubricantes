import type Database from 'better-sqlite3'
import type { AuthInput, AuthResult } from '../../shared/ipc/contracts'

export let currentActiveUser: { id_usuario: number; username: string; id_trabajador: number | null; nombres: string | null } | null = null

function getNextId(db: Database.Database, tableName: string, idColumn: string): number {
  const stmt = db.prepare(`SELECT MAX(${idColumn}) as maxId FROM ${tableName}`)
  const result = stmt.get() as { maxId: number | null }
  return (result.maxId ?? 0) + 1
}

export function getCurrentUserId(): number {
  return currentActiveUser ? currentActiveUser.id_usuario : 1 // 1 = system
}

export function getCurrentUsername(): string {
  return currentActiveUser ? currentActiveUser.username : 'system'
}

export function getCurrentWorkerId(): number | null {
  return currentActiveUser ? currentActiveUser.id_trabajador : null
}

export function logAudit(db: Database.Database, accion: string, modulo: string, idRegistro: number | null, descripcion: string) {
  try {
    const stmt = db.prepare(`
      INSERT INTO auditoria_logs (id_log, id_usuario, accion, modulo, tabla_afectada, id_registro, descripcion, ip_origen, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    stmt.run(
      getNextId(db, 'auditoria_logs', 'id_log'),
      getCurrentUserId(),
      accion,
      modulo,
      null,
      idRegistro,
      descripcion,
      '127.0.0.1'
    )
  } catch (err) {
    console.error('Failed to log audit event:', err)
  }
}

export function login(db: Database.Database, payload: AuthInput): AuthResult {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.id_usuario, 
        u.username, 
        u.password_hash, 
        u.estado, 
        t.id_trabajador, 
        t.nombres
      FROM usuarios u
      LEFT JOIN trabajadores t ON t.id_usuario = u.id_usuario
      WHERE u.username = ?
    `)
    const user = stmt.get(payload.username) as any

    if (!user) {
      return { success: false, message: 'Usuario no encontrado.' }
    }
    
    if (user.estado !== 'activo') {
      return { success: false, message: 'Usuario inactivo.' }
    }

    // Basic password check since the app is offline and local.
    // The seed data uses 'password123' as password_hash.
    if (user.password_hash !== payload.password_plain) {
      return { success: false, message: 'Contraseña incorrecta.' }
    }

    currentActiveUser = {
      id_usuario: user.id_usuario,
      username: user.username,
      id_trabajador: user.id_trabajador,
      nombres: user.nombres,
    }

    logAudit(db, 'LOGIN', 'auth', null, 'Inicio de sesión exitoso')

    return {
      success: true,
      user: currentActiveUser
    }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false, message: 'Error interno del servidor.' }
  }
}
