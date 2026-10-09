// P03 step 35 — open a match, jump to Result, read the result/reward screen.
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
  const before = ((await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '').replace(/^- text: /, '').trim();
  console.log('[HUD]', before);

  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('35-dialog');
  await s.page.getByRole('button', { name: 'Play now' }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(12000);
  await s.shot('35-matchzone');
  console.log('===== MATCHZONE ARIA =====');
  console.log(await s.ariaSnapshot());
  // jump to result
  const res = s.page.getByRole('button', { name: /Result/ });
  if (await res.count()) { await res.first().click({ timeout: 10_000 }).catch((e) => console.log('result click:', e.message)); }
  await s.page.waitForTimeout(5000);
  await s.shot('35-after-result');
  console.log('===== AFTER RESULT ARIA =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Session 4: opened a match, captured the Matchzone and jumped to the Result screen.');
} catch (e) {
  await s.shot('35-error');
  await s.decide(`35 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
