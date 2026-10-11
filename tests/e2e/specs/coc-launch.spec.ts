import { expect, test } from '@playwright/test';

/**
 * The launch loop (CLAUDE.md "Game model"): a new manager registers, founds a
 * club, lands on the campus with the CoC HUD and seven buildings, sees the
 * first goals, finds a starter XI on the grid, collects nothing yet, attacks a
 * club and reads stars + loot on the result screen.
 *
 * Runs against the Go-only stack (scripts/run-go-stack.ps1):
 *   E2E_BASE_URL=http://localhost:5173 E2E_API_URL=http://localhost:3000 npx playwright test coc-launch --project desktop-1440x900
 *
 * It writes one QA user + club (named qa-launch-*) to the stack's database.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

test.skip(({ isMobile }) => isMobile, 'desktop flow');

test('register → found → campus → grid → attack → result', async ({ page }) => {
  const tag = Date.now().toString(36).slice(-5);
  const code = `E${tag.toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, 4);

  await page.goto('/auth/join');
  await page.fill('input[autocomplete="name"]', 'QA Launch E2E');
  await page.fill('input[type="email"]', `qa-launch-${tag}@example.test`);
  await page.fill('input[autocomplete="username"]', `qa-launch-${tag}`);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill('qa-password-123');
  await pw.nth(1).fill('qa-password-123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/start/);

  // Found through the same API the founding screen calls.
  const res = await page.request.post(`${API}/api/atlas/clubs`, {
    data: {
      name: `QA E2E ${tag}`,
      code,
      crest: { shape: 'shield', pattern: 'stripes', emblem: 'ball', primary: '#d8342c', secondary: '#f2f2ee', trim: '#fffaf0', initials: code },
      newCountry: { name: `Qaland ${tag}`, code: `Q${tag.slice(0, 2).toUpperCase()}` },
      newRegion: { name: `Qa Reach ${tag}` },
      newTown: { name: `Qa Town ${tag}` },
    },
  });
  expect(res.status()).toBe(200);
  const clubId = (await res.json()).payload.clubId as string;
  await page.evaluate((id) => {
    const u = JSON.parse(localStorage.getItem('fspro-user') ?? '{}');
    u.clubs = [id];
    localStorage.setItem('fspro-user', JSON.stringify(u));
    // Quick sim (the Settings toggle): straight to the result, no 3D replay.
    localStorage.setItem('fspro_play_mode', 'quick_sim');
  }, clubId);

  // Campus: CoC HUD, first goals, seven buildings.
  await page.goto(`/game/${clubId}`);
  await expect(page.locator('.hud .resbar [data-res="cash"]')).toBeVisible();
  await expect(page.locator('.quests')).toContainText('First goals');
  await page.click('.dock button:has-text("Build")');
  await expect(page.locator('.cards .card')).toHaveCount(7);
  await page.keyboard.press('Escape');
  await page.locator('.modal button.x, [aria-label="Close"]').first().click().catch(() => {});

  // Squad: the starter XI is already on the grid; 16 players on the roster.
  await page.click('.dock button:has-text("Squad")');
  await expect(page.locator('aside.drawer')).toContainText('11/11 placed');
  await page.click('aside.drawer button:has-text("Players")');
  await expect(page.locator('.roster')).toContainText('Players 16');
  await page.click('aside.drawer button.x');

  // Attack: opponents show available loot; play one; stars + loot on the result.
  await page.click('.playbtn');
  await expect(page.locator('.opp').first()).toBeVisible();
  await expect(page.locator('.opp-loot').first()).toContainText('Available loot');
  await page.locator('.opp .btn.primary').first().click();
  const result = page.locator('.result');
  await expect(result).toBeVisible();
  await expect(result).toContainText(/dominance/);
  await expect(result).toContainText(/standing/);
});
