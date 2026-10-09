// P08 step 17 — League screen (my pool/division).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P08');
try {
  await s.page.goto(`${s.url}/world`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await s.page.getByRole('button', { name: 'League' }).first().click();
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  await s.shot('17-league');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened the League screen to see my pool/division and any friends.');
} catch (e) {
  await s.shot('17-league-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
