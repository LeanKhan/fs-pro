// P04 s3 step 12 — watch the Play now result sequence carefully.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.shot('s3-12-campus-before');
  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 5000, force: true }).catch(e => log('play err', e.message));
  await s.page.waitForTimeout(1500);
  await s.shot('s3-12-find-match');
  const playNow = s.page.getByRole('button', { name: 'Play now', exact: true });
  log('playNow count', await playNow.count());
  await playNow.first().click({ timeout: 6000, force: true }).catch(e => log('playNow err', e.message));
  await s.page.waitForTimeout(800);
  await s.shot('s3-12-immediately-after');
  await s.page.waitForTimeout(1500);
  await s.shot('s3-12-2s');
  await s.page.waitForTimeout(4000);
  await s.shot('s3-12-6s');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 10000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after ===\n' + aria.slice(0, 3000));
  await s.decide('S3: replayed Play now with screenshots at 0.8s/2s/6s to catch any match feedback.');
} catch (e) {
  await s.shot('s3-12-error');
  await s.decide(`S3 step12 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally { await s.close(); }
