// P04 s3 step 9 — build the cheapest Tier 1 (Training Ground).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: "Owner's program" }).first().click({ timeout: 6000, force: true }).catch(e => log('op err', e.message));
  await s.page.waitForTimeout(1200);
  await s.shot('s3-09-foundations');

  const tg = s.page.getByRole('article').filter({ hasText: 'Training Ground' }).first();
  const build = tg.getByRole('button', { name: /Build Tier 1/i });
  log('training build count', await build.count());
  await build.click({ timeout: 5000, force: true }).catch(e => log('build err', e.message));
  await s.page.waitForTimeout(2500);
  await s.shot('s3-09-after-build');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 10000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA ===\n' + aria.slice(0, 3500));
  await s.decide('S3: built Training Ground Tier 1 (V200,000, shows 5 min at scale 4 = 20 min design).');
} catch (e) {
  await s.shot('s3-09-error');
  await s.decide(`S3 step9 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally { await s.close(); }
