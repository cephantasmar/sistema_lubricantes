# Skill: Database Operations and Schema Management

This skill details how to interact with the SQLite database, execute migrations, verify tables, and ensure integrity when working with manually-assigned integer keys.

## Phase 1: Locating Schema and Database File

1.  **Canonical Schema:** Always treat [schema.sql](file:///c:/Users/CESAR/Documents/trabajo_sis/sis_lubricantes/backend/src/shared/database/schema.sql) as the source of truth for the database layout.
2.  **Runtime Database File:** The database is stored in the Electron user data directory as `inventario-aceites.sqlite`. Its path can be retrieved programmatically using `getDatabasePath()` from `backend/src/main/db/database.ts`.

## Phase 2: Schema Modifications

If you need to alter the database schema:
1.  Modify [schema.sql](file:///c:/Users/CESAR/Documents/trabajo_sis/sis_lubricantes/backend/src/shared/database/schema.sql).
2.  Delete the local database file `inventario-aceites.sqlite` to force a recreate, or write an incremental migration script.
3.  Note: Any schema adjustments must respect the **manual integer primary key constraint** (`id_* INT PRIMARY KEY`) as defined in the project structure.

## Phase 3: safe ID Generation (`getNextId`)

Since auto-increment is not used, you MUST query and calculate the next ID within a database transaction. Use this standard query helper:

```typescript
function getNextId(database: Database.Database, tableName: string, columnName: string): number {
  const result = database.prepare(`SELECT COALESCE(MAX(${columnName}), 0) + 1 AS next_id FROM ${tableName}`).get() as {
    next_id: number
  };
  return Number(result.next_id);
}
```

### Transaction Pattern Example

When inserting a new record, do it inside a transaction to ensure thread-safety:

```typescript
const transaction = database.transaction((payload) => {
  const nextId = getNextId(database, 'productos', 'id_producto');
  database.prepare(`
    INSERT INTO productos (id_producto, codigo, nombre, ...)
    VALUES (?, ?, ?, ...)
  `).run(nextId, payload.codigo, payload.nombre, ...);
  return nextId;
});
transaction(inputData);
```

## Phase 4: Seeding and Verifying Data

The base seeds are defined in `seedDatabase()` inside `backend/src/main/db/database.ts`.
To insert test data safely, write a script using `better-sqlite3` and run it via standard Node execution or add to the seeds list.
