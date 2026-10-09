// P09 step 07 — enter campus; capture portrait + rotate to landscape; probe nav/drawer.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  const go = s.page.getByRole('button', { name: /Go to your ground/ });
  if (await go.count()) { await go.click(); await s.page.waitForTimeout(6000); }
  console.log('URL:', s.page.url());

  // Portrait
  let aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step07-campus-portrait-aria.txt', aria);
  console.log('--- PORTRAIT ARIA ---'); console.log(aria);
  await s.shot('07-campus-portrait');
  await s.decide('Entered the campus; captured portrait view.');

  // Rotate to landscape
  await s.page.setViewportSize({ width: 1024, height: 768 });
  await s.page.waitForTimeout(2500);
  aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step07-campus-landscape-aria.txt', aria);
  console.log('--- LANDSCAPE ARIA ---'); console.log(aria);
  await s.shot('07-campus-landscape');

  // Rotate back
  await s.page.setViewportSize({ width: 768, height: 1024 });
  await s.page.waitForTimeout(2000);
  await s.shot('07-campus-portrait-again');
  await s.decide('Rotated 768x1024 -> 1024x768 (landscape) and back; compared campus layout.');
} finally {
  await s.close();
}
console.log('DONE');
