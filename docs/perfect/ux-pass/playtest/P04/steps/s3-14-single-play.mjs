// P04 s3 step 14 — clean single friendly play: XP before/after via a11y.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';
const LOG = 'C:/done/fs-pro/docs/perfect/ux-pass/playtest/P04/traces/s3-14-playlog.txt';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const say = (m) => { console.log('[P04]', m); fs.appendFileSync(LOG, m + '\n'); };
const xpOf = (aria) => (aria.match(/\d+ \d+\/100/) || ['(none)'])[0];

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  const before = xpOf(await withTimeout(s.ariaSnapshot(), 8000, 'a1'));
  say(`before XP: ${before}`);
  await s.shot('s3-14-before');

  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 5000, force: true }).catch(e => say('play err ' + e.message));
  await s.page.waitForTimeout(1600);
  const pn = s.page.getByRole('button', { name: 'Play now', exact: true });
  say(`playNow count=${await pn.count()} enabled=${await pn.first().isEnabled().catch(() => false)}`);
  await s.shot('s3-14-find-match');
  await pn.first().click({ timeout: 6000, force: true }).catch(e => say('playnow err ' + e.message));
  await s.page.waitForTimeout(1500);
  await s.shot('s3-14-t1');
  await s.page.waitForTimeout(5000);
  await s.shot('s3-14-t6');
  await s.page.waitForTimeout(6000);
  const after = xpOf(await withTimeout(s.ariaSnapshot(), 8000, 'a2'));
  say(`after XP: ${after}`);
  await s.shot('s3-14-after');
  await s.decide('S3: single clean friendly play; XP before/after logged.');
} catch (e) {
  await s.shot('s3-14-error');
  say('ERROR ' + e.message);
  await s.decide(`S3 step14 error: ${e.message}`);
} finally { await s.close(); }
