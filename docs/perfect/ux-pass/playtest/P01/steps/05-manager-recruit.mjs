// P01 resumed step 05 — close program, reopen First steps, tap "Sign a manager".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tap = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1200); return true; }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(600); }
  }
  // Remove any open overlay
  const back = s.page.getByRole('button', { name: 'Back to the grounds' });
  if (await back.count()) { await back.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(800); }

  await tap('First steps');
  await tap('Sign a manager');
  console.log('=== AFTER TAP Sign a manager ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-06-manager-recruit');
  await s.decide('Found the path: campus chip "First steps" expands to a "Sign a manager" button; tapped it to open the manager recruitment flow.');
} catch (e) {
  await s.shot('s02-error4');
  await s.decide(`Blocked opening manager recruitment: ${e.message}`);
} finally {
  await s.close();
}
