// P08 step 22 — explore Ground and district/town page for an invite link.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
async function dismiss(s) {
  for (let i = 0; i < 5; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 4000 }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
}
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await s.page.getByRole('button', { name: 'Ground', exact: true }).first().click();
  await s.page.waitForTimeout(3000);
  await dismiss(s);
  console.log('URL after Ground:', s.page.url());
  await s.shot('22a-ground');
  console.log('--- ARIA ground ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Tapped "Ground" from the World nav to look for a town/district page with an invite link.');
} catch (e) {
  await s.shot('22-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
