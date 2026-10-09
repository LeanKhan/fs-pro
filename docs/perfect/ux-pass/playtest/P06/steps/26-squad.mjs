// P06 step 26 — sign a GK + 10 outfielders (free agents) via the program squad builder.
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

  async function progress() {
    return s.page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(\d+)\s*of\s*11 players/) || t.match(/Minimum matchday squad\s*(\d+)\/11/);
      const xp = t.match(/Program XP\s*(\d+)\/(\d+)/);
      const budget = t.match(/Budget left\s*V([\d.,KMB]+)/i);
      return { squad: m ? m[0] : null, xp: xp ? xp[0] : null, budget: budget ? budget[0] : null };
    });
  }
  console.log('[start]', JSON.stringify(await progress()));

  async function signFirst(posFilter) {
    // click position filter if given
    if (posFilter) {
      await s.page.evaluate((f) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === f); if (b) b.click(); }, posFilter);
      await s.page.waitForTimeout(1500);
    }
    const before = await s.page.evaluate(() => {
      const art = document.querySelector('article');
      return art ? (art.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) : null;
    });
    const sign = s.page.getByRole('button', { name: /^Sign$/ }).first();
    if (!(await sign.count())) return { ok: false, why: 'no sign button' };
    await sign.scrollIntoViewIfNeeded().catch(() => {});
    const t0 = Date.now();
    await sign.click();
    // dialog?
    let confirmed = false;
    try {
      const dlg = s.page.getByRole('dialog').first();
      await dlg.waitFor({ state: 'visible', timeout: 6000 });
      const conf = s.page.getByRole('button', { name: /Sign for V/ }).first();
      if (await conf.count()) { await conf.click(); confirmed = true; }
      else { const nb = s.page.getByRole('button', { name: /Not yet/ }).first(); if (await nb.count()) await nb.click(); }
    } catch { /* no dialog: maybe signed directly */ }
    await s.page.waitForTimeout(2200);
    return { ok: true, confirmed, before, ms: Date.now() - t0 };
  }

  // 1 GK
  const gk = await signFirst('GK');
  console.log('[GK]', JSON.stringify(gk));
  await s.shot('43-after-gk');

  // 10 outfielders
  for (let i = 0; i < 11; i++) {
    const p = await progress();
    if (p.squad && /11\s*of\s*11/.test(p.squad)) break;
    const r = await signFirst(null);
    console.log(`[sign ${i + 1}]`, JSON.stringify(r), 'progress', JSON.stringify(await progress()));
    if (!r.ok) break;
  }
  const end = await progress();
  console.log('[end]', JSON.stringify(end));
  await s.shot('44-squad-built');
  await s.decide(`Signed GK + free agents; progress ${JSON.stringify(end)}.`);
} finally {
  await s.close();
}
