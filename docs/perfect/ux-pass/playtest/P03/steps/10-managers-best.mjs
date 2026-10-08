// P03 step 10 — manager market: sort Best rated, capture top of market.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1800); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1500); }
  await s.page.getByRole('button', { name: 'Best rated' }).click().catch(()=>{});
  await s.page.waitForTimeout(1200);
  await s.shot('10-managers-best');
  const aria = await s.ariaSnapshot();
  const lines = aria.split('\n');
  console.log(lines.slice(0, 100).join('\n'));
  await s.decide('Sorted manager market by Best rated; captured top of the list.');
} catch (e) {
  await s.shot('10-error');
  await s.decide(`Manager best-rated failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
