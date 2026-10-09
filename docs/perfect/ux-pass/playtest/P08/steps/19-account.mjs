// P08 step 19 — Account panel.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 5; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 4000 }).catch(() => {});
    await s.page.waitForTimeout(700);
  }
}
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  await dismiss(s);
  await s.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('button', { name: /Account/ }).click();
  await s.page.waitForTimeout(2500);
  await s.shot('19-account');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened the Account panel from Settings.');
} catch (e) {
  await s.shot('19-account-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
