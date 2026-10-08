// P03 step 09 — start the Owner's program; go to Manager step.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(800); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1800); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(2500); }
  console.log('[url]', s.page.url());
  await s.shot('09-manager-step');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide('Started the Owner program; now on the Manager step.');
} catch (e) {
  await s.shot('09-error');
  await s.decide(`Blocked starting program: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
