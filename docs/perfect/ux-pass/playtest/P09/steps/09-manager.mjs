// P09 step 09 — dismiss intro modal + advisor, open "Sign a manager".
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1500); }
  await s.shot('09-campus-clean');
  // Dismiss advisor if present
  const dismiss = s.page.getByRole('button', { name: /Dismiss this tip/ });
  if (await dismiss.count()) { await dismiss.click(); await s.page.waitForTimeout(800); }

  // Open "Sign a manager"
  await s.page.getByRole('button', { name: /Sign a manager/ }).click();
  await s.page.waitForTimeout(2500);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step09-manager-aria.txt', aria);
  console.log('--- MANAGER ARIA ---'); console.log(aria);
  await s.shot('09-sign-manager');
  await s.decide('Dismissed the welcome modal + advisor tip, then opened First steps → "Sign a manager".');
} finally {
  await s.close();
}
console.log('DONE');
