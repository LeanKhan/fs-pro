// P03 step 27 — actually start the Ticket Booth build via "Upgrade to Tier 1".
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

  await s.page.getByRole('button', { name: 'Build', exact: true }).first().click({ timeout: 15_000 });
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: /Empty Plot Stands/ }).first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(1500);
  const up = s.page.getByRole('button', { name: /^Upgrade to Tier 1/ });
  console.log('upgrade buttons:', await up.count());
  await up.first().click({ force: true, timeout: 15_000 });
  await s.page.waitForTimeout(2000);
  await s.shot('27-confirm-dialog');
  console.log('===== CONFIRM DIALOG =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(-30).join('\n'));

  // any explicit confirm in the dialog only
  for (const name of [/^Confirm/i, /^Build for/i, /^Start .*build/i, /^Upgrade for/i, /^Yes/i]) {
    const b = s.page.getByRole('button', { name });
    if (await b.count()) { console.log('[confirm2]', name); await b.first().click({ force: true, timeout: 10_000 }); break; }
  }
  await s.page.waitForTimeout(3000);
  await s.shot('27-after-build');
  console.log('===== AFTER =====');
  console.log((await s.ariaSnapshot()).split('\n').filter((l) => /builder|busy|V\d|min|Tier|till|collect/i.test(l)).slice(0, 20).join('\n'));
  await s.decide('Session 3: drove the Stands dialog to "Upgrade to Tier 1" and captured the confirmation.');
} catch (e) {
  await s.shot('27-error');
  await s.decide(`27 failed: ${e.message}`);
  console.error(e);
} finally {
  await done();
}
