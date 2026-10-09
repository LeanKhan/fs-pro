import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

/**
 * PHASE 2, BATCH 4B — 3D campus canvas + advisor QA (threejs-qa-release pass).
 *
 * Two independent suites:
 *   A. `campus lab` — the real `World` + `CozyAdvisor` on a dev harness
 *      (`/campus-advisor-lab.html`); canvas pixel metrics, renderer stats, named-state
 *      screenshots and an fps read at both viewports. No backend.
 *   B. `live campus` — register -> found on the REAL stack, then the campus
 *      with the advisor active: screenshots and the authoritative fps read.
 *
 * Run (Windows Node, from tests/e2e):
 *   set E2E_BASE_URL=http://localhost:8091
 *   node <repo>\node_modules\@playwright\test\cli.js test specs/campus-qa.spec.ts --reporter=list
 *
 * The live suite also needs E2E_API_URL (default http://localhost:3010).
 */

const ASSETS = path.resolve(process.cwd(), '..', '..', 'docs', 'perfect', 'phase-2', 'assets', 'visual-qa');
const API = (process.env.E2E_API_URL ?? 'http://localhost:3010').replace(/\/$/, '');

// The fps gate needs the discrete GPU: on this hybrid-graphics laptop Chromium
// defaults to the Intel iGPU. Run headed with:
//   node .../cli.js test specs/campus-qa.spec.ts --headed
// (headless forces SwiftShader, which is not a real frame-rate measurement).
test.use({
  launchOptions: { args: ['--force_high_performance_gpu', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] },
});

// ---------------------------------------------------------------------------
// A. Campus lab — canvas inspection + fps (no backend)
// ---------------------------------------------------------------------------

/** Screenshot the WebGL canvas (compositor, not a live readback) and describe its pixels. */
async function canvasMetrics(page: Page) {
  const canvas = page.locator('.stage canvas').first();
  if (!(await canvas.count())) return null;
  const buf = await canvas.screenshot();
  const png = PNG.sync.read(buf);
  const d = png.data;
  const n = png.width * png.height;
  let sum = 0;
  let min = 255;
  let max = 0;
  const shades = new Set<number>();
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l;
    if (l < min) min = l;
    if (l > max) max = l;
    if ((i / 4) % 5 === 0) shades.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    variance += (l - mean) ** 2;
  }
  const gpu = await page.evaluate(() => {
    const cv = document.querySelector('.stage canvas') as HTMLCanvasElement | null;
    const gl = (cv?.getContext('webgl2') || cv?.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  return {
    width: png.width,
    height: png.height,
    gpu,
    mean: Math.round(mean),
    min: Math.round(min),
    max: Math.round(max),
    std: Math.round(Math.sqrt(variance / n)),
    uniqueShades: shades.size,
    blank: max - min < 8,
  };
}

async function rafFps(page: Page, ms: number) {
  return page.evaluate(
    (duration) =>
      new Promise<{ fps: number; frames: number; p95: number; worst: number }>((resolve) => {
        const times: number[] = [];
        let frames = 0;
        let last = performance.now();
        const start = last;
        const tick = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          frames += 1;
          if (now - start >= duration) {
            const sorted = [...times].sort((a, b) => a - b);
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
            resolve({
              fps: Math.round((frames * 1000) / (now - start)),
              frames,
              p95: Math.round(p95 * 10) / 10,
              worst: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
}

const LAB_STATES = ['campus-advisor', 'campus-advisor-point', 'campus-advisor-excited'] as const;

test.describe('A. campus lab', () => {
  for (const state of LAB_STATES) {
    test(`canvas + advisor: ${state}`, async ({ page }, testInfo) => {
      await page.goto(`/campus-advisor-lab.html?state=${state}`);
      await expect(page.locator('.stage canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.cozy-advisor')).toBeVisible({ timeout: 30_000 });
      await page.evaluate((s) => (window as unknown as { __CAMPUS_TEST_HOOKS__: { setState(x: string): Promise<unknown> } }).__CAMPUS_TEST_HOOKS__.setState(s), state);
      await page.waitForTimeout(600);
      if (state !== 'campus-advisor') {
        await expect(page.locator('.adv-sightline')).toBeVisible();
      }

      const metrics = await canvasMetrics(page);
      expect(metrics, 'campus canvas present').not.toBeNull();
      expect(metrics!.blank, `canvas is blank (max-min=${metrics!.max - metrics!.min})`).toBe(false);
      expect(metrics!.std, 'canvas has no visual variation').toBeGreaterThan(4);
      expect(metrics!.uniqueShades, 'canvas has too few shades').toBeGreaterThan(8);

      const tag = testInfo.project.name;
      fs.mkdirSync(ASSETS, { recursive: true });
      await page.screenshot({ path: path.join(ASSETS, `campus-${state}-${tag}.png`), animations: 'disabled' });
      fs.writeFileSync(path.join(ASSETS, `campus-${state}-${tag}.json`), JSON.stringify({ metrics, viewport: testInfo.project.name }, null, 1));
      console.log(`[canvas ${state} ${tag}] ${JSON.stringify(metrics)}`);
    });
  }

  test('campus lab fps with the advisor animating', async ({ page }, testInfo) => {
    await page.goto('/campus-advisor-lab.html?state=campus-advisor-point');
    await expect(page.locator('.stage canvas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.cozy-advisor')).toBeVisible({ timeout: 30_000 });
    // Warm up: shader compilation and the first frames are not steady state.
    await page.waitForTimeout(2500);
    const fps = await rafFps(page, 5000);
    const gpu = await page.evaluate(() => {
      const cv = document.querySelector('.stage canvas') as HTMLCanvasElement | null;
      const gl = (cv?.getContext('webgl2') || cv?.getContext('webgl')) as WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    });
    const stats = await page.evaluate(() => (window as unknown as { __CAMPUS_TEST_HOOKS__: { stats(): unknown } }).__CAMPUS_TEST_HOOKS__.stats());
    const tag = testInfo.project.name;
    fs.mkdirSync(ASSETS, { recursive: true });
    fs.writeFileSync(path.join(ASSETS, `campus-fps-lab-${tag}.json`), JSON.stringify({ fps, stats, gpu }, null, 1));
    console.log(`[campus-lab fps ${tag}] ${JSON.stringify(fps)} gpu=${gpu} stats=${JSON.stringify(stats)}`);
    // The authoritative fps gate is the live campus (suite B). This lab read is
    // a secondary sanity check: headed Chromium windows can lose foreground
    // focus between tests, so it only guards against a gross regression.
    expect(fps.fps, `campus lab fps below 30`).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// B. Live campus — register, found, then the campus + advisor at this viewport
// ---------------------------------------------------------------------------

function shotter(testInfo: TestInfo) {
  const dir = path.join(ASSETS);
  fs.mkdirSync(dir, { recursive: true });
  return async (page: Page, name: string) => {
    await page.screenshot({ path: path.join(dir, `${name}-${testInfo.project.name}.png`), animations: 'disabled' });
  };
}

function stamp(): string {
  return `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`.toLowerCase();
}

async function register(page: Page, who: string) {
  await page.goto('/auth/join');
  await expect(page.locator('form.form')).toBeVisible();
  await page.locator('input[autocomplete="name"]').fill(`Owner ${who}`);
  await page.locator('input[type="email"]').fill(`qa4b-${who}@example.com`);
  await page.locator('input[autocomplete="username"]').fill(`qa${who}`);
  await page.locator('input[autocomplete="new-password"]').first().fill('e2e-password-123');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('e2e-password-123');
  await page.getByRole('button', { name: /Create account/i }).click();
}

async function foundClub(page: Page, who: string): Promise<string> {
  await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });
  await expect(page.locator('.found-panel')).toBeVisible({ timeout: 30_000 });
  const countryInput = page.locator('input[placeholder="e.g. Verdania"]');
  if (await countryInput.count()) {
    await countryInput.fill(`Verdania${who}`);
    const countryCode = page.locator('.found-panel input.code').first();
    if ((await countryCode.inputValue()).length < 2) await countryCode.fill(`V${who.slice(-2).toUpperCase()}`);
  }
  const regionInput = page.locator('input[placeholder="e.g. The Northern Reach"]');
  if (await regionInput.count()) await regionInput.fill(`Northreach${who}`);
  const townInput = page.locator('input[placeholder="e.g. Port Ellis"]');
  if (await townInput.count()) await townInput.fill(`Port${who}`);
  await page.getByRole('button', { name: /Next: your club/i }).click();
  await expect(page.locator('.club-form')).toBeVisible();
  // Long, culture-flavoured name: culture-name fit in the real HUD.
  await page.getByLabel('Club name').fill(`VendoorStein Atletihk ${who}`);
  await page.getByLabel('Code').fill(`V${who}`.toUpperCase().slice(0, 4));
  await expect(page.getByRole('button', { name: /Next: kick-off/i })).toBeEnabled();
  await page.getByRole('button', { name: /Next: kick-off/i }).click();
  await page.getByRole('button', { name: /^Found / }).click();
  await expect(page.getByRole('button', { name: /Go to your ground/i })).toBeVisible({ timeout: 30_000 });
  // The founding response updates the user store; read the new club id from it
  // rather than relying on the post-found navigation (kept deterministic).
  const clubId = await page.evaluate(() => {
    const u = JSON.parse(localStorage.getItem('fspro-user') || '{}') as { clubs?: unknown[] };
    const c = u.clubs?.[0];
    return typeof c === 'string' ? c : ((c as { _id?: string })?._id ?? '');
  });
  expect(clubId, 'founding returned a club id').not.toEqual('');
  return clubId;
}

async function dismissAway(page: Page) {
  const letsGo = page.getByRole('button', { name: /Let's go!/i });
  if ((await letsGo.count()) && (await letsGo.first().isVisible().catch(() => false))) {
    await letsGo.first().click();
  }
}

test('live campus with the advisor active: screenshot + fps', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 200)}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('fspro_sfx', 'off');
  });
  const who = stamp();
  const shot = shotter(testInfo);

  await register(page, who);
  const clubId = await foundClub(page, who);
  await page.goto(`/game/${clubId}?welcome=1`);
  await page.waitForTimeout(4000);
  await dismissAway(page);
  await expect(page.locator('.cozy-advisor')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cozy-advisor')).toContainText(/V\d/i, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await dismissAway(page);
  await shot(page, 'campus-live-advisor');

  const metrics = await canvasMetrics(page);
  const gpu = (await page.evaluate(() => {
    const cv = document.querySelector('.stage canvas') as HTMLCanvasElement | null;
    const gl = (cv?.getContext('webgl2') || cv?.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  })) as string;
  const fps = await rafFps(page, 5000);

  fs.mkdirSync(ASSETS, { recursive: true });
  const tag = testInfo.project.name;
  const report = { clubId, gpu, metrics, fps, viewport: tag, consoleErrors: consoleErrors.slice(0, 10), url: page.url() };
  fs.writeFileSync(path.join(ASSETS, `campus-fps-live-${tag}.json`), JSON.stringify(report, null, 1));
  console.log(`[campus-live ${tag}] gpu=${gpu} fps=${JSON.stringify(fps)} metrics=${JSON.stringify(metrics)} errors=${consoleErrors.length} url=${page.url()}`);

  expect(metrics, 'live campus canvas present').not.toBeNull();
  expect(metrics!.blank).toBe(false);
  const floor = tag.startsWith('mobile') ? 30 : 55;
  expect(fps.fps, `live campus fps below ${floor}`).toBeGreaterThanOrEqual(floor);
});

export {};
