// P01 resumed step 08 — confirm signing the manager, observe result.
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
  await s.page.getByText('Sign', { exact: true }).first().click({ force: true });
  await s.page.waitForTimeout(1200);
  await s.shot('s02-10-sign-dialog');
  const confirm = s.page.getByText(/Sign for V40,000/).first();
  console.log('confirm count:', await confirm.count());
  await confirm.click({ force: true });
  await s.page.waitForTimeout(1800);
  console.log('=== AFTER confirming ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-11-signed');
  await s.decide('Confirmed "Sign for V40,000" (no interview) — the modal warned the attributes were still a range and I was gambling.');
} catch (e) {
  await s.shot('s02-error8');
  await s.decide(`Blocked confirming manager: ${e.message}`);
} finally {
  await s.close();
}
