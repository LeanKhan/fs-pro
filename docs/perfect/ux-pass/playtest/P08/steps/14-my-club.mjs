// P08 step 14 — try "My club" from World to reach my district/town page.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await s.page.getByRole('button', { name: 'My club' }).click();
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  await s.shot('14-my-club');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Tapped "My club" on the World screen to try to reach my district/town page.');
} catch (e) {
  await s.shot('14-my-club-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
