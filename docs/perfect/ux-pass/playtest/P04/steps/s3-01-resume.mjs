// P04 session 3, step 1 — resume after the outage. Just look at where we are.
import { personaContext } from 'file:///C:/done/fs-pro/tests/e2e/playtest/harness.mjs';

const s = await personaContext('P04');
try {
  console.log(`[P04] client ${s.url}`);
  await s.page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await s.page.waitForTimeout(3500);
  await s.shot('s3-01-resume-campus');
  const aria = await s.ariaSnapshot();
  console.log('=== ARIA ===');
  console.log(aria);
  await s.decide(`S3 resume: opened ${s.url}; a11y has ${aria.split('\n').length} lines.`);
} catch (e) {
  await s.shot('s3-01-error');
  await s.decide(`S3 resume error: ${e.message}`);
  console.log('ERROR', e.message);
} finally {
  await s.close();
}
