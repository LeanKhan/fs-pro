// P03 step 19 — open Build, inspect the Stands upgrade, start the Ticket Booth.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(7000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: 'Build', exact: true }).first().click();
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: /Empty Plot Stands/ }).click();
  await s.page.waitForTimeout(1500);
  await s.shot('19-build-stand-dialog');
  console.log('===== DIALOG ARIA =====');
  const aria = await s.ariaSnapshot();
  console.log(aria.split('\n').slice(-45).join('\n'));
  // confirm whichever positive action exists
  for (const name of [/^Build /i, /^Start build/i, /^Upgrade/i, /^Confirm/i]) {
    const b = s.page.getByRole('button', { name });
    if (await b.count()) { console.log('[clicking]', name); await b.first().click(); break; }
  }
  await s.page.waitForTimeout(2500);
  await s.shot('19-after-build-start');
  const a2 = await s.ariaSnapshot();
  console.log('===== AFTER =====');
  console.log(a2.split('\n').filter(l => /builder|Tier|V\d|min|Build|Next|busy/i.test(l)).slice(0,25).join('\n'));
  await s.decide('Started the Stands (Ticket Booth) build.');
} catch (e) {
  await s.shot('19-error');
  await s.decide(`Build stand failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
