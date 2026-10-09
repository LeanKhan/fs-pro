import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PHASE 2, BATCH 3C — the whole new-owner flow on the REAL stack.
 *
 * register -> found (balance reveal) -> hire a manager -> sign a legal squad ->
 * build a Tier-1 -> qualifying friendlies -> Level 1 -> the league is joined.
 *
 * This spec runs against the live dev stack (client :8080, Node API :3010,
 * Go world-service, migrated Postgres), NOT route mocks. Start the stack and
 * run it (through Windows Node, matching the repo's win32 node_modules):
 *
 *   set E2E_BASE_URL=http://localhost:8080
 *   npx playwright test specs/owner-journey.spec.ts --reporter=list
 *
 * Screenshots land in tests/e2e/artifacts/<project>/owner-journey/.
 * The cross-device check opens a second browser context with the first one's
 * storageState and asserts both see the same server program state.
 *
 * With a high GAME_TIME_SCALE (the harness uses 50) the 300s friendly cooldown
 * is ~6s and a Tier-1 build ~24s, so the whole journey fits the test timeout.
 */

const GAME_TIME_SCALE = Number(process.env.E2E_GAME_TIME_SCALE ?? '50');
/** The API origin the client itself talks to (VITE_APP_API_BASE_URL). */
const API = (process.env.E2E_API_URL ?? 'http://localhost:3010').replace(/\/$/, '');

// Reduced motion keeps the campus deterministic (no bob/typewriter/count-up
// races) without changing any program state.
test.use({ reducedMotion: 'reduce' });

function shotter(testInfo: TestInfo) {
  const dir = path.join('artifacts', testInfo.project.name, 'owner-journey');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (page: Page, name: string) => {
    n += 1;
    await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-${name}.png`), animations: 'disabled' });
  };
}

/** Stamp unique enough for the parallel desktop/mobile projects. */
function stamp(): string {
  return `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`.toLowerCase();
}

async function dismissAway(page: Page) {
  const letsGo = page.getByRole('button', { name: /Let's go!/i });
  if ((await letsGo.count()) && (await letsGo.first().isVisible().catch(() => false))) {
    await letsGo.first().click();
  }
}

async function register(page: Page, who: string) {
  await page.goto('/auth/join');
  await expect(page.locator('form.form')).toBeVisible();
  await page.locator('input[autocomplete="name"]').fill(`Owner ${who}`);
  await page.locator('input[type="email"]').fill(`e2e-${who}@example.com`);
  await page.locator('input[autocomplete="username"]').fill(`own${who}`);
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
  await page.getByLabel('Club name').fill(`Journey United ${who}`);
  await page.getByLabel('Code').fill(`J${who}`.toUpperCase().slice(0, 4));
  await expect(page.getByRole('button', { name: /Next: kick-off/i })).toBeEnabled();
  await page.getByRole('button', { name: /Next: kick-off/i }).click();
  await page.getByRole('button', { name: /^Found / }).click();
  await expect(page.getByRole('button', { name: /Go to your ground/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Go to your ground/i }).click();
  await expect(page).toHaveURL(/\/game\//, { timeout: 30_000 });
  const clubId = page.url().match(/\/game\/([^/?#]+)/)?.[1] ?? '';
  expect(clubId).not.toEqual('');
  return clubId;
}

/** Read the program state straight from the API for cross-device assertions. */
async function programState(page: Page, clubId: string): Promise<{ step: string; programXp: number; stepStars: Record<string, number> }> {
  return page.evaluate(
    async ([api, id]) => {
      const res = await fetch(`${api}/api/program/${id}`, { credentials: 'include' });
      const body = await res.json();
      const p = body.payload ?? body;
      return { step: p.step, programXp: p.programXp, stepStars: p.stepStars ?? {} };
    },
    [API, clubId] as const
  );
}

/**
 * Some steps add unread inbox cards, which make the campus open the "While you
 * were away" modal over the matchmaking modal. Clear the inbox first so PLAY
 * is unobstructed.
 */
async function clearInbox(page: Page, clubId: string) {
  await page.evaluate(
    async ([api, id]) => {
      await fetch(`${api}/api/play/${id}/inbox/read`, { method: 'POST', credentials: 'include' });
      localStorage.setItem(`fspro_last_seen_${id}`, String(Date.now()));
    },
    [API, clubId] as const
  );
}

async function openProgram(page: Page, clubId: string) {
  // The campus entry (`.program-chip`) is asserted visible in the test; here we
  // deep-link to the screen, which is deterministic even when the campus has an
  // unrelated modal backdrop open over the chip.
  await page.goto(`/game/${clubId}/program`);
  await expect(page.locator('.op')).toBeVisible({ timeout: 30_000 });
}

test('new owner journey: register -> found -> manager -> squad -> build -> Level 1 -> league', async ({ page, browser }, testInfo) => {
  test.setTimeout(600_000);
  const who = stamp();
  const shot = shotter(testInfo);

  await page.addInitScript(() => {
    localStorage.setItem('fspro_play_mode', 'quick_sim');
    localStorage.setItem('fspro_sfx', 'off');
  });

  // --- 1. Register ----------------------------------------------------------
  await register(page, who);
  await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });
  await shot(page, 'register');

  // --- 2. Found + balance reveal -------------------------------------------
  const clubId = await foundClub(page, who);
  await dismissAway(page);
  await expect(page.locator('.program-chip')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.program-chip')).toContainText(/Owner's program/i);
  // The advisor is prominent and its balance.reveal tip is Villa money (L13),
  // served by the Go tip engine through the new Node proxy (L9).
  await expect(page.locator('.cozy-advisor')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cozy-advisor')).toContainText(/V\d/i, { timeout: 30_000 });
  await shot(page, 'campus-advisor');

  await openProgram(page, clubId);
  await expect(page.locator('.op-balance')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.op-balance-amount')).toContainText(/V\d/i);
  await shot(page, 'balance-reveal');
  await page.getByRole('button', { name: /start the program/i }).click();

  // --- 3. Hire a manager ----------------------------------------------------
  await expect(page.locator('.op-mgr').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, 'managers');
  // Interview the first manager (paid reveal), then sign through the modal.
  await page.locator('.op-mgr').first().locator('.op-btn.ghost').click();
  await expect(page.locator('.op-mgr').first().locator('.op-mgr-badge')).toBeVisible({ timeout: 20_000 });
  await page.locator('.op-mgr').first().locator('.op-btn.primary').click();
  await expect(page.locator('.op-modal-card')).toBeVisible();
  await shot(page, 'manager-negotiate');
  await page.locator('.op-modal-actions .op-btn.primary').click();
  // The server advances on sign, so the squad step may appear without 3B's
  // client-side star overlay (see the known-gaps note). Capture it if present.
  await page.waitForTimeout(1_200);
  if (await page.locator('.op-reveal-card').count()) {
    await shot(page, 'manager-star-reveal');
    await page.locator('.op-reveal-card .op-btn.primary').click();
  }

  // --- 3b. Cross-device: a second context sees the SAME server state --------
  await expect(page.locator('.op-meter')).toBeVisible({ timeout: 30_000 });
  const state1 = await programState(page, clubId);
  expect(state1.step).toEqual('players');
  const storage = await page.context().storageState();
  const ctx2 = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.goto(`/game/${clubId}/program`);
  await expect(page2.locator('.op')).toBeVisible({ timeout: 30_000 });
  const state2 = await programState(page2, clubId);
  expect(state2.step).toEqual(state1.step);
  expect(state2.programXp).toEqual(state1.programXp);
  expect(state2.stepStars).toEqual(state1.stepStars);
  await page2.screenshot({ path: path.join('artifacts', testInfo.project.name, 'owner-journey', 'cross-device-second-context.png'), animations: 'disabled' });
  await ctx2.close();
  await shot(page, 'squad-empty');

  // --- 4. Sign a legal squad: a keeper first, then the cheapest outfielders --
  await page.locator('.op-posfilter button', { hasText: 'GK' }).first().click();
  await page.locator('.op-player .op-pbtn.primary:not([disabled])').first().click();
  await page.waitForTimeout(500);
  await page.locator('.op-posfilter button', { hasText: 'ALL' }).first().click();
  await page.waitForTimeout(300);

  let signed = 0;
  for (let i = 0; i < 16; i++) {
    if (await page.locator('.op-fac-grid').count()) break; // advanced to facilities
    const sign = page.locator('.op-player .op-pbtn.primary:not([disabled])').first();
    if (!(await sign.count())) break;
    await sign.click();
    signed += 1;
    await page.waitForTimeout(450);
  }
  expect(signed).toBeGreaterThanOrEqual(10);

  // --- 5. Build a Tier-1 facility ------------------------------------------
  await expect(page.locator('.op-fac-grid')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'facilities');
  const training = page.locator('.op-fac', { hasText: 'Training Ground' }).first();
  await training.getByRole('button', { name: /Build Tier 1/i }).click();
  await expect(page.locator('.op-fac-building')).toBeVisible({ timeout: 20_000 });

  // The step completes when the build finishes; the upgrade is completed
  // lazily on a campus read and the program read can race it, so poll: each
  // load's campus GET completes the due upgrade, and the next load advances.
  const buildWait = Math.ceil((20 * 60 * 1000) / GAME_TIME_SCALE) + 6_000;
  await page.waitForTimeout(buildWait);
  let atLevel1 = false;
  for (let i = 0; i < 24; i++) {
    await page.goto(`/game/${clubId}/program`);
    await expect(page.locator('.op')).toBeVisible({ timeout: 30_000 });
    if (await page.getByText(/The last push/i).count()) {
      atLevel1 = true;
      break;
    }
    await page.waitForTimeout(4_000);
  }
  expect(atLevel1, 'facilities step completed and advanced to the Level-1 step').toBe(true);
  await shot(page, 'level1-push');

  // --- 6. Qualifying friendlies until Level 1 ------------------------------
  let reached = false;
  for (let m = 0; m < 16; m++) {
    if (await page.locator('.op-draw').count()) {
      reached = true;
      break;
    }
    await clearInbox(page, clubId);
    await page.waitForTimeout(7_000); // friendly cooldown at the harness time scale
    await page.getByRole('button', { name: /Play a qualifying friendly/i }).click();
    await expect(page.locator('.playbtn')).toBeVisible({ timeout: 30_000 });
    await dismissAway(page);
    await page.waitForTimeout(300);
    const playNow = page.locator('.opp .btn.primary').first();
    await expect(playNow).toBeVisible({ timeout: 30_000 });
    await playNow.click();
    const back = page.getByRole('button', { name: /Back to the grounds/i });
    await expect(back).toBeVisible({ timeout: 90_000 });
    if (m === 0) await shot(page, 'friendly-rewards');
    await back.click();
    await dismissAway(page);
    await page.goto(`/game/${clubId}/program`);
    await expect(page.locator('.op')).toBeVisible({ timeout: 30_000 });
  }
  reached = reached || (await page.locator('.op-draw').count()) > 0;
  expect(reached, 'reached Level 1 within 16 qualifying friendlies').toBe(true);

  // --- 7. League joined -----------------------------------------------------
  await expect(page.locator('.op-draw-title')).toContainText(/league has a name/i, { timeout: 30_000 });
  await expect(page.locator('.op-draw-pool')).toBeVisible();
  await shot(page, 'league-joined');

  // The server says the program is done and the club has a Level-1 league.
  const final = await programState(page, clubId);
  expect(final.step).toEqual('done');
  const play = await page.evaluate(
    async ([api, id]) => {
      const res = await fetch(`${api}/api/play/${id}`, { credentials: 'include' });
      const body = await res.json();
      return (body.payload ?? body) as { club: { level: number }; league: unknown };
    },
    [API, clubId] as const
  );
  expect(play.club.level).toBeGreaterThanOrEqual(1);
  expect(play.league).not.toBeNull();
});
