// P04 s3 step 8b — keep signing free agents until PLAY opens.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);

async function signOnce() {
  const article = s.page.getByRole('article').filter({ hasNotText: 'HTTP PgTest' }).first();
  const btn = article.getByRole('button', { name: 'Sign', exact: true });
  if (!(await btn.count())) { log('no Sign button left'); return 'nomore'; }
  await btn.click({ timeout: 5000, force: true }).catch(e => log('sign err', e.message));
  await s.page.waitForTimeout(1200);
  const confirm = s.page.getByRole('button', { name: /Sign for V/ });
  if (await confirm.count()) {
    await confirm.first().click({ timeout: 5000, force: true }).catch(e => log('confirm err', e.message));
    await s.page.waitForTimeout(1400);
  }
  return 'ok';
}

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: "Owner's program" }).first().click({ timeout: 6000, force: true }).catch(e => log('op err', e.message));
  await s.page.waitForTimeout(1200);
  // make sure ALL positions
  await s.page.getByRole('button', { name: 'ALL', exact: true }).first().click({ timeout: 4000, force: true }).catch(() => {});
  await s.page.waitForTimeout(500);

  for (let i = 0; i < 16; i++) {
    const r = await signOnce();
    log('sign', i + 1, r);
    if (r === 'nomore') break;
  }
  await s.page.waitForTimeout(1500);
  await s.shot('s3-08b-squad-built');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 10000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA ===\n' + aria.slice(0, 4000));
  await s.decide('S3: signed players in a loop to try to open PLAY.');
} catch (e) {
  await s.shot('s3-08b-error');
  await s.decide(`S3 step8b error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
