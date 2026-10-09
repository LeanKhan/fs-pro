// P08 step 07 — complete the whole found-club wizard in one page session.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  // step 1 -> club
  await s.page.getByRole('button', { name: 'Next: your club' }).click();
  await s.page.waitForTimeout(1200);
  await s.page.getByRole('textbox', { name: 'Club name' }).fill('Invite Rovers');
  await s.page.getByRole('textbox', { name: 'Code' }).fill('INV');
  await s.page.getByRole('textbox', { name: 'Ground (stadium name)' }).fill('Invite Park');
  await s.page.waitForTimeout(400);
  await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
  await s.page.waitForTimeout(1200);
  console.log('pre-found URL:', s.page.url());
  await s.page.getByRole('button', { name: /Found Invite Rovers/ }).click();
  await s.page.waitForTimeout(6000);
  console.log('post-found URL:', s.page.url());
  await s.shot('07-after-found', { fullPage: true });
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Completed the founding wizard in one pass and founded Invite Rovers.');
} catch (e) {
  await s.shot('07-after-found-error');
  console.log('ERR URL:', s.page.url());
  console.log(await s.ariaSnapshot().catch(() => ''));
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
