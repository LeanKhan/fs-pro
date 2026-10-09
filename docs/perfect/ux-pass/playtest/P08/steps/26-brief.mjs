// P08 step 26 — Owner's office -> "The brief" tab.
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
async function tapByText(s, name) {
  const el = s.page.getByRole('button', { name, exact: true }).last();
  const box = await el.boundingBox();
  if (!box) throw new Error('no box for ' + name);
  await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
const s = await personaContext('P08');
s.page.setDefaultTimeout(8000);
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await dismiss(s);
  // open Owner's office via dock Manager
  const mgr = s.page.getByRole('navigation').getByRole('button', { name: 'Manager' });
  const mb = await mgr.boundingBox();
  await s.page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await s.page.waitForTimeout(2000);
  await tapByText(s, 'The brief');
  await s.page.waitForTimeout(2000);
  await s.shot('26-brief');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened the "The brief" tab of the Owner\'s office.');
} catch (e) {
  await s.shot('26-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
