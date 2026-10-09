// P08 step 12 — inspect blocking modal, close it, then open World.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const GAME = 'http://localhost:4173/game/735ffcea-ebf3-42b2-9dcb-b2ed53209a74';
const s = await personaContext('P08');
try {
  await s.page.goto(GAME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(4500);
  await s.shot('12a-on-load');
  console.log('--- ARIA on load ---');
  console.log(await s.ariaSnapshot());
  // Close whatever modal is open (aria-label Close)
  for (let i = 0; i < 4; i++) {
    const closer = s.page.getByRole('button', { name: 'Close' });
    if (await closer.count() === 0) break;
    if (!(await closer.first().isVisible().catch(() => false))) break;
    await closer.first().click({ timeout: 5000 }).catch(() => {});
    await s.page.waitForTimeout(900);
  }
  await s.shot('12b-after-close');
  console.log('--- ARIA after close ---');
  console.log(await s.ariaSnapshot());
  const world = s.page.getByRole('button', { name: 'World', exact: true });
  if (await world.count()) {
    await world.click({ timeout: 8000 }).catch((e) => console.log('world click err:', e.message.split('\n')[0]));
    await s.page.waitForTimeout(3000);
  }
  console.log('URL:', s.page.url());
  await s.shot('12c-world');
  console.log('--- ARIA world ---');
  console.log(await s.ariaSnapshot());
  await s.decide('Found a blocking modal on campus load; closed it and opened World.');
} catch (e) {
  await s.shot('12-error');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
