// P09 step 12 — sign the top "Best rated" manager.
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
  if (await best.count()) { await best.click(); await s.page.waitForTimeout(1000); }

  const firstSign = s.page.getByRole('button', { name: 'Sign' }).first();
  await firstSign.click();
  await s.page.waitForTimeout(2000);
  await s.shot('12-after-sign-click');
  let aria = await s.ariaSnapshot();
  console.log('--- AFTER SIGN CLICK ---');
  console.log(aria.split('\n').slice(0, 50).join('\n'));

  // Confirm if a dialog appeared.
  const confirm = s.page.getByRole('button', { name: /^(Confirm|Sign|Hire|Yes)/ });
  console.log('confirm buttons:', await confirm.count());
  for (let i = 0; i < await confirm.count(); i++) {
    console.log('  confirm[' + i + ']=', await confirm.nth(i).textContent());
  }
  await s.decide('Tapped Sign on the top "Best rated" manager; captured the result.');
} finally {
  await s.close();
}
console.log('DONE');
