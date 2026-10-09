// P04 s3 step 13 — diagnose friendly cooldown / feedback; play a couple.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))]);
const s = await personaContext('P04');
const log = (...a) => console.log('[P04]', ...a);

async function header() {
  const el = s.page.locator('text=/\\d+ \\/? ?\\d+\\/100/').first();
  try { return (await el.textContent({ timeout: 2000 }))?.trim(); } catch { return '(no xp found)'; }
}

async function openPlay() {
  await s.page.getByRole('button', { name: /^PLAY/ }).first().click({ timeout: 5000, force: true }).catch(e => log('play-open err', e.message));
  await s.page.waitForTimeout(1600);
}

try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(600); }

  for (let round = 1; round <= 3; round++) {
    log(`round ${round}: header before =`, await header());
    await s.shot(`s3-13-r${round}-campus`);
    await openPlay();
    const pn = s.page.getByRole('button', { name: 'Play now', exact: true });
    const enabled = await pn.first().isEnabled().catch(() => false);
    const disabledAttr = await pn.first().getAttribute('disabled').catch(() => null);
    log(`round ${round}: Play now count=${await pn.count()} enabled=${enabled} disabledAttr=${disabledAttr}`);
    await s.shot(`s3-13-r${round}-find-match`);
    await pn.first().click({ timeout: 6000, force: true }).catch(e => log('playnow err', e.message));
    await s.page.waitForTimeout(5000);
    log(`round ${round}: header after  =`, await header());
    await s.shot(`s3-13-r${round}-after`);
    // close the play sheet if still open, then idle for the cooldown
    const close = s.page.getByRole('button', { name: 'Close' });
    if (await close.count()) { await close.first().click({ timeout: 3000, force: true }).catch(() => {}); }
    if (round < 3) { await s.page.waitForTimeout(78_000); }
  }
  await s.decide('S3: ran 3 friendly plays ~78s apart; logged XP before/after to find the cooldown behavior.');
} catch (e) {
  await s.shot('s3-13-error');
  await s.decide(`S3 step13 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally { await s.close(); }
