import type Database from 'better-sqlite3'
import { app, dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { logAudit } from './auth'
import { closeDatabase, getDatabasePath } from '../db/database'

/**
 * Runs an automatic hot backup daily. Keeps the last 5 backups.
 */
export function runAutomaticBackup(db: Database.Database): void {
  try {
    const userData = app.getPath('userData')
    const backupsDir = join(userData, 'backups')

    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true })
    }

    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`
    const filename = `auto_backup_${todayStr}.sqlite`
    const backupPath = join(backupsDir, filename)

    // Check if backup already exists for today
    if (existsSync(backupPath)) {
      console.log('Automatic backup already exists for today:', filename)
      return
    }

    // Execute safe online hot backup
    db.backup(backupPath)
      .then(() => {
        console.log('Automatic daily backup created successfully:', filename)

        // Clean up older backups (keep last 5)
        try {
          const files = readdirSync(backupsDir)
          const autoBackups = files
            .filter(f => f.startsWith('auto_backup_') && f.endsWith('.sqlite'))
            .sort() // Sort alphabetically (earliest dates first)

          if (autoBackups.length > 5) {
            const toDelete = autoBackups.slice(0, autoBackups.length - 5)
            for (const file of toDelete) {
              unlinkSync(join(backupsDir, file))
              console.log('Deleted old automatic backup:', file)
            }
          }
        } catch (err) {
          console.error('Error cleaning up old automatic backups:', err)
        }
      })
      .catch((err) => {
        console.error('Failed to create automatic daily backup:', err)
      })
  } catch (err) {
    console.error('Error running automatic backup:', err)
  }
}

/**
 * Exposes a dialog to save the database manually.
 */
export async function createBackupManual(db: Database.Database): Promise<{ success: boolean; message: string; destPath?: string }> {
  try {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const defaultFilename = `backup_lubricantes_${yyyy}-${mm}-${dd}.sqlite`
    const defaultPath = join(app.getPath('downloads'), defaultFilename)

    const win = BrowserWindow.getFocusedWindow() || undefined
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Exportar Copia de Seguridad',
      defaultPath: defaultPath,
      filters: [
        { name: 'Base de datos SQLite', extensions: ['sqlite', 'db'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ]
    })

    if (canceled || !filePath) {
      return { success: false, message: 'Operación cancelada por el usuario.' }
    }

    await db.backup(filePath)

    logAudit(db, 'EXPORT_BACKUP', 'backup', null, `Copia de seguridad exportada manualmente a: ${filePath}`)

    return {
      success: true,
      message: 'Copia de seguridad creada con éxito.',
      destPath: filePath
    }
  } catch (err) {
    console.error('Error creating manual backup:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Error interno al crear el backup.'
    }
  }
}

/**
 * Exposes a dialog to select a database backup, confirm and restore it, then restarts the app.
 */
export async function restoreBackupManual(db: Database.Database): Promise<{ success: boolean; message: string }> {
  try {
    const win = BrowserWindow.getFocusedWindow() || undefined
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      title: 'Restaurar Copia de Seguridad',
      filters: [
        { name: 'Base de datos SQLite', extensions: ['sqlite', 'db'] },
        { name: 'Todos los archivos', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, message: 'Operación cancelada por el usuario.' }
    }

    const selectedPath = filePaths[0]

    const { response } = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Cancelar', 'Confirmar y Reiniciar'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirmar Restauración',
      message: '¿Está seguro de que desea restaurar esta copia de seguridad?',
      detail: 'Se reemplazarán todos los datos actuales con los del archivo seleccionado y la aplicación se reiniciará automáticamente para aplicar los cambios.'
    })

    if (response !== 1) {
      return { success: false, message: 'Restauración cancelada.' }
    }

    logAudit(db, 'IMPORT_BACKUP', 'backup', null, `Restauración de copia de seguridad iniciada desde: ${selectedPath}`)

    // Close connection cleanly
    closeDatabase()

    // Copy selected file over active database file
    const activeDbPath = getDatabasePath()
    copyFileSync(selectedPath, activeDbPath)

    // Restart Electron application
    app.relaunch()
    app.exit(0)

    return { success: true, message: 'Copia de seguridad restaurada. Reiniciando...' }
  } catch (err) {
    console.error('Error restoring backup:', err)
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Error interno al restaurar el backup.'
    }
  }
}
