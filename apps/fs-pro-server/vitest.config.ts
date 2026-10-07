import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure server modules (Batch 1C).
 *
 * The tests live in ./test (outside tsconfig's `src/**` include) so the
 * production `tsc` build is unaffected. They import the modules under test
 * from ../src. `npm test` runs this config (`vitest run`).
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    /**
     * Several server modules pull in the DB layer transitively (pyramid.service
     * -> db/drizzle -> repositories -> auth -> sessionStore), and sessionStore.ts:72
     * throws at import time without DATABASE_URL. The `postgres` client is lazy,
     * so a placeholder is enough; no unit test here touches the DB.
     */
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://fspro:fspro@localhost:5434/fspro',
    },
  },
});
