import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * The session harness (`tests/harness/`): real wallet sessions run as
 * scripted actors in node against an in-process `was-teaching-server`,
 * booted through its `was-teaching-server/testing` export. Each test file
 * boots its own server and points `VITE_WAS_SERVER_URL` at it before any
 * module under `src/` loads, so files must not share a module graph (the
 * default isolation). Kept out of the default `test:unit` include, and
 * reported with the default reporter so a run prints the measurement
 * tables. Run via `pnpm run test:harness`.
 */
export default defineConfig({
  resolve: {
    // One RxDB copy in the graph; see the note in `vite.config.ts`.
    dedupe: ['rxdb'],
    alias: { '@': path.resolve(dirname, 'src') }
  },
  test: {
    environment: 'node',
    include: ['tests/harness/**/*.test.ts'],
    reporters: ['default'],
    testTimeout: 300_000,
    hookTimeout: 120_000
  }
})
