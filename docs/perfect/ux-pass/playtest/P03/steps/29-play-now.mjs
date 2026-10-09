// P03 step 29 — Play now against the matchmade opponent; observe the match screen.
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
  // dismiss advisor if present
  const got = s.page.getByRole('button', { name: 'Got it' });
  if (await got.count()) { await got.first().click().catch(() => {}); await s.page.waitForTimeout(400); }

  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2500);
  const pn = s.page.getByRole('button', { name: 'Play now' });
  console.log('play now:', await pn.count());
  await pn.first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(6000);
  await s.shot('29-after-playnow');
  console.log('URL:', s.page.url());
  console.log('===== AFTER PLAY NOW =====');
  console.log(await s.ariaSnapshot());
  await s.decide('Session 3: hit "Play now" against E2E United; captured the match screen.');
} catch (e) {
  await s.shot('29-error');
  await s.decide(`29 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
