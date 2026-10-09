// P09 step 18 — play first match; observe Matchzone.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  const gotIt = s.page.getByRole('button', { name: /Got it/ });
  if (await gotIt.count()) { await gotIt.click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /PLAY/ }).first().click();
  await s.page.waitForTimeout(3000);
  await s.page.getByRole('button', { name: 'Play now' }).click();
  await s.page.waitForTimeout(4000);
  await s.shot('18-after-playnow');
  let aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step18-playnow-aria.txt', aria);
  console.log('--- AFTER PLAY NOW (head 70) ---');
  console.log(aria.split('\n').slice(0, 70).join('\n'));
  await s.decide('Tapped "Play now" against Skip FC; captured the match kickoff screen.');
} finally {
  await s.close();
}
console.log('DONE');
