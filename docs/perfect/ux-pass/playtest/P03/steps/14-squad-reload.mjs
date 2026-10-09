// P03 step 14 — reload and re-check squad counters after signing the GK.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1500); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1200); }
  const squadTab = s.page.getByRole('tab', { name: 'Squad' }).or(s.page.getByRole('button', { name: /^Squad / }));
  await squadTab.first().click().catch(()=>{});
  await s.page.waitForTimeout(1500);
  await s.shot('14-squad-after-reload');
  const aria = await s.ariaSnapshot();
  console.log(aria.split('\n').filter(l => /matchday squad|goalkeeper|of 11 players|Program XP|Budget left/i.test(l)).join('\n'));
  await s.decide('Reloaded and re-checked squad counters after signing GK.');
} catch (e) {
  await s.shot('14-error');
  await s.decide(`Reload squad check failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
