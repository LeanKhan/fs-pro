// P09 step 20 — click Play now; sample screen + level XP over 40s.
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

  const xpNow = async () => {
    const t = await s.page.getByText(/\b\d+\/100\b/).first().textContent().catch(() => '?');
    return t?.trim();
  };
  console.log('XP before:', await xpNow());

  await s.page.getByRole('button', { name: /PLAY/ }).first().click();
  await s.page.waitForTimeout(2500);
  await s.page.getByRole('button', { name: 'Play now' }).click();
  for (const t of [1000, 4000, 8000, 15000, 25000]) {
    await s.page.waitForTimeout(t === 1000 ? 1000 : t - 0);
    await s.shot(`20-playnow-t${t}`);
    const aria = await s.ariaSnapshot();
    const head = aria.split('\n').slice(0, 25).join('\n');
    console.log(`--- t=${t}ms ---`);
    console.log(head);
    console.log('XP:', await xpNow());
    fs.writeFileSync(`docs/perfect/ux-pass/playtest/P09/step20-t${t}-aria.txt`, aria);
  }
  await s.decide('Sampled the screen at 1/4/8/15/25s after "Play now" to find where the match result appears.');
} finally {
  await s.close();
}
console.log('DONE');
