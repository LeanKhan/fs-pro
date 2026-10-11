import { defineConfig } from 'vitest/config';

/**
 * The Vitest runner (OW-N03, docs/coc-mapping/08 §5).
 *
 * The repo-wide `npm test` harness is `node:test` + `tsx` (with
 * `@vue/compiler-sfc` compile checks, since no jsdom is available). Vitest is
 * added as a *second* runner for tests that want its ergonomics (assertions,
 * snapshots, a Vite pipeline); it is deliberately scoped to a distinct
 * `*.vitest.ts` suffix so it never picks up the `node:test` suites — those
 * import `node:test` and would fail under Vitest, and the repo's `test` script
 * globs `*.test.ts` under src (which must stay node:test-only).
 *
 * `environment: 'node'` is enough for the invariants here (they assert on the
 * filesystem and source text, not a DOM).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.vitest.ts'],
  },
});
