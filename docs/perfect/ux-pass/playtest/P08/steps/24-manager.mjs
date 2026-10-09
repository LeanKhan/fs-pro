// P08 step 24 — dock Manager button -> what actually opens.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
async function dismiss(s) {
  for (let i = 0; i < 6; i++) {
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count() === 0) break;
    if (!(await c.first().isVisible().catch(() => false))) break;
    await c.first().click({ timeout: 3000, force: true }).catch(() => {});
    await s.page.waitForTimeout(600);
  }
}
const s = await personaContext('P08');
s.page.setDefaultTimeout(8000);
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await dismiss(s);
  await s.page.waitForTimeout(500);
  await s.shot('24a-campus');
  const nav = s.page.getByRole('navigation').getByRole('button', { name: 'Manager' });
  console.log('nav Manager count', await nav.count());
  if (await nav.count()) {
    await nav.click({ force: true, timeout: 6000 }).catch((e) => console.log('click err', e.message.split('\n')[0]));
    await s.page.waitForTimeout(2500);
  }
  await s.shot('24b-manager');
  console.log('--- ARIA ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Tapped the dock "Manager" button to see whether it leads to hiring a manager.');
} catch (e) {
  await s.shot('24-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close().catch(() => {});
  process.exit(0);
}
