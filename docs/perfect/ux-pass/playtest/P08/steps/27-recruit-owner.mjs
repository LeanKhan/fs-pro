// P08 step 27 — Owner's office -> Recruitment and Owner tabs.
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
  await s.page.waitForTimeout(1800);
}
const s = await personaContext('P08');
s.page.setDefaultTimeout(8000);
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await dismiss(s);
  const mgr = s.page.getByRole('navigation').getByRole('button', { name: 'Manager' });
  const mb = await mgr.boundingBox();
  await s.page.mouse.click(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await s.page.waitForTimeout(2000);
  await tapByText(s, 'Recruitment');
  await s.shot('27a-recruitment');
  console.log('--- ARIA recruitment ---');
  console.log(await s.ariaSnapshot());
  await tapByText(s, 'Owner');
  await s.shot('27b-owner');
  console.log('--- ARIA owner ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Checked the Recruitment and Owner tabs of the Owner\'s office.');
} catch (e) {
  await s.shot('27-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
