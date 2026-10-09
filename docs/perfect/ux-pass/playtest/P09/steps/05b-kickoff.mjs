// P09 step 05b — founding flow in one pass: home -> club -> kick-off.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2000);
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(1200);

  const boxes = await s.page.getByRole('textbox').all();
  console.log('textbox count:', boxes.length);
  for (const b of boxes) console.log('  value=', JSON.stringify(await b.inputValue().catch(() => '?')));

  await boxes[1].fill('PCU');
  await s.page.waitForTimeout(400);
  await s.shot('05-club-code-filled');
  const next = s.page.getByRole('button', { name: 'Next: kick-off' });
  console.log('next disabled?', await next.isDisabled());
  await next.click();
  await s.page.waitForTimeout(1500);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step05-kickoff-aria.txt', aria);
  console.log('--- KICKOFF ARIA ---');
  console.log(aria);
  await s.shot('05-kickoff');
  await s.decide('Filled club Code=PCU (Next: kick-off was disabled while empty) and advanced to Kick-off.');
} finally {
  await s.close();
}
console.log('DONE');
