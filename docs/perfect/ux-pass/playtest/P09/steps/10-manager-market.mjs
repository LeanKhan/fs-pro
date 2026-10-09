// P09 step 10 — start the program; find manager candidates.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1200); }
  await s.page.getByRole('button', { name: /Sign a manager/ }).click();
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: /start the program/ }).click();
  await s.page.waitForTimeout(3000);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step10-manager-market-aria.txt', aria);
  console.log('--- MANAGER MARKET ARIA ---'); console.log(aria);
  await s.shot('10-manager-market');
  await s.decide('Started the Owner\'s Program and landed on the manager market.');
} finally {
  await s.close();
}
console.log('DONE');
