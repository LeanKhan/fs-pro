// P01 resumed step 07c — click first Sign button robustly.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1100); return true; }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(500); }
  }
  await tapText("Owner's program");
  const start = s.page.getByRole('button', { name: /start the program/i });
  if (await start.count()) { await start.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(1400); }

  const cand = s.page.locator('button').filter({ hasText: 'Sign' });
  console.log('button filter hasText Sign count:', await cand.count());
  const txt = s.page.getByText('Sign', { exact: true });
  console.log('getByText Sign exact count:', await txt.count());

  let clicked = false;
  if (await cand.count()) { await cand.first().click({ force: true }); clicked = true; }
  else if (await txt.count()) { await txt.first().click({ force: true }); clicked = true; }
  console.log('clicked:', clicked);
  await s.page.waitForTimeout(1600);
  console.log('=== AFTER Sign ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-09-after-sign');
  await s.decide('Clicked the first manager "Sign" button (whitespace-tolerant locator).');
} catch (e) {
  await s.shot('s02-error7c');
  await s.decide(`Blocked signing (07c): ${e.message}`);
} finally {
  await s.close();
}
