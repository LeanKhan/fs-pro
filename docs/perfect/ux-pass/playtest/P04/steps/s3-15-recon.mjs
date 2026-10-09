// P04 s3 step 15 — recon: owner's program build status, league, messages.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
import fs from 'node:fs';
const LOG = 'C:/done/fs-pro/docs/perfect/ux-pass/playtest/P04/traces/s3-15-log.txt';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const say = (m) => { console.log('[P04]', m); fs.appendFileSync(LOG, m + '\n'); };
const xp = (a) => (a.match(/\d+ \d+\/100/) || ['(none)'])[0];

async function aria(label) { try { return await withTimeout(s.ariaSnapshot(), 9000, label); } catch (e) { return `ERR ${e.message}`; } }

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  say('campus XP: ' + xp(await aria('a0')));

  // Owner's program
  await s.page.getByRole('button', { name: "Owner's program" }).first().evaluate(el => el.click()).catch(e => say('op err ' + e.message));
  await s.page.waitForTimeout(1500);
  const a1 = await aria('a1');
  say('--- PROGRAM ---');
  say(a1.split('\n').slice(0, 30).join('\n'));
  await s.shot('s3-15-program');
  const back = s.page.getByRole('button', { name: /Back to the grounds/i });
  if (await back.count()) { await back.first().evaluate(el => el.click()).catch(() => {}); await s.page.waitForTimeout(1200); }

  // League
  await s.page.getByRole('button', { name: 'League', exact: true }).first().evaluate(el => el.click()).catch(e => say('league err ' + e.message));
  await s.page.waitForTimeout(2000);
  const a2 = await aria('a2');
  say('--- LEAGUE ---');
  say(a2.slice(0, 2200));
  await s.shot('s3-15-league');
  await s.decide('S3 recon: read Owner&#39;s program status and League screen.');
} catch (e) {
  await s.shot('s3-15-error');
  say('ERROR ' + e.message);
  await s.decide(`S3 step15 error: ${e.message}`);
} finally { await s.close(); }
