// P09 step 13 — confirm signing; then open the Squad step.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  await s.page.getByRole('button', { name: /Sign a manager/ }).click();
  await s.page.waitForTimeout(2000);
  const start = s.page.getByRole('button', { name: /start the program/ });
  if (await start.count()) { await start.click(); await s.page.waitForTimeout(2000); }
  const best = s.page.getByRole('button', { name: 'Best rated' });
  if (await best.count()) { await best.click(); await s.page.waitForTimeout(800); }

  // If already has a manager, market may show differently. Try Sign -> confirm.
  const signConfirm = s.page.getByRole('button', { name: /Sign for V/ }).first();
  console.log('sign-for-v present:', await signConfirm.count());
  if (await signConfirm.count()) {
    await signConfirm.click();
    await s.page.waitForTimeout(3000);
  } else {
    const firstSign = s.page.getByRole('button', { name: 'Sign' }).first();
    if (await firstSign.count()) {
      await firstSign.click();
      await s.page.waitForTimeout(1500);
      const sc = s.page.getByRole('button', { name: /Sign for V/ }).first();
      if (await sc.count()) { await sc.click(); await s.page.waitForTimeout(3000); }
    }
  }
  await s.shot('13-after-sign');
  let aria = await s.ariaSnapshot();
  console.log('--- AFTER SIGN (head 45) ---');
  console.log(aria.split('\n').slice(0, 45).join('\n'));

  // Try to open Squad (step 2).
  const squad = s.page.getByRole('button', { name: /^Squad/ }).first();
  if (await squad.count()) { await squad.click(); await s.page.waitForTimeout(2500); }
  aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step13-squad-aria.txt', aria);
  await s.shot('13-squad-step');
  await s.decide('Confirmed the manager signing, then opened the Squad step of the Owner\'s Program.');
} finally {
  await s.close();
}
console.log('DONE');
