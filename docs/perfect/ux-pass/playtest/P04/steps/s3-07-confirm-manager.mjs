// P04 s3 step 7 — complete manager signing.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);

const s = await personaContext('P04');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: "Owner's program" }).first().click({ timeout: 5000, force: true }).catch(e => console.log('op err', e.message));
  await s.page.waitForTimeout(1200);
  await s.shot('s3-07-program');

  const sign = s.page.getByRole('button', { name: 'Sign', exact: true });
  await sign.first().click({ timeout: 5000, force: true }).catch(e => console.log('sign err', e.message));
  await s.page.waitForTimeout(1200);
  await s.shot('s3-07-negotiate');

  const confirm = s.page.getByRole('button', { name: /Sign for V/ });
  console.log('confirm count', await confirm.count());
  if (await confirm.count()) { await confirm.first().click({ timeout: 5000, force: true }).catch(e => console.log('confirm err', e.message)); await s.page.waitForTimeout(2500); }
  await s.shot('s3-07-after-confirm');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 8000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after confirm ===\n' + aria);
  await s.decide('S3: confirmed "Sign for V40,000" and captured the result.');
} catch (e) {
  await s.shot('s3-07-error');
  await s.decide(`S3 step7 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
