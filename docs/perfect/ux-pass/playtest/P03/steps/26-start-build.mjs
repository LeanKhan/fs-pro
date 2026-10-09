// P03 step 26 — verify login post-restart, start the Ticket Booth (Stands) build.
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
  const hud = (await s.ariaSnapshot()).split('\n').find((l) => /\/100/.test(l)) || '';
  console.log('[HUD]', hud.trim());

  await s.page.getByRole('button', { name: 'Build', exact: true }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2000);
  const stand = s.page.getByRole('button', { name: /Empty Plot Stands/ });
  console.log('stands plot:', await stand.count());
  await stand.first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(2000);
  await s.shot('26-stand-dialog');
  console.log('===== STAND DIALOG ARIA =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(-50).join('\n'));

  // confirm
  for (const name of [/^Build\b/i, /^Start build/i, /^Upgrade/i, /^Confirm/i, /^Yes/i]) {
    const b = s.page.getByRole('button', { name });
    if (await b.count()) { console.log('[confirm]', name); await b.first().click({ force: true, timeout: 10_000 }); break; }
  }
  await s.page.waitForTimeout(3000);
  await s.shot('26-after-build-start');
  console.log('===== AFTER BUILD START =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 30).join('\n'));
  await s.decide('Session 3: started the Ticket Booth (Stands) build; captured the terms dialog.');
} catch (e) {
  await s.shot('26-error');
  await s.decide(`26 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
