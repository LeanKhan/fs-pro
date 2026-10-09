// P02 step 43: Owner tab -> Hire Head Coach; capture the interview/hire flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P02');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  const letsGo = s.page.getByRole('button', { name: /Let's go/i });
  if (await letsGo.count()) { await letsGo.first().click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^Manager$/ }).first().click().catch(() => {});
  await s.page.waitForTimeout(1200);

  const drawer = s.page.locator('aside.drawer');
  await drawer.getByRole('button', { name: 'Owner', exact: true }).first().click();
  await s.page.waitForTimeout(1200);
  await s.shot('43-owner-tab');

  const hire = s.page.getByRole('button', { name: /Hire Head Coach/i }).first();
  console.log('hire count', await hire.count());
  await hire.click().catch((e) => console.log('hire click fail', e.message));
  await s.page.waitForTimeout(2500);
  console.log('URL after hire:', s.page.url());
  console.log(await s.ariaSnapshot());
  await s.shot('43-hire-dialog');
  await s.decide('Owner tab is a real finance board (Treasury, wage bill, board confidence, ledger). Clicked "Hire Head Coach" to start the manager interview.');
} catch (e) {
  await s.shot('43-error');
  await s.decide(`Step 43 blocked: ${e.message}`);
} finally {
  await s.close();
}
