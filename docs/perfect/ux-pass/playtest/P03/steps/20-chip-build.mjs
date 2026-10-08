// P03 step 20 — capture chip motion (2 stills) + start the Stands/Ticket Booth build.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  // two stills of the animated Owner's-program chip
  await s.page.screenshot({ path: s.dir + '/screenshots/20-chip-t0.png', clip: { x: 470, y: 120, width: 460, height: 130 } });
  await s.page.waitForTimeout(700);
  await s.page.screenshot({ path: s.dir + '/screenshots/20-chip-t1.png', clip: { x: 470, y: 120, width: 460, height: 130 } });
  // start the stand build
  await s.page.getByRole('button', { name: 'Build', exact: true }).first().click();
  await s.page.waitForTimeout(1800);
  await s.page.getByRole('button', { name: /Empty Plot Stands/ }).click();
  await s.page.waitForTimeout(1500);
  await s.shot('20-stand-dialog');
  console.log('===== DIALOG =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(-35).join('\n'));
  for (const name of [/^Build /i, /^Start build/i, /^Upgrade/i, /Ticket Booth/i, /^Confirm/i]) {
    const b = s.page.getByRole('button', { name });
    if (await b.count()) { console.log('[clicking]', name); await b.first().click(); break; }
  }
  await s.page.waitForTimeout(2500);
  await s.shot('20-after-build-start');
  console.log('===== AFTER =====');
  console.log((await s.ariaSnapshot()).split('\n').filter(l => /builder|Tier|V\d|min|Build|Next|busy|Ticket/i.test(l)).slice(0,25).join('\n'));
  await s.decide('Captured chip motion stills; started the Ticket Booth (Stands Tier 1) build.');
} catch (e) {
  await s.shot('20-error');
  await s.decide(`Chip/build step failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
