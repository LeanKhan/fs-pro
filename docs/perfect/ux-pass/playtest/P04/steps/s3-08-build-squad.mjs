// P04 s3 step 8 — build a legal matchday squad (1 GK + 10).
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);

const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);

async function openSquadScreen() {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }
  await s.page.getByRole('button', { name: "Owner's program" }).first().click({ timeout: 6000, force: true }).catch(e => log('op err', e.message));
  await s.page.waitForTimeout(1200);
}

async function signOne(posButton) {
  if (posButton) { await s.page.getByRole('button', { name: posButton, exact: true }).first().click({ timeout: 5000, force: true }).catch(e => log('filter err', e.message)); await s.page.waitForTimeout(600); }
  const article = s.page.getByRole('article').filter({ hasNotText: 'HTTP PgTest' }).first();
  const btn = article.getByRole('button', { name: 'Sign', exact: true });
  if (!(await btn.count())) { log('no Sign button'); return false; }
  await btn.click({ timeout: 5000, force: true }).catch(e => log('sign err', e.message));
  await s.page.waitForTimeout(900);
  const confirm = s.page.getByRole('button', { name: /Sign for V/ });
  if (await confirm.count()) { await confirm.first().click({ timeout: 5000, force: true }).catch(e => log('confirm err', e.message)); await s.page.waitForTimeout(1400); }
  else { log('no confirm modal'); return false; }
  return true;
}

try {
  await openSquadScreen();
  // 1 keeper
  let ok = await signOne('GK');
  log('signed GK', ok);
  await s.shot('s3-08-after-gk');

  // 10 outfield
  for (let i = 0; i < 10; i++) {
    const done = await signOne(null);
    log('sign', i + 1, done);
    if (!done) break;
  }
  await s.page.waitForTimeout(1500);
  await s.shot('s3-08-squad-built');
  let aria = ''; try { aria = await withTimeout(s.ariaSnapshot(), 10000, 'aria'); } catch (e) { aria = `ERR ${e.message}`; }
  console.log('=== ARIA after squad build ===\n' + aria.slice(0, 6000));
  await s.decide('S3: signed 1 GK + 10 outfielders from Owner&#39;s program to open PLAY.');
} catch (e) {
  await s.shot('s3-08-error');
  await s.decide(`S3 step8 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
