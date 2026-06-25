import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
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

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash.includes(':')) {
    return password === storedHash
  }
  const [salt, hash] = storedHash.split(':')
  const computedHash = crypto.scryptSync(password, salt, 64).toString('hex')
  return hash === computedHash
}

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
  const isAdminLike = userId === 1 || normalizedRoles.some((role) => role === 'admin' || role === 'administrador' || role === 'gerente')

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
    canViewAllAttendance: access.isAdminLike || access.permissionNames.includes('VER_ASISTENCIAS'),
  }
}

export function hasPermission(db: Database.Database, permissionName: string) {
  const access = getCurrentUserAccess(db)
  return (currentActiveUser?.id_usuario === 1) || access.permissionNames.includes(permissionName)
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

export function changePassword(db: Database.Database, userId: number, newPasswordPlain: string): { success: boolean; message?: string } {
  try {
    const hash = hashPassword(newPasswordPlain)
    db.prepare('UPDATE usuarios SET password_hash = ?, requiere_cambio_password = 0, actualizado_en = ? WHERE id_usuario = ?')
      .run(hash, localDateTimeSql(), userId)
    logAudit(db, 'UPDATE', 'usuarios', userId, 'Cambio de contraseña completado')
    return { success: true }
  } catch (err) {
    console.error('changePassword error:', err)
    return { success: false, message: 'Error al cambiar contraseña' }
  }
}

export function login(db: Database.Database, payload: AuthInput): AuthResult {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.id_usuario, 
        u.username, 
        u.password_hash, 
        u.requiere_cambio_password,
        u.estado as usuario_estado, 
        t.id_trabajador, 
        t.nombres,
        t.estado as trabajador_estado
      FROM usuarios u
      LEFT JOIN trabajadores t ON t.id_usuario = u.id_usuario
      WHERE u.username = ?
    `)
    const user = stmt.get(payload.username) as any

    if (!user) {
      return { success: false, message: 'Usuario no encontrado.' }
    }
    
    if (user.usuario_estado !== 'activo' || (user.id_trabajador && user.trabajador_estado !== 'activo')) {
      return { success: false, message: 'El usuario o trabajador se encuentra inactivo.' }
    }

    if (!verifyPassword(payload.password_plain, user.password_hash)) {
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
      requiresPasswordChange: Boolean(user.requiere_cambio_password),
      user: currentActiveUser
    }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false, message: 'Error interno del servidor.' }
  }
}
