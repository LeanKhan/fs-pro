// P03 step 23 — resume: verify login, open campus, read current state.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  console.log('URL:', s.page.url());
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { console.log('dismissing intro'); await go.first().click(); await s.page.waitForTimeout(800); }
  await s.shot('23-resume');
  const aria = await s.ariaSnapshot();
  console.log('===== ARIA (P03 resume) =====');
  console.log(aria);
  await s.decide('RESUME: opened campus after outage; instance + login working.');
} catch (e) {
  await s.shot('23-error');
  await s.decide(`RESUME failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
