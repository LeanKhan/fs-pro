// P09 step 05c — founding flow: fill club identity completely.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url + '/start', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: /Next: your club/ }).click();
  await s.page.waitForTimeout(1500);
  await s.shot('05-club-step');

  const boxes = await s.page.getByRole('textbox').all();
  for (const b of boxes) console.log('  value=', JSON.stringify(await b.inputValue().catch(() => '?')));

  await boxes[0].fill('Philamentia Central United');
  await boxes[1].fill('PCU');
  await boxes[2].fill('Philamentia Central Park');
  await s.page.waitForTimeout(500);
  await s.shot('05b-club-filled');
  const next = s.page.getByRole('button', { name: 'Next: kick-off' });
  console.log('next disabled?', await next.isDisabled());
  await next.click();
  await s.page.waitForTimeout(1500);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step05-kickoff-aria.txt', aria);
  console.log('--- KICKOFF ARIA ---');
  console.log(aria);
  await s.shot('05c-kickoff');
  await s.decide('Filled Club name / Code=PCU / Ground (Next stayed disabled until all three were valid) and advanced to Kick-off.');
} finally {
  await s.close();
}
console.log('DONE');
