# Sistema de inventario para tienda de aceites

Base inicial de escritorio construida con Electron, TypeScript y SQLite.

## Estructura

- `backend/src/main`: proceso principal de Electron, base de datos e IPC.
- `backend/src/preload`: puente seguro entre frontend y backend.
- `backend/src/shared`: contratos compartidos y el esquema SQLite.
- `frontend`: interfaz de usuario.

## Base de datos

El esquema inicial está en `backend/src/shared/database/schema.sql` y se ejecuta desde el proceso principal al abrir la aplicación.

## Comandos

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`

## Nota

Los campos `id_*` quedan definidos como llaves primarias manuales para respetar el esquema solicitado. Más adelante se puede migrar a una estrategia de autoincremento o UUID sin romper la separación por capas.
