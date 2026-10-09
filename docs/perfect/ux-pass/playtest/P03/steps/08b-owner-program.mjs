// P03 step 08b — open Owner's program (chip is animated -> force click).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(1000); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) {
    await owner.click({ force: true }).catch(() => {});
    await s.page.waitForTimeout(2000);
  }
  await s.shot('08b-owner-program');
  console.log('===== ARIA =====');
  console.log(await s.ariaSnapshot());
  console.log('===== /ARIA =====');
  await s.decide("Owner's program chip would not stabilise for a normal click (force-clicked); screenshot 08b.");
} catch (e) {
  await s.shot('08b-error');
  await s.decide(`Blocked owner program (force): ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
