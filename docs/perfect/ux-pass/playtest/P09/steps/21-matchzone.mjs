// P09 step 21 — navigate the Matchzone: click Result, capture result + leave.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }

  // Are we already in a matchzone?
  let leave = s.page.getByRole('button', { name: /Leave the Matchzone/ });
  let inMatch = await leave.count();
  console.log('in matchzone at start:', inMatch);

  if (!inMatch) {
    await s.page.getByRole('button', { name: /PLAY/ }).first().click();
    await s.page.waitForTimeout(2500);
    const pn = s.page.getByRole('button', { name: 'Play now' });
    console.log('Play now count:', await pn.count());
    if (await pn.count()) { await pn.click(); }
    // wait for the matchzone controls to appear
    for (let i = 0; i < 30; i++) {
      await s.page.waitForTimeout(1000);
      leave = s.page.getByRole('button', { name: /Leave the Matchzone/ });
      if (await leave.count()) break;
    }
  }
  await s.shot('21-matchzone');
  let aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step21-matchzone-aria.txt', aria);
  console.log('--- MATCHZONE ARIA ---');
  console.log(aria.slice(0, 3000));

  const result = s.page.getByRole('button', { name: /Result/ });
  console.log('Result count:', await result.count());
  if (await result.count()) { await result.click(); await s.page.waitForTimeout(2500); }
  await s.shot('21-result');
  aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step21-result-aria.txt', aria);
  console.log('--- RESULT ARIA ---');
  console.log(aria.slice(0, 3000));
  await s.decide('Opened a live match in the Matchzone and tapped Result to see the full-time view.');
} finally {
  await s.close();
}
console.log('DONE');
