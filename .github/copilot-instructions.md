# Project Instructions

- Keep the codebase split between `backend/src/main`, `backend/src/preload`, `backend/src/shared`, and `frontend`.
- Treat `backend/src/shared/database/schema.sql` as the canonical SQLite schema.
- Prefer small, testable modules for database access and IPC handlers.
- Keep renderer code free of direct filesystem or database access; use the preload bridge.
- Preserve the current folder structure when adding new features.
