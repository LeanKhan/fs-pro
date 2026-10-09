// P06 step 24 — sign a manager.
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

  // Top candidate name + fee for the diary.
  const card = await s.page.evaluate(() => {
    const arts = [...document.querySelectorAll('article')];
    const a = arts[0];
    if (!a) return null;
    return { text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140), signs: a.querySelectorAll('button').length };
  });
  console.log('[top-card]', JSON.stringify(card));
  await s.shot('39-manager-list');

  const t0 = Date.now();
  const signs = s.page.getByRole('button', { name: /^Sign$/ });
  await signs.first().click();
  await s.page.waitForTimeout(2500);
  await s.shot('40-after-sign-click');
  const aria = await s.ariaSnapshot();
  console.log('[after-sign]', aria.split('\n').slice(-50).join('\n'));
  console.log('[sign-click-ms]', Date.now() - t0);
  await s.decide(`Clicked Sign on top manager (${card?.text?.slice(0, 60)}); click->UI ${Date.now() - t0} ms.`);
} finally {
  await s.close();
}
