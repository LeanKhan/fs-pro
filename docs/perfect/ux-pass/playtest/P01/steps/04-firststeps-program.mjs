// P01 resumed step 04 — dismiss advisor, open First steps checklist and Owner's program.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P01');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);

  for (const nm of ["Let's go!"]) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click(); await s.page.waitForTimeout(800); }
  }
  for (const nm of ['Got it', 'Next']) {
    const b = s.page.getByRole('button', { name: nm });
    if (await b.count()) { await b.first().click(); await s.page.waitForTimeout(700); }
  }

  // First steps checklist
  const fs = s.page.getByRole('button', { name: /First steps/ });
  console.log('First steps button count:', await fs.count());
  if (await fs.count()) {
    await fs.first().click();
    await s.page.waitForTimeout(1200);
    console.log('=== FIRST STEPS ===');
    console.log(await s.ariaSnapshot());
    await s.shot('s02-04-first-steps');
    await s.decide('Opened "First steps 0/4" to read the onboarding checklist and look for a link to hiring the manager.');
    // close if there is a Close button
    const c = s.page.getByRole('button', { name: 'Close' });
    if (await c.count()) { await c.first().click(); await s.page.waitForTimeout(700); }
  }

  // Owner's program
  const op = s.page.getByRole('button', { name: /Owner's program/ });
  console.log("Owner's program button count:", await op.count());
  if (await op.count()) {
    await op.first().click();
    await s.page.waitForTimeout(1200);
    console.log("=== OWNER'S PROGRAM ===");
    console.log(await s.ariaSnapshot());
    await s.shot('s02-05-owners-program');
    await s.decide("Opened the Owner's program panel to see whether program step 1 (hire a manager) is actionable.");
  }
} catch (e) {
  await s.shot('s02-error3');
  await s.decide(`Blocked exploring First steps/program: ${e.message}`);
} finally {
  await s.close();
}
