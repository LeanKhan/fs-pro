import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the fs-pro end-to-end flows (Batch 1C).
 *
 * The dev stack must already be running (see docs/perfect/B1-1C-REPORT.md):
 *   - API on http://localhost:3010 (PORT=3010 npm run dev --workspace fs-pro-server)
 *   - client on http://localhost:8080 (`VITE_APP_API_BASE_URL=http://localhost:3010`)
 * Override the client with E2E_BASE_URL. The repo's node_modules is
 * win32-native (BASELINE.md §0), so run the suite through Windows Node:
 *   cmd.exe /c "npx playwright test"
 *
 * Screenshots are written by the spec into tests/e2e/artifacts/<project>/.
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './specs',
  outputDir: './artifacts/test-results',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Chromium mobile emulation at the brief's 390x844 viewport.
      name: 'mobile-390x844',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],
});
