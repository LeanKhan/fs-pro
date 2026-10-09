// P09 step 05 — club step: read full tree, fill code, go to kick-off.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  let aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step05-aria.txt', aria);
  console.log('ARIA lines:', aria.split('\n').length, '(written to step05-aria.txt)');

  // Fill the club code (the only empty required field).
  const codeBox = s.page.getByRole('textbox').nth(1); // Club name, Code, Ground ordering
  // Safer: find textbox near "Code" label via placeholder/label.
  const boxes = await s.page.getByRole('textbox').all();
  for (const b of boxes) {
    const val = await b.inputValue().catch(() => '');
    console.log('textbox value=', JSON.stringify(val));
  }
  // Fill by position: aria shows Club name, then Code, then Ground.
  await boxes[1].fill('PCU');
  await s.page.waitForTimeout(400);
  await s.shot('05-club-code-filled');
  const next = s.page.getByRole('button', { name: 'Next: kick-off' });
  console.log('next disabled?', await next.isDisabled());
  await next.click();
  await s.page.waitForTimeout(1500);
  aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step05b-aria.txt', aria);
  console.log('--- KICKOFF ARIA ---');
  console.log(aria);
  await s.shot('05-kickoff');
  await s.decide('Filled club Code=PCU (Next was disabled while empty) and advanced to Kick-off.');
} finally {
  await s.close();
}
console.log('DONE');
