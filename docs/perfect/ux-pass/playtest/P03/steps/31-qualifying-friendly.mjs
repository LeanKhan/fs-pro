// P03 step 31 — play a qualifying friendly from the Owner program; observe the whole flow.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
async function done() {
  await Promise.race([s.close().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]);
  process.exit(0);
}
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(8000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.first().click(); await s.page.waitForTimeout(800); }

  await s.page.getByRole('button', { name: /Owner's program/ }).first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('31-op-open');
  const qf = s.page.getByRole('button', { name: /Play a qualifying friendly/ });
  console.log('qualifying-friendly buttons:', await qf.count());
  await qf.first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(6000);
  await s.shot('31-after-qf-6s');
  console.log('URL:', s.page.url());
  console.log('===== AFTER QF (6s) =====');
  console.log(await s.ariaSnapshot());
  await s.page.waitForTimeout(8000);
  await s.shot('31-after-qf-14s');
  console.log('===== AFTER QF (14s) =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 60).join('\n'));
  await s.decide('Session 3: started a "qualifying friendly" from the Owner program.');
} catch (e) {
  await s.shot('31-error');
  await s.decide(`31 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
