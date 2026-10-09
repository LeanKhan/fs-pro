// P01 resumed step 07b — list buttons, then click Sign via text locator.
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

  const names = await s.page.locator('button').evaluateAll((els) =>
    els.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  );
  console.log('BUTTON TEXTS (first 30):', JSON.stringify(names.slice(0, 30)));

  // Click the first button whose text is exactly "Sign" (the candidate sign button).
  const signBtn = s.page.locator('button').filter({ hasText: /^Sign$/ }).first();
  console.log('signBtn count:', await s.page.locator('button').filter({ hasText: /^Sign$/ }).count());
  await signBtn.scrollIntoViewIfNeeded().catch(() => {});
  await signBtn.click({ force: true });
  await s.page.waitForTimeout(1600);
  console.log('=== AFTER Sign ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-09-after-sign');
  await s.decide('Clicked the first manager "Sign" button via a text filter on button elements.');
} catch (e) {
  await s.shot('s02-error7b');
  await s.decide(`Blocked signing (07b): ${e.message}`);
} finally {
  await s.close();
}
