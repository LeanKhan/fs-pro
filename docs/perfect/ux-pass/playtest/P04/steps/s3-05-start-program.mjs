// P04 s3 step 5 — open Owner's program, start it, look for the manager hire.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);

const s = await personaContext('P04');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  const op = s.page.getByRole('button', { name: "Owner's program" });
  await op.first().click({ timeout: 5000, force: true }).catch(e => console.log('op err', e.message));
  await s.page.waitForTimeout(1200);
  await s.shot('s3-05-program-open');

  // Tap the primary CTA
  const start = s.page.getByRole('button', { name: /start the program/i });
  console.log('start-cta count', await start.count());
  if (await start.count()) { await start.first().click({ timeout: 5000, force: true }).catch(e => console.log('start err', e.message)); await s.page.waitForTimeout(1500); }
  await s.shot('s3-05-after-start');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 8000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after start ===\n' + aria);
  await s.decide('S3: opened Owner&#39;s program and tapped "Right then — start the program" to find the manager hire.');
} catch (e) {
  await s.shot('s3-05-error');
  await s.decide(`S3 step5 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
