// P06 step 27 — check squad count and program state.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P06');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await s.page.waitForTimeout(9000);
  for (let i = 0; i < 6; i++) {
    const b = s.page.getByRole('button', { name: /Let's go!|Got it|Continue/ }).first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await s.page.waitForTimeout(900); } else break;
  }
  // Open Owner's program and read the squad-builder progress.
  const op = s.page.getByRole('button', { name: /Owner's program/ }).first();
  if (await op.count()) { await op.click().catch(() => {}); await s.page.waitForTimeout(3000); }
  const start = s.page.getByRole('button', { name: /start the program/i }).first();
  if (await start.count() && await start.isVisible().catch(() => false)) { await start.click().catch(() => {}); await s.page.waitForTimeout(4500); }
  const txt = await s.page.evaluate(() => {
    const t = document.body.innerText.replace(/\n+/g, '\n');
    const lines = t.split('\n').filter((l) => /players|Budget|goalkeeper|Program XP|Level|First steps|XP/i.test(l));
    return lines.slice(0, 25).join('\n');
  });
  console.log('[state]', txt);
  await s.shot('45-squad-state');
  // Count articles.
  const n = await s.page.evaluate(() => document.querySelectorAll('article').length);
  console.log('[articles]', n);
  await s.decide(`Checked squad state: ${txt.replace(/\n/g, ' | ')} (articles listed: ${n}).`);
} finally {
  await s.close();
}
