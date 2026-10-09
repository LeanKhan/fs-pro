// P03 step 13 — squad step: sign the cheapest GK.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const signFirst = async () => {
  const card = s.page.locator('article').first();
  await card.getByRole('button', { name: 'Sign' }).click();
  await s.page.waitForTimeout(900);
  const confirm = s.page.getByRole('button', { name: /Sign for V/ });
  if (await confirm.count()) { await confirm.click(); await s.page.waitForTimeout(1500); }
};
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1800); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1200); }
  // Go to Squad step via the step nav.
  const squadTab = s.page.getByRole('tab', { name: 'Squad' }).or(s.page.getByRole('button', { name: /^Squad / }));
  await squadTab.first().click().catch(()=>{});
  await s.page.waitForTimeout(800);
  await s.page.getByRole('button', { name: 'GK' }).click().catch(()=>{});
  await s.page.getByRole('button', { name: 'Cheapest' }).click().catch(()=>{});
  await s.page.waitForTimeout(900);
  await s.shot('13-gk-list');
  const first = (await s.page.locator('article').first().innerText()).replace(/\s+/g,' ');
  console.log('[first GK]', first.slice(0,160));
  await signFirst();
  await s.shot('13-after-gk');
  const aria = await s.ariaSnapshot();
  console.log(aria.split('\n').filter(l => /Budget left|matchday squad|Program XP|goalkeeper/i.test(l)).join('\n'));
  await s.decide('Signed cheapest GK from the free-agent list.');
} catch (e) {
  await s.shot('13-error');
  await s.decide(`Sign GK failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
