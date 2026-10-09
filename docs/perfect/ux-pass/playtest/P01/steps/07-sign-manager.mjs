// P01 resumed step 07 — reach manager list and Sign the first candidate.
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

  // Try "Best rated" sort first (casual optimising a little).
  const best = s.page.getByRole('button', { name: 'Best rated' });
  if (await best.count()) { await best.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(900); }

  const signs = s.page.getByRole('button', { name: 'Sign', exact: true });
  console.log('Sign buttons:', await signs.count());
  await signs.first().click({ force: true });
  await s.page.waitForTimeout(1600);
  console.log('=== AFTER Sign ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-09-after-sign');
  await s.decide('Tapped "Sign" on the top-rated manager candidate; checking the confirmation.');
} catch (e) {
  await s.shot('s02-error7');
  await s.decide(`Blocked signing manager: ${e.message}`);
} finally {
  await s.close();
}
