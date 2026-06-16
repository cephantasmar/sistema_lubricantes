import type Database from 'better-sqlite3'
import type { AuthInput, AuthResult } from '../../shared/ipc/contracts'

export type ActiveUser = {
  id_usuario: number
  username: string
  id_trabajador: number | null
  nombres: string | null
  roleNames: string[]
  permissionNames: string[]
  isAdminLike: boolean
}

export let currentActiveUser: ActiveUser | null = null

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function localDateTimeSql() {
  const date = new Date()

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())} ${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`
}

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

function normalizeAccessName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function resolveUserAccess(db: Database.Database, userId: number) {
  const roles = db
    .prepare(
      `
      SELECT r.nombre
      FROM usuario_rol ur
      INNER JOIN roles r ON r.id_rol = ur.id_rol
      WHERE ur.id_usuario = ? AND r.estado = 1
      ORDER BY r.nombre ASC
    `,
    )
    .all(userId) as { nombre: string }[]

  const permissions = db
    .prepare(
      `
      SELECT DISTINCT p.nombre
      FROM usuario_rol ur
      INNER JOIN roles r ON r.id_rol = ur.id_rol AND r.estado = 1
      INNER JOIN rol_permiso rp ON rp.id_rol = r.id_rol
      INNER JOIN permisos p ON p.id_permiso = rp.id_permiso
      WHERE ur.id_usuario = ?
      ORDER BY p.nombre ASC
    `,
    )
    .all(userId) as { nombre: string }[]

  const roleNames = roles.map((role) => role.nombre)
  const permissionNames = permissions.map((permission) => permission.nombre)
  const normalizedRoles = roleNames.map(normalizeAccessName)
  const isAdminLike = normalizedRoles.some((role) => role === 'admin' || role.includes('administrador') || role.includes('gerente'))

  return {
    roleNames,
    permissionNames,
    isAdminLike,
  }
}

export function getCurrentUserAccess(db: Database.Database) {
  if (!currentActiveUser) {
    return {
      roleNames: [],
      permissionNames: [],
      isAdminLike: false,
      canViewAllAttendance: false,
    }
  }

  const access = resolveUserAccess(db, currentActiveUser.id_usuario)
  currentActiveUser = {
    ...currentActiveUser,
    ...access,
  }

  return {
    ...access,
    canViewAllAttendance: access.isAdminLike,
  }
}

export function hasPermission(db: Database.Database, permissionName: string) {
  const access = getCurrentUserAccess(db)
  return access.isAdminLike || access.permissionNames.includes(permissionName)
}

export function requirePermission(db: Database.Database, permissionName: string) {
  if (!currentActiveUser) {
    throw new Error('Debes iniciar sesion para realizar esta accion.')
  }

  if (!hasPermission(db, permissionName)) {
    throw new Error('No tienes permiso para realizar esta accion.')
  }
}

export function logAudit(db: Database.Database, accion: string, modulo: string, idRegistro: number | null, descripcion: string) {
  try {
    const stmt = db.prepare(`
      INSERT INTO auditoria_logs (id_log, id_usuario, accion, modulo, tabla_afectada, id_registro, descripcion, ip_origen, fecha_evento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      getNextId(db, 'auditoria_logs', 'id_log'),
      getCurrentUserId(),
      accion,
      modulo,
      null,
      idRegistro,
      descripcion,
      '127.0.0.1',
      localDateTimeSql()
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

    const access = resolveUserAccess(db, user.id_usuario)

    currentActiveUser = {
      id_usuario: user.id_usuario,
      username: user.username,
      id_trabajador: user.id_trabajador,
      nombres: user.nombres,
      ...access,
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
