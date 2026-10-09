// P09 step 17 — back to campus; open PLAY; capture the match screen.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  const back = s.page.getByRole('button', { name: /Back to the grounds/ });
  if (await back.count()) { await back.click(); await s.page.waitForTimeout(4000); }
  await s.shot('17-campus');
  const aria0 = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step17-campus-aria.txt', aria0);
  console.log('--- CAMPUS (head 40) ---');
  console.log(aria0.split('\n').slice(0, 40).join('\n'));

  const play = s.page.getByRole('button', { name: /PLAY/ });
  console.log('PLAY count:', await play.count());
  await play.first().click();
  await s.page.waitForTimeout(4000);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step17-play-aria.txt', aria);
  console.log('--- PLAY (head 60) ---');
  console.log(aria.split('\n').slice(0, 60).join('\n'));
  await s.shot('17-play');
  await s.decide('Returned to the campus and tapped PLAY to open matchmaking.');
} finally {
  await s.close();
}
console.log('DONE');
