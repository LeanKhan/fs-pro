// P08 step 04 — club naming step.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/start`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(1500);
  await s.page.getByRole('button', { name: 'Next: your club' }).click();
  await s.page.waitForTimeout(1500);
  console.log('URL:', s.page.url());
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.shot('04-your-club');
  await s.decide('Continued to the club naming step.');
} catch (e) {
  await s.shot('04-your-club-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
