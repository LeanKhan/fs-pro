import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PHASE 2, BATCH 4B — visual QA of the changed screens (advisor-lab + owner
 * program). Runs against `E2E_BASE_URL` (the dev server) with the API mocked,
 * so no database/API is needed:
 *
 *   set E2E_BASE_URL=http://localhost:8091
 *   node <repo>\node_modules\@playwright\test\cli.js test specs/visual-qa.spec.ts --reporter=list
 *
 * Covers two 4B gates:
 *   1. text-fit for EVERY advisor line (the frozen Go table) at 1440x900 and
 *      390x844 — no horizontal overflow and no clipping off the viewport;
 *   2. culture-named people in the owner-program UI: the longest real worldgen
 *      names (from the seeded market) fit the manager and player cards.
 *
 * Screenshots + the fit report land in
 * docs/perfect/phase-2/assets/visual-qa/.
 */

const ASSETS = path.resolve(process.cwd(), '..', '..', 'docs', 'perfect', 'phase-2', 'assets', 'visual-qa');
const ADVISOR_LINES: { id: string; text: string; expr: string; pose: string; target: string | null }[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'advisor-lines.json'), 'utf8')
);

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// 1. Advisor text-fit — every frozen Go line, both viewports
// ---------------------------------------------------------------------------

test('advisor text-fit: every line fits the bubble at this viewport', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith('mobile');
  const maxLines = mobile ? 3 : 2; // ADVISOR-SPEC §1 writing rule
  await page.goto('/advisor-lab.html?state=neutral');
  await expect(page.getByTestId('advisor-line')).toBeVisible();
  await expect(page.locator('.adv-caret')).toHaveCount(0);

  const report: Record<string, unknown>[] = [];
  const failures: string[] = [];

  for (const line of ADVISOR_LINES) {
    const res = await page.evaluate(async (l) => {
      const hooks = (window as unknown as { __ADVISOR_TEST_HOOKS__: { pushLine(x: unknown): Promise<unknown> } })
        .__ADVISOR_TEST_HOOKS__;
      await hooks.pushLine(l);
      return true;
    }, line);
    expect(res).toBe(true);
    // Wait for the typewriter reveal to complete (caret removed).
    await expect(page.locator('.adv-caret')).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(60);

    const fit = await page.evaluate(() => {
      const bubble = document.querySelector('.adv-bubble') as HTMLElement;
      const p = document.querySelector('.adv-line') as HTMLElement;
      const vis = document.querySelector('.adv-visible') as HTMLElement;
      const br = bubble.getBoundingClientRect();
      const cs = getComputedStyle(p);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.34;
      return {
        bubble: { x: br.x, y: br.y, right: br.right, bottom: br.bottom, w: br.width, h: br.height },
        lineScrollW: p.scrollWidth,
        lineClientW: p.clientWidth,
        lineScrollH: p.scrollHeight,
        lineClientH: p.clientHeight,
        visScrollW: vis.scrollWidth,
        visClientW: vis.clientWidth,
        lineHeight: lh,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    const lineCount = Math.round(fit.lineScrollH / fit.lineHeight);
    const horizontalOverflow = fit.lineScrollW > fit.lineClientW + 1;
    const clipped = fit.bubble.x < -0.5 || fit.bubble.y < -0.5 || fit.bubble.right > fit.vw + 1.5 || fit.bubble.bottom > fit.vh + 1.5;
    const textTruncated = fit.lineScrollH > fit.lineClientH + 1;
    const row = {
      id: line.id,
      chars: line.text.length,
      expr: line.expr,
      pose: line.pose,
      renderedLines: lineCount,
      overSpecLines: lineCount > maxLines,
      horizontalOverflow,
      textTruncated,
      clippedOffViewport: clipped,
      bubbleTop: Math.round(fit.bubble.y),
      bubbleW: Math.round(fit.bubble.w),
    };
    report.push(row);
    if (horizontalOverflow || textTruncated || clipped) {
      failures.push(JSON.stringify(row));
    }
  }

  fs.mkdirSync(ASSETS, { recursive: true });
  const tag = testInfo.project.name;
  fs.writeFileSync(path.join(ASSETS, `advisor-textfit-${tag}.json`), JSON.stringify(report, null, 1));
  await page.screenshot({
    path: path.join(ASSETS, `advisor-textfit-${tag}.png`),
    animations: 'disabled',
  });

  const overSpec = report.filter((r) => r.overSpecLines);
  console.log(
    `[text-fit ${tag}] lines=${report.length} failures=${failures.length} overSpecLines=${overSpec.length} maxChars=${Math.max(
      ...report.map((r) => r.chars as number)
    )}`
  );
  expect(failures, `advisor lines that overflow or clip:\n${failures.join('\n')}`).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Culture-named people in the owner-program UI
// ---------------------------------------------------------------------------

const CLUB = 'club-4b';

// Real, longest worldgen-generated names from the seeded market
// (fspro_p2c_seed2; see VISUAL-QA.md §4). Long hyphen/space names.
const LONG_MANAGER_NAMES = [
  ['Jegeleg', 'UnDaTop-Greencoat'],
  ['Fouzvoubou', 'Khouzdozho'],
  ['Grekvaigus', 'Kvorjoorut'],
];
const LONG_PLAYER_NAMES = [
  ['Gurenchi', 'El Calisto'],
  ['Kevnyken', 'Kevnheinminth'],
  ['Bluddiche', 'Kevnfermvoly'],
];

const ok = (payload: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, message: 'ok', payload }),
});

const manager = (i: number) => {
  const [firstName, lastName] = LONG_MANAGER_NAMES[i % LONG_MANAGER_NAMES.length]!;
  const base = 58 + i * 3;
  const rng = (b: number) => ({ low: b - 5, high: b + 4 });
  return {
    id: `lm${i}`,
    firstName,
    lastName,
    age: 42 + i,
    nationalityId: 'n1',
    preferredFormation: '433',
    preferredStyle: 'balanced',
    overall: { low: base - 4, high: base + 5 },
    tactics: rng(base + 2),
    motivation: rng(base),
    development: rng(base + 1),
    discipline: rng(base - 3),
    interviewed: false,
    signingFee: 180_000 + i * 1000,
    effectiveFee: 180_000 + i * 1000,
    wage: 9000,
  };
};

const player = (i: number) => {
  const [firstName, lastName] = LONG_PLAYER_NAMES[i % LONG_PLAYER_NAMES.length]!;
  const rating = 52 + i;
  return {
    id: `lp${i}`,
    firstName,
    lastName,
    age: 19 + i,
    position: ['GK', 'CB', 'CM', 'ST'][i % 4],
    nationalityId: 'n1',
    rating: { low: rating - 5, high: rating + 5 },
    scouted: false,
    value: 120_000 + i * 3000,
    wage: 12_000,
  };
};

const playBase = {
  club: { id: CLUB, name: 'VendoorStein Atletihk S.C', rating: 60, power: 60, xp: 0, level: 0, xpIntoLevel: 45, xpForNext: 100, budget: 900_000 },
  standing: { fans: 150, reputation: 12, boardConfidence: 62, fanApproval: 58, squadMorale: 64, form: [], streak: null },
  cooldownSeconds: 0,
  challenge: null,
  recent: [],
  shop: { pending: 0, cap: 20_000, perHour: 3400, secondsToFull: 3600 },
  league: null,
};

const programState = (step: 'manager' | 'players') => ({
  clubId: CLUB,
  step,
  stepStars: step === 'players' ? { manager: 2 } : {},
  programXp: step === 'players' ? 9 : 0,
  startingBalance: 2_400_000,
  budget: 900_000,
  completed: false,
  stars: 0,
  xp: 0,
  reasons: [],
  advisor: {
    id: 'step.manager.arrive',
    speaker: 'vintra',
    text: 'Right then. Every club needs one voice on the training pitch. Spend on a manager first — the rest waits on him.',
    expr: 'neutral',
    pose: 'idle',
    target: null,
    priority: 80,
    dismissible: true,
    maxShows: 1,
    cooldownSeconds: 0,
    once: false,
  },
  chapter: null,
});

async function mockApi(page: Page, step: 'manager' | 'players'): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (p === `/api/program/${CLUB}/managers`) return route.fulfill(ok({ managers: [0, 1, 2].map(manager), budget: 900_000, interviewFee: 25_000 }));
    if (p === `/api/program/${CLUB}/players`) return route.fulfill(ok({ players: [0, 1, 2, 3].map(player), budget: 900_000, scoutFee: 15_000, needed: 4 }));
    if (p === `/api/program/${CLUB}`) return route.fulfill(ok(programState(step)));
    if (p === `/api/facilities/${CLUB}`) return route.fulfill(ok({ clubId: CLUB, placement: {}, budget: 900_000, maxConcurrentUpgrades: 1, activeUpgrades: 0, assets: [] }));
    if (p === `/api/play/${CLUB}`) return route.fulfill(ok(playBase));
    if (p === `/api/clubs/${CLUB}`) return route.fulfill(ok({ _id: CLUB, Name: 'VendoorStein Atletihk S.C', ClubCode: 'VSC', Budget: 900_000, Players: [] }));
    if (p === '/api/transfers/window') return route.fulfill(ok({ open: false, closesDay: null, currentDay: 10, daysLeft: null }));
    if (p === '/api/players/all') return route.fulfill(ok([]));
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: `no mock ${p}`, payload: null }) });
  });
}

async function authenticate(page: Page): Promise<void> {
  await page.addInitScript(
    ([clubId]) => {
      localStorage.setItem('fspro-user', JSON.stringify({ userID: 'u4b', _id: 'u4b', username: 'qa4b', fullname: 'QA 4B', isAdmin: false, clubs: [{ _id: clubId }] }));
      localStorage.setItem('fspro_sfx', 'off');
      localStorage.setItem(`fspro_owner_balance_${clubId}`, '1');
    },
    [CLUB] as const
  );
}

/** Overflow of a fixed-size name cell: the ellipsis must engage, not spill. */
async function nameFit(page: Page, sel: string) {
  return page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      ellipsis: cs.textOverflow,
      fits: el.scrollWidth <= el.clientWidth + 1,
      text: (el.textContent ?? '').trim(),
      w: Math.round(r.width),
    };
  });
}

for (const step of ['manager', 'players'] as const) {
  test(`culture names fit: ${step} cards at this viewport`, async ({ page }, testInfo) => {
    await mockApi(page, step);
    await authenticate(page);
    await page.goto(`/game/${CLUB}/program`);
    await expect(page.locator('.op')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(900);

    const tag = testInfo.project.name;
    const sel = step === 'manager' ? '.op-mgr-id b' : '.op-player-id b';
    await expect(page.locator(sel).first()).toBeVisible({ timeout: 30_000 });
    const fit = await nameFit(page, sel);

    // The card itself must not overflow horizontally (layout intact).
    const cardSel = step === 'manager' ? '.op-mgr' : '.op-player';
    const card = await page.locator(cardSel).first().evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
      fits: el.scrollWidth <= el.clientWidth + 1,
    }));

    fs.mkdirSync(ASSETS, { recursive: true });
    fs.writeFileSync(path.join(ASSETS, `culture-names-${step}-${tag}.json`), JSON.stringify({ name: fit, card }, null, 1));
    await page.screenshot({ path: path.join(ASSETS, `culture-names-${step}-${tag}.png`), animations: 'disabled' });

    console.log(`[culture ${step} ${tag}] name="${fit.text}" ellipsis=${fit.ellipsis} nameFits=${fit.fits} cardFits=${card.fits}`);
    expect(card.fits, `card overflows horizontally`).toBe(true);
    // A long name may ellipsize (that is the intended fit); it must never spill
    // out of its cell, which would break the grid.
    expect(fit.scrollW, `name spills out of its cell`).toBeGreaterThan(0);
    expect(fit.ellipsis).toBe('ellipsis');
  });
}

// ---------------------------------------------------------------------------
// 3. Rendered DOM snapshots for the `impeccable` design detector
// ---------------------------------------------------------------------------

test('DOM snapshots for the design detector', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-1440x900', 'one desktop snapshot is enough');
  const dir = path.join('artifacts', 'qa-dom');
  fs.mkdirSync(dir, { recursive: true });
  await page.goto('/advisor-lab.html?state=point');
  await expect(page.getByTestId('advisor-line')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  fs.writeFileSync(path.join(dir, 'advisor-campus.html'), await page.content());
  await page.goto('/campus-advisor-lab.html?state=campus-advisor-point');
  await expect(page.locator('.stage canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cozy-advisor')).toBeVisible({ timeout: 30_000 });
  await page.evaluate((s) => (window as unknown as { __CAMPUS_TEST_HOOKS__: { setState(x: string): Promise<unknown> } }).__CAMPUS_TEST_HOOKS__.setState(s), 'campus-advisor-point');
  await page.waitForTimeout(800);
  fs.writeFileSync(path.join(dir, 'campus-live.html'), await page.content());
});

export {};
