// P03 step 04 — found-club flow, step 2 "Club".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('button', { name: 'Next: your club' }).click();
  await s.page.waitForTimeout(1500);
  console.log('[url]', s.page.url());
  await s.shot('04-club-step');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide('Advanced to the Club step of founding.');
} catch (e) {
  await s.shot('04-error');
  await s.decide(`Blocked at club step: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
