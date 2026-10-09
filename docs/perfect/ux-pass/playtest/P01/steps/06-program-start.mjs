// P01 resumed step 06 — Owner's program: tap "Right then — start the program".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
const tap = async (name) => {
  const loc = s.page.getByText(name, { exact: false }).first();
  if (await loc.count()) { await loc.click({ force: true, timeout: 8000 }).catch(() => {}); await s.page.waitForTimeout(1300); return true; }
  return false;
};
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  for (const nm of ["Let's go!", 'Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await s.page.waitForTimeout(600); }
  }
  await tap("Owner's program");
  await tap('Right then');
  console.log('=== AFTER "Right then — start the program" ===');
  console.log(await s.ariaSnapshot());
  await s.shot('s02-07-program-start');
  await s.decide('Tapped "Right then — start the program" in the Owner\'s program to begin the manager step.');
} catch (e) {
  await s.shot('s02-error5');
  await s.decide(`Blocked starting program: ${e.message}`);
} finally {
  await s.close();
}
