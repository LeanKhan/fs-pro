// P04 s3 step 16 — grind qualifying friendlies via PLAY dock; log XP/results.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';
const LOG = 'C:/done/fs-pro/docs/perfect/ux-pass/playtest/P04/traces/s3-16-grind.txt';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const say = (m) => { console.log('[P04]', m); fs.appendFileSync(LOG, m + '\n'); };
const xp = (a) => ((a.match(/0 \d+\/100/) || a.match(/\d+ \d+\/100/) || ['(none)'])[0]);
const results = (a) => (a.split('\n').filter(l => /(^|\s)[WDL] [A-Z]/.test(l)).join(' | ') || '(no results line)');
async function aria(l) { try { return await withTimeout(s.ariaSnapshot(), 9000, l); } catch (e) { return `ERR ${e.message}`; } }
async function domClick(loc, what) { await loc.evaluate(el => el.click()).catch(e => say(`${what} err ${e.message}`)); }

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }

  for (let i = 1; i <= 6; i++) {
    const a0 = await aria('x0');
    say(`r${i} XP before: ${xp(a0)}`);
    // open PLAY via DOM click (animated button)
    await domClick(s.page.locator('.playbtn').first(), 'playbtn');
    await s.page.waitForTimeout(1600);
    const pn = s.page.getByRole('button', { name: 'Play now', exact: true });
    const cnt = await pn.count();
    if (!cnt) { say(`r${i} no Play now (sheet didn't open)`); await s.shot(`s3-16-r${i}-nosheet`); await s.page.waitForTimeout(5000); continue; }
    await domClick(pn.first(), 'playnow');
    await s.page.waitForTimeout(7000);
    const a1 = await aria('x1');
    say(`r${i} XP after:  ${xp(a1)}`);
    say(`r${i} results:   ${results(a1)}`);
    await s.shot(`s3-16-r${i}`);
    if (i < 6) await s.page.waitForTimeout(80_000);
    // reload fresh each round for robustness
    if (i < 6) { await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }); await s.page.waitForTimeout(3000); const lg = s.page.getByRole('button', { name: "Let's go!" }); if (await lg.count()) { await lg.first().click(); await s.page.waitForTimeout(500); } }
  }
  say('DONE');
  await s.decide('S3: ground 6 friendlies ~80s apart; XP/results logged.');
} catch (e) {
  await s.shot('s3-16-error');
  say('ERROR ' + e.message);
  await s.decide(`S3 step16 error: ${e.message}`);
} finally {
  await s.saveState().catch(() => {});
  await withTimeout(s.close(), 10_000, 'close').catch(() => {});
  process.exit(0);
}
