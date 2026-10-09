// P04 session 3, step 3 — open "Owner's program" chip.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P04');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(2500);
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(800); }

  const op = s.page.getByRole('button', { name: "Owner's program" });
  console.log('owners-program count', await op.count());
  await op.first().click({ timeout: 5000 }).catch(e => console.log('click err', e.message));
  await s.page.waitForTimeout(1500);
  await s.shot('s3-03-owners-program');
  const aria = await s.ariaSnapshot();
  console.log('=== ARIA after Owner\'s program ===');
  console.log(aria);
  await s.decide('S3: tapped Owner&#39;s program chip.');
} catch (e) {
  await s.shot('s3-03-error');
  await s.decide(`S3 step3 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
