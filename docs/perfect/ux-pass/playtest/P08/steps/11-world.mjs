// P08 step 11 — open World (town/district pages, invite links).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  const got = s.page.getByRole('button', { name: 'Got it' });
  if (await got.count()) { await got.click(); await s.page.waitForTimeout(800); }
  await s.page.getByRole('button', { name: 'World', exact: true }).click();
  await s.page.waitForTimeout(3000);
  console.log('URL:', s.page.url());
  await s.shot('11-world');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened the World screen to find my town page and the invite-link affordance.');
} catch (e) {
  await s.shot('11-world-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
