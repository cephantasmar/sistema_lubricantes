# Skill: Verify Project Integrity

This skill provides step-by-step instructions to verify that the project is in a valid state, compile-ready, and free from TypeScript compilation errors.

## Phase 1: Environment and Setup Checks

1. Verify that `package.json` contains dependencies (`electron`, `better-sqlite3`, etc.).
2. Ensure `node_modules` is populated by executing `npm install` if necessary.

## Phase 2: Compile & Type Check

To check the project for TypeScript and code compiling errors, execute the following command in the workspace root:

```powershell
npm run typecheck
```

*This command compiles both the backend (node process) and frontend (web client) configurations.*

## Phase 3: Electron Build

To verify that the assets package and build correctly, run:

```powershell
npm run build
```

This runs `electron-vite build` and outputs compilation results into the `dist/` directory.

## Phase 4: Main/Preload Bridge Contracts Integrity

Verify that any updates to backend modules (`backend/src/main/modules/`) correspond to updates in the IPC contracts defined in:
*   [contracts.ts](file:///c:/Users/CESAR/Documents/trabajo_sis/sis_lubricantes/backend/src/shared/ipc/contracts.ts)
*   [index.ts](file:///c:/Users/CESAR/Documents/trabajo_sis/sis_lubricantes/backend/src/preload/index.ts)
