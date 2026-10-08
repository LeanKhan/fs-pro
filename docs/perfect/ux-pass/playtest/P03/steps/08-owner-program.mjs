// P03 step 08 — dismiss welcome, open the Owner's program.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(1200); }
  await s.shot('08-campus-clean');
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) {
    await owner.click();
    await s.page.waitForTimeout(2000);
  }
  console.log('[url]', s.page.url());
  await s.shot('08-owner-program');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide("Dismissed welcome; opened Owner's program.");
} catch (e) {
  await s.shot('08-error');
  await s.decide(`Blocked opening owner program: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
