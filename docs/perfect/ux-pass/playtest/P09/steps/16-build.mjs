// P09 step 16 — build Training Ground Tier 1; capture state.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  await s.page.getByRole('button', { name: /Build a facility/ }).click();
  await s.page.waitForTimeout(3000);
  await s.shot('16-facilities');
  const btns = s.page.getByRole('button', { name: 'Build Tier 1' });
  console.log('build buttons:', await btns.count());
  await btns.first().click();
  await s.page.waitForTimeout(2000);
  await s.shot('16-after-build-click');
  let aria = await s.ariaSnapshot();
  console.log('--- AFTER BUILD CLICK (tail 35) ---');
  console.log(aria.split('\n').slice(-35).join('\n'));
  // Confirm if a dialog
  const conf = s.page.getByRole('button', { name: /^(Confirm|Build|Yes)/ });
  if (await conf.count()) {
    for (let i = 0; i < await conf.count(); i++) console.log('confirm:', await conf.nth(i).textContent());
  }
  await s.decide('Opened the Facilities step and tapped Build Tier 1 on the recommended Training Ground.');
} finally {
  await s.close();
}
console.log('DONE');
