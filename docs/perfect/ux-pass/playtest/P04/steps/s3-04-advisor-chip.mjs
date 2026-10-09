// P04 s3 step 4 — verify services; try advisor bubble + Owner's program chip.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
]);

const s = await personaContext('P04');
try {
  const t0 = Date.now();
  const resp = await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('client status', resp && resp.status(), 'in', Date.now() - t0, 'ms');
  await s.page.waitForTimeout(3000);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(700); }

  // 1. The advisor bubble (bottom-left avatar with speech bubble) — try to reopen guidance.
  await s.shot('s3-04-before-advisor');
  const bubble = s.page.locator('img, button, [role="button"]').filter({ hasNotText: 'x' });
  // target the advisor group region by role first
  const advGroup = s.page.getByRole('group', { name: 'Club advisor' });
  console.log('advisor group count', await advGroup.count());
  let aria1 = '';
  try { aria1 = await withTimeout(s.ariaSnapshot(), 8000, 'aria(before)'); } catch (e) { aria1 = `ERR ${e.message}`; }
  console.log('=== ARIA before ===\n' + aria1.split('\n').slice(0, 40).join('\n'));

  // Try clicking the advisor group (the bottom-left character/bubble)
  if (await advGroup.count()) {
    await advGroup.first().click({ timeout: 4000, force: true }).catch(e => console.log('adv click err', e.message));
    await s.page.waitForTimeout(1200);
  }
  await s.shot('s3-04-after-advisor');

  // 2. Owner's program chip via forced DOM click
  const op = s.page.getByRole('button', { name: "Owner's program" });
  if (await op.count()) {
    await op.first().click({ timeout: 4000, force: true }).catch(e => console.log('op click err', e.message));
    await s.page.waitForTimeout(1500);
  }
  await s.shot('s3-04-after-owners-program');
  let aria2 = '';
  try { aria2 = await withTimeout(s.ariaSnapshot(), 8000, 'aria(after)'); } catch (e) { aria2 = `ERR ${e.message}`; }
  console.log('=== ARIA after ===\n' + aria2);
  await s.decide('S3: services up; tried advisor bubble and Owner&#39;s program chip to recover guidance.');
} catch (e) {
  await s.shot('s3-04-error');
  await s.decide(`S3 step4 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
