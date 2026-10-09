// P01 resumed step 11 — build the recommended Tier 1 (Training Ground).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1200); return true; }
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

  // The recommended (first) facility is Training Ground; click its Build Tier 1.
  const build = s.page.locator('article:visible').first().getByText('Build Tier 1', { exact: true }).first();
  console.log('build button count:', await build.count());
  await s.shot('s02-15-build-options');
  await build.click({ force: true });
  await s.page.waitForTimeout(1500);
  console.log('=== AFTER BUILD CLICK ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-16-built');
  await s.decide('Tapped "Build Tier 1" on the recommended Training Ground (V200,000) in program step 3.');
} catch (e) {
  await s.shot('s02-error11');
  await s.decide(`Blocked building: ${e.message}`);
} finally {
  await s.close();
}
