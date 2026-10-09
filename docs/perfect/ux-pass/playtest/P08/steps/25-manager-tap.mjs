// P08 step 25 — tap dock buttons by coordinates (real tap emulation).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 6; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 3000, force: true }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
}
async function tap(s, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
const s = await personaContext('P08');
s.page.setDefaultTimeout(8000);
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await dismiss(s);
  const mgr = s.page.getByRole('navigation').getByRole('button', { name: 'Manager' });
  const box = await mgr.boundingBox();
  console.log('manager box', JSON.stringify(box));
  const covered = await s.page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? { tag: el.tagName, cls: el.className, label: el.getAttribute('aria-label') } : null;
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  console.log('elementFromPoint at Manager center:', JSON.stringify(covered));
  await tap(s, mgr);
  await s.page.waitForTimeout(2500);
  await s.shot('25-manager');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Tapped the dock Manager button by coordinate (real tap); captured what it opens.');
} catch (e) {
  await s.shot('25-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
