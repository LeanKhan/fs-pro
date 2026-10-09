/**
 * Advisor component QA (phase-2 Batch 3A, ADVISOR-SPEC §4/§6).
 *
 * Runs against the dev-server lab page `/advisor-lab.html`, which mounts the
 * real `CozyAdvisor` over the app's own cozy.scss HUD/dock/PLAY geometry. The
 * lab feeds it a scripted source, so no API/DB is needed.
 *
 *   E2E_BASE_URL=http://localhost:8091 cmd.exe /c "npx playwright test advisor"
 *
 * Covers: every expression/state at both viewports, the no-overlap rule,
 * reduced motion, keyboard advance/dismiss and the aria-live contract.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STATES = ['neutral', 'happy', 'excited', 'worried', 'thinking', 'point', 'blocked'] as const;
const ART = (p: string, name: string) => `artifacts/advisor/${p}/${name}.png`;

async function openLab(page: Page, state: string) {
  await page.goto(`/advisor-lab.html?state=${state}`);
  await expect(page.getByTestId('advisor-line')).toBeVisible();
}

/** Wait for the typewriter reveal to finish (the caret is removed). */
async function waitTyped(page: Page) {
  await expect(page.locator('.adv-caret')).toHaveCount(0, { timeout: 10_000 });
}

/** Axis-aligned rect intersection. */
function overlaps(a: DOMRect, b: DOMRect) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

test.describe('advisor: expressions, states and screenshots', () => {
  for (const state of STATES) {
    test(`renders ${state} at this viewport`, async ({ page }, testInfo) => {
      await openLab(page, state);
      // Let the typewriter finish so the screenshot shows the full line.
      await waitTyped(page);
      await page.waitForTimeout(200);
      await expect(page.locator('.cozy-advisor')).toBeVisible();
      await page.screenshot({ path: ART(testInfo.project.name, state), fullPage: false });

      // The full text is always in the DOM (the sr-only span), even mid-reveal.
      const full = await page.getByTestId('advisor-line').locator('.adv-sr').textContent();
      expect(full && full.trim().length).toBeGreaterThan(0);

      if (state === 'point' || state === 'excited') {
        // Pointing lines draw the aimable arm and the dotted sight-line.
        await expect(page.locator('.adv-sightline')).toBeVisible();
        await expect(page.locator('.cozy-advisor svg.adv-pose-point-right')).toHaveCount(1);
      }
    });
  }

  test('typewriter: visible text reveals while the sr text is already whole', async ({ page }, testInfo) => {
    await openLab(page, 'neutral');
    await expect(page.locator('.adv-caret')).toBeVisible();
    const sr = (await page.getByTestId('advisor-line').locator('.adv-sr').textContent())!.trim();
    const visible = (await page.locator('.adv-visible').textContent()) ?? '';
    // The full line is in the DOM, but the decorative reveal is still short.
    expect(visible.trim().length).toBeLessThan(sr.length);
    await page.screenshot({ path: ART(testInfo.project.name, 'talking') });
    await waitTyped(page);
    const typed = (await page.locator('.adv-visible').textContent())!.trim();
    expect(typed).toBe(sr);
  });

  test('collapsed: portrait only, tap re-opens the line', async ({ page }, testInfo) => {
    await openLab(page, 'neutral');
    await waitTyped(page);
    await page.locator('.cozy-advisor').focus();
    await page.keyboard.press('Enter'); // nothing queued -> collapse
    await expect(page.locator('.cozy-advisor.is-collapsed')).toBeVisible();
    await page.screenshot({ path: ART(testInfo.project.name, 'collapsed') });
    await page.getByTestId('advisor-portrait').click();
    await expect(page.locator('.cozy-advisor.is-collapsed')).toHaveCount(0);
  });

  test('quiet mode: the toggle is a real pressed button', async ({ page }, testInfo) => {
    await openLab(page, 'neutral');
    await waitTyped(page);
    await page.locator('.adv-quiet').click();
    await expect(page.locator('.adv-quiet')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: ART(testInfo.project.name, 'quiet') });
  });

  test('inline mode (drawer/founding) is the same component', async ({ page }, testInfo) => {
    await page.goto('/advisor-lab.html?state=thinking&inline=1');
    await expect(page.getByTestId('advisor-line')).toBeVisible();
    await waitTyped(page);
    await page.screenshot({ path: ART(testInfo.project.name, 'inline') });
    // Inline lives inside the modal, not the campus dock.
    await expect(page.locator('.modal .cozy-advisor.is-inline')).toHaveCount(1);
  });
});

test.describe('advisor: never covers PLAY, dock, HUD or presence', () => {
  for (const state of ['neutral', 'point'] as const) {
    test(`no overlap (${state})`, async ({ page }) => {
      await openLab(page, state);
      await page.waitForTimeout(900);
      await waitTyped(page);
      const advisor = (await page.locator('.cozy-advisor').boundingBox())!;
      expect(advisor).toBeTruthy();
      const adv = {
        left: advisor.x,
        top: advisor.y,
        right: advisor.x + advisor.width,
        bottom: advisor.y + advisor.height,
        width: advisor.width,
        height: advisor.height,
      } as DOMRect;
      for (const id of ['play', 'dock', 'hud', 'presence']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, `${id} present`).toBeTruthy();
        const r = {
          left: box!.x,
          top: box!.y,
          right: box!.x + box!.width,
          bottom: box!.y + box!.height,
        } as DOMRect;
        expect(overlaps(adv, r), `advisor overlaps ${id}: ${JSON.stringify({ adv, id: r })}`).toBe(false);
      }
      // Fully on screen.
      const vp = page.viewportSize()!;
      expect(adv.left).toBeGreaterThanOrEqual(0);
      expect(adv.top).toBeGreaterThanOrEqual(0);
      expect(adv.right).toBeLessThanOrEqual(vp.width + 1);
      expect(adv.bottom).toBeLessThanOrEqual(vp.height + 1);
    });
  }
});

test.describe('advisor: accessibility', () => {
  test('aria-live region carries the full line', async ({ page }) => {
    await openLab(page, 'neutral');
    const region = page.getByTestId('advisor-line');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toHaveAttribute('aria-atomic', 'true');
    const full = await region.locator('.adv-sr').textContent();
    await page.waitForTimeout(900);
    const visible = await region.textContent();
    expect(visible).toContain(full!.trim());
  });

  test('keyboard-only: Enter advances/skips, Esc dismisses a tip', async ({ page }) => {
    await openLab(page, 'neutral');
    // Enter skips the typewriter and completes the line.
    await page.locator('.cozy-advisor').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.adv-caret')).toHaveCount(0);
    // Enter again with nothing queued collapses to the portrait.
    await page.keyboard.press('Enter');
    await expect(page.locator('.cozy-advisor.is-collapsed')).toBeVisible();
    // Click the portrait re-opens the line.
    await page.getByTestId('advisor-portrait').click();
    await expect(page.locator('.cozy-advisor.is-collapsed')).toHaveCount(0);
    // Escape dismisses a dismissible tip.
    await page.locator('.cozy-advisor').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.cozy-advisor')).toHaveCount(0);
  });

  test('Esc never discards a non-dismissible program/blocked line', async ({ page }) => {
    await openLab(page, 'blocked');
    await page.locator('.cozy-advisor').focus();
    await page.keyboard.press('Escape');
    // Collapses, but the advisor stays reachable.
    await expect(page.locator('.cozy-advisor.is-collapsed')).toBeVisible();
  });

  test('quiet toggle is a real, labelled pressed button', async ({ page }) => {
    await openLab(page, 'neutral');
    const quiet = page.locator('.adv-quiet');
    await expect(quiet).toHaveAttribute('aria-pressed', 'false');
    await quiet.click();
    await expect(quiet).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('advisor: performance', () => {
  test('advisor animations keep a high frame rate in the lab', async ({ page }) => {
    await openLab(page, 'point');
    await page.waitForTimeout(400);
    const fps = await page.evaluate(() =>
      (window as unknown as { __ADVISOR_TEST_HOOKS__: { measureFps(n: number): Promise<number> } }).__ADVISOR_TEST_HOOKS__.measureFps(1500)
    );
    // Indicative only: the campus 3D fps (>=55 desktop / >=30 mobile) is the 4B gate.
    console.log(`[advisor] lab rAF fps while animating: ${fps}`);
    expect(fps).toBeGreaterThanOrEqual(30);
  });
});

test.describe('advisor: reduced motion', () => {  test.use({ reducedMotion: 'reduce' });

  test('text is revealed at once and animation is off', async ({ page }, testInfo) => {
    await openLab(page, 'neutral');
    // No partial text: the reduced-motion path types nothing.
    await expect(page.locator('.adv-caret')).toHaveCount(0);
    const full = await page.getByTestId('advisor-line').locator('.adv-sr').textContent();
    const visible = await page.getByTestId('advisor-line').textContent();
    expect(visible).toContain(full!.trim());
    const anim = await page.locator('.adv-bubble').evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('none');
    await page.screenshot({ path: ART(testInfo.project.name, 'reduced-motion') });
  });
});
