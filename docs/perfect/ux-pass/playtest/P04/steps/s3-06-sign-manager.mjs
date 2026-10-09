// P04 s3 step 6 — sign the first (cheapest) manager.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);

const s = await personaContext('P04');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: "Owner's program" }).first().click({ timeout: 5000, force: true }).catch(e => console.log('op err', e.message));
  await s.page.waitForTimeout(1000);
  await s.page.getByRole('button', { name: /start the program/i }).first().click({ timeout: 5000, force: true }).catch(e => console.log('start err', e.message));
  await s.page.waitForTimeout(1500);
  await s.shot('s3-06-sign-manager-list');

  const sign = s.page.getByRole('button', { name: 'Sign', exact: true });
  console.log('sign buttons', await sign.count());
  await sign.first().click({ timeout: 5000, force: true }).catch(e => console.log('sign err', e.message));
  await s.page.waitForTimeout(2000);
  await s.shot('s3-06-after-sign');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 8000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after Sign ===\n' + aria);
  await s.decide('S3: signed the cheapest manager (V40,000) from the Owner&#39;s program Sign-a-manager screen.');
} catch (e) {
  await s.shot('s3-06-error');
  await s.decide(`S3 step6 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
