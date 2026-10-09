// P06 step 25 — complete manager signing + capture reward/XP.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 6; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(900); } else break;
  }
  const op = s.page.getByRole('button', { name: /Owner's program/ }).first();
  if (await op.count()) { await op.click().catch(() => {}); await s.page.waitForTimeout(3000); }
  const start = s.page.getByRole('button', { name: /start the program/i }).first();
  if (await start.count() && await start.isVisible().catch(() => false)) { await start.click().catch(() => {}); await s.page.waitForTimeout(4500); }

  await s.page.getByRole('button', { name: /^Sign$/ }).first().click();
  await s.page.waitForTimeout(2500);
  // choose 3-year contract
  const three = s.page.getByRole('button', { name: '3', exact: true }).first();
  if (await three.count() && await three.isVisible().catch(() => false)) { await three.click().catch(() => {}); await s.page.waitForTimeout(600); }
  await s.shot('41-negotiate');
  const confirm = s.page.getByRole('button', { name: /Sign for V/ }).first();
  const t0 = Date.now();
  await confirm.click();
  await s.page.waitForTimeout(4500);
  await s.shot('42-after-manager-signed');
  const aria = await s.ariaSnapshot();
  console.log('[after-confirm]', aria.split('\n').slice(0, 60).join('\n'));
  console.log('---tail---');
  console.log(aria.split('\n').slice(-40).join('\n'));
  console.log(`[confirm-ms] ${Date.now() - t0}`);
  const xp = await s.page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/Program XP\s*(\d+)\s*\/\s*(\d+)/i) || t.match(/(\d+)\s*\/\s*(\d+)\s*XP/i);
    return m ? m[0] : null;
  });
  console.log('[xp]', xp);
  await s.decide(`Signed manager Jousare Batou for V40,000, 3-year contract. XP text=${xp}.`);
} finally {
  await s.close();
}
