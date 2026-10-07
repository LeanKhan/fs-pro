import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The core manager loop (docs/CORE-LOOP.md):
 * register -> found club -> collect -> PLAY -> rewards -> Manager hub ->
 * Match prep -> save plan.
 *
 * Screenshots land in tests/e2e/artifacts/<project>/. Requires the dev stack
 * (API :3010, client :8080); see playwright.config.ts.
 */

function shotter(page: Page, testInfo: TestInfo) {
  const dir = path.join('artifacts', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  return async (name: string) => {
    n += 1;
    await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-${name}.png`) });
  };
}

test('core loop: register -> found club -> collect -> PLAY -> rewards -> Manager hub -> Match prep -> save plan', async ({
  page,
}, testInfo) => {
  const shot = shotter(page, testInfo);
  const stamp = Date.now().toString(36).slice(-6);
  const email = `e2e-${stamp}@example.com`;
  const username = `e2e${stamp}`;
  const password = 'e2e-password-123';

  // --- 1. Register -------------------------------------------------------
  await page.goto('/auth/join');
  await expect(page.locator('form.form')).toBeVisible();
  await page.locator('input[autocomplete="name"]').fill('E2E Manager');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="new-password"]').first().fill(password);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(password);
  await shot('register');
  await page.getByRole('button', { name: /Create account/i }).click();

  // --- 2. Found club -----------------------------------------------------
  await expect(page).toHaveURL(/\/start/, { timeout: 30_000 });
  await expect(page.locator('.found-panel')).toBeVisible({ timeout: 30_000 });
  await shot('found-home');

  // The world decides the placement; name any new places it asks for.
  const countryInput = page.locator('input[placeholder="e.g. Verdania"]');
  if (await countryInput.count()) {
    await countryInput.fill(`Verdania${stamp}`);
    const countryCode = page.locator('.found-panel input.code').first();
    if ((await countryCode.inputValue()).length < 2) {
      await countryCode.fill(`V${stamp.slice(-2).toUpperCase()}`);
    }
  }
  const regionInput = page.locator('input[placeholder="e.g. The Northern Reach"]');
  if (await regionInput.count()) await regionInput.fill(`Northreach${stamp}`);
  const townInput = page.locator('input[placeholder="e.g. Port Ellis"]');
  if (await townInput.count()) await townInput.fill(`Port${stamp}`);

  await page.getByRole('button', { name: /Next: your club/i }).click();
  await expect(page.locator('.club-form')).toBeVisible();

  const clubName = `E2E United ${stamp}`;
  // The auto-suggested code is only the initials, which repeats across runs,
  // so send a unique code or the name check reports "taken".
  const clubCodeValue = `E${stamp}`.toUpperCase().slice(0, 4);
  await page.getByLabel('Club name').fill(clubName);
  await page.getByLabel('Code').fill(clubCodeValue);
  // Wait out the debounced name check so the submit enables.
  await expect(page.getByRole('button', { name: /Next: kick-off/i })).toBeEnabled();
  await shot('found-club');
  await page.getByRole('button', { name: /Next: kick-off/i }).click();

  await page.getByRole('button', { name: /^Found / }).click();
  await expect(page.getByRole('button', { name: /Go to your ground/i })).toBeVisible({ timeout: 30_000 });
  await shot('found-done');
  await page.getByRole('button', { name: /Go to your ground/i }).click();

  await expect(page).toHaveURL(/\/game\//, { timeout: 30_000 });
  // PLAY the quick-sim way so the reward screen arrives at once.
  await page.evaluate(() => localStorage.setItem('fspro_play_mode', 'quick_sim'));
  await page.reload();
  await expect(page.locator('.playbtn')).toBeVisible({ timeout: 30_000 });

  // A first visit opens the "While you were away" summary over the campus.
  const letsGo = page.getByRole('button', { name: /Let's go!/i });
  if ((await letsGo.count()) && (await letsGo.first().isVisible())) await letsGo.first().click();
  await shot('campus');

  // --- 3. Collect the club shop takings ----------------------------------
  // The coin bubble re-renders as the campus view animates, so force the tap.
  const collect = page.locator('.bubble.collect');
  await expect(collect).toBeVisible({ timeout: 30_000 });
  await collect.click({ force: true });
  await expect(collect).toBeHidden({ timeout: 10_000 });
  await shot('collect');

  // --- 4. PLAY -----------------------------------------------------------
  await page.locator('.playbtn').click();
  const playNow = page.locator('.opp .btn.primary').first();
  await expect(playNow).toBeVisible({ timeout: 30_000 });
  await shot('matchmaking');
  await playNow.click();

  // --- 5. Rewards --------------------------------------------------------
  const backToGrounds = page.getByRole('button', { name: /Back to the grounds/i });
  await expect(backToGrounds).toBeVisible({ timeout: 60_000 });
  await shot('rewards');
  await backToGrounds.click();

  // --- 6. Manager hub -> Match prep -> save plan -------------------------
  const dockManager = page.locator('.dock button', { hasText: 'Manager' });
  if ((await dockManager.count()) && (await dockManager.first().isVisible())) {
    await dockManager.first().click();
  } else {
    await page.locator('.profile').click();
  }
  await expect(page.locator('.drawer')).toBeVisible();

  const matchdayTab = page.locator('.drawer-tabs button', { hasText: 'Matchday' });
  if (await matchdayTab.count()) await matchdayTab.first().click();

  const firstFixture = page.locator('button.md-row').first();
  await expect(firstFixture).toBeVisible({ timeout: 30_000 });
  await shot('manager-hub');
  await firstFixture.click();

  // Match prep: a fresh club has no team sheet, so the XI is auto-filled.
  await expect(page.locator('.prep')).toBeVisible({ timeout: 30_000 });
  const savePlan = page.locator('.save button');
  await expect(savePlan).toBeVisible({ timeout: 30_000 });
  await expect(savePlan).toBeEnabled({ timeout: 30_000 });
  await shot('match-prep');
  await savePlan.click();
  await expect(savePlan).toHaveText(/Plan locked in/i, { timeout: 30_000 });
  await shot('plan-saved');
});
