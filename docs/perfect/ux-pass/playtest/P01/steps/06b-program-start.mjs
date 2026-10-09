// P01 resumed step 06b — click the program start button by role.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tapText = async (name) => {
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
  await tapText("Owner's program");
  const start = s.page.getByRole('button', { name: /start the program/i });
  console.log('start button count:', await start.count());
  if (await start.count()) {
    await start.first().scrollIntoViewIfNeeded().catch(() => {});
    await start.first().click({ force: true });
    await s.page.waitForTimeout(1600);
  }
  console.log('=== AFTER start-the-program button ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-08-program-started');
  await s.decide('Clicked the real "Right then — start the program" button (previously my tap hit Vintra\'s note text).');
} catch (e) {
  await s.shot('s02-error6');
  await s.decide(`Blocked: ${e.message}`);
} finally {
  await s.close();
}
