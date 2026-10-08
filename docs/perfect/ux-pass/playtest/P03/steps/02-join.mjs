// P03 step 02 — open the "New manager" (registration) screen by clicking the tab.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('link', { name: 'New manager' }).click();
  await s.page.waitForTimeout(1500);
  console.log('[url]', s.page.url());
  await s.shot('02-join');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide('Clicked New manager tab -> registration screen.');
} catch (e) {
  await s.shot('02-error');
  await s.decide(`Blocked at join: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
