// P03 step 30 — collect till, open Owner's program to read Program XP + steps.
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

  // collect till (force) and note exact amount + balance before/after from HUD text
  const hudBefore = (await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '';
  const till = s.page.getByRole('button', { name: /^\+V\d/ });
  if (await till.count()) {
    console.log('[till]', await till.first().getAttribute('title'), '| label:', await till.first().innerText().catch(() => ''));
    await till.first().click({ force: true, timeout: 10_000 });
    await s.page.waitForTimeout(2000);
  }
  const hudAfter = (await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '';
  console.log('[HUD before]', hudBefore.trim());
  console.log('[HUD after ]', hudAfter.trim());

  // Owner's program
  await s.page.getByRole('button', { name: /Owner's program/ }).first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  await s.shot('30-owner-program');
  console.log('===== OWNER PROGRAM =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Session 3: collected the till and reopened the Owner program to read XP.');
} catch (e) {
  await s.shot('30-error');
  await s.decide(`30 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
