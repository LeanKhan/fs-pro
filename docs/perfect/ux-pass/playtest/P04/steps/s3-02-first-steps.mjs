// P04 session 3, step 2 — dismiss digest, open "First steps" checklist.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P04');
try {
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3000);
  // Dismiss the "While you were away" digest (visible in a11y as Let's go!)
  const letsGo = s.page.getByRole('button', { name: "Let's go!" });
  if (await letsGo.count()) { await letsGo.first().click(); await s.page.waitForTimeout(800); }
  await s.shot('s3-02-campus-clear');

  // Open the First steps checklist
  const fs = s.page.getByRole('button', { name: /First steps/i });
  console.log('first-steps count', await fs.count());
  if (await fs.count()) { await fs.first().click(); await s.page.waitForTimeout(1200); }
  await s.shot('s3-02-first-steps');
  const aria = await s.ariaSnapshot();
  console.log('=== ARIA after First steps ===');
  console.log(aria);
  await s.decide('S3: dismissed digest; opened First steps checklist to find the manager task.');
} catch (e) {
  await s.shot('s3-02-error');
  await s.decide(`S3 step2 error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
