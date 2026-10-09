// P01 resumed step 04b — robust: snapshot first, then open First steps (text chip) and Owner's program.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const clickText = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) {
    await loc.click({ force: true, timeout: 8000 }).catch(() => {});
    await s.page.waitForTimeout(1200);
    return true;
  }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(700); }
  }
  await s.shot('s02-04a-campus-clean');
  console.log('=== CAMPUS AFTER DISMISS ===');
  console.log(await s.ariaSnapshot());

  await clickText('First steps');
  console.log('=== AFTER TAP "First steps" ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-04-first-steps');
  await s.decide('Tapped the "First steps 0/4" chip on the campus to open the onboarding checklist.');

  const closeBtn = s.page.getByRole('button', { name: 'Close' });
  if (await closeBtn.count()) { await closeBtn.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(800); }

  await clickText("Owner's program");
  console.log("=== AFTER TAP Owner's program ===");
  console.log(await s.ariaSnapshot());
  await s.shot('s02-05-owners-program');
} catch (e) {
  await s.shot('s02-error3b');
  await s.decide(`Blocked exploring first steps/program: ${e.message}`);
} finally {
  await s.close();
}
