// P09 step 22 — collect match rewards; check XP/level.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';

const watchdog = setTimeout(() => { console.error('[watchdog] forcing exit'); process.exit(0); }, 110000);
const s = await personaContext('P09');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(6000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.click(); await s.page.waitForTimeout(800); }

  const xpNow = async () => (await s.page.getByText(/\b\d+\/100\b/).first().textContent().catch(() => '?'))?.trim();
  console.log('XP at start:', await xpNow());

  let leave = s.page.getByRole('button', { name: /Leave the Matchzone/ });
  if (!(await leave.count())) {
    await s.page.getByRole('button', { name: /PLAY/ }).first().click();
    await s.page.waitForTimeout(2500);
    const pn = s.page.getByRole('button', { name: 'Play now' });
    console.log('Play now available:', await pn.count());
    if (await pn.count()) await pn.click();
    for (let i = 0; i < 25; i++) {
      await s.page.waitForTimeout(1000);
      if (await s.page.getByRole('button', { name: /Leave the Matchzone/ }).count()) break;
    }
  }
  await s.shot('22-in-match');
  const result = s.page.getByRole('button', { name: /^Result/ });
  if (await result.count()) { await result.click(); await s.page.waitForTimeout(2500); }
  const collect = s.page.getByRole('button', { name: /Collect rewards/ });
  console.log('Collect rewards count:', await collect.count());
  if (await collect.count()) { await collect.click(); await s.page.waitForTimeout(2500); }
  await s.shot('22-collected');
  const aria = await s.ariaSnapshot();
  fs.writeFileSync('docs/perfect/ux-pass/playtest/P09/step22-collected-aria.txt', aria);
  console.log('--- AFTER COLLECT (head 35) ---');
  console.log(aria.split('\n').slice(0, 35).join('\n'));
  console.log('XP after:', await xpNow());
  await s.decide('Opened a match in the Matchzone, jumped to Result and tapped "Collect rewards".');
} finally {
  clearTimeout(watchdog);
  await s.close({ keepTracing: true }).catch(() => {});
}
console.log('DONE');
process.exit(0);
