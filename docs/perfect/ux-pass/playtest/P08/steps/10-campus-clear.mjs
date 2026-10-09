// P08 step 10 — dismiss welcome, look around campus.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const go = s.page.getByRole('button', { name: "Let's go!" });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(2500); }
  await s.shot('10-campus-clear');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Dismissed the welcome modal and recorded the campus HUD, dock and advisor.');
} catch (e) {
  await s.shot('10-campus-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
