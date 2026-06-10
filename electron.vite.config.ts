import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: {
        entry: resolve('backend/src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      lib: {
        entry: resolve('backend/src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    root: resolve('frontend'),
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve('frontend/index.html'),
      },
    },
    resolve: {
      alias: {
        '@renderer': resolve('frontend/src'),
        '@shared': resolve('backend/src/shared'),
      },
    },
  },
})
