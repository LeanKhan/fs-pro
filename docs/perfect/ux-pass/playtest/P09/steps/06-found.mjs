// P09 step 06 — found the club, land on campus, read a11y + screenshots portrait & landscape.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  // If wizard already at kick-off step after previous run? The flow resets on reload, so redo fast.
  let found = s.page.getByRole('button', { name: /^Found Philamentia/ });
  if (!(await found.count())) {
    await s.page.getByRole('button', { name: /Next: your club/ }).click();
    await s.page.waitForTimeout(1200);
    const boxes = await s.page.getByRole('textbox').all();
    await boxes[0].fill('Philamentia Central United');
    await boxes[1].fill('PCU');
    await boxes[2].fill('Philamentia Central Park');
    await s.page.getByRole('button', { name: 'Next: kick-off' }).click();
    await s.page.waitForTimeout(1200);
    found = s.page.getByRole('button', { name: /^Found Philamentia/ });
  }
  await found.click();
  await s.page.waitForTimeout(5000);
  console.log('URL after found:', s.page.url());
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step06-campus-portrait-aria.txt', aria);
  console.log('--- CAMPUS ARIA (portrait) ---');
  console.log(aria);
  await s.shot('06-campus-portrait');
  await s.decide('Founded Philamentia Central United (PCU) and landed on the campus (portrait).');
} finally {
  await s.close();
}
console.log('DONE');
