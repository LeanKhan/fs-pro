// P08 step 23 — Owner's program (first step = hire a manager).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 5; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 4000 }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
}
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4000);
  await dismiss(s);
  await s.page.getByRole('button', { name: /Owner's program/ }).click({ force: true, timeout: 10000 });
  await s.page.waitForTimeout(2500);
  await s.shot('23-owners-program');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Opened the Owner\'s program to try to hire a manager (the first step the game tells me to do).');
} catch (e) {
  await s.shot('23-op-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
