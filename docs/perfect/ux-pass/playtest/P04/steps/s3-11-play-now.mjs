// P04 s3 step 11 — play a match now.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 5000, force: true }).catch(e => log('play err', e.message));
  await s.page.waitForTimeout(2000);
  const playNow = s.page.getByRole('button', { name: 'Play now', exact: true });
  log('playNow count', await playNow.count());
  await playNow.first().click({ timeout: 6000, force: true }).catch(e => log('playNow err', e.message));
  await s.page.waitForTimeout(4000);
  await s.shot('s3-11-play-now');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 10000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after Play now ===\n' + aria.slice(0, 5000));
  await s.decide('S3: tapped Play now vs Ledger United (P03).');
} catch (e) {
  await s.shot('s3-11-error');
  await s.decide(`S3 step11 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally { await s.close(); }
