// P03 step 08c — check whether the "opening balance" number is stable.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
const grab = async (tag) => {
  const aria = await s.ariaSnapshot();
  const lines = aria.split('\n').map(l => l.trim()).filter(l => /V[\d.]+M|opening balance/i.test(l));
  console.log(`[${tag}]`, JSON.stringify(lines));
  return lines;
};
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(800); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); }
  {
    await s.page.waitForTimeout(300);
    await s.shot('08c-balance-t0'); await grab('t0');
    await s.page.waitForTimeout(1500);
    await s.shot('08c-balance-t1'); await grab('t1');
    await s.page.waitForTimeout(2500);
    await s.shot('08c-balance-t2'); await grab('t2');
  }
  await s.decide('Sampled the Owner-program opening balance at t0/1.5s/4s to test stability.');
} catch (e) {
  await s.shot('08c-error');
  await s.decide(`Balance stability probe failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
