// P09 step 15 — sign up to 11 players (best first), then read progress.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(1000); }
  await s.page.getByRole('button', { name: /Build a squad/ }).click();
  await s.page.waitForTimeout(3000);
  await s.shot('15-squad-start');

  const best = s.page.getByRole('button', { name: 'Best' });
  if (await best.count()) { await best.click(); await s.page.waitForTimeout(1000); }

  for (let i = 0; i < 14; i++) {
    const sign = s.page.getByRole('button', { name: 'Sign' });
    const n = await sign.count();
    if (!n) { console.log('no Sign buttons left at iter', i); break; }
    await sign.first().click();
    await s.page.waitForTimeout(900);
    const prog = await s.page.getByText(/of 11 players/).first().textContent().catch(() => '?');
    console.log(`iter ${i}: ${prog?.trim()}`);
    if (/\b11 of 11/.test(prog || '')) { console.log('squad full'); break; }
  }
  await s.shot('15-squad-after');
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step15-squad-aria.txt', aria);
  console.log('--- AFTER SIGNING (head 40) ---');
  console.log(aria.split('\n').slice(0, 40).join('\n'));
  await s.decide('Signed free agents with the "Best" sort until the matchday squad reached 11.');
} finally {
  await s.close();
}
console.log('DONE');
