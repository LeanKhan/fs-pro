// P03 step 11 — sign the top best-rated manager; capture terms/confirmation.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1800); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1500); }
  await s.page.getByRole('button', { name: 'Best rated' }).click().catch(()=>{});
  await s.page.waitForTimeout(800);
  const card = s.page.locator('article').first();
  console.log('[card]', (await card.innerText()).replace(/\s+/g, ' ').slice(0, 200));
  await card.getByRole('button', { name: 'Sign' }).click();
  await s.page.waitForTimeout(1800);
  await s.shot('11-sign-manager-dialog');
  console.log('===== ARIA (head) =====');
  const aria = await s.ariaSnapshot();
  console.log(aria.split('\n').slice(0, 80).join('\n'));
  await s.decide('Opened Sign on the top best-rated manager.');
} catch (e) {
  await s.shot('11-error');
  await s.decide(`Sign manager failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
