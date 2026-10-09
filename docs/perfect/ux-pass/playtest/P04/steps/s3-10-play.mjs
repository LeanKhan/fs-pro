// P04 s3 step 10 — back to grounds, check XP, open PLAY.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.shot('s3-10-campus');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 8000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA campus ===\n' + aria);

  const play = s.page.getByRole('button', { name: /^PLAY/ });
  log('play count', await play.count());
  await play.first().click({ timeout: 5000, force: true }).catch(e => log('play err', e.message));
  await s.page.waitForTimeout(2000);
  await s.shot('s3-10-play');
  let aria2 = ''; try { aria2 = await withTimeout(s.ariaSnapshot(), 8000, 'aria'); } catch (e) { aria2 = `ERR ${e.message}`; }
  console.log('=== ARIA play ===\n' + aria2);
  await s.decide('S3: returned to grounds and opened PLAY.');
} catch (e) {
  await s.shot('s3-10-error');
  await s.decide(`S3 step10 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally { await s.close(); }
