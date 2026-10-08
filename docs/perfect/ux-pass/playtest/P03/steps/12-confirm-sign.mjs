// P03 step 12 — confirm signing; capture budget + XP changes.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const readHud = async (s) => {
  const aria = await s.ariaSnapshot();
  const line = aria.split('\n').find(l => /Program XP/.test(l)) || '';
  return line.trim();
};
const s = await personaContext('P03');
try {
  await s.page.goto(s.url + '/game/023d54eb-4d69-4ad6-b870-e594cc915f14', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(600); }
  const owner = s.page.getByRole('button', { name: /Owner's program/ });
  if (await owner.count()) { await owner.click({ force: true }).catch(()=>{}); await s.page.waitForTimeout(1800); }
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(1200); }
  await s.page.getByRole('button', { name: 'Best rated' }).click().catch(()=>{});
  await s.page.waitForTimeout(800);
  const card = s.page.locator('article').first();
  await card.getByRole('button', { name: 'Sign' }).click();
  await s.page.waitForTimeout(1200);
  const signBtn = s.page.getByRole('button', { name: /Sign for V/ });
  console.log('[before]', await readHud(s));
  await signBtn.click();
  await s.page.waitForTimeout(2500);
  await s.shot('12-after-sign-manager');
  console.log('[after]', await readHud(s));
  console.log('===== ARIA (head) =====');
  console.log((await s.ariaSnapshot()).split('\n').slice(0, 70).join('\n'));
  await s.decide('Signed Saikyaivau Daimau for V90,000 (3-yr).');
} catch (e) {
  await s.shot('12-error');
  await s.decide(`Confirm sign failed: ${e.message}`);
  console.error(e);
} finally {
  await s.close();
}
