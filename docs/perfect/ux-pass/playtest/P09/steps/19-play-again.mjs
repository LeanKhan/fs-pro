// P09 step 19 — reopen PLAY; check cooldown / match feedback.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }
  const next = s.page.getByRole('button', { name: /^Next$/ });
  if (await next.count()) { await next.click(); await s.page.waitForTimeout(500); }
  await s.page.getByRole('button', { name: /PLAY/ }).first().click();
  await s.page.waitForTimeout(3500);
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step19-play-aria.txt', aria);
  console.log('--- PLAY (from Find a Match) ---');
  const idx = aria.indexOf('Find a Match');
  console.log(aria.slice(Math.max(0, idx - 200)));
  await s.shot('19-play-again');
  await s.decide('Reopened PLAY immediately after a match to check cooldown and match feedback.');
} finally {
  await s.close();
}
console.log('DONE');
